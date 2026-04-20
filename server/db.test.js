// @ts-check
// Integration tests for the server DB layer. Uses a throwaway SQLite database
// under a temporary DATA_DIR so production data is not touched.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

let db
let tmpDir

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'fa-db-test-'))
  process.env.DATA_DIR = tmpDir
  db = await import('./db.js')
})

afterAll(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

function makeAccount(username) {
  const r = db.createAccount(username, 'password12345', username, '', '', '')
  expect(r.ok, `failed to create ${username}: ${r.error}`).toBe(true)
  return r.accountId
}

describe('schema migration compatibility', () => {
  it('opens a legacy accounts table without anti-abuse columns', async () => {
    const legacyDir = mkdtempSync(path.join(tmpdir(), 'fa-db-legacy-'))
    const previousDataDir = process.env.DATA_DIR

    try {
      const legacyDb = new Database(path.join(legacyDir, 'fractured-arcanum.db'))
      legacyDb.exec(`
        CREATE TABLE accounts (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_login TEXT,
          device_fp TEXT,
          flags TEXT NOT NULL DEFAULT ''
        );
      `)
      legacyDb.close()

      process.env.DATA_DIR = legacyDir
      const migrated = await import('./db.js?legacy-test')
      const columns = migrated.default.prepare('PRAGMA table_info(accounts)').all()

      expect(columns.some((column) => column.name === 'created_ip_hash')).toBe(true)
      expect(columns.some((column) => column.name === 'created_ua_hash')).toBe(true)
      expect(columns.some((column) => column.name === 'role')).toBe(true)

      migrated.default.close()
    } finally {
      process.env.DATA_DIR = previousDataDir
      try { rmSync(legacyDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })
})

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

it('falls back to the username when a legacy account has a blank display name', () => {
  const username = 'legacyblankname'
  const accountId = makeAccount(username)
  db.default.prepare('UPDATE accounts SET display_name = ? WHERE id = ?').run('', accountId)

  const login = db.authenticateAccount(username, 'password12345')

  expect(login.ok).toBe(true)
  expect(login.displayName).toBe(username)
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
  it('unranked mode grants shards but does not change season rating', () => {
    const a = makeAccount('unrankedplayer')
    const before = db.getProfile(a)
    const result = db.resolveMatchResult(a, 'opponent', 'unranked', 'win', 5)
    expect(result.ok).toBe(true)
    expect(result.ratingDelta).toBe(0)
    expect(result.seasonRating).toBe(before.season_rating)
    expect(result.shardsEarned).toBeGreaterThan(0)
  })

  it('duel mode adjusts season rating', () => {
    const a = makeAccount('rankedplayer')
    const result = db.resolveMatchResult(a, 'opponent', 'duel', 'win', 5)
    expect(result.ok).toBe(true)
    expect(result.ratingDelta).toBeGreaterThan(0)
  })
})

describe('card trading', () => {
  function setOwned(accountId, owned) {
    db.default.prepare(
      `UPDATE player_profiles SET owned_cards = ? WHERE account_id = ?`,
    ).run(JSON.stringify(owned), accountId)
  }

  function makeFriendPair(prefix) {
    const a = makeAccount(prefix + 'a')
    const b = makeAccount(prefix + 'b')
    db.addFriend(a, prefix + 'b')
    // Reset collections to a controlled baseline so starter-pack contents
    // don't interfere with max-copy enforcement.
    setOwned(a, {})
    setOwned(b, {})
    return [a, b]
  }

  it('proposeTrade rejects non-friends', () => {
    const a = makeAccount('tradenotfriendx')
    const b = makeAccount('tradenotfriendy')
    setOwned(a, { 'spark-imp': 2 })
    const result = db.proposeTrade(a, b, [{ cardId: 'spark-imp', qty: 1 }], [{ cardId: 'shadow-whelp', qty: 1 }])
    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
  })

  it('proposeTrade rejects self-trade', () => {
    const a = makeAccount('tradeselfa')
    setOwned(a, { 'spark-imp': 1 })
    const result = db.proposeTrade(a, a, [{ cardId: 'spark-imp', qty: 1 }], [{ cardId: 'spark-imp', qty: 1 }])
    expect(result.ok).toBe(false)
  })

  it('proposeTrade rejects when proposer does not own enough copies', () => {
    const [a, b] = makeFriendPair('tradelow1')
    setOwned(a, { 'spark-imp': 1 })
    const result = db.proposeTrade(a, b, [{ cardId: 'spark-imp', qty: 3 }], [{ cardId: 'shadow-whelp', qty: 1 }])
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/do not own/i)
  })

  it('acceptTrade swaps cards atomically', () => {
    const [a, b] = makeFriendPair('tradeswap1')
    setOwned(a, { 'spark-imp': 2 })
    setOwned(b, { 'shadow-whelp': 2 })
    const prop = db.proposeTrade(a, b, [{ cardId: 'spark-imp', qty: 1 }], [{ cardId: 'shadow-whelp', qty: 1 }])
    expect(prop.ok).toBe(true)

    const accept = db.acceptTrade(b, prop.tradeId)
    expect(accept.ok).toBe(true)

    const aCollection = db.getCollection(a)
    const bCollection = db.getCollection(b)
    expect(aCollection['spark-imp']).toBe(1)
    expect(aCollection['shadow-whelp']).toBe(1)
    expect(bCollection['shadow-whelp']).toBe(1)
    expect(bCollection['spark-imp']).toBe(1)
  })

  it('concurrent accepts: only one wins', () => {
    const [a, b] = makeFriendPair('tradeconcur1')
    setOwned(a, { 'spark-imp': 2 })
    setOwned(b, { 'shadow-whelp': 2 })
    const prop = db.proposeTrade(a, b, [{ cardId: 'spark-imp', qty: 1 }], [{ cardId: 'shadow-whelp', qty: 1 }])
    expect(prop.ok).toBe(true)

    const first = db.acceptTrade(b, prop.tradeId)
    const second = db.acceptTrade(b, prop.tradeId)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false) // second accept on already-accepted trade
  })

  it('cancelTrade (by proposer) ends pending trade', () => {
    const [a, b] = makeFriendPair('tradecancel1')
    setOwned(a, { 'spark-imp': 1 })
    setOwned(b, { 'shadow-whelp': 1 })
    const prop = db.proposeTrade(a, b, [{ cardId: 'spark-imp', qty: 1 }], [{ cardId: 'shadow-whelp', qty: 1 }])
    const cancelled = db.cancelTrade(a, prop.tradeId, 'cancelled')
    expect(cancelled.ok).toBe(true)
    const acceptAfter = db.acceptTrade(b, prop.tradeId)
    expect(acceptAfter.ok).toBe(false)
  })

  it('cancelTrade rejects wrong actor', () => {
    const [a, b] = makeFriendPair('tradeperm1')
    setOwned(a, { 'spark-imp': 1 })
    setOwned(b, { 'shadow-whelp': 1 })
    const prop = db.proposeTrade(a, b, [{ cardId: 'spark-imp', qty: 1 }], [{ cardId: 'shadow-whelp', qty: 1 }])
    // Recipient cannot use "cancel" action (they must use "reject")
    const wrong = db.cancelTrade(b, prop.tradeId, 'cancelled')
    expect(wrong.ok).toBe(false)
    expect(wrong.status).toBe(403)
    // Proposer cannot "reject"
    const wrong2 = db.cancelTrade(a, prop.tradeId, 'rejected')
    expect(wrong2.ok).toBe(false)
  })

  it('rejects malformed trade items', () => {
    const [a, b] = makeFriendPair('tradebad1')
    setOwned(a, { 'spark-imp': 2 })
    const bad = db.proposeTrade(a, b, [], [{ cardId: 'shadow-whelp', qty: 1 }])
    expect(bad.ok).toBe(false)
    const bad2 = db.proposeTrade(a, b, [{ cardId: 'spark-imp', qty: 99 }], [{ cardId: 'shadow-whelp', qty: 1 }])
    expect(bad2.ok).toBe(false)
  })

  it('acceptTrade fails if it would exceed max-copy limit for receiver', () => {
    const [a, b] = makeFriendPair('tradecap1')
    // a has 1 spark-imp; b already has 3 (MAX_COPIES). Trading 1 more spark-imp to b would overflow.
    setOwned(a, { 'spark-imp': 1 })
    setOwned(b, { 'shadow-whelp': 1, 'spark-imp': 3 })
    const prop = db.proposeTrade(a, b, [{ cardId: 'spark-imp', qty: 1 }], [{ cardId: 'shadow-whelp', qty: 1 }])
    expect(prop.ok).toBe(true)
    const accept = db.acceptTrade(b, prop.tradeId)
    expect(accept.ok).toBe(false)
    expect(accept.error).toMatch(/limit/i)
  })
})

describe('multi-deck CRUD', () => {
  it('lazy-migrates legacy deck_config into a "Main" deck on first read', () => {
    const id = makeAccount('decks_legacy')
    const decks = db.listDecks(id)
    expect(decks.length).toBe(1)
    expect(decks[0].name).toBe('Main')
    expect(decks[0].isActive).toBe(true)
  })

  it('creates, renames, selects, and deletes decks', () => {
    const id = makeAccount('decks_crud')
    // Use a deck the player owns at least one copy of (starter).
    const create = db.createDeck(id, 'Combo', { 'spark-imp': 1 })
    expect(create.ok, create.error).toBe(true)
    const decks = db.listDecks(id)
    expect(decks.length).toBe(2)
    const main = decks.find((d) => d.name === 'Main')
    const combo = decks.find((d) => d.name === 'Combo')
    expect(main && main.isActive).toBe(true)

    // Rename
    const renamed = db.renameDeck(id, combo.id, 'Combo Mk II')
    expect(renamed.ok).toBe(true)
    expect(renamed.deck.name).toBe('Combo Mk II')

    // Switch active
    const sel = db.selectActiveDeck(id, combo.id)
    expect(sel.ok).toBe(true)
    const after = db.listDecks(id)
    expect(after.find((d) => d.id === combo.id).isActive).toBe(true)
    expect(after.find((d) => d.id === main.id).isActive).toBe(false)

    // Cannot delete the last deck
    db.deleteDeck(id, main.id)
    const lone = db.listDecks(id)
    expect(lone.length).toBe(1)
    const last = db.deleteDeck(id, lone[0].id)
    expect(last.ok).toBe(false)
  })

  it('rejects decks containing cards the player does not own', () => {
    const id = makeAccount('decks_own')
    const r = db.createDeck(id, 'Pirate', { 'drakarion-the-eternal': 1 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/own/i)
  })
})

describe('shard breakdown', () => {
  it('refunds shards for excess copies and updates owned counts', () => {
    const id = makeAccount('breakdown_basic')
    // Grant the account an extra copy of a starter common.
    const profile = db.getProfile(id)
    const cardId = Object.keys(profile.owned_cards)[0]
    // Set owned_cards directly via saveDeck path? Easier: just use the
    // existing copy if there is one and the player has 0 decks needing it.
    // Empty out the active deck so no card is required by saved decks.
    const empty = db.saveDeck(id, {})
    expect(empty.ok).toBe(true)

    const baseShards = db.getProfile(id).shards
    const result = db.breakdownCard(id, cardId, 1)
    expect(result.ok, result.error).toBe(true)
    expect(result.refunded).toBeGreaterThan(0)
    expect(db.getProfile(id).shards).toBe(baseShards + result.refunded)
  })

  it('refuses to break down copies needed by saved decks', () => {
    const id = makeAccount('breakdown_lock')
    const profile = db.getProfile(id)
    const cardId = Object.keys(profile.owned_cards).find((c) => profile.owned_cards[c] >= 1)
    // Active deck (Main) seeded from DEFAULT_DECK_CONFIG already requires copies.
    // Try to break down a copy that's needed.
    const result = db.breakdownCard(id, cardId, profile.owned_cards[cardId])
    expect(result.ok).toBe(false)
  })
})

describe('card border cosmetics', () => {
  it('lists the catalog and lets the player purchase + select a border', () => {
    const id = makeAccount('border_buyer')
    const cat = db.listCardBorders()
    expect(cat.find((b) => b.id === 'default')).toBeTruthy()
    expect(cat.find((b) => b.id === 'bronze')).toBeTruthy()

    // Initially, only 'default' is owned and selected.
    const profile = db.getProfile(id)
    expect(profile.owned_card_borders).toEqual(['default'])
    expect(profile.selected_card_border).toBe('default')

    // Try to purchase without enough shards.
    const broke = db.purchaseCardBorder(id, 'void')
    expect(broke.ok).toBe(false)

    // Grant some shards via daily reward — repeatedly is blocked, so use the
    // resolveMatchResult path or directly run an unsupported helper. Easiest:
    // grant via daily then purchase the cheapest non-default border.
    const day = db.claimDailyReward(id)
    expect(day.ok).toBe(true)
    const result = db.purchaseCardBorder(id, 'bronze')
    expect(result.ok, result.error).toBe(true)
    expect(result.ownedCardBorders).toContain('bronze')
    expect(result.selectedCardBorder).toBe('bronze')
  })

  it('rejects unknown borders and unowned selection', () => {
    const id = makeAccount('border_invalid')
    const r1 = db.purchaseCardBorder(id, 'no-such-border')
    expect(r1.ok).toBe(false)
    const r2 = db.selectCardBorder(id, 'bronze')
    expect(r2.ok).toBe(false)
  })
})
