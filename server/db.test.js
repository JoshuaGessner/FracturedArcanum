// @ts-check
// Integration tests for the server DB layer. Uses a throwaway SQLite database
// under a temporary DATA_DIR so production data is not touched.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CARD_LIBRARY } from './game.js'
import { getQuestDefinition } from './quest-definitions.js'

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
  vi.restoreAllMocks()
  clearWebAuthnEnv()
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
})

describe('card pack economy', () => {
  it('avoids maxed cards while the rolled rarity still has an eligible card', () => {
    const accountId = makeAccount('packprotection')
    const commonCards = CARD_LIBRARY.filter((card) => card.rarity === 'common')
    const maxedCard = commonCards.at(-1).id
    db.default.prepare(
      'UPDATE player_profiles SET shards = 500, owned_cards = ? WHERE account_id = ?',
    ).run(JSON.stringify({ [maxedCard]: 3 }), accountId)
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)

    const result = db.openPack(accountId, 'basic')

    expect(result.ok).toBe(true)
    expect(result.refund).toBe(0)
    expect(result.cards.every((card) => card.id !== maxedCard)).toBe(true)
    expect(result.cards.every((card) => card.duplicate !== true)).toBe(true)
  })
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
      expect(migrated.default.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'authoritative_matches'",
      ).get().count).toBe(1)
      expect(migrated.default.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'economy_ledger'",
      ).get().count).toBe(1)

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

  it('links another device without revoking existing passkeys', () => {
    const accountId = makeAccount('linkdevice')
    const firstPasskey = addPasskey(accountId, 'link-device-old')

    const link = db.createPasskeyDeviceLink(accountId, { metadata: { source: 'vitest' }, sessionId: 'sess-test' })
    expect(link.ok, link.error).toBe(true)
    expect(link.token).toMatch(/^pdlink-/)
    expect(db.getPasskeyDeviceLink(link.token).accountId).toBe(accountId)

    const linked = db.completePasskeyDeviceLinkRegistration(link.token, accountId, {
      id: 'link-device-phone',
      publicKey: Buffer.from('link-device-phone-key'),
      counter: 0,
      transports: ['internal'],
    }, { name: 'Phone passkey', backedUp: false, deviceType: 'singleDevice' })

    expect(linked.ok, linked.error).toBe(true)
    expect(db.getPasskeyCredential(firstPasskey.credentialId).accountId).toBe(accountId)
    expect(db.getPasskeyCredential('link-device-phone').accountId).toBe(accountId)
    expect(db.getPasskeyDeviceLink(link.token)).toBeNull()
    expect(db.completePasskeyDeviceLinkRegistration(link.token, accountId, {
      id: 'link-device-replay',
      publicKey: Buffer.from('link-device-replay-key'),
      counter: 0,
      transports: ['internal'],
    }).ok).toBe(false)
  })

  it('expires passkey device links before they can add a passkey', () => {
    const accountId = makeAccount('linkexpired')
    addPasskey(accountId, 'link-expired-old')
    const link = db.createPasskeyDeviceLink(accountId)
    expect(link.ok, link.error).toBe(true)
    db.default.prepare(`UPDATE passkey_device_links SET expires_at = datetime('now', '-1 minute') WHERE id = ?`).run(link.link.id)

    expect(db.getPasskeyDeviceLink(link.token)).toBeNull()
    const linked = db.completePasskeyDeviceLinkRegistration(link.token, accountId, {
      id: 'link-expired-new',
      publicKey: Buffer.from('link-expired-new-key'),
      counter: 0,
      transports: ['internal'],
    })

    expect(linked.ok).toBe(false)
    expect(db.getPasskeyCredential('link-expired-new')).toBeNull()
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

    // `force` opts in to the destructive path, which is otherwise disabled.
    const expired = db.expireLegacyMigrationAccounts({ force: true, metadata: { source: 'vitest' } })
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

  it('tracks AI mastery chain progress and claims each tier once', () => {
    const accountId = makeAccount('questmastery')
    const before = db.getProfile(accountId)
    const initial = db.getQuestOverview(accountId)
    expect(initial.ok).toBe(true)
    expect(initial.quests.find((quest) => quest.id === 'chain-legend-path')?.completed).toBe(false)

    db.resolveMatchResult(accountId, 'Legend AI', 'ai', 'win', 7, { aiDifficulty: 'legend' })

    const progressed = db.getQuestOverview(accountId)
    const legendQuest = progressed.quests.find((quest) => quest.id === 'chain-legend-path')
    expect(legendQuest?.completed).toBe(true)
    expect(legendQuest?.claimed).toBe(false)
    expect(legendQuest?.title).toBe('Legendfall I')

    const claimed = db.claimQuestReward(accountId, 'chain-legend-path')
    expect(claimed.ok).toBe(true)
    expect(claimed.reward.shards).toBe(75)
    expect(claimed.shards).toBe(before.shards + 30 + 75)

    const duplicate = db.claimQuestReward(accountId, 'chain-legend-path')
    expect(duplicate.ok).toBe(false)

    // The chain does not retire — claiming tier I posts tier II immediately.
    const nextTier = db.getQuestOverview(accountId).quests.find((quest) => quest.id === 'chain-legend-path')
    expect(nextTier.title).toBe('Legendfall II')
    expect(nextTier.target).toBe(5)
    expect(nextTier.completed).toBe(false)
  })
})

