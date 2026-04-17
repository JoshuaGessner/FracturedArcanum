// @ts-check
// Integration tests for the server DB layer. Uses a throwaway SQLite database
// under a temporary DATA_DIR so production data is not touched.

import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

let db
let tmpDir

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'fa-db-test-'))
  process.env.DATA_DIR = tmpDir
  db = await import('./db.js')
  return () => {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
})

function makeAccount(username) {
  const r = db.createAccount(username, 'password12345', username, '', '', '')
  expect(r.ok, `failed to create ${username}: ${r.error}`).toBe(true)
  return r.accountId
}

describe('admin roles', () => {
  it('defaults new accounts to role=user', () => {
    const id = makeAccount('rolesuser1')
    expect(db.getAccountRole(id)).toBe('user')
  })

  it('assignInitialOwner promotes one account and refuses a second', () => {
    const a = makeAccount('rolesowner1')
    const b = makeAccount('rolesowner2')
    expect(db.assignInitialOwner(a, { reason: 'test' }).ok).toBe(true)
    expect(db.getAccountRole(a)).toBe('owner')
    const second = db.assignInitialOwner(b, { reason: 'test' })
    expect(second.ok).toBe(false)
    expect(second.status).toBe(409)
    // single-owner DB constraint: only one owner row
    expect(db.findOwnerAccountId()).toBe(a)
  })

  it('setAccountRole happy path: owner promotes user to admin and back', () => {
    const owner = db.findOwnerAccountId()
    const target = makeAccount('promotetarget')
    const up = db.setAccountRole(owner, target, 'admin')
    expect(up.ok).toBe(true)
    expect(up.role).toBe('admin')
    expect(db.getAccountRole(target)).toBe('admin')
    const down = db.setAccountRole(owner, target, 'user')
    expect(down.ok).toBe(true)
    expect(db.getAccountRole(target)).toBe('user')
  })

  it('setAccountRole rejects non-owner actor', () => {
    const owner = db.findOwnerAccountId()
    const admin = makeAccount('nonowneractor')
    db.setAccountRole(owner, admin, 'admin')
    const target = makeAccount('nonownertarget')
    const r = db.setAccountRole(admin, target, 'admin')
    expect(r.ok).toBe(false)
    expect(r.status).toBe(403)
  })

  it('setAccountRole rejects attempts to alter the owner', () => {
    const owner = db.findOwnerAccountId()
    const other = makeAccount('cantalterowner')
    // Other cannot be made owner via setAccountRole.
    const r = db.setAccountRole(owner, other, 'owner')
    expect(r.ok).toBe(false)
    // Owner cannot demote self.
    const r2 = db.setAccountRole(owner, owner, 'admin')
    expect(r2.ok).toBe(false)
  })

  it('setAccountRole rejects unknown targets', () => {
    const owner = db.findOwnerAccountId()
    const r = db.setAccountRole(owner, 'acct-doesnotexist', 'admin')
    expect(r.ok).toBe(false)
    expect(r.status).toBe(404)
  })

  it('transferOwnership swaps roles atomically and logs', () => {
    const prevOwner = db.findOwnerAccountId()
    const newOwner = makeAccount('newowner')
    const r = db.transferOwnership(prevOwner, newOwner)
    expect(r.ok).toBe(true)
    expect(db.getAccountRole(prevOwner)).toBe('admin')
    expect(db.getAccountRole(newOwner)).toBe('owner')
    expect(db.findOwnerAccountId()).toBe(newOwner)
    const audit = db.listAudit({ limit: 5 })
    expect(audit.some((entry) => entry.action === 'ownership_transfer')).toBe(true)
  })

  it('listAccounts supports search by username', () => {
    makeAccount('searchableabc')
    const results = db.listAccounts({ search: 'searchable' })
    expect(results.some((row) => row.username === 'searchableabc')).toBe(true)
  })

  it('hasRoleAtLeast compares roles correctly', () => {
    expect(db.hasRoleAtLeast('owner', 'admin')).toBe(true)
    expect(db.hasRoleAtLeast('admin', 'admin')).toBe(true)
    expect(db.hasRoleAtLeast('user', 'admin')).toBe(false)
    expect(db.hasRoleAtLeast('user', 'owner')).toBe(false)
  })
})

describe('single-owner DB constraint', () => {
  it('prevents inserting two owner rows via direct role change', () => {
    // The partial unique index should block a second 'owner' row. Use
    // setAccountRole's escape hatch: directly bypass via raw SQL would be
    // the only way, so simulate by verifying the index exists and is unique.
    const rows = db.default.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_accounts_single_owner'",
    ).all()
    expect(rows.length).toBe(1)

    // Try to directly set a second account to 'owner' — should throw.
    const currentOwner = db.findOwnerAccountId()
    const second = makeAccount('wouldbeowner')
    expect(currentOwner).not.toBe(second)
    expect(() => {
      db.default.prepare('UPDATE accounts SET role = ? WHERE id = ?').run('owner', second)
    }).toThrow(/UNIQUE/i)
  })
})

describe('friend gating', () => {
  it('isFriendOf returns true only for reciprocal friend edges', () => {
    const a = makeAccount('friendhelpera')
    const b = makeAccount('friendhelperb')
    expect(db.isFriendOf(a, b)).toBe(false)
    // Accept via addFriend (creates bidirectional edges per existing behaviour).
    const added = db.addFriend(a, 'friendhelperb')
    expect(added.ok).toBe(true)
    expect(db.isFriendOf(a, b)).toBe(true)
    expect(db.isFriendOf(b, a)).toBe(true)
    // Removing one direction de-links that direction.
    db.removeFriend(a, b)
    expect(db.isFriendOf(a, b)).toBe(false)
  })

  it('isFriendOf rejects self and empty inputs', () => {
    const a = makeAccount('selffriend')
    expect(db.isFriendOf(a, a)).toBe(false)
    expect(db.isFriendOf('', a)).toBe(false)
    expect(db.isFriendOf(a, '')).toBe(false)
  })
})

describe('resolveMatchResult mode gating', () => {
  it('unranked mode grants runes but does not change season rating', () => {
    const a = makeAccount('unrankedplayer')
    const before = db.getProfile(a)
    const result = db.resolveMatchResult(a, 'opponent', 'unranked', 'win', 5)
    expect(result.ok).toBe(true)
    expect(result.ratingDelta).toBe(0)
    expect(result.seasonRating).toBe(before.season_rating)
    expect(result.runesEarned).toBeGreaterThan(0)
  })

  it('duel mode adjusts season rating', () => {
    const a = makeAccount('rankedplayer')
    const result = db.resolveMatchResult(a, 'opponent', 'duel', 'win', 5)
    expect(result.ok).toBe(true)
    expect(result.ratingDelta).toBeGreaterThan(0)
  })
})
