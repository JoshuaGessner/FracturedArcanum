// @ts-check
// Integration tests for the server DB layer. Uses a throwaway SQLite database
// under a temporary DATA_DIR so production data is not touched.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

let db
let passkeyService
let tmpDir
let originalNodeEnv

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'fa-db-test-'))
  originalNodeEnv = process.env.NODE_ENV
  process.env.DATA_DIR = tmpDir
  db = await import('./db.js')
  passkeyService = await import('./passkey-service.js')
})

afterAll(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

afterEach(() => {
  clearWebAuthnEnv()
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
})

function makeAccount(username) {
  const r = db.createAccount(username, 'password12345', username, '', '', '')
  expect(r.ok, `failed to create ${username}: ${r.error}`).toBe(true)
  return r.accountId
}

function addPasskey(accountId, credentialId = `credential-${accountId}`) {
  const result = db.registerAccountPasskey(accountId, {
    id: credentialId,
    publicKey: Buffer.from(`public-key-${credentialId}`),
    counter: 0,
    transports: ['internal'],
  }, { name: 'Primary', backedUp: true, deviceType: 'multiDevice' })
  expect(result.ok, `failed to add passkey: ${result.error}`).toBe(true)
  return result.passkey
}

function acknowledgeRecoveryCodes(accountId) {
  const generated = db.generateAccountRecoveryCodes(accountId, { metadata: { source: 'vitest' } })
  expect(generated.ok, `failed to generate recovery codes: ${generated.error}`).toBe(true)
  const acknowledged = db.acknowledgeAccountRecoveryCodes(accountId, { metadata: { source: 'vitest' } })
  expect(acknowledged.ok, `failed to acknowledge recovery codes: ${acknowledged.error}`).toBe(true)
  return generated.codes
}

function createClusteredAccount(username, options = {}) {
  return db.createAccount(username, 'password12345', username, 'shared-fp', '198.51.100.44', 'cluster-agent', options)
}

function requestWithOrigin(origin) {
  return {
    get(name) {
      return name.toLowerCase() === 'origin' ? origin : ''
    },
  }
}

function clearWebAuthnEnv() {
  delete process.env.WEBAUTHN_ORIGIN
  delete process.env.WEBAUTHN_RP_ID
  delete process.env.PUBLIC_APP_URL
  delete process.env.CLIENT_ORIGIN
}

describe('passkey origin configuration', () => {
  it('derives production passkey origin from the browser request when env origin is missing', async () => {
    clearWebAuthnEnv()
    process.env.NODE_ENV = 'production'
    const accountId = makeAccount('webaprodorigin')

    const result = await passkeyService.createPasskeyRegistrationOptions(
      accountId,
      requestWithOrigin('https://farcanum.anomalousinteractive.com'),
    )

    expect(result.ok, result.error).toBe(true)
    expect(result.options.rp.id).toBe('farcanum.anomalousinteractive.com')
  })

  it('fails production passkey setup clearly instead of falling back to localhost', async () => {
    clearWebAuthnEnv()
    process.env.NODE_ENV = 'production'
    const accountId = makeAccount('webamissorigin')

    const result = await passkeyService.createPasskeyRegistrationOptions(accountId, requestWithOrigin(''))

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Passkey origin is not configured for this domain.')
  })

  it('uses explicit WebAuthn origin configuration ahead of request origin', async () => {
    clearWebAuthnEnv()
    process.env.NODE_ENV = 'production'
    process.env.WEBAUTHN_ORIGIN = 'https://farcanum.anomalousinteractive.com'
    process.env.WEBAUTHN_RP_ID = 'farcanum.anomalousinteractive.com'
    const accountId = makeAccount('webaexplicitorigin')

    const result = await passkeyService.createPasskeyRegistrationOptions(accountId, requestWithOrigin('https://unexpected.example'))

    expect(result.ok, result.error).toBe(true)
    expect(result.options.rp.id).toBe('farcanum.anomalousinteractive.com')
  })

  it('rejects mismatched WebAuthn relying party IDs before browser ceremony', async () => {
    clearWebAuthnEnv()
    process.env.NODE_ENV = 'production'
    process.env.WEBAUTHN_ORIGIN = 'https://farcanum.anomalousinteractive.com'
    process.env.WEBAUTHN_RP_ID = 'farcanum.com'
    const accountId = makeAccount('webarpmismatch')

    const result = await passkeyService.createPasskeyRegistrationOptions(accountId, requestWithOrigin('https://farcanum.anomalousinteractive.com'))

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Passkey relying party ID does not match this app origin.')
  })
})

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
      expect(columns.some((column) => column.name === 'email_normalized')).toBe(true)
      expect(columns.some((column) => column.name === 'account_setup_required')).toBe(true)
      expect(columns.some((column) => column.name === 'terms_version')).toBe(true)

      migrated.default.close()
    } finally {
      process.env.DATA_DIR = previousDataDir
      try { rmSync(legacyDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  it('backfills missing player profile economy columns without dropping legacy rows', async () => {
    const legacyDir = mkdtempSync(path.join(tmpdir(), 'fa-db-legacy-profile-'))
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

        CREATE TABLE player_profiles (
          account_id TEXT PRIMARY KEY,
          deck_config TEXT NOT NULL DEFAULT '{}'
        );
      `)
      legacyDb.prepare(`
        INSERT INTO accounts (id, username, password_hash, display_name)
        VALUES (?, ?, ?, ?)
      `).run('acct-legacy-profile', 'legacyprofile', 'legacy-hash', 'Legacy Profile')
      legacyDb.prepare(`INSERT INTO player_profiles (account_id, deck_config) VALUES (?, ?)`)
        .run('acct-legacy-profile', '{"spark-imp":2}')
      legacyDb.close()

      process.env.DATA_DIR = legacyDir
      const migrated = await import('./db.js?legacy-profile-test')
      const columns = migrated.default.prepare('PRAGMA table_info(player_profiles)').all()
      const profile = migrated.getProfile('acct-legacy-profile')

      expect(columns.some((column) => column.name === 'shards')).toBe(true)
      expect(columns.some((column) => column.name === 'total_earned')).toBe(true)
      expect(columns.some((column) => column.name === 'owned_cards')).toBe(true)
      expect(profile).toBeTruthy()
      expect(profile.deck_config).toEqual({ 'spark-imp': 2 })
      expect(profile.shards).toBe(120)
      expect(profile.total_earned).toBe(120)
      expect(profile.owned_cards['spark-imp']).toBeGreaterThanOrEqual(2)

      migrated.default.close()
    } finally {
      process.env.DATA_DIR = previousDataDir
      try { rmSync(legacyDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  it('creates account readiness support tables without dropping user data', () => {
    const accountId = makeAccount('readinessschema')
    const tableNames = db.default.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((row) => row.name)
    const readiness = db.getAccountReadiness(accountId)

    expect(tableNames).toContain('account_authenticators')
    expect(tableNames).toContain('auth_challenges')
    expect(tableNames).toContain('email_tokens')
    expect(tableNames).toContain('account_recovery_codes')
    expect(tableNames).toContain('account_consents')
    expect(tableNames).toContain('security_events')
    expect(tableNames).toContain('session_families')
    expect(readiness.ready).toBe(false)
    expect(readiness.setupRequired).toBe(true)
    expect(readiness.requirements.some((item) => item.id === 'passkey')).toBe(true)
    expect(db.getProfile(accountId)).toBeTruthy()
  })

  it('keeps production signup cluster limits unless an explicit local QA bypass is passed', () => {
    expect(createClusteredAccount('clusterlimit1').ok).toBe(true)
    expect(createClusteredAccount('clusterlimit2').ok).toBe(true)

    const blocked = createClusteredAccount('clusterlimit3')
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toContain('device')

    const bypassed = createClusteredAccount('clusterlimit3', { bypassSignupClusterLimits: true })
    expect(bypassed.ok).toBe(true)
  })

  it('completes passkey account setup and records consents', () => {
    const accountId = makeAccount('upgradecomplete')
    expect(db.markAccountPendingPasskeySignup(accountId)).toBe(true)
    addPasskey(accountId)
    const profileBefore = db.getProfile(accountId)

    const completed = db.completeAccountUpgrade(accountId, {
      acceptTerms: true,
      acceptPrivacy: true,
      ageAttestation: 'adult',
      ip: '203.0.113.24',
      userAgent: 'vitest-agent',
      locale: 'en-US',
    })

    const account = db.default.prepare(`SELECT * FROM accounts WHERE id = ?`).get(accountId)
    const consentCount = db.default.prepare(`SELECT COUNT(*) as cnt FROM account_consents WHERE account_id = ?`).get(accountId).cnt
    const profileAfter = db.getProfile(accountId)

    expect(completed.ok).toBe(true)
    expect(completed.readiness.ready).toBe(false)
    expect(completed.readiness.requirements.some((item) => item.id === 'recovery_codes')).toBe(true)
    expect(account.account_setup_required).toBe(0)
    expect(account.account_status).toBe('active')
    expect(account.terms_version).toBe(db.getCurrentLegalVersions().termsVersion)
    expect(account.privacy_version).toBe(db.getCurrentLegalVersions().privacyVersion)
    expect(account.age_attestation).toBe('adult')
    expect(consentCount).toBe(3)
    expect(profileAfter.deck_config).toEqual(profileBefore.deck_config)

    acknowledgeRecoveryCodes(accountId)
    const replay = db.completeAccountUpgrade(accountId, {
      acceptTerms: true,
      acceptPrivacy: true,
      ageAttestation: 'adult',
    })
    expect(replay.ok).toBe(true)
    expect(db.getAccountReadiness(accountId).ready).toBe(true)
  })

  it('keeps pending passkey signups out of password and passkey login until setup completes', () => {
    const accountId = makeAccount('pendingsignup')
    expect(db.markAccountPendingPasskeySignup(accountId)).toBe(true)
    expect(db.authenticateAccount('pendingsignup', 'password12345').ok).toBe(false)
    expect(db.findAccountForPasskeyIdentifier('pendingsignup')).toBeNull()

    addPasskey(accountId)
    expect(db.completeAccountUpgrade(accountId, {
      acceptTerms: true,
      acceptPrivacy: true,
      ageAttestation: 'adult',
    }).ok).toBe(true)
    expect(db.findAccountForPasskeyIdentifier('pendingsignup').id).toBe(accountId)
  })

  it('refuses account setup completion without legal and age consent', () => {
    const accountId = makeAccount('upgradeconsent')
    addPasskey(accountId)

    const completed = db.completeAccountUpgrade(accountId, {
      acceptTerms: true,
      acceptPrivacy: false,
      ageAttestation: '',
    })

    expect(completed.ok).toBe(false)
    expect(db.getAccountReadiness(accountId).ready).toBe(false)
  })

  it('stores passkey authenticators and one-time auth challenges', () => {
    const accountId = makeAccount('passkeyowner')
    const account = db.findAccountForPasskeyIdentifier('passkeyowner')
    expect(account.id).toBe(accountId)

    const firstChallenge = db.createAuthChallenge(accountId, 'passkey_registration', 'challenge-one', { origin: 'http://localhost:5173', rpID: 'localhost' })
    const secondChallenge = db.createAuthChallenge(accountId, 'passkey_registration', 'challenge-two', { origin: 'http://localhost:5173', rpID: 'localhost' })
    expect(db.consumeAuthChallenge(firstChallenge.id, 'passkey_registration')).toBeNull()
    const consumed = db.consumeAuthChallenge(secondChallenge.id, 'passkey_registration')
    expect(consumed.challenge).toBe('challenge-two')
    expect(consumed.metadata.rpID).toBe('localhost')
    expect(db.consumeAuthChallenge(secondChallenge.id, 'passkey_registration')).toBeNull()

    const first = db.registerAccountPasskey(accountId, {
      id: 'credential-one',
      publicKey: Buffer.from('public-key-one'),
      counter: 1,
      transports: ['internal'],
    }, { name: 'Laptop', backedUp: true, deviceType: 'multiDevice' })
    const second = db.registerAccountPasskey(accountId, {
      id: 'credential-two',
      publicKey: Buffer.from('public-key-two'),
      counter: 0,
      transports: ['usb'],
    }, { name: 'Security Key', backedUp: false, deviceType: 'singleDevice' })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(db.getAccountReadiness(accountId).passkeyCount).toBe(2)
    expect(db.listAccountPasskeys(accountId).map((item) => item.name)).toContain('Laptop')

    const credential = db.getPasskeyCredential('credential-one')
    expect(credential.accountId).toBe(accountId)
    expect(credential.credential.counter).toBe(1)
    expect(credential.credential.publicKey.toString()).toBe('public-key-one')
    db.updatePasskeyAfterAuthentication(credential.id, 7, { backedUp: false, deviceType: 'singleDevice' })
    expect(db.getPasskeyCredential('credential-one').credential.counter).toBe(7)

    expect(db.deleteAccountPasskey(accountId, first.passkey.id).ok).toBe(true)
    expect(db.deleteAccountPasskey(accountId, second.passkey.id).ok).toBe(false)
  })

  it('requires acknowledged recovery codes before account readiness is complete', () => {
    const accountId = makeAccount('recoveryready')
    addPasskey(accountId)
    expect(db.completeAccountUpgrade(accountId, {
      acceptTerms: true,
      acceptPrivacy: true,
      ageAttestation: 'adult',
    }).ok).toBe(true)

    const missing = db.getAccountReadiness(accountId)
    expect(missing.ready).toBe(false)
    expect(missing.requirements.some((item) => item.id === 'recovery_codes')).toBe(true)

    const codes = db.generateAccountRecoveryCodes(accountId)
    expect(codes.ok).toBe(true)
    expect(codes.codes).toHaveLength(10)
    expect(codes.recovery.activeCount).toBe(10)
    expect(db.getAccountReadiness(accountId).requirements.some((item) => item.id === 'recovery_codes_saved')).toBe(true)

    const acknowledged = db.acknowledgeAccountRecoveryCodes(accountId)
    expect(acknowledged.ok).toBe(true)
    expect(acknowledged.readiness.ready).toBe(true)
    const stored = db.default.prepare(`SELECT code_hash FROM account_recovery_codes WHERE account_id = ? LIMIT 1`).get(accountId)
    expect(stored.code_hash).not.toContain(codes.codes[0])
  })

  it('uses recovery codes once and revokes old passkeys during lost-access recovery', () => {
    const accountId = makeAccount('recoveronce')
    const oldPasskey = addPasskey(accountId, 'recover-old')
    expect(db.completeAccountUpgrade(accountId, {
      acceptTerms: true,
      acceptPrivacy: true,
      ageAttestation: 'adult',
    }).ok).toBe(true)
    const codes = acknowledgeRecoveryCodes(accountId)
    const found = db.findAccountRecoveryCode('recoveronce', codes[0])
    expect(found.account.id).toBe(accountId)

    const newPasskey = addPasskey(accountId, 'recover-new')
    const recovered = db.completeAccountRecovery(accountId, found.recoveryCodeId, newPasskey.id, { metadata: { source: 'vitest' } })
    expect(recovered.ok).toBe(true)
    expect(db.getPasskeyCredential('recover-new').accountId).toBe(accountId)
    expect(db.getPasskeyCredential(oldPasskey.credentialId)).toBeNull()
    expect(db.findAccountRecoveryCode('recoveronce', codes[0])).toBeNull()
  })

  it('atomically consumes recovery codes with replacement passkey registration', () => {
    const accountId = makeAccount('recoveratomic')
    addPasskey(accountId, 'recover-atomic-old')
    expect(db.completeAccountUpgrade(accountId, {
      acceptTerms: true,
      acceptPrivacy: true,
      ageAttestation: 'adult',
    }).ok).toBe(true)
    const codes = acknowledgeRecoveryCodes(accountId)
    const found = db.findAccountRecoveryCode('recoveratomic', codes[0])

    const first = db.completeAccountRecoveryWithPasskey(accountId, found.recoveryCodeId, {
      id: 'recover-atomic-new-a',
      publicKey: Buffer.from('recover-atomic-key-a'),
      counter: 0,
      transports: ['internal'],
    }, { name: 'Recovery A', backedUp: true, deviceType: 'multiDevice' })
    const second = db.completeAccountRecoveryWithPasskey(accountId, found.recoveryCodeId, {
      id: 'recover-atomic-new-b',
      publicKey: Buffer.from('recover-atomic-key-b'),
      counter: 0,
      transports: ['internal'],
    }, { name: 'Recovery B', backedUp: true, deviceType: 'multiDevice' })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(db.listAccountPasskeys(accountId).map((item) => item.credentialId)).toEqual(['recover-atomic-new-a'])
  })

  it('stores only hashed session tokens and revokes sessions by account', () => {
    const accountId = makeAccount('sessionhash')
    const session = db.createSession(accountId, '203.0.113.12', 'vitest-agent', 'password')
    const stored = db.default.prepare(`SELECT * FROM sessions WHERE account_id = ?`).get(accountId)

    expect(stored.token).not.toBe(session.token)
    expect(stored.token).toMatch(/^sess-/)
    expect(stored.token_hash).toBeTruthy()
    expect(stored.auth_method).toBe('password')
    expect(db.validateSession(session.token).account_id).toBe(accountId)

    db.revokeAllSessions(accountId)
    expect(db.validateSession(session.token)).toBeNull()
  })

  it('tracks recent passkey reauthentication on sessions', () => {
    const accountId = makeAccount('reauthsession')
    const passwordSession = db.createSession(accountId, '203.0.113.12', 'vitest-agent', 'password')
    const passkeySession = db.createSession(accountId, '203.0.113.13', 'vitest-agent', 'passkey')

    expect(db.sessionHasRecentPasskeyReauth(db.validateSession(passwordSession.token), 10 * 60 * 1000)).toBe(false)
    expect(db.sessionHasRecentPasskeyReauth(db.validateSession(passkeySession.token), 10 * 60 * 1000)).toBe(true)
    expect(db.markSessionPasskeyReauthenticated(passwordSession.token)).toBe(true)
    expect(db.sessionHasRecentPasskeyReauth(db.validateSession(passwordSession.token), 10 * 60 * 1000)).toBe(true)
  })

  it('exports account data and soft deletes account access', () => {
    const accountId = makeAccount('deleteowner')
    addPasskey(accountId)
    expect(db.completeAccountUpgrade(accountId, {
      acceptTerms: true,
      acceptPrivacy: true,
      ageAttestation: 'adult',
    }).ok).toBe(true)
    const session = db.createSession(accountId, '203.0.113.32', 'vitest-agent', 'password')
    const exported = db.exportAccountData(accountId)

    expect(exported.account.username).toBe('deleteowner')
    expect(exported.account.password_hash).toBeUndefined()
    expect(exported.sessions.length).toBeGreaterThan(0)

    const deleted = db.deleteAccount(accountId, 'password12345', { ip: '203.0.113.32', userAgent: 'vitest-agent' })
    const account = db.default.prepare(`SELECT account_status, deleted_at FROM accounts WHERE id = ?`).get(accountId)

    expect(deleted.ok).toBe(true)
    expect(account.account_status).toBe('deleted')
    expect(account.deleted_at).toBeTruthy()
    expect(db.validateSession(session.token)).toBeNull()
    expect(db.authenticateAccount('deleteowner', 'password12345').ok).toBe(false)
  })

  it('allows passkey-authenticated account deletion without password fallback', () => {
    const accountId = makeAccount('deletepasskey')
    addPasskey(accountId)
    expect(db.completeAccountUpgrade(accountId, {
      acceptTerms: true,
      acceptPrivacy: true,
      ageAttestation: 'adult',
    }).ok).toBe(true)
    const session = db.createSession(accountId, '203.0.113.42', 'vitest-agent', 'passkey')

    const deleted = db.deleteAccount(accountId, '', { ip: '203.0.113.42', userAgent: 'vitest-agent', authMethod: 'passkey' })
    expect(deleted.ok).toBe(true)
    expect(db.validateSession(session.token)).toBeNull()
    expect(db.authenticateAccount('deletepasskey', 'password12345').ok).toBe(false)
  })

  it('soft-deletes legacy accounts that miss the migration deadline', () => {
    const accountId = makeAccount('expiredlegacy')
    db.default.prepare(`
      UPDATE accounts
      SET legacy_migration_deadline_at = datetime('now', '-1 day'), legacy_migration_completed_at = NULL
      WHERE id = ?
    `).run(accountId)

    const expired = db.expireLegacyMigrationAccounts({ metadata: { source: 'vitest' } })
    const account = db.default.prepare(`SELECT account_status, deleted_at FROM accounts WHERE id = ?`).get(accountId)

    expect(expired.deleted).toBeGreaterThanOrEqual(1)
    expect(account.account_status).toBe('deleted')
    expect(account.deleted_at).toBeTruthy()
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

  it('requires owner accounts to keep two passkeys while admin accounts need one', () => {
    const owner = db.findOwnerAccountId()
    addPasskey(owner, 'owner-required-a')
    const firstReadiness = db.getAccountReadiness(owner)
    expect(firstReadiness.requirements.some((item) => item.id === 'owner_second_passkey')).toBe(true)

    const second = addPasskey(owner, 'owner-required-b')
    const secondReadiness = db.getAccountReadiness(owner)
    expect(secondReadiness.requirements.some((item) => item.id === 'owner_second_passkey')).toBe(false)
    expect(db.deleteAccountPasskey(owner, second.id).ok).toBe(false)

    const target = makeAccount('adminonepasskey')
    const promoted = db.setAccountRole(owner, target, 'admin')
    expect(promoted.ok).toBe(true)
    addPasskey(target, 'admin-required-a')
    expect(db.getAccountReadiness(target).requirements.some((item) => item.id === 'owner_second_passkey')).toBe(false)
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

  it('addFriend is idempotent and returns the existing friend', () => {
    const a = makeAccount('friendidema')
    const b = makeAccount('friendidemb')

    const first = db.addFriend(a, 'friendidemb')
    const second = db.addFriend(a, 'friendidemb')

    expect(first.ok).toBe(true)
    expect(first.alreadyFriend).toBe(false)
    expect(second.ok).toBe(true)
    expect(second.alreadyFriend).toBe(true)
    expect(second.friend.accountId).toBe(b)
    expect(db.getSocialOverview(a).friends).toHaveLength(1)
  })

  it('getSocialOverview repairs one-way friend edges', () => {
    const a = makeAccount('friendrepaira')
    const b = makeAccount('friendrepairb')

    db.default.prepare(`INSERT INTO social_friends (account_id, friend_account_id) VALUES (?, ?)`).run(a, b)
    expect(db.isFriendOf(b, a)).toBe(true)
    const overview = db.getSocialOverview(b)

    expect(overview.friends.some((friend) => friend.accountId === a)).toBe(true)
    expect(db.isFriendOf(a, b)).toBe(true)
    expect(db.isFriendOf(b, a)).toBe(true)
  })
})

describe('resolveMatchResult mode gating', () => {
  it('daily reward returns the granted amount and refreshed shard totals', () => {
    const accountId = makeAccount('dailyrewardshape')
    const before = db.getProfile(accountId)
    const result = db.claimDailyReward(accountId)

    expect(result.ok).toBe(true)
    expect(result.amount).toBe(25)
    expect(result.shards).toBe(before.shards + 25)
    expect(result.newBalance).toBe(result.shards)
    expect(result.totalEarned).toBe(before.total_earned + 25)
  })

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

  it('tracks AI mastery quest progress and claims rewards once', () => {
    const accountId = makeAccount('questmastery')
    const before = db.getProfile(accountId)
    const initial = db.getQuestOverview(accountId)
    expect(initial.ok).toBe(true)
    expect(initial.quests.find((quest) => quest.id === 'skirmish-legend')?.completed).toBe(false)

    db.resolveMatchResult(accountId, 'Legend AI', 'ai', 'win', 7, { aiDifficulty: 'legend' })

    const progressed = db.getQuestOverview(accountId)
    const legendQuest = progressed.quests.find((quest) => quest.id === 'skirmish-legend')
    expect(legendQuest?.completed).toBe(true)
    expect(legendQuest?.claimed).toBe(false)

    const claimed = db.claimQuestReward(accountId, 'skirmish-legend')
    expect(claimed.ok).toBe(true)
    expect(claimed.reward.shards).toBe(75)
    expect(claimed.shards).toBe(before.shards + 30 + 75)

    const duplicate = db.claimQuestReward(accountId, 'skirmish-legend')
    expect(duplicate.ok).toBe(false)
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