describe('quest slot rotation', () => {
  function slotRows(accountId, cadence) {
    return db.default
      .prepare('SELECT * FROM player_quest_slots WHERE account_id = ? AND cadence = ? ORDER BY slot_index')
      .all(accountId, cadence)
  }

  function completeDailySlots(accountId) {
    db.default
      .prepare(
        `UPDATE player_quest_slots SET progress = target, completed_at = ?
         WHERE account_id = ? AND cadence = 'daily'`,
      )
      .run(new Date().toISOString(), accountId)
  }

  it('fills every rotating slot with a distinct quest', () => {
    const accountId = makeAccount('questslots')
    expect(db.getQuestOverview(accountId).ok).toBe(true)

    for (const cadence of ['daily', 'weekly']) {
      const rows = slotRows(accountId, cadence)
      expect(rows).toHaveLength(3)
      expect(new Set(rows.map((row) => row.quest_id)).size).toBe(3)
    }
  })

  it('holds a claimed slot until the period turns over', () => {
    const accountId = makeAccount('questnorefill')
    db.getQuestOverview(accountId)
    const [slot] = slotRows(accountId, 'daily')
    completeDailySlots(accountId)
    expect(db.claimQuestReward(accountId, slot.quest_id).ok).toBe(true)

    db.getQuestOverview(accountId)

    // Refilling on claim would make the daily faucet unbounded.
    const after = slotRows(accountId, 'daily').find((row) => row.slot_index === slot.slot_index)
    expect(after.quest_id).toBe(slot.quest_id)
    expect(after.claimed).toBe(1)
  })

  it('refills a spent slot once the period key advances', () => {
    const accountId = makeAccount('questrefill')
    db.getQuestOverview(accountId)
    const [slot] = slotRows(accountId, 'daily')
    db.default
      .prepare(
        `UPDATE player_quest_slots
         SET claimed = 1, progress = target, assigned_key = '1999-01-01', expires_at = '1999-01-02T00:00:00.000Z'
         WHERE account_id = ? AND cadence = 'daily' AND slot_index = ?`,
      )
      .run(accountId, slot.slot_index)

    db.getQuestOverview(accountId)

    const rows = slotRows(accountId, 'daily')
    const refilled = rows.find((row) => row.slot_index === slot.slot_index)
    expect(refilled.claimed).toBe(0)
    expect(refilled.progress).toBe(0)
    expect(refilled.assigned_key).toBe(new Date().toISOString().slice(0, 10))
    expect(new Set(rows.map((row) => row.quest_id)).size).toBe(3)
  })

  it('carries an unclaimed daily past its own day', () => {
    const accountId = makeAccount('questcarry')
    db.getQuestOverview(accountId)
    const [slot] = slotRows(accountId, 'daily')
    db.default
      .prepare(
        `UPDATE player_quest_slots SET assigned_key = '1999-01-01', progress = 0
         WHERE account_id = ? AND cadence = 'daily' AND slot_index = ?`,
      )
      .run(accountId, slot.slot_index)

    db.getQuestOverview(accountId)

    // Still unexpired and unclaimed, so partial progress survives the reset.
    const after = slotRows(accountId, 'daily').find((row) => row.slot_index === slot.slot_index)
    expect(after.quest_id).toBe(slot.quest_id)
  })

  it('seeds slots from pre-slot rows so in-flight progress survives the migration', () => {
    const accountId = makeAccount('questlegacy')
    db.default.prepare('DELETE FROM player_quest_slots WHERE account_id = ?').run(accountId)
    db.default
      .prepare(
        `INSERT INTO player_quests (account_id, quest_id, cadence, period_key, progress)
         VALUES (?, 'daily-burst-channeler', 'daily', ?, 1)`,
      )
      .run(accountId, new Date().toISOString().slice(0, 10))

    db.getQuestOverview(accountId)

    const carried = slotRows(accountId, 'daily').find((row) => row.quest_id === 'daily-burst-channeler')
    expect(carried).toBeDefined()
    expect(carried.progress).toBe(1)
    // The legacy rotating rows are pruned so they cannot accumulate forever.
    const leftover = db.default
      .prepare("SELECT COUNT(*) AS n FROM player_quests WHERE account_id = ? AND period_key <> 'ever'")
      .get(accountId)
    expect(leftover.n).toBe(0)
  })

  it('claims every ready reward in one batched call', () => {
    const accountId = makeAccount('questbatch')
    db.getQuestOverview(accountId)
    const before = db.getProfile(accountId)
    const dailyIds = slotRows(accountId, 'daily').map((row) => row.quest_id)
    completeDailySlots(accountId)

    const result = db.claimQuestRewards(accountId, dailyIds)

    expect(result.ok).toBe(true)
    expect(result.claims).toHaveLength(3)
    expect(result.totalShards).toBe(result.claims.reduce((sum, claim) => sum + claim.reward.shards, 0))
    expect(result.shards).toBe(before.shards + result.totalShards)
    expect(db.claimQuestRewards(accountId, dailyIds).claims).toHaveLength(0)
  })

  it('reports per-quest reasons for rewards it could not claim', () => {
    const accountId = makeAccount('questbatchreject')
    db.getQuestOverview(accountId)
    const [slot] = slotRows(accountId, 'daily')

    const result = db.claimQuestRewards(accountId, [slot.quest_id, 'no-such-quest'])

    expect(result.claims).toHaveLength(0)
    expect(result.rejected).toEqual([
      { id: slot.quest_id, error: 'Quest is not complete yet.' },
      { id: 'no-such-quest', error: 'Quest is not active.' },
    ])
  })

  it('advances every objective a single match feeds in one batch', () => {
    const accountId = makeAccount('questbatchevents')
    db.getQuestOverview(accountId)
    // Pin a known rotating objective so the batch has both a slot quest and a
    // permanent quest to satisfy.
    db.default
      .prepare(
        `UPDATE player_quest_slots SET quest_id = 'daily-first-blood', target = 1, progress = 0, claimed = 0
         WHERE account_id = ? AND cadence = 'daily' AND slot_index = 0`,
      )
      .run(accountId)

    const result = db.recordQuestEvents(accountId, [
      { type: 'play_matches' },
      { type: 'win_any_match' },
      { type: 'win_ai' },
      { type: 'win_ai_difficulty', aiDifficulty: 'legend' },
    ])

    expect(result.ok).toBe(true)
    const completedIds = result.completed.map((quest) => quest.id)
    expect(completedIds).toContain('daily-first-blood')
    expect(completedIds).toContain('chain-legend-path')

    const quests = db.getQuestOverview(accountId).quests
    expect(quests.find((quest) => quest.id === 'daily-first-blood').completed).toBe(true)
  })

  it('keeps weekly periods seven days long across the year boundary', () => {
    // floor(dayOfYear / 7) restarted at January 1 and produced a one-day
    // "week 53" every December; Monday-anchored epoch buckets do not.
    const lengths = new Map()
    for (let offset = 0; offset < 400; offset += 1) {
      const key = db.questPeriodKey('weekly', new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000))
      lengths.set(key, (lengths.get(key) ?? 0) + 1)
    }

    const interior = [...lengths.values()].slice(1, -1)
    expect(interior.length).toBeGreaterThan(50)
    expect(interior.every((length) => length === 7)).toBe(true)
  })

  it('expires a weekly quest at the next Monday, not seven days out', () => {
    const wednesday = new Date(Date.UTC(2026, 6, 29))
    expect(db.questExpiresAt('weekly', wednesday)).toBe('2026-08-03T00:00:00.000Z')
    expect(db.questPeriodKey('weekly', wednesday)).toBe('w2026-07-27')
  })
})

