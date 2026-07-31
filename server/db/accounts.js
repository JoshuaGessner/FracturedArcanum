/**
 * Accounts, sessions, and assisted recovery.
 *
 * One identity domain. Splitting these apart produces an import cycle: session
 * lookup reads accounts, account deletion revokes sessions, and recovery grants
 * touch both.
 */
import { createHash, randomBytes } from 'node:crypto'
import { DEFAULT_DECK_CONFIG } from '../game.js'
import { CURRENT_ACCOUNT_STANDARD_VERSION, CURRENT_AGE_GATE_VERSION, CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, LEGACY_MIGRATION_EXPIRY_ENABLED, LEGACY_MIGRATION_WINDOW_DAYS, PASSKEY_DEVICE_LINK_TTL_MS, PENDING_SIGNUP_TTL_MS, RECOVERY_CODE_COUNT, db, getCurrentLegalVersions, prepare, transaction } from './connection.js'
import { hashFingerprint, hashPassword, hashUserAgent, verifyPassword } from './crypto.js'
import { buildStarterCollection } from './profiles.js'

// ─── Account operations ──────────────────────────────────────────────────────

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/
const DISPLAY_RE = /^.{1,24}$/
const PASSWORD_MIN = 8
const MAX_ACCOUNTS_PER_DEVICE = 2
const MAX_ACCOUNTS_PER_IP = 4
const MAX_ACCOUNTS_PER_IP_PER_DAY = 2
const MAX_ACCOUNTS_PER_IP_AND_AGENT_PER_WEEK = 3
const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000