describe('quest variety and reroll', () => {
  function slotRows(accountId, cadence) {
    return db.default
      .prepare('SELECT * FROM player_quest_slots WHERE account_id = ? AND cadence = ? ORDER BY slot_index')
      .all(accountId, cadence)
  }

  function forceSlot(accountId, cadence, slotIndex, questId, target) {
    db.default
      .prepare(
        `UPDATE player_quest_slots
         SET quest_id = ?, target = ?, reward_shards = 10, progress = 0, claimed = 0, completed_at = NULL
         WHERE account_id = ? AND cadence = ? AND slot_index = ?`,
      )
      .run(questId, target, accountId, cadence, slotIndex)
  }

  function progressOf(accountId, questId) {
    return db.getQuestOverview(accountId).quests.find((quest) => quest.id === questId)
  }

  it('offers one quest per difficulty tier so a board is never all-hard or all-trivial', () => {
    for (const cadence of ['daily', 'weekly']) {
      const accountId = makeAccount(`questtier${cadence}`)
      db.getQuestOverview(accountId)

      const tiers = slotRows(accountId, cadence).map((row) => getQuestDefinition(row.quest_id).tier)
      expect(tiers).toEqual(['light', 'standard', 'hard'])
    }
  })

  it('assigns a target and payout drawn from the definition\'s declared variants', () => {
    const accountId = makeAccount('questvariant')
    db.getQuestOverview(accountId)

    for (const row of slotRows(accountId, 'daily')) {
      const variants = getQuestDefinition(row.quest_id).variants
      expect(variants).toContainEqual({ target: row.target, shards: row.reward_shards })
    }
  })

  it('renders the rolled target into the description rather than the definition default', () => {
    const accountId = makeAccount('questdescription')
    db.getQuestOverview(accountId)
    forceSlot(accountId, 'daily', 1, 'daily-burst-channeler', 4)

    const quest = progressOf(accountId, 'daily-burst-channeler')
    expect(quest.description).toBe('Complete 4 battles to charge the arena ledger.')
    expect(quest.description).not.toContain('{target}')
  })

  it('never leaks the server-side variant table to the client', () => {
    const accountId = makeAccount('questnoleak')
    const overview = db.getQuestOverview(accountId)
    expect(overview.quests.every((quest) => quest.variants === undefined)).toBe(true)
  })

  it('rerolls a quest for a different objective in the same tier', () => {
    const accountId = makeAccount('questreroll')
    db.getQuestOverview(accountId)
    const before = slotRows(accountId, 'daily')[2]

    const result = db.rerollQuest(accountId, before.quest_id)

    expect(result.ok).toBe(true)
    const after = slotRows(accountId, 'daily')[2]
    expect(after.quest_id).not.toBe(before.quest_id)
    expect(getQuestDefinition(after.quest_id).tier).toBe('hard')
    expect(after.progress).toBe(0)
    expect(after.rerolled).toBe(1)
    // The other two slots are untouched, and the board stays duplicate-free.
    expect(new Set(slotRows(accountId, 'daily').map((row) => row.quest_id)).size).toBe(3)
  })

  it('allows one free reroll per cadence per day', () => {
    const accountId = makeAccount('questrerollonce')
    expect(db.getQuestOverview(accountId).rerolls).toEqual({ daily: true, weekly: true })

    const [daily] = slotRows(accountId, 'daily')
    expect(db.rerollQuest(accountId, daily.quest_id).ok).toBe(true)

    const second = db.rerollQuest(accountId, slotRows(accountId, 'daily')[1].quest_id)
    expect(second.ok).toBe(false)
    expect(second.error).toMatch(/already used/i)

    // The weekly reroll is tracked separately and is still available.
    const overview = db.getQuestOverview(accountId)
    expect(overview.rerolls).toEqual({ daily: false, weekly: true })
    expect(db.rerollQuest(accountId, slotRows(accountId, 'weekly')[0].quest_id).ok).toBe(true)
  })

  it('refuses to reroll a quest that is ready to claim', () => {
    const accountId = makeAccount('questrerollready')
    db.getQuestOverview(accountId)
    const [slot] = slotRows(accountId, 'daily')
    db.default
      .prepare(
        `UPDATE player_quest_slots SET progress = target, completed_at = ?
         WHERE account_id = ? AND cadence = 'daily' AND slot_index = ?`,
      )
      .run(new Date().toISOString(), accountId, slot.slot_index)

    const result = db.rerollQuest(accountId, slot.quest_id)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/claim/i)
    // The free reroll was not consumed by the rejected attempt.
    expect(db.getQuestOverview(accountId).rerolls.daily).toBe(true)
  })

  it('refuses to reroll a permanent quest', () => {
    const accountId = makeAccount('questrerollpermanent')
    db.getQuestOverview(accountId)
    expect(db.rerollQuest(accountId, 'skirmish-legend').ok).toBe(false)
  })

  it('tracks streak objectives at their high-water mark', () => {
    const accountId = makeAccount('queststreak')
    db.getQuestOverview(accountId)
    forceSlot(accountId, 'daily', 1, 'daily-momentum-run', 3)

    db.recordQuestEvents(accountId, [{ type: 'reach_streak', amount: 2 }])
    expect(progressOf(accountId, 'daily-momentum-run').progress).toBe(2)

    // A shorter streak must not add to the peak, or three separate one-win
    // streaks would satisfy "reach a 3 win streak".
    db.recordQuestEvents(accountId, [{ type: 'reach_streak', amount: 1 }])
    expect(progressOf(accountId, 'daily-momentum-run').progress).toBe(2)

    db.recordQuestEvents(accountId, [{ type: 'reach_streak', amount: 3 }])
    expect(progressOf(accountId, 'daily-momentum-run').completed).toBe(true)
  })

  it('accumulates spend objectives by amount and caps at the target', () => {
    const accountId = makeAccount('questspend')
    db.getQuestOverview(accountId)
    forceSlot(accountId, 'daily', 1, 'daily-shardflow', 100)

    db.recordQuestEvents(accountId, [{ type: 'spend_shards', amount: 60 }])
    expect(progressOf(accountId, 'daily-shardflow').progress).toBe(60)

    db.recordQuestEvents(accountId, [{ type: 'spend_shards', amount: 60 }])
    const quest = progressOf(accountId, 'daily-shardflow')
    expect(quest.progress).toBe(100)
    expect(quest.completed).toBe(true)
  })

  it('only credits pack-tier objectives for a pack at or above the required tier', () => {
    const accountId = makeAccount('questpacktier')
    db.getQuestOverview(accountId)
    forceSlot(accountId, 'daily', 2, 'daily-premium-seal', 1)

    db.recordQuestEvents(accountId, [{ type: 'open_pack_type', packTier: 'basic' }])
    expect(progressOf(accountId, 'daily-premium-seal').progress).toBe(0)

    db.recordQuestEvents(accountId, [{ type: 'open_pack_type', packTier: 'legendary' }])
    expect(progressOf(accountId, 'daily-premium-seal').completed).toBe(true)
  })

  it('keeps the permanent tabs stocked instead of emptying them', () => {
    const accountId = makeAccount('questchainstocked')
    const overview = db.getQuestOverview(accountId)

    // The old milestone/skirmish tabs held five one-shot quests between them.
    for (const cadence of ['milestone', 'skirmish']) {
      const live = overview.quests.filter((quest) => quest.cadence === cadence && !quest.claimed)
      expect(live.length).toBeGreaterThan(0)
    }
    expect(overview.chains.length).toBe(13)
  })

  it('rolls surplus progress into later chain tiers instead of discarding it', () => {
    const accountId = makeAccount('questchainsurplus')
    db.getQuestOverview(accountId)

    // Far past tier I (1 win) and tier II (5 wins) in one go.
    db.recordQuestEvents(accountId, [{ type: 'win_any_match', amount: 30 }])

    const chain = db.getQuestOverview(accountId).chains.find((entry) => entry.id === 'chain-riftbreaker')
    expect(chain.progress).toBe(30)
    expect(chain.completed).toBe(true)

    // Each claim advances one tier, and the banked total keeps satisfying them.
    expect(db.claimQuestReward(accountId, 'chain-riftbreaker').ok).toBe(true)
    expect(db.claimQuestReward(accountId, 'chain-riftbreaker').ok).toBe(true)
    expect(db.claimQuestReward(accountId, 'chain-riftbreaker').ok).toBe(true)

    const after = db.getQuestOverview(accountId).chains.find((entry) => entry.id === 'chain-riftbreaker')
    expect(after.tierIndex).toBe(3)
    expect(after.target).toBe(100)
    expect(after.progress).toBe(30)
    expect(after.completed).toBe(false)
  })

  it('generates further tiers past the end of an endless ladder', () => {
    const accountId = makeAccount('questchainendless')
    db.getQuestOverview(accountId)
    // chain-legend-path lists 1/5/25 then continues in steps of 25.
    db.default
      .prepare('UPDATE player_quest_chains SET claimed_tier = 3, progress = 25 WHERE account_id = ? AND chain_id = ?')
      .run(accountId, 'chain-legend-path')

    const chain = db.getQuestOverview(accountId).chains.find((entry) => entry.id === 'chain-legend-path')

    expect(chain.exhausted).toBe(false)
    expect(chain.target).toBe(50)
    expect(chain.reward.shards).toBe(350)
  })

  it('marks a finite chain exhausted once its last tier is claimed', () => {
    const accountId = makeAccount('questchainfinite')
    db.getQuestOverview(accountId)
    db.default
      .prepare('UPDATE player_quest_chains SET claimed_tier = 1, progress = 14 WHERE account_id = ? AND chain_id = ?')
      .run(accountId, 'chain-deckwright')

    const chain = db.getQuestOverview(accountId).chains.find((entry) => entry.id === 'chain-deckwright')

    expect(chain.exhausted).toBe(true)
    expect(chain.endless).toBe(false)
    expect(db.claimQuestReward(accountId, 'chain-deckwright').ok).toBe(false)
  })

  it('credits chain tier I to players who claimed the one-shot quest it replaced', () => {
    const accountId = makeAccount('questchainlegacy')
    // Simulate a pre-chain account that had already beaten the Legend skirmish.
    db.default.prepare('DELETE FROM player_quest_chains WHERE account_id = ?').run(accountId)
    db.default
      .prepare(
        `INSERT INTO player_quests (account_id, quest_id, cadence, period_key, progress, claimed)
         VALUES (?, 'skirmish-legend', 'skirmish', 'ever', 1, 1)`,
      )
      .run(accountId)

    const chain = db.getQuestOverview(accountId).chains.find((entry) => entry.id === 'chain-legend-path')

    expect(chain.tierIndex).toBe(1)
    expect(chain.progress).toBe(1)
    expect(chain.tierLabel).toBe('II')
    // An unclaimed legacy quest must not hand out credit.
    const untouched = db.getQuestOverview(accountId).chains.find((entry) => entry.id === 'chain-adept-path')
    expect(untouched.tierIndex).toBe(0)
  })

  it('tracks collection size from live ownership rather than an event tally', () => {
    const accountId = makeAccount('questchaincollect')
    const archivist = () => db.getQuestOverview(accountId).chains.find((entry) => entry.id === 'chain-archivist')

    const starter = Object.keys(db.getProfile(accountId).owned_cards).length
    expect(archivist().progress).toBe(starter)

    const owned = Object.fromEntries(CARD_LIBRARY.slice(0, starter + 8).map((card) => [card.id, 1]))
    db.default
      .prepare('UPDATE player_profiles SET owned_cards = ? WHERE account_id = ?')
      .run(JSON.stringify(owned), accountId)
    expect(archivist().progress).toBe(starter + 8)

    // Breaking the collection back down must not claw back chain progress —
    // a milestone you reached stays reached.
    db.default
      .prepare('UPDATE player_profiles SET owned_cards = ? WHERE account_id = ?')
      .run(JSON.stringify({ [CARD_LIBRARY[0].id]: 1 }), accountId)
    expect(archivist().progress).toBe(starter + 8)
  })

  it('credits shard spend and pack tier when a pack is actually opened', () => {
    const accountId = makeAccount('questpackopen')
    db.getQuestOverview(accountId)
    db.default.prepare('UPDATE player_profiles SET shards = 500 WHERE account_id = ?').run(accountId)
    forceSlot(accountId, 'daily', 1, 'daily-shardflow', 100)
    forceSlot(accountId, 'daily', 2, 'daily-premium-seal', 1)

    expect(db.openPack(accountId, 'premium').ok).toBe(true)

    expect(progressOf(accountId, 'daily-shardflow').progress).toBe(100)
    expect(progressOf(accountId, 'daily-premium-seal').completed).toBe(true)
  })
})

describe('durable authoritative match settlement', () => {
  function settlePair(matchId, firstAccountId, secondAccountId, firstResult = 'win', mode = 'duel') {
    const secondResult = firstResult === 'draw' ? 'draw' : 'loss'
    return db.settleAuthoritativeMatch({
      matchId,
      mode,
      reason: firstResult === 'draw' ? 'draw' : 'completed',
      turns: 8,
      participants: [
        { accountId: firstAccountId, name: 'First', result: firstResult },
        { accountId: secondAccountId, name: 'Second', result: secondResult },
      ],
      metadata: { source: 'vitest' },
    })
  }

  it('settles both players once and returns the stored outcome on retry', () => {
    const winner = makeAccount('settlementwinner')
    const loser = makeAccount('settlementloser')
    const winnerBefore = db.getProfile(winner)
    const loserBefore = db.getProfile(loser)

    const first = settlePair('auth-match-idempotent', winner, loser)
    expect(first.ok, first.error).toBe(true)
    expect(first.replayed).toBe(false)
    expect(first.outcomes).toHaveLength(2)

    const afterFirstWinner = db.getProfile(winner)
    const afterFirstLoser = db.getProfile(loser)
    expect(afterFirstWinner.shards).toBe(winnerBefore.shards + 30)
    expect(afterFirstWinner.season_rating).toBe(winnerBefore.season_rating + 25)
    expect(afterFirstWinner.wins).toBe(winnerBefore.wins + 1)
    expect(afterFirstLoser.shards).toBe(loserBefore.shards + 10)
    expect(afterFirstLoser.season_rating).toBe(loserBefore.season_rating - 15)
    expect(afterFirstLoser.losses).toBe(loserBefore.losses + 1)

    const replay = db.settleAuthoritativeMatch({ matchId: 'auth-match-idempotent' })
    expect(replay.ok).toBe(true)
    expect(replay.replayed).toBe(true)
    expect(replay.outcomes).toEqual(first.outcomes)
    expect(db.getProfile(winner).shards).toBe(afterFirstWinner.shards)
    expect(db.getProfile(loser).shards).toBe(afterFirstLoser.shards)
    expect(db.default.prepare(
      'SELECT COUNT(*) AS count FROM economy_ledger WHERE match_id = ?',
    ).get('auth-match-idempotent').count).toBe(2)

    const winnerView = db.getMatchSettlementForAccount('auth-match-idempotent', winner)
    expect(winnerView.outcome.result).toBe('win')
    expect(db.getLatestUnacknowledgedSettlement(loser).matchId).toBe('auth-match-idempotent')
    expect(db.acknowledgeMatchSettlement('auth-match-idempotent', loser)).toBe(true)
    expect(db.getLatestUnacknowledgedSettlement(loser)).toBeNull()
  })

  it('does not partially settle when either participant profile is missing', () => {
    const existing = makeAccount('settlementatomic')
    const before = db.getProfile(existing)

    const result = settlePair('auth-match-missing-side', existing, 'acct-does-not-exist')

    expect(result.ok).toBe(false)
    expect(db.getProfile(existing).shards).toBe(before.shards)
    expect(db.getProfile(existing).season_rating).toBe(before.season_rating)
    expect(db.default.prepare(
      'SELECT COUNT(*) AS count FROM authoritative_matches WHERE match_id = ?',
    ).get('auth-match-missing-side').count).toBe(0)
  })

  it('records a draw for both players without currency, rating, or record changes', () => {
    const firstAccount = makeAccount('settlementdrawa')
    const secondAccount = makeAccount('settlementdrawb')
    const firstBefore = db.getProfile(firstAccount)
    const secondBefore = db.getProfile(secondAccount)

    const result = settlePair('auth-match-draw', firstAccount, secondAccount, 'draw')

    expect(result.ok, result.error).toBe(true)
    expect(result.outcomes.every((outcome) => outcome.shardsEarned === 0)).toBe(true)
    expect(result.outcomes.every((outcome) => outcome.ratingDelta === 0)).toBe(true)
    expect(db.getProfile(firstAccount).shards).toBe(firstBefore.shards)
    expect(db.getProfile(secondAccount).shards).toBe(secondBefore.shards)
    expect(db.getProfile(firstAccount).wins).toBe(firstBefore.wins)
    expect(db.getProfile(secondAccount).losses).toBe(secondBefore.losses)
  })

  it('caps the authoritative streak bonus at twenty shards', () => {
    const winner = makeAccount('settlementstreaka')
    const loser = makeAccount('settlementstreakb')
    db.default.prepare('UPDATE player_profiles SET streak = 20 WHERE account_id = ?').run(winner)

    const result = settlePair('auth-match-streak-cap', winner, loser)
    expect(result.ok, result.error).toBe(true)
    const winnerOutcome = result.outcomes.find((outcome) => outcome.accountId === winner)
    expect(winnerOutcome.shardsEarned).toBe(50)
    expect(winnerOutcome.streak).toBe(21)
    expect(winnerOutcome.ratingDelta).toBe(25)
  })

  it('keeps friend matches non-economic', () => {
    const firstAccount = makeAccount('settlementfrienda')
    const secondAccount = makeAccount('settlementfriendb')
    const firstBefore = db.getProfile(firstAccount)
    const secondBefore = db.getProfile(secondAccount)
    db.default.prepare('UPDATE player_profiles SET streak = 4 WHERE account_id = ?').run(firstAccount)

    const result = settlePair('auth-match-friend', firstAccount, secondAccount, 'win', 'unranked')

    expect(result.ok, result.error).toBe(true)
    expect(result.outcomes.every((outcome) => outcome.shardsEarned === 0)).toBe(true)
    expect(result.outcomes.every((outcome) => outcome.ratingDelta === 0)).toBe(true)
    expect(db.getProfile(firstAccount).streak).toBe(4)
    expect(db.getProfile(firstAccount).wins).toBe(firstBefore.wins)
    expect(db.getProfile(secondAccount).losses).toBe(secondBefore.losses)
  })

  it('settles a maintenance abort as a no-contest without rewards, record, or quest progress', () => {
    const firstAccount = makeAccount('settlementaborta')
    const secondAccount = makeAccount('settlementabortb')
    const firstBefore = db.getProfile(firstAccount)
    const questsBefore = db.getQuestOverview(firstAccount).quests.map(({ id, progress }) => ({ id, progress }))

    const result = db.settleAuthoritativeMatch({
      matchId: 'auth-match-maintenance-abort',
      mode: 'duel',
      reason: 'server_abort',
      turns: 6,
      participants: [
        { accountId: firstAccount, name: 'First', result: 'draw' },
        { accountId: secondAccount, name: 'Second', result: 'draw' },
      ],
    })

    expect(result.ok, result.error).toBe(true)
    expect(result.outcomes.every((outcome) => outcome.shardsEarned === 0)).toBe(true)
    expect(db.getProfile(firstAccount)).toMatchObject({
      shards: firstBefore.shards,
      season_rating: firstBefore.season_rating,
      wins: firstBefore.wins,
      losses: firstBefore.losses,
      streak: firstBefore.streak,
    })
    expect(db.getQuestOverview(firstAccount).quests.map(({ id, progress }) => ({ id, progress }))).toEqual(questsBefore)
  })

  it('applies ranked rating and W/L but no farmable reward for an early surrender', () => {
    const winner = makeAccount('settlementsurrendera')
    const loser = makeAccount('settlementsurrenderb')
    const winnerBefore = db.getProfile(winner)
    const loserBefore = db.getProfile(loser)

    const result = db.settleAuthoritativeMatch({
      matchId: 'auth-match-early-surrender',
      mode: 'duel',
      reason: 'surrender',
      turns: 1,
      participants: [
        { accountId: winner, name: 'Winner', result: 'win' },
        { accountId: loser, name: 'Loser', result: 'loss' },
      ],
    })

    expect(result.ok, result.error).toBe(true)
    expect(result.outcomes.every((outcome) => outcome.shardsEarned === 0)).toBe(true)
    expect(db.getProfile(winner).season_rating).toBe(winnerBefore.season_rating + 25)
    expect(db.getProfile(loser).season_rating).toBe(loserBefore.season_rating - 15)
    expect(db.getProfile(winner).wins).toBe(winnerBefore.wins + 1)
    expect(db.getProfile(loser).losses).toBe(loserBefore.losses + 1)
    expect(db.getProfile(winner).streak).toBe(winnerBefore.streak)
  })

  it('supports one-participant authoritative AI completion and blocks abort rewards', () => {
    const player = makeAccount('settlementaiplayer')
    const before = db.getProfile(player)
    const completed = db.settleAuthoritativeMatch({
      matchId: 'auth-match-ai-complete',
      mode: 'ai',
      reason: 'completed',
      turns: 7,
      participants: [{ accountId: player, name: 'Player', opponentName: 'Legend AI', result: 'win' }],
      metadata: { aiDifficulty: 'legend' },
    })
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.outcomes[0].shardsEarned).toBe(30)
    expect(db.getProfile(player).shards).toBe(before.shards + 30)

    const afterCompleted = db.getProfile(player)
    const aborted = db.settleAuthoritativeMatch({
      matchId: 'auth-match-ai-abort',
      mode: 'ai',
      reason: 'abort',
      turns: 5,
      participants: [{ accountId: player, name: 'Player', opponentName: 'Legend AI', result: 'loss' }],
      metadata: { aiDifficulty: 'legend' },
    })
    expect(aborted.ok, aborted.error).toBe(true)
    expect(aborted.outcomes[0].shardsEarned).toBe(0)
    expect(db.getProfile(player).shards).toBe(afterCompleted.shards)
    expect(db.getProfile(player).streak).toBe(afterCompleted.streak)
  })
})