const _insertAccount = prepare(`
  INSERT INTO accounts (id, username, password_hash, display_name, device_fp, created_ip_hash, created_ua_hash, flags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const _insertProfile = prepare(`
  INSERT INTO player_profiles (account_id, deck_config, owned_cards)
  VALUES (?, ?, ?)
`)

export const _getByUsername = prepare(`SELECT * FROM accounts WHERE username = ?`)
export const _getById = prepare(`SELECT * FROM accounts WHERE id = ?`)
const _countAuthenticatorsByAccount = prepare(`SELECT COUNT(*) as cnt FROM account_authenticators WHERE account_id = ?`)
const _listAuthenticatorsByAccount = prepare(`
  SELECT id, credential_id, transports, backed_up, device_type, name, created_at, last_used_at
  FROM account_authenticators
  WHERE account_id = ?
  ORDER BY created_at DESC
`)
const _listAuthenticatorCredentialsByAccount = prepare(`
  SELECT id, credential_id, transports, counter
  FROM account_authenticators
  WHERE account_id = ?
  ORDER BY created_at DESC
`)
const _getAuthenticatorByCredentialId = prepare(`
  SELECT a.*, acct.username, acct.display_name, acct.role
  FROM account_authenticators a
  JOIN accounts acct ON acct.id = a.account_id
  WHERE a.credential_id = ?
`)
const _insertAuthenticator = prepare(`
  INSERT INTO account_authenticators (
    id, account_id, credential_id, credential_public_key, counter, transports, backed_up, device_type, name
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const _updateAuthenticatorCounter = prepare(`
  UPDATE account_authenticators
  SET counter = ?, backed_up = ?, device_type = ?, last_used_at = datetime('now')
  WHERE id = ?
`)
const _deleteAuthenticator = prepare(`DELETE FROM account_authenticators WHERE id = ? AND account_id = ?`)
const _deleteOtherAuthenticatorsByAccount = prepare(`DELETE FROM account_authenticators WHERE account_id = ? AND id <> ?`)
const _consumeOutstandingAuthChallenges = prepare(`
  UPDATE auth_challenges
  SET consumed_at = datetime('now')
  WHERE account_id = ? AND purpose = ? AND consumed_at IS NULL
`)
const _insertAuthChallenge = prepare(`
  INSERT INTO auth_challenges (id, account_id, purpose, challenge, metadata, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const _getActiveAuthChallenge = prepare(`
  SELECT * FROM auth_challenges
  WHERE id = ?
    AND purpose = ?
    AND consumed_at IS NULL
    AND expires_at > datetime('now')
`)
const _consumeAuthChallenge = prepare(`UPDATE auth_challenges SET consumed_at = datetime('now') WHERE id = ?`)
const _insertPasskeyDeviceLink = prepare(`
  INSERT INTO passkey_device_links (id, account_id, secret_hash, created_by_session, expires_at)
  VALUES (?, ?, ?, ?, ?)
`)
const _getPendingPasskeyDeviceLink = prepare(`
  SELECT link.*, acct.username, acct.display_name, acct.role, acct.account_status, acct.deleted_at
  FROM passkey_device_links link
  JOIN accounts acct ON acct.id = link.account_id
  WHERE link.id = ?
    AND link.secret_hash = ?
    AND link.status = 'pending'
    AND link.consumed_at IS NULL
    AND link.expires_at > datetime('now')
`)
const _consumePasskeyDeviceLink = prepare(`
  UPDATE passkey_device_links
  SET status = 'consumed', consumed_at = datetime('now')
  WHERE id = ? AND account_id = ? AND status = 'pending' AND consumed_at IS NULL AND expires_at > datetime('now')
`)
const _expirePasskeyDeviceLinks = prepare(`
  UPDATE passkey_device_links
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at <= datetime('now')
`)
const _insertAccountConsent = prepare(`
  INSERT INTO account_consents (id, account_id, document_type, document_version, ip_hash, ua_hash, locale, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
const _countActiveRecoveryCodes = prepare(`
  SELECT COUNT(*) as cnt
  FROM account_recovery_codes
  WHERE account_id = ? AND used_at IS NULL AND revoked_at IS NULL
`)
const _listActiveRecoveryCodes = prepare(`
  SELECT id, code_hash, code_prefix, batch_id, created_at
  FROM account_recovery_codes
  WHERE account_id = ? AND used_at IS NULL AND revoked_at IS NULL
  ORDER BY created_at DESC
`)
const _revokeRecoveryCodesByAccount = prepare(`
  UPDATE account_recovery_codes
  SET revoked_at = datetime('now')
  WHERE account_id = ? AND used_at IS NULL AND revoked_at IS NULL
`)
const _insertRecoveryCode = prepare(`
  INSERT INTO account_recovery_codes (id, account_id, code_hash, code_prefix, batch_id)
  VALUES (?, ?, ?, ?, ?)
`)
const _consumeRecoveryCode = prepare(`
  UPDATE account_recovery_codes
  SET used_at = datetime('now')
  WHERE id = ? AND account_id = ? AND used_at IS NULL AND revoked_at IS NULL
`)
const _acknowledgeRecoveryCodes = prepare(`
  UPDATE accounts
  SET recovery_codes_acknowledged_at = datetime('now'), last_security_event_at = datetime('now')
  WHERE id = ?
`)
const _insertSecurityEvent = prepare(`
  INSERT INTO security_events (id, account_id, event_type, ip_hash, ua_hash, metadata)
  VALUES (?, ?, ?, ?, ?, ?)
`)
export const _markAccountDeleted = prepare(`
  UPDATE accounts
  SET account_status = 'deleted', deleted_at = datetime('now'), last_security_event_at = datetime('now')
  WHERE id = ?
`)
const _markAccountPendingPasskeySignup = prepare(`
  UPDATE accounts
  SET account_status = 'pending_passkey', account_setup_required = 1, last_security_event_at = datetime('now')
  WHERE id = ?
`)
const _startLegacyMigrationWindow = prepare(`
  UPDATE accounts
  SET legacy_migration_started_at = COALESCE(legacy_migration_started_at, datetime('now')),
      legacy_migration_deadline_at = COALESCE(legacy_migration_deadline_at, datetime('now', '+${LEGACY_MIGRATION_WINDOW_DAYS} days'))
  WHERE id = ? AND legacy_migration_completed_at IS NULL
`)
export const _deleteAuthenticatorsByAccount = prepare(`DELETE FROM account_authenticators WHERE account_id = ?`)
const _deleteEmailTokensByAccount = prepare(`DELETE FROM email_tokens WHERE account_id = ?`)
export const _deleteAuthChallengesByAccount = prepare(`DELETE FROM auth_challenges WHERE account_id = ?`)
const _deleteFriendEdgesByAccount = prepare(`DELETE FROM social_friends WHERE account_id = ? OR friend_account_id = ?`)
const _deleteClanMembershipByAccount = prepare(`DELETE FROM clan_members WHERE account_id = ?`)
const _completeAccountStandards = prepare(`
  UPDATE accounts
  SET account_status = 'active',
      terms_version = ?,
      terms_accepted_at = datetime('now'),
      terms_accepted_ip_hash = ?,
      terms_accepted_ua_hash = ?,
      privacy_version = ?,
      privacy_accepted_at = datetime('now'),
      privacy_accepted_ip_hash = ?,
      privacy_accepted_ua_hash = ?,
      age_gate_version = ?,
      age_attested_at = datetime('now'),
      age_attestation = ?,
      account_standard_version = ?,
      account_setup_required = 0,
      legacy_migration_completed_at = COALESCE(legacy_migration_completed_at, datetime('now')),
      last_security_event_at = datetime('now')
  WHERE id = ?
`)

// Signup-cluster limits count real accounts only. A `pending_passkey` row is an
// unfinished ceremony that `reapAbandonedSignups` will delete, so counting it
// would let a cancelled Touch ID prompt burn a player's device quota for good.
const NOT_ABANDONED_SIGNUP = `account_status <> 'pending_passkey'`

const _countByFp = prepare(`
  SELECT COUNT(*) as cnt FROM accounts
  WHERE device_fp = ? AND device_fp IS NOT NULL AND ${NOT_ABANDONED_SIGNUP}
`)

const _countByCreatedIp = prepare(`
  SELECT COUNT(*) as cnt FROM accounts
  WHERE created_ip_hash = ? AND created_ip_hash IS NOT NULL AND ${NOT_ABANDONED_SIGNUP}
`)

const _countByCreatedIpPerDay = prepare(`
  SELECT COUNT(*) as cnt
  FROM accounts
  WHERE created_ip_hash = ?
    AND created_ip_hash IS NOT NULL
    AND ${NOT_ABANDONED_SIGNUP}
    AND created_at >= datetime('now', '-1 day')
`)

const _countByCreatedIpAndAgentPerWeek = prepare(`
  SELECT COUNT(*) as cnt
  FROM accounts
  WHERE created_ip_hash = ?
    AND created_ua_hash = ?
    AND created_ip_hash IS NOT NULL
    AND created_ua_hash IS NOT NULL
    AND ${NOT_ABANDONED_SIGNUP}
    AND created_at >= datetime('now', '-7 day')
`)

function getCount(row) {
  return Number(row?.cnt ?? 0)
}

function hashSessionToken(token) {
  return createHash('sha256').update(`rc-session-token:${token}`).digest('hex')
}

function hashPasskeyDeviceLinkSecret(secret) {
  return createHash('sha256').update(`rc-passkey-device-link:${secret}`).digest('hex')
}

function parsePasskeyDeviceLinkToken(token) {
  const [id, secret] = String(token ?? '').split('.')
  if (!id || !secret || !id.startsWith('pdlink-') || secret.length < 32) return null
  return { id, secretHash: hashPasskeyDeviceLinkSecret(secret) }
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function mapAuthenticatorSummary(row) {
  return {
    id: row.id,
    credentialId: row.credential_id,
    transports: parseJson(row.transports, []),
    backedUp: Boolean(row.backed_up),
    deviceType: row.device_type,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

function normalizeRecoveryCode(code) {
  const normalized = String(code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalized.length === 12 && !normalized.startsWith('FA') ? `FA${normalized}` : normalized
}

function formatRecoveryCode(raw) {
  return `FA-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

function generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let raw = ''
  while (raw.length < 12) {
    const byte = randomBytes(1)[0]
    if (byte < alphabet.length * 7) raw += alphabet[byte % alphabet.length]
  }
  return formatRecoveryCode(raw)
}

function recoveryCodePrefix(code) {
  return normalizeRecoveryCode(code).slice(0, 6)
}

export function recoveryStatusForAccount(accountId) {
  const account = _getById.get(accountId)
  const activeCount = getCount(_countActiveRecoveryCodes.get(accountId))
  const latest = _listActiveRecoveryCodes.get(accountId)
  return {
    activeCount,
    acknowledgedAt: account?.recovery_codes_acknowledged_at ?? null,
    generatedAt: latest?.created_at ?? null,
    requiredCount: RECOVERY_CODE_COUNT,
  }
}

function insertConsentRows(accountId, ipHash, userAgentHash, locale, source) {
  const rows = [
    ['terms', CURRENT_TERMS_VERSION],
    ['privacy', CURRENT_PRIVACY_VERSION],
    ['age_gate', CURRENT_AGE_GATE_VERSION],
  ]
  for (const [documentType, documentVersion] of rows) {
    _insertAccountConsent.run(
      `consent-${randomBytes(12).toString('hex')}`,
      accountId,
      documentType,
      documentVersion,
      ipHash,
      userAgentHash,
      locale,
      source,
    )
  }
}

export function recordSecurityEvent(accountId, eventType, details = {}) {
  _insertSecurityEvent.run(
    `secevt-${randomBytes(12).toString('hex')}`,
    accountId,
    eventType,
    hashIp(details.ip),
    hashUserAgent(details.userAgent),
    JSON.stringify(details.metadata ?? {}),
  )
}

export function listAccountRecoveryStatus(accountId) {
  return recoveryStatusForAccount(accountId)
}

export function generateAccountRecoveryCodes(accountId, details = {}) {
  const account = _getById.get(accountId)
  if (!account || account.deleted_at || account.account_status !== 'active') {
    return { ok: false, status: 404, error: 'Active account not found.' }
  }

  const batchId = `rcbatch-${randomBytes(10).toString('hex')}`
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode())
  const tx = db.transaction(() => {
    _revokeRecoveryCodesByAccount.run(accountId)
    for (const code of codes) {
      _insertRecoveryCode.run(
        `rcode-${randomBytes(12).toString('hex')}`,
        accountId,
        hashPassword(normalizeRecoveryCode(code)),
        recoveryCodePrefix(code),
        batchId,
      )
    }
    db.prepare(`UPDATE accounts SET recovery_codes_acknowledged_at = NULL, last_security_event_at = datetime('now') WHERE id = ?`).run(accountId)
    recordSecurityEvent(accountId, 'recovery_codes_generated', { ...details, metadata: { ...(details.metadata ?? {}), batchId } })
  })
  tx()

  return { ok: true, codes, batchId, recovery: recoveryStatusForAccount(accountId) }
}

// ─── Assisted recovery grants ────────────────────────────────────────────────
// A grant is a single-use, short-lived credential that lets its holder attach a
// new passkey to one account. It exists so a player who lost both their device
// and their recovery codes has a route back in that does not require an
// operator to ever see or set a working credential.
//
// `channel` records how the grant reached the player. Today the only channel is
// 'manual' (an operator relays the code over a support channel). Adding email
// later means issuing with channel='email' and a delivery_hint, then sending the
// code from the transport layer — no schema or redemption change.

const RECOVERY_GRANT_TTL_MS = 60 * 60 * 1000
const RECOVERY_GRANT_CHANNELS = new Set(['manual', 'email'])

const _insertRecoveryGrant = prepare(`
  INSERT INTO account_recovery_grants (
    id, account_id, token_hash, token_prefix, channel, purpose,
    issued_by_account_id, delivery_hint, note, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
export const _revokeRecoveryGrantsByAccount = prepare(`
  UPDATE account_recovery_grants
  SET revoked_at = datetime('now')
  WHERE account_id = ? AND consumed_at IS NULL AND revoked_at IS NULL
`)
const _findRecoveryGrantsByPrefix = prepare(`
  SELECT * FROM account_recovery_grants
  WHERE token_prefix = ?
    AND consumed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > datetime('now')
`)
const _consumeRecoveryGrant = prepare(`
  UPDATE account_recovery_grants
  SET consumed_at = datetime('now')
  WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > datetime('now')
`)
const _listRecoveryGrantsByAccount = prepare(`
  SELECT id, channel, purpose, issued_by_account_id, delivery_hint, note,
         created_at, expires_at, consumed_at, revoked_at
  FROM account_recovery_grants
  WHERE account_id = ?
  ORDER BY created_at DESC
  LIMIT 20
`)

/** Grant codes are their own identifier, so they carry more entropy than the
 *  10 user-managed recovery codes: 20 chars from a 32-symbol alphabet. */
function generateRecoveryGrantCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let raw = ''
  while (raw.length < 20) {
    const byte = randomBytes(1)[0]
    if (byte < alphabet.length * 7) raw += alphabet[byte % alphabet.length]
  }
  return `FAR-${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`
}

function normalizeRecoveryGrantCode(code) {
  return String(code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Mint a recovery grant. The plaintext code is returned exactly once and is
 * never stored, so it cannot be recovered from the database or a later read of
 * this account — an operator who loses it must issue a new grant.
 *
 * Issuing revokes any earlier unconsumed grant so only one is ever live.
 */
export function issueAccountRecoveryGrant(accountId, options = {}) {
  const account = _getById.get(accountId)
  if (!account) return { ok: false, status: 404, error: 'Account not found.' }
  if (account.deleted_at || account.account_status === 'deleted') {
    return { ok: false, status: 400, error: 'Restore the account before issuing a recovery grant.' }
  }

  const channel = RECOVERY_GRANT_CHANNELS.has(String(options.channel)) ? String(options.channel) : 'manual'
  const ttlMs = Number.isFinite(options.ttlMs) ? Math.min(24 * 60 * 60 * 1000, Math.max(60_000, Number(options.ttlMs))) : RECOVERY_GRANT_TTL_MS
  const code = generateRecoveryGrantCode()
  const normalized = normalizeRecoveryGrantCode(code)
  const grantId = `rgrant-${randomBytes(12).toString('hex')}`
  const expiresAt = new Date(Date.now() + ttlMs).toISOString()

  const tx = db.transaction(() => {
    _revokeRecoveryGrantsByAccount.run(accountId)
    _insertRecoveryGrant.run(
      grantId,
      accountId,
      hashPassword(normalized),
      normalized.slice(0, 6),
      channel,
      'account_recovery',
      options.issuedByAccountId ?? null,
      String(options.deliveryHint ?? '').slice(0, 120),
      String(options.note ?? '').slice(0, 200),
      expiresAt,
    )
    recordSecurityEvent(accountId, 'recovery_grant_issued', {
      ...options,
      metadata: { ...(options.metadata ?? {}), grantId, channel, issuedBy: options.issuedByAccountId ?? null },
    })
  })
  tx()

  return { ok: true, grantId, code, channel, expiresAt, username: account.username }
}

/**
 * Validate a grant code without consuming it, so an abandoned WebAuthn ceremony
 * does not burn the player's only route back in. The grant is consumed later by
 * `completeAccountRecoveryWithGrant`, once a replacement passkey actually
 * verifies.
 */
export function findAccountRecoveryGrant(code) {
  const normalized = normalizeRecoveryGrantCode(code)
  if (normalized.length < 12) return null

  // The prefix narrows the candidate set; the full code is still verified
  // against the stored hash, so a guessed prefix alone reveals nothing.
  const candidates = _findRecoveryGrantsByPrefix.all(normalized.slice(0, 6))
  const grant = candidates.find((row) => verifyPassword(normalized, row.token_hash))
  if (!grant) return null

  const account = _getById.get(grant.account_id)
  if (!account || account.deleted_at || account.account_status === 'deleted') return null

  return { grantId: grant.id, channel: grant.channel, account }
}

/**
 * Consume a grant and attach the replacement passkey it authorised. Mirrors
 * `completeAccountRecoveryWithPasskey`: old passkeys and sessions are dropped,
 * because a grant is issued precisely when the player lost their device.
 */
export function completeAccountRecoveryWithGrant(accountId, grantId, credential, details = {}) {
  const account = _getById.get(accountId)
  if (!account || account.deleted_at || account.account_status !== 'active') {
    return { ok: false, status: 404, error: 'Active account not found.' }
  }

  const passkeyId = `authnr-${randomBytes(12).toString('hex')}`
  const name = String(details.name ?? '').trim().slice(0, 48) || 'Recovery passkey'
  const tx = db.transaction(() => {
    if (_consumeRecoveryGrant.run(grantId).changes !== 1) throw new Error('grant-consumed')
    _insertAuthenticator.run(
      passkeyId,
      accountId,
      credential.id,
      Buffer.from(credential.publicKey),
      Number(credential.counter ?? 0),
      JSON.stringify(credential.transports ?? []),
      details.backedUp ? 1 : 0,
      String(details.deviceType ?? ''),
      name,
    )
    _deleteOtherAuthenticatorsByAccount.run(accountId, passkeyId)
    _revokeSessionsByAccount.run(accountId)
    db.prepare(`
      UPDATE accounts
      SET recovery_codes_acknowledged_at = NULL, last_security_event_at = datetime('now')
      WHERE id = ?
    `).run(accountId)
    recordSecurityEvent(accountId, 'account_recovered_via_grant', {
      ip: details.ip,
      userAgent: details.userAgent,
      metadata: { ...(details.metadata ?? {}), grantId, revokedOldPasskeys: true },
    })
  })

  try {
    tx()
  } catch (error) {
    if (error?.message === 'grant-consumed') {
      return { ok: false, status: 409, error: 'This recovery code was already used.' }
    }
    if (String(error?.message ?? '').toLowerCase().includes('unique')) {
      return { ok: false, status: 409, error: 'This passkey is already registered.' }
    }
    throw error
  }

  return { ok: true, passkey: listAccountPasskeys(accountId).find((item) => item.id === passkeyId) }
}

export function revokeAccountRecoveryGrants(accountId, details = {}) {
  const revoked = _revokeRecoveryGrantsByAccount.run(accountId).changes
  if (revoked > 0) recordSecurityEvent(accountId, 'recovery_grant_revoked', details)
  return { ok: true, revoked }
}

/** Grant history for the owner console. Never exposes a code or its hash. */
export function listAccountRecoveryGrants(accountId) {
  const now = Date.now()
  return _listRecoveryGrantsByAccount.all(accountId).map((row) => ({
    grantId: row.id,
    channel: row.channel,
    purpose: row.purpose,
    issuedByAccountId: row.issued_by_account_id,
    deliveryHint: row.delivery_hint,
    note: row.note,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    revokedAt: row.revoked_at,
    status: row.consumed_at
      ? 'consumed'
      : row.revoked_at
        ? 'revoked'
        : Date.parse(row.expires_at) <= now ? 'expired' : 'active',
  }))
}

export function acknowledgeAccountRecoveryCodes(accountId, details = {}) {
  if (getCount(_countActiveRecoveryCodes.get(accountId)) < 1) {
    return { ok: false, status: 400, error: 'Generate recovery codes before continuing.' }
  }
  _acknowledgeRecoveryCodes.run(accountId)
  recordSecurityEvent(accountId, 'recovery_codes_acknowledged', details)
  return { ok: true, recovery: recoveryStatusForAccount(accountId), readiness: getAccountReadiness(accountId) }
}

export function findAccountRecoveryCode(identifier, code) {
  const normalizedIdentifier = String(identifier ?? '').trim().toLowerCase()
  const normalizedCode = normalizeRecoveryCode(code)
  if (!normalizedIdentifier || normalizedCode.length !== 14) {
    return null
  }
  const account = _getByUsername.get(normalizedIdentifier)
  if (!account || account.account_status !== 'active' || account.deleted_at) return null

  const prefix = recoveryCodePrefix(normalizedCode)
  const candidates = _listActiveRecoveryCodes.all(account.id).filter((row) => row.code_prefix === prefix)
  for (const candidate of candidates) {
    if (verifyPassword(normalizedCode, candidate.code_hash)) {
      return { account, recoveryCodeId: candidate.id }
    }
  }
  return null
}

export function completeAccountRecovery(accountId, recoveryCodeId, newPasskeyId, details = {}) {
  const account = _getById.get(accountId)
  if (!account || account.deleted_at || account.account_status !== 'active') {
    return { ok: false, status: 404, error: 'Active account not found.' }
  }

  const tx = db.transaction(() => {
    const consumed = _consumeRecoveryCode.run(recoveryCodeId, accountId)
    if (consumed.changes < 1) throw new Error('recovery-code-consumed')
    _deleteOtherAuthenticatorsByAccount.run(accountId, newPasskeyId)
    _revokeSessionsByAccount.run(accountId)
    db.prepare(`UPDATE accounts SET recovery_codes_acknowledged_at = NULL, last_security_event_at = datetime('now') WHERE id = ?`).run(accountId)
    recordSecurityEvent(accountId, 'account_recovered', details)
  })

  try {
    tx()
  } catch (error) {
    if (error?.message === 'recovery-code-consumed') {
      return { ok: false, status: 400, error: 'Recovery code has already been used.' }
    }
    throw error
  }

  return { ok: true }
}

export function completeAccountRecoveryWithPasskey(accountId, recoveryCodeId, credential, details = {}) {
  const account = _getById.get(accountId)
  if (!account || account.deleted_at || account.account_status !== 'active') {
    return { ok: false, status: 404, error: 'Active account not found.' }
  }

  const passkeyId = `authnr-${randomBytes(12).toString('hex')}`
  const name = String(details.name ?? '').trim().slice(0, 48) || 'Recovery passkey'
  const tx = db.transaction(() => {
    const consumed = _consumeRecoveryCode.run(recoveryCodeId, accountId)
    if (consumed.changes < 1) throw new Error('recovery-code-consumed')
    _insertAuthenticator.run(
      passkeyId,
      accountId,
      credential.id,
      Buffer.from(credential.publicKey),
      Number(credential.counter ?? 0),
      JSON.stringify(credential.transports ?? []),
      details.backedUp ? 1 : 0,
      String(details.deviceType ?? ''),
      name,
    )
    _deleteOtherAuthenticatorsByAccount.run(accountId, passkeyId)
    _revokeSessionsByAccount.run(accountId)
    db.prepare(`UPDATE accounts SET recovery_codes_acknowledged_at = NULL, last_security_event_at = datetime('now') WHERE id = ?`).run(accountId)
    recordSecurityEvent(accountId, 'account_recovered', {
      ip: details.ip,
      userAgent: details.userAgent,
      metadata: { ...(details.metadata ?? {}), revokedOldPasskeys: true },
    })
  })

  try {
    tx()
  } catch (error) {
    if (error?.message === 'recovery-code-consumed') {
      return { ok: false, status: 400, error: 'Recovery code has already been used.' }
    }
    if (String(error?.message ?? '').toLowerCase().includes('unique')) {
      return { ok: false, status: 409, error: 'This passkey is already registered.' }
    }
    throw error
  }

  return { ok: true, passkey: listAccountPasskeys(accountId).find((item) => item.id === passkeyId) }
}

function requirement(id, label, description, blocking = true) {
  return { id, label, description, blocking }
}

export function getAccountReadiness(accountId) {
  const account = _getById.get(accountId)
  if (!account) {
    return {
      ready: false,
      setupRequired: true,
      accountStatus: 'missing',
      requirements: [requirement('account', 'Account unavailable', 'The account record could not be found.')],
      legal: getCurrentLegalVersions(),
    }
  }

  const requirements = []
  const now = Date.now()
  const lockedUntil = account.locked_until ? Date.parse(account.locked_until) : 0

  if (account.account_status !== 'active') {
    requirements.push(requirement('account_status', 'Account status', 'This account must be active before play can continue.'))
  }

  if (account.deleted_at) {
    requirements.push(requirement('deleted_account', 'Account recovery', 'This account is marked for deletion or recovery review.'))
  }

  if (Number.isFinite(lockedUntil) && lockedUntil > now) {
    requirements.push(requirement('security_lock', 'Security lock', 'This account is temporarily locked for security review.'))
  }

  const authenticatorCount = getCount(_countAuthenticatorsByAccount.get(account.id))
  if (authenticatorCount === 0) {
    const deadline = account.legacy_migration_deadline_at ? ` This legacy window closes ${account.legacy_migration_deadline_at}.` : ''
    requirements.push(requirement('passkey', 'Create passkey', `Register a passkey for account sign-in and recovery protection.${deadline}`))
  }

  if (account.terms_version !== CURRENT_TERMS_VERSION || !account.terms_accepted_at) {
    requirements.push(requirement('terms', 'Accept Terms', 'Accept the current Terms of Service.'))
  }

  if (account.privacy_version !== CURRENT_PRIVACY_VERSION || !account.privacy_accepted_at) {
    requirements.push(requirement('privacy', 'Accept Privacy Policy', 'Acknowledge the current Privacy Policy.'))
  }

  if (account.age_gate_version !== CURRENT_AGE_GATE_VERSION || !account.age_attested_at || !account.age_attestation) {
    requirements.push(requirement('age_attestation', 'Age eligibility', 'Confirm age eligibility or guardian consent for the account.'))
  }

  if (account.role === 'owner' && authenticatorCount < 2) {
    requirements.push(requirement('owner_second_passkey', 'Owner recovery passkey', 'Owner accounts must register two passkeys before privileged access is production-ready.'))
  }

  const recovery = recoveryStatusForAccount(account.id)
  if (recovery.activeCount < 1) {
    requirements.push(requirement('recovery_codes', 'Save recovery codes', 'Generate one-time recovery codes before entering the arena.'))
  } else if (!recovery.acknowledgedAt) {
    requirements.push(requirement('recovery_codes_saved', 'Confirm recovery codes', 'Copy or download your recovery codes before entering the arena.'))
  }

  const blockingRequirements = requirements.filter((item) => item.blocking)
  return {
    ready: blockingRequirements.length === 0,
    setupRequired: Number(account.account_setup_required) === 1 || blockingRequirements.length > 0,
    accountStatus: account.account_status,
    accountStandardVersion: Number(account.account_standard_version ?? 0),
    passkeyCount: authenticatorCount,
    legacyMigration: {
      startedAt: account.legacy_migration_started_at,
      deadlineAt: account.legacy_migration_deadline_at,
      completedAt: account.legacy_migration_completed_at,
      windowDays: LEGACY_MIGRATION_WINDOW_DAYS,
    },
    recovery,
    requirements,
    legal: getCurrentLegalVersions(),
  }
}

export function findAccountForPasskeyIdentifier(identifier) {
  const normalized = String(identifier ?? '').trim().toLowerCase()
  if (!normalized) return null
  const account = _getByUsername.get(normalized)
  if (!account || account.account_status !== 'active' || account.deleted_at) return null
  return account
}

export function listAccountPasskeys(accountId) {
  return _listAuthenticatorsByAccount.all(accountId).map(mapAuthenticatorSummary)
}

export function listAccountPasskeyCredentials(accountId) {
  return _listAuthenticatorCredentialsByAccount.all(accountId).map((row) => ({
    id: row.credential_id,
    transports: parseJson(row.transports, []),
    counter: Number(row.counter ?? 0),
  }))
}

export function getPasskeyCredential(credentialId) {
  const row = _getAuthenticatorByCredentialId.get(String(credentialId ?? ''))
  if (!row) return null
  return {
    id: row.id,
    accountId: row.account_id,
    username: row.username,
    displayName: String(row.display_name ?? '').trim() || row.username,
    role: row.role,
    credential: {
      id: row.credential_id,
      publicKey: row.credential_public_key,
      counter: Number(row.counter ?? 0),
      transports: parseJson(row.transports, []),
    },
    backedUp: Boolean(row.backed_up),
    deviceType: row.device_type,
  }
}

export function createAuthChallenge(accountId, purpose, challenge, metadata = {}) {
  const id = `challenge-${randomBytes(12).toString('hex')}`
  const expiresAt = new Date(Date.now() + AUTH_CHALLENGE_TTL_MS).toISOString()
  const tx = db.transaction(() => {
    if (accountId) _consumeOutstandingAuthChallenges.run(accountId, purpose)
    _insertAuthChallenge.run(id, accountId, purpose, challenge, JSON.stringify(metadata), expiresAt)
  })
  tx()
  return { id, expiresAt }
}

export function consumeAuthChallenge(challengeId, purpose) {
  const row = _getActiveAuthChallenge.get(String(challengeId ?? ''), purpose)
  if (!row) return null
  _consumeAuthChallenge.run(row.id)
  return {
    id: row.id,
    accountId: row.account_id,
    challenge: row.challenge,
    metadata: parseJson(row.metadata, {}),
  }
}

function mapPasskeyDeviceLink(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    username: row.username,
    displayName: String(row.display_name ?? '').trim() || row.username,
    role: row.role,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

export function createPasskeyDeviceLink(accountId, details = {}) {
  const account = _getById.get(accountId)
  if (!account || account.deleted_at || account.account_status !== 'active') {
    return { ok: false, status: 404, error: 'Active account not found.' }
  }
  if (getCount(_countAuthenticatorsByAccount.get(accountId)) < 1) {
    return { ok: false, status: 400, error: 'Register a passkey before linking another device.' }
  }

  const id = `pdlink-${randomBytes(12).toString('hex')}`
  const secret = randomBytes(24).toString('hex')
  const token = `${id}.${secret}`
  const expiresAt = new Date(Date.now() + PASSKEY_DEVICE_LINK_TTL_MS).toISOString()
  const tx = db.transaction(() => {
    _expirePasskeyDeviceLinks.run()
    _insertPasskeyDeviceLink.run(id, accountId, hashPasskeyDeviceLinkSecret(secret), String(details.sessionId ?? ''), expiresAt)
    recordSecurityEvent(accountId, 'passkey_device_link_created', details)
  })
  tx()

  return {
    ok: true,
    token,
    link: {
      id,
      expiresAt,
    },
  }
}

export function getPasskeyDeviceLink(token) {
  const parsed = parsePasskeyDeviceLinkToken(token)
  if (!parsed) return null
  _expirePasskeyDeviceLinks.run()
  const row = _getPendingPasskeyDeviceLink.get(parsed.id, parsed.secretHash)
  if (!row || row.account_status !== 'active' || row.deleted_at) return null
  return mapPasskeyDeviceLink(row)
}

export function completePasskeyDeviceLinkRegistration(token, accountId, credential, details = {}) {
  const parsed = parsePasskeyDeviceLinkToken(token)
  if (!parsed) return { ok: false, status: 400, error: 'Device link is invalid or expired.' }

  const passkeyId = `authnr-${randomBytes(12).toString('hex')}`
  const name = String(details.name ?? '').trim().slice(0, 48) || 'Linked device passkey'
  const tx = db.transaction(() => {
    _expirePasskeyDeviceLinks.run()
    const row = _getPendingPasskeyDeviceLink.get(parsed.id, parsed.secretHash)
    if (!row || row.account_status !== 'active' || row.deleted_at || row.account_id !== accountId) {
      throw new Error('device-link-invalid')
    }
    const consumed = _consumePasskeyDeviceLink.run(row.id, row.account_id)
    if (consumed.changes < 1) throw new Error('device-link-consumed')
    _insertAuthenticator.run(
      passkeyId,
      row.account_id,
      credential.id,
      Buffer.from(credential.publicKey),
      Number(credential.counter ?? 0),
      JSON.stringify(credential.transports ?? []),
      details.backedUp ? 1 : 0,
      String(details.deviceType ?? ''),
      name,
    )
    recordSecurityEvent(row.account_id, 'passkey_device_link_completed', details)
    return row.account_id
  })

  let linkedAccountId
  try {
    linkedAccountId = tx()
  } catch (error) {
    if (error?.message === 'device-link-invalid' || error?.message === 'device-link-consumed') {
      return { ok: false, status: 400, error: 'Device link is invalid or expired.' }
    }
    if (String(error?.message ?? '').toLowerCase().includes('unique')) {
      return { ok: false, status: 409, error: 'This passkey is already registered.' }
    }
    throw error
  }

  return { ok: true, passkey: listAccountPasskeys(linkedAccountId).find((item) => item.id === passkeyId) }
}

export function registerAccountPasskey(accountId, credential, details = {}) {
  const account = _getById.get(accountId)
  if (!account) return { ok: false, status: 404, error: 'Account not found.' }

  const name = String(details.name ?? '').trim().slice(0, 48) || 'Passkey'
  const id = `authnr-${randomBytes(12).toString('hex')}`
  try {
    _insertAuthenticator.run(
      id,
      accountId,
      credential.id,
      Buffer.from(credential.publicKey),
      Number(credential.counter ?? 0),
      JSON.stringify(credential.transports ?? []),
      details.backedUp ? 1 : 0,
      String(details.deviceType ?? ''),
      name,
    )
  } catch (error) {
    if (String(error?.message ?? '').toLowerCase().includes('unique')) {
      return { ok: false, status: 409, error: 'This passkey is already registered.' }
    }
    throw error
  }

  return { ok: true, passkey: listAccountPasskeys(accountId).find((item) => item.id === id) }
}

export function markAccountPendingPasskeySignup(accountId) {
  const result = _markAccountPendingPasskeySignup.run(accountId)
  return result.changes > 0
}

export function updatePasskeyAfterAuthentication(passkeyId, newCounter, details = {}) {
  _updateAuthenticatorCounter.run(
    Number(newCounter ?? 0),
    details.backedUp ? 1 : 0,
    String(details.deviceType ?? ''),
    passkeyId,
  )
}

export function deleteAccountPasskey(accountId, passkeyId) {
  const count = getCount(_countAuthenticatorsByAccount.get(accountId))
  const account = _getById.get(accountId)
  if (account?.role === 'owner' && count <= 2) {
    return { ok: false, status: 400, error: 'Owner accounts must keep at least two passkeys.' }
  }
  if (count <= 1) {
    return { ok: false, status: 400, error: 'Add another passkey before removing the last one.' }
  }
  const result = _deleteAuthenticator.run(passkeyId, accountId)
  if (result.changes === 0) return { ok: false, status: 404, error: 'Passkey not found.' }
  return { ok: true }
}

export function completeAccountUpgrade(accountId, payload = {}) {
  const account = _getById.get(accountId)
  if (!account) return { ok: false, status: 404, error: 'Account not found.' }

  if (!['active', 'pending_passkey'].includes(account.account_status) || account.deleted_at) {
    return { ok: false, status: 403, error: 'This account is not eligible for setup completion.' }
  }

  if (payload.acceptTerms !== true || payload.acceptPrivacy !== true) {
    return { ok: false, error: 'Terms of Service and Privacy Policy acceptance are required.' }
  }

  const ageAttestation = String(payload.ageAttestation ?? '').trim()
  if (!['adult', 'guardian'].includes(ageAttestation)) {
    return { ok: false, error: 'Confirm age eligibility or guardian consent.' }
  }

  const authenticatorCount = getCount(_countAuthenticatorsByAccount.get(accountId))
  if (authenticatorCount === 0) {
    return { ok: false, error: 'Register a passkey before completing account setup.' }
  }

  const ipHash = hashIp(payload.ip)
  const userAgentHash = hashUserAgent(payload.userAgent)
  const locale = String(payload.locale ?? '').slice(0, 20)
  const tx = db.transaction(() => {
    insertConsentRows(accountId, ipHash, userAgentHash, locale, 'account_upgrade')
    _completeAccountStandards.run(
      CURRENT_TERMS_VERSION,
      ipHash,
      userAgentHash,
      CURRENT_PRIVACY_VERSION,
      ipHash,
      userAgentHash,
      CURRENT_AGE_GATE_VERSION,
      ageAttestation,
      CURRENT_ACCOUNT_STANDARD_VERSION,
      accountId,
    )
  })
  tx()

  return {
    ok: true,
    readiness: getAccountReadiness(accountId),
  }
}

function buildAccountFlags({ deviceCount, ipCount, ipDayCount, ipAgentWeekCount }) {
  const flags = []

  if (deviceCount > 0) flags.push('shared-device')
  if (ipCount > 0) flags.push('shared-ip')
  if (ipDayCount > 0 || ipAgentWeekCount > 0) flags.push('signup-cluster')

  return flags.join(',')
}

function resolveAccountName(displayName, username) {
  const fallbackUsername = String(username ?? '').trim()
  const resolvedDisplayName = String(displayName ?? '').trim() || fallbackUsername
  return {
    username: fallbackUsername,
    displayName: resolvedDisplayName,
  }
}

export function createAccount(username, password, displayName, deviceFp, ip, userAgent, options = {}) {
  const resolved = resolveAccountName(displayName, username)

  if (!USERNAME_RE.test(resolved.username)) {
    return { ok: false, error: 'Username must be 3-20 characters: letters, numbers, underscore only.' }
  }

  if (!DISPLAY_RE.test(resolved.displayName)) {
    return { ok: false, error: 'Display name must be 1-24 characters.' }
  }

  if (!password || password.length < PASSWORD_MIN) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` }
  }

  const existing = _getByUsername.get(resolved.username)
  if (existing) {
    // A `pending_passkey` row whose auth challenge has already expired can no
    // longer complete its ceremony, so it is a dead reservation rather than a
    // real account. Release it so the player can retry their own username
    // instead of being told it is taken by their own abandoned attempt.
    if (!releaseDeadSignupReservation(existing)) {
      return { ok: false, error: 'That username is already taken.' }
    }
  }

  // Anti-sybil: limit accounts per device fingerprint
  const fpHash = hashFingerprint(deviceFp)
  const ipHash = hashIp(ip)
  const userAgentHash = hashUserAgent(userAgent)
  const deviceCount = fpHash ? getCount(_countByFp.get(fpHash)) : 0
  const ipCount = ipHash ? getCount(_countByCreatedIp.get(ipHash)) : 0
  const ipDayCount = ipHash ? getCount(_countByCreatedIpPerDay.get(ipHash)) : 0
  const ipAgentWeekCount = ipHash && userAgentHash
    ? getCount(_countByCreatedIpAndAgentPerWeek.get(ipHash, userAgentHash))
    : 0
  const bypassSignupClusterLimits = options.bypassSignupClusterLimits === true

  if (!bypassSignupClusterLimits && fpHash) {
    if (deviceCount >= MAX_ACCOUNTS_PER_DEVICE) {
      return {
        ok: false,
        status: 403,
        error: 'This device has reached the account creation limit. Use an existing account or contact support if you need help.',
      }
    }
  }

  if (!bypassSignupClusterLimits && ipHash && ipDayCount >= MAX_ACCOUNTS_PER_IP_PER_DAY) {
    return {
      ok: false,
      status: 429,
      error: 'This network has created too many accounts recently. Please wait and try again later.',
    }
  }

  if (!bypassSignupClusterLimits && ipHash && ipCount >= MAX_ACCOUNTS_PER_IP) {
    return {
      ok: false,
      status: 403,
      error: 'This network has reached the account creation limit. Use an existing account or contact support if you need help.',
    }
  }

  if (!bypassSignupClusterLimits && ipHash && userAgentHash && ipAgentWeekCount >= MAX_ACCOUNTS_PER_IP_AND_AGENT_PER_WEEK) {
    return {
      ok: false,
      status: 403,
      error: 'Too many similar account registrations were detected from this connection. Please use an existing account or contact support.',
    }
  }

  const id = `acct-${randomBytes(12).toString('hex')}`
  const hash = hashPassword(password)
  const flags = buildAccountFlags({ deviceCount, ipCount, ipDayCount, ipAgentWeekCount })

  try {
    const tx = db.transaction(() => {
      _insertAccount.run(
        id,
        resolved.username.toLowerCase(),
        hash,
        resolved.displayName,
        fpHash,
        ipHash,
        userAgentHash,
        flags,
      )
      _startLegacyMigrationWindow.run(id)
      _insertProfile.run(id, JSON.stringify(DEFAULT_DECK_CONFIG), JSON.stringify(buildStarterCollection()))
    })
    tx()
    return { ok: true, accountId: id }
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { ok: false, error: 'That username is already taken.' }
    }
    throw err
  }
}

export function authenticateAccount(username, password) {
  const row = _getByUsername.get(username?.toLowerCase?.() ?? '')
  if (!row) return { ok: false, error: 'Invalid username or password.' }
  if (row.account_status !== 'active' || row.deleted_at) {
    return { ok: false, error: 'Invalid username or password.' }
  }
  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, error: 'Invalid username or password.' }
  }
  return {
    ok: true,
    accountId: row.id,
    displayName: String(row.display_name ?? '').trim() || row.username,
  }
}

// ─── Session management ─────────────────────────────────────────────────────

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const _insertSessionFamily = prepare(`INSERT INTO session_families (id, account_id) VALUES (?, ?)`)

const _insertSession = prepare(`
  INSERT INTO sessions (token, account_id, expires_at, ip_hash, token_hash, family_id, user_agent_hash, last_seen_at, auth_method, last_passkey_reauth_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, CASE WHEN ? = 'passkey' THEN datetime('now') ELSE NULL END)
`)

const _getSessionByRawToken = prepare(`
  SELECT s.*, a.username, COALESCE(NULLIF(TRIM(a.display_name), ''), a.username) as display_name FROM sessions s
  JOIN accounts a ON a.id = s.account_id
  WHERE s.token = ? AND s.expires_at > datetime('now') AND s.revoked_at IS NULL
`)

const _getSessionByHash = prepare(`
  SELECT s.*, a.username, COALESCE(NULLIF(TRIM(a.display_name), ''), a.username) as display_name FROM sessions s
  JOIN accounts a ON a.id = s.account_id
  WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND s.revoked_at IS NULL
`)

const _touchSession = prepare(`UPDATE sessions SET last_seen_at = datetime('now') WHERE token = ?`)
const _markSessionPasskeyReauthenticated = prepare(`
  UPDATE sessions
  SET last_passkey_reauth_at = datetime('now'), last_seen_at = datetime('now')
  WHERE (token = ? OR token_hash = ?) AND revoked_at IS NULL AND expires_at > datetime('now')
`)

const _revokeSession = prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE token = ? OR token_hash = ?`)

export const _revokeSessionsByAccount = prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE account_id = ? AND revoked_at IS NULL`)

const _cleanExpiredSessions = prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now') OR revoked_at IS NOT NULL`)

const _updateLastLogin = prepare(`UPDATE accounts SET last_login = datetime('now') WHERE id = ?`)

export function hashIp(ip) {
  if (!ip) return null
  return createHash('sha256').update(`rc-ip:${ip}`).digest('hex').slice(0, 24)
}

export function createSession(accountId, ip, userAgent = '', authMethod = 'password') {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashSessionToken(token)
  const sessionId = `sess-${randomBytes(12).toString('hex')}`
  const familyId = `sessfam-${randomBytes(12).toString('hex')}`
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  const tx = db.transaction(() => {
    _insertSessionFamily.run(familyId, accountId)
    _insertSession.run(sessionId, accountId, expiresAt, hashIp(ip), tokenHash, familyId, hashUserAgent(userAgent), authMethod, authMethod)
    _updateLastLogin.run(accountId)
  })
  tx()
  return { token, expiresAt }
}

export function validateSession(token) {
  if (!token || typeof token !== 'string') return null
  const row = _getSessionByHash.get(hashSessionToken(token)) ?? _getSessionByRawToken.get(token)
  if (row) _touchSession.run(row.token)
  return row ?? null
}

export function markSessionPasskeyReauthenticated(token) {
  if (!token || typeof token !== 'string') return false
  const result = _markSessionPasskeyReauthenticated.run(token, hashSessionToken(token))
  return result.changes > 0
}

export function sessionHasRecentPasskeyReauth(session, maxAgeMs) {
  if (!session?.last_passkey_reauth_at) return false
  const reauthAt = Date.parse(session.last_passkey_reauth_at)
  return Number.isFinite(reauthAt) && Date.now() - reauthAt <= maxAgeMs
}

export function destroySession(token) {
  _revokeSession.run(token, hashSessionToken(token))
}

export function revokeAllSessions(accountId) {
  _revokeSessionsByAccount.run(accountId)
}

export function listAccountSessions(accountId) {
  return db.prepare(`
    SELECT token, created_at, expires_at, ip_hash, user_agent_hash, last_seen_at, revoked_at, auth_method, last_passkey_reauth_at
    FROM sessions
    WHERE account_id = ?
    ORDER BY COALESCE(last_seen_at, created_at) DESC
    LIMIT 25
  `).all(accountId).map((row) => ({
    id: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ipHash: row.ip_hash,
    userAgentHash: row.user_agent_hash,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    authMethod: row.auth_method,
    lastPasskeyReauthAt: row.last_passkey_reauth_at,
  }))
}

export function deleteAccount(accountId, password, details = {}) {
  const account = _getById.get(accountId)
  if (!account) return { ok: false, status: 404, error: 'Account not found.' }
  if (account.role === 'owner') {
    return { ok: false, status: 403, error: 'Transfer ownership before deleting the owner account.' }
  }

  const authenticatorCount = getCount(_countAuthenticatorsByAccount.get(accountId))
  const passkeySessionConfirmed = details.authMethod === 'passkey' && authenticatorCount > 0
  if (!passkeySessionConfirmed && !verifyPassword(String(password ?? ''), account.password_hash)) {
    return { ok: false, status: 403, error: 'Passkey session or password confirmation required.' }
  }

  const tx = db.transaction(() => {
    _markAccountDeleted.run(accountId)
    _revokeSessionsByAccount.run(accountId)
    _deleteAuthenticatorsByAccount.run(accountId)
    _deleteEmailTokensByAccount.run(accountId)
    _deleteAuthChallengesByAccount.run(accountId)
    _deleteFriendEdgesByAccount.run(accountId, accountId)
    _deleteClanMembershipByAccount.run(accountId)
    db.prepare(`
      UPDATE trades
      SET status = 'cancelled', updated_at = datetime('now')
      WHERE status = 'pending' AND (from_account_id = ? OR to_account_id = ?)
    `).run(accountId, accountId)
    recordSecurityEvent(accountId, 'account_deleted', details)
  })
  tx()

  return { ok: true }
}

/**
 * Reverse a soft delete. Player data (profile, collection, rating, match log)
 * is never purged by `deleteAccount` or the legacy sweeper, so restoring the
 * account row brings the whole player back.
 *
 * Deletion revokes sessions and drops authenticators, so a restored account
 * always lands in setup-required state and must re-establish a sign-in factor:
 * a legacy password if the row still has one, otherwise an owner-issued
 * recovery grant. The caller is told which, so support can say what happens next.
 */
export function restoreAccount(accountId, details = {}) {
  const account = _getById.get(accountId)
  if (!account) return { ok: false, status: 404, error: 'Account not found.' }
  if (account.account_status !== 'deleted' && !account.deleted_at) {
    return { ok: false, status: 400, error: 'Account is not deleted.' }
  }

  // A restored account would be re-expired by the very sweeper that removed it
  // unless its migration window restarts from now.
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE accounts
      SET account_status = 'active',
          deleted_at = NULL,
          account_setup_required = 1,
          locked_until = NULL,
          failed_login_count = 0,
          legacy_migration_started_at = datetime('now'),
          legacy_migration_deadline_at = datetime('now', '+${LEGACY_MIGRATION_WINDOW_DAYS} days'),
          last_security_event_at = datetime('now')
      WHERE id = ?
    `).run(accountId)
    recordSecurityEvent(accountId, 'account_restored', details)
  })
  tx()

  const passkeyCount = getCount(_countAuthenticatorsByAccount.get(accountId))
  const restored = _getById.get(accountId)
  return {
    ok: true,
    accountId,
    username: restored.username,
    passkeyCount,
    // A legacy row keeps a usable scrypt hash; a passkey-only account's stored
    // hash is the random filler written at signup and can never be entered.
    hasLegacyPassword: Number(restored.account_standard_version ?? 0) === 0 && passkeyCount === 0,
    nextStep: passkeyCount > 0
      ? 'sign_in_with_passkey'
      : Number(restored.account_standard_version ?? 0) === 0
        ? 'sign_in_with_legacy_password'
        : 'needs_recovery_grant',
  }
}

/**
 * Deleted accounts with the player value still attached, newest first. Used by
 * the restore CLI and the owner console to triage who lost what.
 */
export function listDeletedAccounts({ limit = 100, reason = '' } = {}) {
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100))
  const rows = db.prepare(`
    SELECT a.id, a.username, a.display_name, a.deleted_at, a.account_standard_version,
           p.shards, p.season_rating, p.wins, p.losses,
           (SELECT COUNT(*) FROM account_authenticators k WHERE k.account_id = a.id) AS passkey_count,
           (SELECT s.event_type FROM security_events s
             WHERE s.account_id = a.id AND s.event_type IN ('account_deleted', 'legacy_migration_expired')
             ORDER BY s.created_at DESC LIMIT 1) AS delete_reason
    FROM accounts a
    LEFT JOIN player_profiles p ON p.account_id = a.id
    WHERE a.account_status = 'deleted' OR a.deleted_at IS NOT NULL
    ORDER BY a.deleted_at DESC
    LIMIT ?
  `).all(safeLimit)

  return rows
    .filter((row) => !reason || row.delete_reason === reason)
    .map((row) => ({
      accountId: row.id,
      username: row.username,
      displayName: row.display_name,
      deletedAt: row.deleted_at,
      // 'legacy_migration_expired' means the sweeper took it, not the player.
      reason: row.delete_reason ?? 'unknown',
      passkeyCount: row.passkey_count,
      shards: row.shards ?? 0,
      seasonRating: row.season_rating ?? 0,
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
    }))
}

export function expireLegacyMigrationAccounts(details = {}) {
  if (!LEGACY_MIGRATION_EXPIRY_ENABLED && details.force !== true) {
    return { ok: true, deleted: 0, skipped: 'disabled' }
  }
  const expired = db.prepare(`
    SELECT id
    FROM accounts
    WHERE account_status = 'active'
      AND deleted_at IS NULL
      AND legacy_migration_completed_at IS NULL
      AND legacy_migration_deadline_at IS NOT NULL
      AND legacy_migration_deadline_at <= datetime('now')
      AND id NOT IN (SELECT DISTINCT account_id FROM account_authenticators)
  `).all()

  if (expired.length === 0) return { ok: true, deleted: 0 }

  const tx = db.transaction(() => {
    for (const row of expired) {
      _markAccountDeleted.run(row.id)
      _revokeSessionsByAccount.run(row.id)
      _deleteEmailTokensByAccount.run(row.id)
      _deleteAuthChallengesByAccount.run(row.id)
      _deleteFriendEdgesByAccount.run(row.id, row.id)
      _deleteClanMembershipByAccount.run(row.id)
      db.prepare(`
        UPDATE trades
        SET status = 'cancelled', updated_at = datetime('now')
        WHERE status = 'pending' AND (from_account_id = ? OR to_account_id = ?)
      `).run(row.id, row.id)
      recordSecurityEvent(row.id, 'legacy_migration_expired', details)
    }
  })
  tx()

  return { ok: true, deleted: expired.length }
}

/**
 * Delete a signup reservation that can provably never complete, freeing its
 * username immediately. Returns true when the row was released.
 * @param {{ id: string, account_status: string, created_at: string }} account
 */
function releaseDeadSignupReservation(account) {
  if (!account || account.account_status !== 'pending_passkey') return false
  if (getCount(_countAuthenticatorsByAccount.get(account.id)) > 0) return false

  // The age test runs in SQL so `created_at` is read back in the same format
  // SQLite wrote it. The WebAuthn challenge expires well before this cutoff,
  // so anything older can no longer be verified and is safe to reclaim.
  const cutoffSeconds = Math.floor(AUTH_CHALLENGE_TTL_MS / 1000)
  return db.prepare(`
    DELETE FROM accounts
    WHERE id = ?
      AND account_status = 'pending_passkey'
      AND created_at <= datetime('now', ?)
  `).run(account.id, `-${cutoffSeconds} seconds`).changes === 1
}

/**
 * Release usernames held by passkey signups that never finished their WebAuthn
 * ceremony. A `pending_passkey` row has no authenticator and no completed legal
 * setup, so it represents an abandoned attempt rather than a player account —
 * deleting it outright is safe and is what frees the username for a retry.
 */
export function reapAbandonedSignups(details = {}) {
  const ttlMs = Number.isFinite(details.ttlMs) ? Number(details.ttlMs) : PENDING_SIGNUP_TTL_MS
  const cutoffSeconds = Math.max(60, Math.floor(ttlMs / 1000))
  const abandoned = db.prepare(`
    SELECT id, username
    FROM accounts
    WHERE account_status = 'pending_passkey'
      AND deleted_at IS NULL
      AND created_at <= datetime('now', ?)
      AND id NOT IN (SELECT DISTINCT account_id FROM account_authenticators)
  `).all(`-${cutoffSeconds} seconds`)

  if (abandoned.length === 0) return { ok: true, released: 0, usernames: [] }

  const tx = db.transaction(() => {
    for (const row of abandoned) {
      // ON DELETE CASCADE clears challenges, authenticators, and the profile.
      db.prepare(`DELETE FROM accounts WHERE id = ?`).run(row.id)
    }
  })
  tx()

  return { ok: true, released: abandoned.length, usernames: abandoned.map((row) => row.username) }
}

export function cleanupSessions() {
  _cleanExpiredSessions.run()
}

// Run cleanup periodically
// Intentionally not run at import time. Legacy expiry deletes real player
// accounts, so it is driven only by the opt-in interval in server.js.
// unref'd so importing db.js from a CLI script does not pin the event loop.
// The server stays alive on its HTTP listener regardless.
setInterval(cleanupSessions, 60 * 60 * 1000).unref?.()