describe('match deck validation', () => {
  it('returns a sanitized, non-mutating authenticated deck snapshot', () => {
    const accountId = makeAccount('matchdeckvalid')
    const decksBefore = db.default.prepare(
      'SELECT COUNT(*) AS count FROM player_decks WHERE account_id = ?',
    ).get(accountId).count

    const result = db.validateDeckForMatch(accountId)

    expect(result.ok, result.error).toBe(true)
    expect(result.ready).toBe(true)
    expect(result.total).toBeGreaterThanOrEqual(10)
    expect(db.default.prepare(
      'SELECT COUNT(*) AS count FROM player_decks WHERE account_id = ?',
    ).get(accountId).count).toBe(decksBefore)
  })

  it('rejects unknown and unowned cards in candidate decks', () => {
    const accountId = makeAccount('matchdeckinvalid')
    const profile = db.getProfile(accountId)
    const candidate = { ...profile.deck_config, 'not-a-real-card': 1 }
    const firstCard = Object.keys(candidate)[0]
    candidate[firstCard] = 0

    const result = db.validateDeckForMatch(accountId, candidate)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/unknown card/i)
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

describe('account lifecycle safety', () => {
  /** Backdate an account so age-gated sweepers treat it as stale. */
  function ageAccount(accountId, offset) {
    db.default.prepare(`UPDATE accounts SET created_at = datetime('now', ?) WHERE id = ?`)
      .run(offset, accountId)
  }

  function statusOf(accountId) {
    return db.default.prepare('SELECT account_status FROM accounts WHERE id = ?')
      .get(accountId)?.account_status ?? null
  }

  it('does not expire legacy accounts unless an operator opts in', () => {
    const id = makeAccount('legacy_protected')
    db.default.prepare(`
      UPDATE accounts
      SET legacy_migration_deadline_at = datetime('now', '-1 day'),
          legacy_migration_completed_at = NULL
      WHERE id = ?
    `).run(id)

    const skipped = db.expireLegacyMigrationAccounts()
    expect(skipped.deleted).toBe(0)
    expect(skipped.skipped).toBe('disabled')
    expect(statusOf(id)).toBe('active')

    // The destructive path still works when an operator explicitly forces it.
    const forced = db.expireLegacyMigrationAccounts({ force: true })
    expect(forced.deleted).toBeGreaterThanOrEqual(1)
    expect(statusOf(id)).toBe('deleted')
  })

  it('releases an abandoned signup username instead of squatting it forever', () => {
    const id = makeAccount('abandoned_signup')
    db.markAccountPendingPasskeySignup(id)
    // Past the 30-minute sweep TTL, not just the 5-minute ceremony window.
    ageAccount(id, '-40 minutes')

    const reaped = db.reapAbandonedSignups()
    expect(reaped.released).toBeGreaterThanOrEqual(1)
    expect(reaped.usernames).toContain('abandoned_signup')
    expect(statusOf(id)).toBeNull()

    expect(db.createAccount('abandoned_signup', 'password12345', 'abandoned_signup', '', '', '').ok).toBe(true)
  })

  it('keeps an in-flight signup ceremony reserved', () => {
    const id = makeAccount('inflight_signup')
    db.markAccountPendingPasskeySignup(id)

    expect(db.reapAbandonedSignups().released).toBe(0)
    expect(statusOf(id)).toBe('pending_passkey')
    // A fresh reservation still blocks a same-username retry.
    expect(db.createAccount('inflight_signup', 'password12345', 'x', '', '', '').ok).toBe(false)
  })

  it('lets a player reclaim their own username after a dead ceremony', () => {
    const id = makeAccount('retry_signup')
    db.markAccountPendingPasskeySignup(id)
    ageAccount(id, '-10 minutes')

    const retry = db.createAccount('retry_signup', 'password12345', 'retry_signup', '', '', '')
    expect(retry.ok, retry.error).toBe(true)
    expect(retry.accountId).not.toBe(id)
  })

  it('does not let abandoned signups consume the per-device account quota', () => {
    const fingerprint = 'device-quota-fp'
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const created = db.createAccount(`quota_pending_${attempt}`, 'password12345', 'q', fingerprint, '', '')
      expect(created.ok, created.error).toBe(true)
      db.markAccountPendingPasskeySignup(created.accountId)
    }

    const real = db.createAccount('quota_real', 'password12345', 'q', fingerprint, '', '')
    expect(real.ok, real.error).toBe(true)
  })

  it('restores a swept account with its collection and rating intact', () => {
    const id = makeAccount('restore_me')
    db.default.prepare(`
      UPDATE player_profiles SET shards = 4200, season_rating = 1480, wins = 37, losses = 12
      WHERE account_id = ?
    `).run(id)
    db.default.prepare(`
      UPDATE accounts
      SET legacy_migration_deadline_at = datetime('now', '-1 day'), legacy_migration_completed_at = NULL
      WHERE id = ?
    `).run(id)

    db.expireLegacyMigrationAccounts({ force: true })
    expect(statusOf(id)).toBe('deleted')
    expect(db.authenticateAccount('restore_me', 'password12345').ok).toBe(false)

    const listed = db.listDeletedAccounts().find((row) => row.accountId === id)
    expect(listed?.reason).toBe('legacy_migration_expired')
    expect(listed?.shards).toBe(4200)

    const restored = db.restoreAccount(id, { metadata: { source: 'vitest' } })
    expect(restored.ok, restored.error).toBe(true)
    expect(restored.nextStep).toBe('sign_in_with_legacy_password')
    expect(statusOf(id)).toBe('active')

    // Player value survived the whole round trip.
    const profile = db.getProfile(id)
    expect(profile.shards).toBe(4200)
    expect(profile.season_rating).toBe(1480)
    expect(profile.wins).toBe(37)
    expect(db.authenticateAccount('restore_me', 'password12345').ok).toBe(true)
  })

  it('gives a restored account a fresh window so the sweeper cannot re-take it', () => {
    const id = makeAccount('restore_deadline')
    db.default.prepare(`
      UPDATE accounts
      SET legacy_migration_deadline_at = datetime('now', '-1 day'), legacy_migration_completed_at = NULL
      WHERE id = ?
    `).run(id)
    db.expireLegacyMigrationAccounts({ force: true })
    expect(db.restoreAccount(id).ok).toBe(true)

    // Running the sweeper again immediately must not undo the restore.
    db.expireLegacyMigrationAccounts({ force: true })
    expect(statusOf(id)).toBe('active')
  })

  it('refuses to restore an account that was never deleted', () => {
    const id = makeAccount('not_deleted')
    const result = db.restoreAccount(id)
    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
  })
})

describe('owner and admin account management', () => {
  let owner
  let admin
  let secondAdmin
  let player

  beforeAll(() => {
    admin = makeAccount('mgmt_admin')
    secondAdmin = makeAccount('mgmt_admin2')
    player = makeAccount('mgmt_player')
    // The suite shares one database and only one account may hold the owner
    // role, so adopt whichever account already claimed it.
    owner = db.default.prepare(`SELECT id FROM accounts WHERE role = 'owner'`).get()?.id
    if (!owner) {
      owner = makeAccount('mgmt_owner')
      expect(db.assignInitialOwner(owner).ok).toBe(true)
    }
    expect(db.setAccountRole(owner, admin, 'admin').ok).toBe(true)
    expect(db.setAccountRole(owner, secondAdmin, 'admin').ok).toBe(true)
  })

  it('lets an admin reset a user but never an admin, the owner, or themselves', () => {
    expect(db.adminResetAccountCredentials(admin, player).ok).toBe(true)
    expect(db.adminResetAccountCredentials(admin, secondAdmin).status).toBe(403)
    expect(db.adminResetAccountCredentials(admin, owner).status).toBe(403)
    expect(db.adminResetAccountCredentials(admin, admin).status).toBe(400)
    // A non-privileged account cannot use these paths at all.
    expect(db.adminResetAccountCredentials(player, admin).status).toBe(403)
  })

  it('reserves account deletion and restore for the owner', () => {
    const victim = makeAccount('mgmt_deletable')
    expect(db.adminDeleteAccount(admin, victim).status).toBe(403)

    const deleted = db.adminDeleteAccount(owner, victim)
    expect(deleted.ok, deleted.error).toBe(true)
    expect(db.authenticateAccount('mgmt_deletable', 'password12345').ok).toBe(false)

    expect(db.adminRestoreAccount(admin, victim).status).toBe(403)
    const restored = db.adminRestoreAccount(owner, victim)
    expect(restored.ok, restored.error).toBe(true)
    expect(db.authenticateAccount('mgmt_deletable', 'password12345').ok).toBe(true)
  })

  it('resets credentials to a single-use grant the player redeems themselves', () => {
    const target = makeAccount('mgmt_reset')
    addPasskey(target, 'cred-mgmt-reset')
    const session = db.createSession(target, '', '', 'passkey')

    const reset = db.adminResetAccountCredentials(owner, target)
    expect(reset.ok, reset.error).toBe(true)
    expect(reset.grantCode).toMatch(/^FAR-/)
    // The reset must actually cut off the old device and session.
    expect(db.listAccountPasskeys(target)).toHaveLength(0)
    expect(db.validateSession(session.token)).toBeNull()

    const found = db.findAccountRecoveryGrant(reset.grantCode)
    expect(found?.account.id).toBe(target)

    const completed = db.completeAccountRecoveryWithGrant(target, found.grantId, {
      id: 'cred-mgmt-new', publicKey: Buffer.from('pk-mgmt-new'), counter: 0, transports: ['internal'],
    })
    expect(completed.ok, completed.error).toBe(true)
    expect(db.listAccountPasskeys(target)).toHaveLength(1)

    // Single use: the same code cannot be replayed.
    expect(db.findAccountRecoveryGrant(reset.grantCode)).toBeNull()
  })

  it('suspends an account, cutting sessions and blocking play until lifted', () => {
    const target = makeAccount('mgmt_suspend')
    const session = db.createSession(target, '', '', 'password')

    const suspended = db.adminSuspendAccount(owner, target, { hours: 48, reason: 'cheating' })
    expect(suspended.ok, suspended.error).toBe(true)
    expect(db.validateSession(session.token)).toBeNull()
    expect(db.getAccountReadiness(target).ready).toBe(false)
    expect(db.getAdminAccountDetail(target).suspended).toBe(true)

    expect(db.adminUnsuspendAccount(owner, target).ok).toBe(true)
    expect(db.getAdminAccountDetail(target).suspended).toBe(false)
  })

  it('never exposes credential material through the admin detail view', () => {
    const target = makeAccount('mgmt_privacy')
    addPasskey(target, 'cred-mgmt-privacy')
    const reset = db.adminResetAccountCredentials(owner, target)

    const detail = db.getAdminAccountDetail(target)
    const serialized = JSON.stringify(detail)
    expect(serialized).not.toContain('password_hash')
    expect(serialized).not.toContain('token_hash')
    // The one-time grant code must never be readable back after issuance.
    expect(serialized).not.toContain(reset.grantCode)
    expect(detail.recoveryGrants[0].status).toBe('active')
  })

  it('writes an audit row for every privileged action', () => {
    const target = makeAccount('mgmt_audited')
    db.adminSuspendAccount(owner, target, { hours: 1 })
    db.adminUnsuspendAccount(owner, target)

    // Read the table directly: listAudit orders by a second-granularity
    // timestamp, so rows written in the same second have no stable order.
    const actions = db.default
      .prepare('SELECT action FROM admin_audit WHERE target_account_id = ?')
      .all(target)
      .map((row) => row.action)
    expect(actions).toContain('account_suspended')
    expect(actions).toContain('account_unsuspended')
  })
})
