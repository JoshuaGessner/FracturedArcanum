import Database from 'better-sqlite3'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CARD_LIBRARY, DEFAULT_DECK_CONFIG, MAX_COPIES as GAME_MAX_COPIES, MAX_LEGENDARY_COPIES } from './game.js'
import { QUEST_DEFINITIONS, difficultyMeets } from './quest-definitions.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.resolve(__dirname, '../data'))
const DB_PATH = path.join(DATA_DIR, 'fractured-arcanum.db')

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

let db
try {
  db = new Database(DB_PATH, { fileMustExist: false })
} catch (error) {
  console.error(`Failed to open SQLite database at ${DB_PATH}. Ensure the data directory exists and is writable.`)
  throw error
}
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const CURRENT_ACCOUNT_STANDARD_VERSION = 1
const CURRENT_TERMS_VERSION = 'terms-2026-05-17'
const CURRENT_PRIVACY_VERSION = 'privacy-2026-05-17'
const CURRENT_AGE_GATE_VERSION = 'age-2026-05-17'
export const LEGACY_MIGRATION_WINDOW_DAYS = 30
const RECOVERY_CODE_COUNT = 10

export function getCurrentLegalVersions() {
  return {
    accountStandardVersion: CURRENT_ACCOUNT_STANDARD_VERSION,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    ageGateVersion: CURRENT_AGE_GATE_VERSION,
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login    TEXT,
    device_fp     TEXT,
    created_ip_hash TEXT,
    created_ua_hash TEXT,
    flags         TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    ip_hash    TEXT
  );

  CREATE TABLE IF NOT EXISTS player_profiles (
    account_id     TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    shards         INTEGER NOT NULL DEFAULT 120,
    season_rating  INTEGER NOT NULL DEFAULT 1200,
    wins           INTEGER NOT NULL DEFAULT 0,
    losses         INTEGER NOT NULL DEFAULT 0,
    streak         INTEGER NOT NULL DEFAULT 0,
    deck_config    TEXT NOT NULL DEFAULT '{}',
    owned_themes   TEXT NOT NULL DEFAULT '["royal"]',
    selected_theme TEXT NOT NULL DEFAULT 'royal',
    last_daily     TEXT NOT NULL DEFAULT '',
    total_earned   INTEGER NOT NULL DEFAULT 120,
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS match_log (
    id         TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    opponent   TEXT NOT NULL,
    mode       TEXT NOT NULL,
    result     TEXT NOT NULL,
    turns      INTEGER NOT NULL DEFAULT 0,
    shards_earned INTEGER NOT NULL DEFAULT 0,
    rating_delta INTEGER NOT NULL DEFAULT 0,
    played_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS social_friends (
    account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    friend_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (account_id, friend_account_id),
    CHECK (account_id <> friend_account_id)
  );

  CREATE TABLE IF NOT EXISTS clans (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL UNIQUE COLLATE NOCASE,
    tag              TEXT NOT NULL UNIQUE COLLATE NOCASE,
    invite_code      TEXT NOT NULL UNIQUE,
    owner_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS clan_members (
    clan_id     TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    account_id  TEXT NOT NULL PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'member',
    joined_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rate_limits (
    key        TEXT PRIMARY KEY,
    count      INTEGER NOT NULL DEFAULT 1,
    window_start TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS player_decks (
    id           TEXT PRIMARY KEY,
    account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    deck_config  TEXT NOT NULL DEFAULT '{}',
    is_active    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS player_quests (
    account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    quest_id     TEXT NOT NULL,
    cadence      TEXT NOT NULL,
    period_key   TEXT NOT NULL,
    progress     INTEGER NOT NULL DEFAULT 0,
    claimed      INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (account_id, quest_id, period_key)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_match_log_account ON match_log(account_id);
  CREATE INDEX IF NOT EXISTS idx_social_friends_friend ON social_friends(friend_account_id);
  CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id);
  CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
  CREATE INDEX IF NOT EXISTS idx_accounts_device_fp ON accounts(device_fp);
  CREATE INDEX IF NOT EXISTS idx_player_decks_account ON player_decks(account_id);
  CREATE INDEX IF NOT EXISTS idx_player_quests_account ON player_quests(account_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_player_decks_active
    ON player_decks(account_id) WHERE is_active = 1;
`)

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
  if (columns.some((column) => column.name === columnName)) {
    return
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

function ensureColumns(tableName, columnDefinitions) {
  for (const [columnName, definition] of columnDefinitions) {
    ensureColumn(tableName, columnName, definition)
  }
}

ensureColumns('accounts', [
  ['created_ip_hash', 'TEXT'],
  ['created_ua_hash', 'TEXT'],
  ['role', "TEXT NOT NULL DEFAULT 'user'"],
  ['email', 'TEXT'],
  ['email_normalized', 'TEXT'],
  ['email_verified_at', 'TEXT'],
  ['email_verification_required', 'INTEGER NOT NULL DEFAULT 1'],
  ['account_status', "TEXT NOT NULL DEFAULT 'active'"],
  ['account_standard_version', 'INTEGER NOT NULL DEFAULT 0'],
  ['account_setup_required', 'INTEGER NOT NULL DEFAULT 1'],
  ['terms_version', "TEXT NOT NULL DEFAULT ''"],
  ['terms_accepted_at', 'TEXT'],
  ['terms_accepted_ip_hash', 'TEXT'],
  ['terms_accepted_ua_hash', 'TEXT'],
  ['privacy_version', "TEXT NOT NULL DEFAULT ''"],
  ['privacy_accepted_at', 'TEXT'],
  ['privacy_accepted_ip_hash', 'TEXT'],
  ['privacy_accepted_ua_hash', 'TEXT'],
  ['age_gate_version', "TEXT NOT NULL DEFAULT ''"],
  ['age_attested_at', 'TEXT'],
  ['age_attestation', "TEXT NOT NULL DEFAULT ''"],
  ['password_hash_algorithm', "TEXT NOT NULL DEFAULT 'scrypt-v1'"],
  ['password_updated_at', 'TEXT'],
  ['password_reset_required', 'INTEGER NOT NULL DEFAULT 0'],
  ['last_security_event_at', 'TEXT'],
  ['failed_login_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['locked_until', 'TEXT'],
  ['deleted_at', 'TEXT'],
  ['legacy_migration_started_at', 'TEXT'],
  ['legacy_migration_deadline_at', 'TEXT'],
  ['legacy_migration_completed_at', 'TEXT'],
  ['recovery_codes_acknowledged_at', 'TEXT'],
])

ensureColumns('sessions', [
  ['ip_hash', 'TEXT'],
  ['token_hash', 'TEXT'],
  ['family_id', 'TEXT'],
  ['user_agent_hash', 'TEXT'],
  ['last_seen_at', 'TEXT'],
  ['revoked_at', 'TEXT'],
  ['auth_method', "TEXT NOT NULL DEFAULT 'password'"],
  ['last_passkey_reauth_at', 'TEXT'],
])

ensureColumns('player_profiles', [
  ['shards', 'INTEGER NOT NULL DEFAULT 120'],
  ['season_rating', 'INTEGER NOT NULL DEFAULT 1200'],
  ['wins', 'INTEGER NOT NULL DEFAULT 0'],
  ['losses', 'INTEGER NOT NULL DEFAULT 0'],
  ['streak', 'INTEGER NOT NULL DEFAULT 0'],
  ['deck_config', "TEXT NOT NULL DEFAULT '{}'"],
  ['owned_themes', "TEXT NOT NULL DEFAULT '[\"royal\"]'"],
  ['selected_theme', "TEXT NOT NULL DEFAULT 'royal'"],
  ['last_daily', "TEXT NOT NULL DEFAULT ''"],
  ['total_earned', 'INTEGER NOT NULL DEFAULT 120'],
  ['updated_at', "TEXT NOT NULL DEFAULT ''"],
  ['owned_cards', "TEXT NOT NULL DEFAULT '{}'"],
  ['owned_card_borders', "TEXT NOT NULL DEFAULT '[\"default\"]'"],
  ['selected_card_border', "TEXT NOT NULL DEFAULT 'default'"],
])

ensureColumns('match_log', [
  ['mode', "TEXT NOT NULL DEFAULT 'ai'"],
  ['turns', 'INTEGER NOT NULL DEFAULT 0'],
  ['shards_earned', 'INTEGER NOT NULL DEFAULT 0'],
  ['rating_delta', 'INTEGER NOT NULL DEFAULT 0'],
  ['played_at', "TEXT NOT NULL DEFAULT ''"],
])

db.exec(`
  UPDATE player_profiles
  SET updated_at = datetime('now')
  WHERE TRIM(COALESCE(updated_at, '')) = '';

  UPDATE match_log
  SET played_at = datetime('now')
  WHERE TRIM(COALESCE(played_at, '')) = '';

  UPDATE accounts
  SET account_setup_required = 1
  WHERE account_standard_version < ${CURRENT_ACCOUNT_STANDARD_VERSION}
    OR TRIM(COALESCE(terms_version, '')) <> '${CURRENT_TERMS_VERSION}'
    OR TRIM(COALESCE(privacy_version, '')) <> '${CURRENT_PRIVACY_VERSION}'
    OR TRIM(COALESCE(age_gate_version, '')) <> '${CURRENT_AGE_GATE_VERSION}';
`)

// Backward-safe naming migration: older or manually edited rows may have a
// blank display_name. Normalize those rows to the username so account labels
// remain stable without breaking existing logins or profile data.
db.exec(`
  UPDATE accounts
  SET display_name = username
  WHERE TRIM(COALESCE(display_name, '')) = ''
`)

// Create indexes that depend on migrated columns only after the ALTER TABLE
// compatibility pass above. This keeps startup safe for older databases whose
// existing `accounts` table predates the anti-abuse fields.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_accounts_created_ip ON accounts(created_ip_hash);
  CREATE INDEX IF NOT EXISTS idx_accounts_created_ip_ua_created_at ON accounts(created_ip_hash, created_ua_hash, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_normalized
    ON accounts(email_normalized)
    WHERE email_normalized IS NOT NULL AND email_normalized <> '';
  CREATE INDEX IF NOT EXISTS idx_accounts_setup_required
    ON accounts(account_setup_required, account_status);
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS account_authenticators (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    credential_public_key BLOB NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT NOT NULL DEFAULT '[]',
    backed_up INTEGER NOT NULL DEFAULT 0,
    device_type TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS auth_challenges (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    challenge TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    consumed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS email_tokens (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    email_normalized TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    consumed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS account_consents (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_version TEXT NOT NULL,
    accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
    ip_hash TEXT,
    ua_hash TEXT,
    locale TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'auth_gate'
  );

  CREATE TABLE IF NOT EXISTS account_recovery_codes (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    code_prefix TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    used_at TEXT,
    revoked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS security_events (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    ip_hash TEXT,
    ua_hash TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS session_families (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_account_authenticators_account ON account_authenticators(account_id);
  CREATE INDEX IF NOT EXISTS idx_auth_challenges_account ON auth_challenges(account_id, purpose, expires_at);
  CREATE INDEX IF NOT EXISTS idx_email_tokens_account ON email_tokens(account_id, purpose, expires_at);
  CREATE INDEX IF NOT EXISTS idx_account_consents_account ON account_consents(account_id, document_type, document_version);
  CREATE INDEX IF NOT EXISTS idx_account_recovery_codes_account ON account_recovery_codes(account_id, revoked_at, used_at);
  CREATE INDEX IF NOT EXISTS idx_account_recovery_codes_prefix ON account_recovery_codes(account_id, code_prefix);
  CREATE INDEX IF NOT EXISTS idx_security_events_account ON security_events(account_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_session_families_account ON session_families(account_id);
`)

db.exec(`
  UPDATE accounts
  SET legacy_migration_started_at = COALESCE(legacy_migration_started_at, datetime('now')),
      legacy_migration_deadline_at = COALESCE(legacy_migration_deadline_at, datetime('now', '+${LEGACY_MIGRATION_WINDOW_DAYS} days'))
  WHERE account_status = 'active'
    AND legacy_migration_completed_at IS NULL
    AND id NOT IN (SELECT DISTINCT account_id FROM account_authenticators);

  UPDATE accounts
  SET legacy_migration_completed_at = COALESCE(legacy_migration_completed_at, datetime('now'))
  WHERE account_status = 'active'
    AND legacy_migration_completed_at IS NULL
    AND id IN (SELECT DISTINCT account_id FROM account_authenticators);
`)

// ─── Admin role schema ───────────────────────────────────────────────────────
// Exactly one account may have role='owner'. Enforced at the DB layer via a
// partial unique index, and at the application layer via setAccountRole /
// transferOwnership. Roles are re-read from the DB on every privileged request
// so that demotion takes effect immediately without session invalidation.

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_single_owner
    ON accounts(role) WHERE role = 'owner';

  CREATE TABLE IF NOT EXISTS admin_audit (
    id                 TEXT PRIMARY KEY,
    actor_account_id   TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    target_account_id  TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    action             TEXT NOT NULL,
    metadata           TEXT NOT NULL DEFAULT '{}',
    ip_hash            TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit(actor_account_id);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit(target_account_id);
`)

// ─── Password hashing (scrypt — no native addon needed) ──────────────────────

const SCRYPT_KEYLEN = 64
const SCRYPT_COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN, SCRYPT_COST).toString('hex')
  return `${salt}:${derived}`
}

export function verifyPassword(plain, stored) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN, SCRYPT_COST)
  const expected = Buffer.from(hash, 'hex')
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

// ─── Device fingerprint helper ────────────────────────────────────────────────

export function hashFingerprint(fp) {
  if (!fp) return null
  return createHash('sha256').update(`rc-fp:${fp}`).digest('hex').slice(0, 32)
}

export function hashUserAgent(userAgent) {
  if (!userAgent) return null
  return createHash('sha256').update(`rc-ua:${userAgent}`).digest('hex').slice(0, 24)
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

const RATE_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

const _rlCheck = db.prepare(`SELECT count, window_start FROM rate_limits WHERE key = ?`)
const _rlUpsert = db.prepare(`
  INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET count = count + 1
`)
const _rlReset = db.prepare(`
  UPDATE rate_limits SET count = 1, window_start = datetime('now') WHERE key = ?
`)

export function checkRateLimit(key, maxAttempts) {
  const row = _rlCheck.get(key)
  if (!row) {
    _rlUpsert.run(key)
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  const windowAge = Date.now() - new Date(row.window_start + 'Z').getTime()
  if (windowAge > RATE_WINDOW_MS) {
    _rlReset.run(key)
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  if (row.count >= maxAttempts) {
    return { allowed: false, remaining: 0 }
  }

  _rlUpsert.run(key)
  return { allowed: true, remaining: maxAttempts - row.count - 1 }
}

// ─── Account operations ──────────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/
const DISPLAY_RE = /^.{1,24}$/
const PASSWORD_MIN = 8
const MAX_ACCOUNTS_PER_DEVICE = 2
const MAX_ACCOUNTS_PER_IP = 4
const MAX_ACCOUNTS_PER_IP_PER_DAY = 2
const MAX_ACCOUNTS_PER_IP_AND_AGENT_PER_WEEK = 3
const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000

const _insertAccount = db.prepare(`
  INSERT INTO accounts (id, username, password_hash, display_name, device_fp, created_ip_hash, created_ua_hash, flags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const _insertProfile = db.prepare(`
  INSERT INTO player_profiles (account_id, deck_config, owned_cards)
  VALUES (?, ?, ?)
`)

const _getByUsername = db.prepare(`SELECT * FROM accounts WHERE username = ?`)
const _getById = db.prepare(`SELECT * FROM accounts WHERE id = ?`)
const _countAuthenticatorsByAccount = db.prepare(`SELECT COUNT(*) as cnt FROM account_authenticators WHERE account_id = ?`)
const _listAuthenticatorsByAccount = db.prepare(`
  SELECT id, credential_id, transports, backed_up, device_type, name, created_at, last_used_at
  FROM account_authenticators
  WHERE account_id = ?
  ORDER BY created_at DESC
`)
const _listAuthenticatorCredentialsByAccount = db.prepare(`
  SELECT id, credential_id, transports, counter
  FROM account_authenticators
  WHERE account_id = ?
  ORDER BY created_at DESC
`)
const _getAuthenticatorByCredentialId = db.prepare(`
  SELECT a.*, acct.username, acct.display_name, acct.role
  FROM account_authenticators a
  JOIN accounts acct ON acct.id = a.account_id
  WHERE a.credential_id = ?
`)
const _insertAuthenticator = db.prepare(`
  INSERT INTO account_authenticators (
    id, account_id, credential_id, credential_public_key, counter, transports, backed_up, device_type, name
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const _updateAuthenticatorCounter = db.prepare(`
  UPDATE account_authenticators
  SET counter = ?, backed_up = ?, device_type = ?, last_used_at = datetime('now')
  WHERE id = ?
`)
const _deleteAuthenticator = db.prepare(`DELETE FROM account_authenticators WHERE id = ? AND account_id = ?`)
const _deleteOtherAuthenticatorsByAccount = db.prepare(`DELETE FROM account_authenticators WHERE account_id = ? AND id <> ?`)
const _consumeOutstandingAuthChallenges = db.prepare(`
  UPDATE auth_challenges
  SET consumed_at = datetime('now')
  WHERE account_id = ? AND purpose = ? AND consumed_at IS NULL
`)
const _insertAuthChallenge = db.prepare(`
  INSERT INTO auth_challenges (id, account_id, purpose, challenge, metadata, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const _getActiveAuthChallenge = db.prepare(`
  SELECT * FROM auth_challenges
  WHERE id = ?
    AND purpose = ?
    AND consumed_at IS NULL
    AND expires_at > datetime('now')
`)
const _consumeAuthChallenge = db.prepare(`UPDATE auth_challenges SET consumed_at = datetime('now') WHERE id = ?`)
const _insertAccountConsent = db.prepare(`
  INSERT INTO account_consents (id, account_id, document_type, document_version, ip_hash, ua_hash, locale, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
const _countActiveRecoveryCodes = db.prepare(`
  SELECT COUNT(*) as cnt
  FROM account_recovery_codes
  WHERE account_id = ? AND used_at IS NULL AND revoked_at IS NULL
`)
const _listActiveRecoveryCodes = db.prepare(`
  SELECT id, code_hash, code_prefix, batch_id, created_at
  FROM account_recovery_codes
  WHERE account_id = ? AND used_at IS NULL AND revoked_at IS NULL
  ORDER BY created_at DESC
`)
const _revokeRecoveryCodesByAccount = db.prepare(`
  UPDATE account_recovery_codes
  SET revoked_at = datetime('now')
  WHERE account_id = ? AND used_at IS NULL AND revoked_at IS NULL
`)
const _insertRecoveryCode = db.prepare(`
  INSERT INTO account_recovery_codes (id, account_id, code_hash, code_prefix, batch_id)
  VALUES (?, ?, ?, ?, ?)
`)
const _consumeRecoveryCode = db.prepare(`
  UPDATE account_recovery_codes
  SET used_at = datetime('now')
  WHERE id = ? AND account_id = ? AND used_at IS NULL AND revoked_at IS NULL
`)
const _acknowledgeRecoveryCodes = db.prepare(`
  UPDATE accounts
  SET recovery_codes_acknowledged_at = datetime('now'), last_security_event_at = datetime('now')
  WHERE id = ?
`)
const _insertSecurityEvent = db.prepare(`
  INSERT INTO security_events (id, account_id, event_type, ip_hash, ua_hash, metadata)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const _markAccountDeleted = db.prepare(`
  UPDATE accounts
  SET account_status = 'deleted', deleted_at = datetime('now'), last_security_event_at = datetime('now')
  WHERE id = ?
`)
const _markAccountPendingPasskeySignup = db.prepare(`
  UPDATE accounts
  SET account_status = 'pending_passkey', account_setup_required = 1, last_security_event_at = datetime('now')
  WHERE id = ?
`)
const _startLegacyMigrationWindow = db.prepare(`
  UPDATE accounts
  SET legacy_migration_started_at = COALESCE(legacy_migration_started_at, datetime('now')),
      legacy_migration_deadline_at = COALESCE(legacy_migration_deadline_at, datetime('now', '+${LEGACY_MIGRATION_WINDOW_DAYS} days'))
  WHERE id = ? AND legacy_migration_completed_at IS NULL
`)
const _deleteAuthenticatorsByAccount = db.prepare(`DELETE FROM account_authenticators WHERE account_id = ?`)
const _deleteEmailTokensByAccount = db.prepare(`DELETE FROM email_tokens WHERE account_id = ?`)
const _deleteAuthChallengesByAccount = db.prepare(`DELETE FROM auth_challenges WHERE account_id = ?`)
const _deleteFriendEdgesByAccount = db.prepare(`DELETE FROM social_friends WHERE account_id = ? OR friend_account_id = ?`)
const _deleteClanMembershipByAccount = db.prepare(`DELETE FROM clan_members WHERE account_id = ?`)
const _completeAccountStandards = db.prepare(`
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

const _countByFp = db.prepare(`
  SELECT COUNT(*) as cnt FROM accounts WHERE device_fp = ? AND device_fp IS NOT NULL
`)

const _countByCreatedIp = db.prepare(`
  SELECT COUNT(*) as cnt FROM accounts WHERE created_ip_hash = ? AND created_ip_hash IS NOT NULL
`)

const _countByCreatedIpPerDay = db.prepare(`
  SELECT COUNT(*) as cnt
  FROM accounts
  WHERE created_ip_hash = ?
    AND created_ip_hash IS NOT NULL
    AND created_at >= datetime('now', '-1 day')
`)

const _countByCreatedIpAndAgentPerWeek = db.prepare(`
  SELECT COUNT(*) as cnt
  FROM accounts
  WHERE created_ip_hash = ?
    AND created_ua_hash = ?
    AND created_ip_hash IS NOT NULL
    AND created_ua_hash IS NOT NULL
    AND created_at >= datetime('now', '-7 day')
`)

function getCount(row) {
  return Number(row?.cnt ?? 0)
}

function hashSessionToken(token) {
  return createHash('sha256').update(`rc-session-token:${token}`).digest('hex')
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

function recoveryStatusForAccount(accountId) {
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

function recordSecurityEvent(accountId, eventType, details = {}) {
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
    return { ok: false, error: 'That username is already taken.' }
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

const _insertSessionFamily = db.prepare(`INSERT INTO session_families (id, account_id) VALUES (?, ?)`)

const _insertSession = db.prepare(`
  INSERT INTO sessions (token, account_id, expires_at, ip_hash, token_hash, family_id, user_agent_hash, last_seen_at, auth_method, last_passkey_reauth_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, CASE WHEN ? = 'passkey' THEN datetime('now') ELSE NULL END)
`)

const _getSessionByRawToken = db.prepare(`
  SELECT s.*, a.username, COALESCE(NULLIF(TRIM(a.display_name), ''), a.username) as display_name FROM sessions s
  JOIN accounts a ON a.id = s.account_id
  WHERE s.token = ? AND s.expires_at > datetime('now') AND s.revoked_at IS NULL
`)

const _getSessionByHash = db.prepare(`
  SELECT s.*, a.username, COALESCE(NULLIF(TRIM(a.display_name), ''), a.username) as display_name FROM sessions s
  JOIN accounts a ON a.id = s.account_id
  WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND s.revoked_at IS NULL
`)

const _touchSession = db.prepare(`UPDATE sessions SET last_seen_at = datetime('now') WHERE token = ?`)
const _markSessionPasskeyReauthenticated = db.prepare(`
  UPDATE sessions
  SET last_passkey_reauth_at = datetime('now'), last_seen_at = datetime('now')
  WHERE (token = ? OR token_hash = ?) AND revoked_at IS NULL AND expires_at > datetime('now')
`)

const _revokeSession = db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE token = ? OR token_hash = ?`)

const _revokeSessionsByAccount = db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE account_id = ? AND revoked_at IS NULL`)

const _cleanExpiredSessions = db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now') OR revoked_at IS NOT NULL`)

const _updateLastLogin = db.prepare(`UPDATE accounts SET last_login = datetime('now') WHERE id = ?`)

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

export function exportAccountData(accountId) {
  const account = _getById.get(accountId)
  if (!account) return null
  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: account.id,
      username: account.username,
      displayName: account.display_name,
      email: account.email,
      emailVerifiedAt: account.email_verified_at,
      role: account.role,
      accountStatus: account.account_status,
      accountStandardVersion: account.account_standard_version,
      createdAt: account.created_at,
      lastLogin: account.last_login,
      deletedAt: account.deleted_at,
      termsVersion: account.terms_version,
      termsAcceptedAt: account.terms_accepted_at,
      privacyVersion: account.privacy_version,
      privacyAcceptedAt: account.privacy_accepted_at,
      ageGateVersion: account.age_gate_version,
      ageAttestedAt: account.age_attested_at,
      ageAttestation: account.age_attestation,
    },
    readiness: getAccountReadiness(accountId),
    profile: getProfile(accountId),
    decks: listDecks(accountId),
    collection: getCollection(accountId),
    recentMatches: getRecentMatches(accountId),
    social: getSocialOverview(accountId),
    trades: listTradesForAccount(accountId),
    passkeys: listAccountPasskeys(accountId),
    sessions: listAccountSessions(accountId),
    consents: db.prepare(`
      SELECT document_type as documentType, document_version as documentVersion, accepted_at as acceptedAt, locale, source
      FROM account_consents
      WHERE account_id = ?
      ORDER BY accepted_at DESC
    `).all(accountId),
  }
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

export function expireLegacyMigrationAccounts(details = {}) {
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

export function cleanupSessions() {
  _cleanExpiredSessions.run()
}

// Run cleanup periodically
expireLegacyMigrationAccounts({ metadata: { source: 'startup', windowDays: LEGACY_MIGRATION_WINDOW_DAYS } })
setInterval(cleanupSessions, 60 * 60 * 1000)

// ─── Player profile operations ───────────────────────────────────────────────

const _getProfile = db.prepare(`SELECT * FROM player_profiles WHERE account_id = ?`)

function buildStarterCollection() {
  const starter = {}

  Object.entries(DEFAULT_DECK_CONFIG).forEach(([cardId, count]) => {
    if (count > 0) {
      starter[cardId] = count
    }
  })

  ;['bog-lurker', 'rust-golem', 'militia-recruit', 'moonwell-sage', 'pack-wolf'].forEach((cardId) => {
    starter[cardId] = Math.max(1, starter[cardId] ?? 0)
  })

  return starter
}

function normalizeOwnedCards(rawValue) {
  const parsed = rawValue ? JSON.parse(rawValue) : {}
  if (parsed && Object.keys(parsed).length > 0) {
    return parsed
  }
  return buildStarterCollection()
}

const _updateDeck = db.prepare(`
  UPDATE player_profiles SET deck_config = ?, updated_at = datetime('now') WHERE account_id = ?
`)

const _updateTheme = db.prepare(`
  UPDATE player_profiles SET selected_theme = ?, updated_at = datetime('now') WHERE account_id = ?
`)

export function getProfile(accountId) {
  const row = _getProfile.get(accountId)
  if (!row) return null
  // Lazy migration: ensure at least one entry in player_decks for this
  // account. New accounts get a "Main" deck seeded from the legacy
  // deck_config column (which is also kept in sync as the active deck for
  // backwards compatibility with /api/me/deck).
  ensureMigratedDecks(accountId, row.deck_config)
  const ownedBorders = (() => {
    try {
      const parsed = JSON.parse(row.owned_card_borders ?? '["default"]')
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch { /* ignore */ }
    return ['default']
  })()
  return {
    ...row,
    owned_themes: JSON.parse(row.owned_themes),
    deck_config: JSON.parse(row.deck_config),
    owned_cards: normalizeOwnedCards(row.owned_cards),
    owned_card_borders: ownedBorders,
    selected_card_border: row.selected_card_border ?? 'default',
  }
}

const DECK_MIN_TOTAL = 10
const DECK_MAX_TOTAL = 16
const DECK_MAX_COPIES = 3
const DECK_MAX_PER_ACCOUNT = 12
const DECK_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _'\-]{0,29}$/
const DECK_NAME_ERROR = "Deck name must be 1-30 characters: letters, numbers, spaces, underscore, hyphen, apostrophe."
const DECK_CARD_ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/

export function validateDeckConfig(deckConfig) {
  if (!deckConfig || typeof deckConfig !== 'object' || Array.isArray(deckConfig)) {
    return { ok: false, error: 'Deck config must be an object.' }
  }
  const entries = Object.entries(deckConfig)
  if (entries.length > 80) {
    return { ok: false, error: 'Deck config has too many entries.' }
  }
  let total = 0
  const sanitized = {}
  for (const [cardId, rawCount] of entries) {
    if (typeof cardId !== 'string' || !DECK_CARD_ID_RE.test(cardId)) {
      return { ok: false, error: 'Invalid card identifier in deck.' }
    }
    const count = Number(rawCount)
    if (!Number.isInteger(count) || count < 0 || count > DECK_MAX_COPIES) {
      return { ok: false, error: `Card count must be an integer 0-${DECK_MAX_COPIES}.` }
    }
    if (count > 0) {
      sanitized[cardId] = count
      total += count
    }
  }
  if (total > DECK_MAX_TOTAL) {
    return { ok: false, error: `Deck cannot exceed ${DECK_MAX_TOTAL} cards.` }
  }
  // Allow saving in-progress decks (< MIN) but flag so client can warn. Both are persisted.
  return { ok: true, deckConfig: sanitized, total, ready: total >= DECK_MIN_TOTAL }
}

function validateOwnership(profile, deckConfig) {
  for (const [cardId, count] of Object.entries(deckConfig)) {
    const owned = profile.owned_cards?.[cardId] ?? 0
    if (count > owned) {
      const cardName = CARD_LIBRARY.find((card) => card.id === cardId)?.name ?? cardId
      return { ok: false, error: `You only own ${owned} copy/copies of ${cardName}. Open packs to unlock more.` }
    }
  }
  return { ok: true }
}

// ─── Multi-deck CRUD ─────────────────────────────────────────────────

const _listDecks = db.prepare(`
  SELECT id, name, deck_config, is_active, created_at, updated_at
  FROM player_decks WHERE account_id = ?
  ORDER BY is_active DESC, created_at ASC
`)
const _getDeckById = db.prepare(`
  SELECT id, account_id, name, deck_config, is_active, created_at, updated_at
  FROM player_decks WHERE id = ? AND account_id = ?
`)
const _countDecks = db.prepare(`SELECT COUNT(*) as cnt FROM player_decks WHERE account_id = ?`)
const _insertDeck = db.prepare(`
  INSERT INTO player_decks (id, account_id, name, deck_config, is_active)
  VALUES (?, ?, ?, ?, ?)
`)
const _updateDeckRow = db.prepare(`
  UPDATE player_decks SET name = ?, deck_config = ?, updated_at = datetime('now')
  WHERE id = ? AND account_id = ?
`)
const _renameDeckRow = db.prepare(`
  UPDATE player_decks SET name = ?, updated_at = datetime('now') WHERE id = ? AND account_id = ?
`)
const _deleteDeckRow = db.prepare(`DELETE FROM player_decks WHERE id = ? AND account_id = ?`)
const _deactivateDecks = db.prepare(`UPDATE player_decks SET is_active = 0 WHERE account_id = ?`)
const _activateDeckRow = db.prepare(`
  UPDATE player_decks SET is_active = 1, updated_at = datetime('now') WHERE id = ? AND account_id = ?
`)
const _getActiveDeckRow = db.prepare(`
  SELECT id, name, deck_config, created_at, updated_at FROM player_decks
  WHERE account_id = ? AND is_active = 1 LIMIT 1
`)

function mapDeckRow(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    deckConfig: JSON.parse(row.deck_config),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function ensureMigratedDecks(accountId, legacyDeckConfig) {
  const count = Number(_countDecks.get(accountId)?.cnt ?? 0)
  if (count > 0) return
  let parsed
  try {
    parsed = JSON.parse(legacyDeckConfig ?? '{}')
  } catch {
    parsed = {}
  }
  const seedConfig = parsed && Object.keys(parsed).length > 0 ? parsed : DEFAULT_DECK_CONFIG
  const id = `dck-${randomBytes(8).toString('hex')}`
  _insertDeck.run(id, accountId, 'Main', JSON.stringify(seedConfig), 1)
}

export function listDecks(accountId) {
  // getProfile triggers ensureMigratedDecks; safe to call without it though.
  ensureMigratedDecks(accountId, null)
  return _listDecks.all(accountId).map(mapDeckRow)
}

export function getActiveDeck(accountId) {
  ensureMigratedDecks(accountId, null)
  const row = _getActiveDeckRow.get(accountId)
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    deckConfig: JSON.parse(row.deck_config),
  }
}

export function createDeck(accountId, name, deckConfig) {
  const trimmedName = String(name ?? '').trim()
  if (!DECK_NAME_RE.test(trimmedName)) {
    return { ok: false, error: DECK_NAME_ERROR }
  }
  const validation = validateDeckConfig(deckConfig ?? {})
  if (!validation.ok) return validation
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }
  const ownership = validateOwnership(profile, validation.deckConfig)
  if (!ownership.ok) return ownership

  const count = Number(_countDecks.get(accountId)?.cnt ?? 0)
  if (count >= DECK_MAX_PER_ACCOUNT) {
    return { ok: false, error: `You can save at most ${DECK_MAX_PER_ACCOUNT} decks. Delete one first.` }
  }

  const id = `dck-${randomBytes(8).toString('hex')}`
  // First deck for an account is also the active deck.
  const isActive = count === 0 ? 1 : 0
  _insertDeck.run(id, accountId, trimmedName, JSON.stringify(validation.deckConfig), isActive)
  if (isActive) {
    _updateDeck.run(JSON.stringify(validation.deckConfig), accountId)
  }
  return { ok: true, deck: mapDeckRow(_getDeckById.get(id, accountId)) }
}

export function updateDeck(accountId, deckId, { name, deckConfig }) {
  const existing = _getDeckById.get(deckId, accountId)
  if (!existing) return { ok: false, error: 'Deck not found.' }

  const nextName = name === undefined ? existing.name : String(name).trim()
  if (!DECK_NAME_RE.test(nextName)) {
    return { ok: false, error: DECK_NAME_ERROR }
  }

  const nextConfigRaw = deckConfig ?? JSON.parse(existing.deck_config)
  const validation = validateDeckConfig(nextConfigRaw)
  if (!validation.ok) return validation

  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }
  const ownership = validateOwnership(profile, validation.deckConfig)
  if (!ownership.ok) return ownership

  _updateDeckRow.run(nextName, JSON.stringify(validation.deckConfig), deckId, accountId)
  // Mirror to legacy deck_config if this is the active deck.
  if (existing.is_active) {
    _updateDeck.run(JSON.stringify(validation.deckConfig), accountId)
  }
  return {
    ok: true,
    deck: mapDeckRow(_getDeckById.get(deckId, accountId)),
    total: validation.total,
    ready: validation.ready,
  }
}

export function renameDeck(accountId, deckId, name) {
  const trimmed = String(name ?? '').trim()
  if (!DECK_NAME_RE.test(trimmed)) {
    return { ok: false, error: DECK_NAME_ERROR }
  }
  const existing = _getDeckById.get(deckId, accountId)
  if (!existing) return { ok: false, error: 'Deck not found.' }
  _renameDeckRow.run(trimmed, deckId, accountId)
  return { ok: true, deck: mapDeckRow(_getDeckById.get(deckId, accountId)) }
}

export function deleteDeck(accountId, deckId) {
  const existing = _getDeckById.get(deckId, accountId)
  if (!existing) return { ok: false, error: 'Deck not found.' }
  const count = Number(_countDecks.get(accountId)?.cnt ?? 0)
  if (count <= 1) {
    return { ok: false, error: 'You must keep at least one deck. Create another deck before deleting this one.' }
  }
  const tx = db.transaction(() => {
    _deleteDeckRow.run(deckId, accountId)
    if (existing.is_active) {
      // Promote the oldest remaining deck to active.
      const next = _listDecks.all(accountId)[0]
      if (next) {
        _activateDeckRow.run(next.id, accountId)
        _updateDeck.run(next.deck_config, accountId)
      }
    }
  })
  tx()
  return { ok: true }
}

export function selectActiveDeck(accountId, deckId) {
  const existing = _getDeckById.get(deckId, accountId)
  if (!existing) return { ok: false, error: 'Deck not found.' }
  const tx = db.transaction(() => {
    _deactivateDecks.run(accountId)
    _activateDeckRow.run(deckId, accountId)
    _updateDeck.run(existing.deck_config, accountId)
  })
  tx()
  return { ok: true, deck: mapDeckRow(_getDeckById.get(deckId, accountId)) }
}

export function saveDeck(accountId, deckConfig) {
  // Legacy single-deck endpoint: writes to the active deck (and the
  // mirrored player_profiles.deck_config) so older clients keep working.
  const result = validateDeckConfig(deckConfig)
  if (!result.ok) return result

  const profile = getProfile(accountId)
  if (!profile) {
    return { ok: false, error: 'Profile not found.' }
  }
  const ownership = validateOwnership(profile, result.deckConfig)
  if (!ownership.ok) return ownership

  const active = _getActiveDeckRow.get(accountId)
  if (active) {
    _updateDeckRow.run(active.name, JSON.stringify(result.deckConfig), active.id, accountId)
  }
  _updateDeck.run(JSON.stringify(result.deckConfig), accountId)
  return { ok: true, total: result.total, ready: result.ready }
}

export function selectTheme(accountId, themeId) {
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }
  if (!profile.owned_themes.includes(themeId)) {
    return { ok: false, error: 'Theme not owned.' }
  }
  _updateTheme.run(themeId, accountId)
  return { ok: true }
}

// ─── Economy operations (server-authoritative) ──────────────────────────────

const THEME_COSTS = { royal: 0, ember: 120, moon: 180 }
const WIN_SHARDS = 30
const LOSS_SHARDS = 10
const DAILY_SHARDS = 25
const WIN_RATING = 25
const LOSS_RATING = 15
const RATING_FLOOR = 1000

const _grantShards = db.prepare(`
  UPDATE player_profiles
  SET shards = shards + ?, total_earned = total_earned + MAX(0, ?), updated_at = datetime('now')
  WHERE account_id = ?
`)

const _deductShards = db.prepare(`
  UPDATE player_profiles
  SET shards = shards - ?, updated_at = datetime('now')
  WHERE account_id = ? AND shards >= ?
`)

const _addOwnedTheme = db.prepare(`
  UPDATE player_profiles
  SET owned_themes = ?, updated_at = datetime('now')
  WHERE account_id = ?
`)

const _setDailyClaim = db.prepare(`
  UPDATE player_profiles
  SET last_daily = ?, shards = shards + ?, total_earned = total_earned + ?, updated_at = datetime('now')
  WHERE account_id = ?
`)

const _updateRating = db.prepare(`
  UPDATE player_profiles
  SET season_rating = MAX(?, season_rating + ?), updated_at = datetime('now')
  WHERE account_id = ?
`)

const _updateRecord = db.prepare(`
  UPDATE player_profiles
  SET wins = wins + ?, losses = losses + ?, streak = ?, updated_at = datetime('now')
  WHERE account_id = ?
`)

const _insertMatch = db.prepare(`
  INSERT INTO match_log (id, account_id, opponent, mode, result, turns, shards_earned, rating_delta)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const _insertQuest = db.prepare(`
  INSERT OR IGNORE INTO player_quests (account_id, quest_id, cadence, period_key)
  VALUES (?, ?, ?, ?)
`)

const _listQuestRows = db.prepare(`
  SELECT * FROM player_quests WHERE account_id = ?
`)

const _getQuestRow = db.prepare(`
  SELECT * FROM player_quests WHERE account_id = ? AND quest_id = ? AND period_key = ?
`)

const _setQuestProgress = db.prepare(`
  UPDATE player_quests
  SET progress = ?, completed_at = COALESCE(completed_at, ?), updated_at = datetime('now')
  WHERE account_id = ? AND quest_id = ? AND period_key = ?
`)

const _claimQuest = db.prepare(`
  UPDATE player_quests
  SET claimed = 1, updated_at = datetime('now')
  WHERE account_id = ? AND quest_id = ? AND period_key = ? AND claimed = 0
`)

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function weekKey(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const dayIndex = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start.getTime()) / 86_400_000)
  const week = Math.floor(dayIndex / 7) + 1
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function questPeriodKey(cadence, date = new Date()) {
  if (cadence === 'daily') return dayKey(date)
  if (cadence === 'weekly') return weekKey(date)
  return 'ever'
}

function questExpiresAt(cadence, date = new Date()) {
  if (cadence === 'daily') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString()
  }
  if (cadence === 'weekly') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 7)).toISOString()
  }
  return null
}

function stableQuestSample(accountId, periodKey, cadence, pool, count) {
  return [...pool]
    .sort((left, right) => {
      const leftHash = createHash('sha256').update(`${accountId}:${periodKey}:${cadence}:${left.id}`).digest('hex')
      const rightHash = createHash('sha256').update(`${accountId}:${periodKey}:${cadence}:${right.id}`).digest('hex')
      return leftHash.localeCompare(rightHash)
    })
    .slice(0, count)
}

function getAssignedQuestDefinitions(accountId, date = new Date()) {
  const daily = stableQuestSample(
    accountId,
    questPeriodKey('daily', date),
    'daily',
    QUEST_DEFINITIONS.filter((quest) => quest.cadence === 'daily'),
    3,
  )
  const weekly = stableQuestSample(
    accountId,
    questPeriodKey('weekly', date),
    'weekly',
    QUEST_DEFINITIONS.filter((quest) => quest.cadence === 'weekly'),
    3,
  )
  const permanent = QUEST_DEFINITIONS.filter((quest) => quest.cadence === 'milestone' || quest.cadence === 'skirmish')
  return [...daily, ...weekly, ...permanent]
}

function deckSize(deckConfig) {
  return Object.values(deckConfig ?? {}).reduce((sum, count) => sum + Number(count ?? 0), 0)
}

function ensureQuestRows(accountId, date = new Date()) {
  for (const quest of getAssignedQuestDefinitions(accountId, date)) {
    _insertQuest.run(accountId, quest.id, quest.cadence, questPeriodKey(quest.cadence, date))
  }
}

function completeIfReady(accountId, quest, row, nextProgress) {
  const target = quest.objective.target
  const progress = Math.max(0, Math.min(target, nextProgress))
  const completedAt = progress >= target ? new Date().toISOString() : null
  if (progress !== row.progress || (completedAt && !row.completed_at)) {
    _setQuestProgress.run(progress, completedAt, accountId, quest.id, row.period_key)
  }
}

function questMatchesEvent(quest, eventType, payload) {
  const objective = quest.objective
  if (objective.type !== eventType) return false
  if (objective.type === 'win_ai_difficulty') {
    return difficultyMeets(payload.aiDifficulty, objective.difficulty)
  }
  return true
}

export function recordQuestEvent(accountId, eventType, payload = {}) {
  if (!accountId) return { ok: false, error: 'Missing account.' }
  ensureQuestRows(accountId)
  const assigned = getAssignedQuestDefinitions(accountId)
  const rows = _listQuestRows.all(accountId)
  const completed = []
  for (const quest of assigned) {
    if (!questMatchesEvent(quest, eventType, payload)) continue
    const periodKey = questPeriodKey(quest.cadence)
    const row = rows.find((entry) => entry.quest_id === quest.id && entry.period_key === periodKey)
    if (!row || row.claimed) continue
    const amount = Math.max(1, Number(payload.amount ?? 1))
    const before = Math.min(quest.objective.target, row.progress)
    completeIfReady(accountId, quest, row, before + amount)
    if (before < quest.objective.target && before + amount >= quest.objective.target) {
      completed.push(quest.id)
    }
  }
  return { ok: true, completed }
}

function buildQuestSummary(quests) {
  return {
    total: quests.length,
    completed: quests.filter((quest) => quest.completed).length,
    claimable: quests.filter((quest) => quest.completed && !quest.claimed).length,
    claimed: quests.filter((quest) => quest.claimed).length,
    dailyClaimable: quests.filter((quest) => quest.cadence === 'daily' && quest.completed && !quest.claimed).length,
    weeklyClaimable: quests.filter((quest) => quest.cadence === 'weekly' && quest.completed && !quest.claimed).length,
    milestoneClaimable: quests.filter((quest) => quest.cadence === 'milestone' && quest.completed && !quest.claimed).length,
    skirmishClaimable: quests.filter((quest) => quest.cadence === 'skirmish' && quest.completed && !quest.claimed).length,
  }
}

export function getQuestOverview(accountId) {
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }
  ensureQuestRows(accountId)

  const assigned = getAssignedQuestDefinitions(accountId)
  const rows = _listQuestRows.all(accountId)
  const quests = assigned.map((quest) => {
    const periodKey = questPeriodKey(quest.cadence)
    const row = rows.find((entry) => entry.quest_id === quest.id && entry.period_key === periodKey)
      ?? _getQuestRow.get(accountId, quest.id, periodKey)
    const dynamicProgress = quest.objective.type === 'build_deck'
      ? Math.max(row?.progress ?? 0, deckSize(profile.deck_config))
      : row?.progress ?? 0
    if (row && dynamicProgress !== row.progress) {
      completeIfReady(accountId, quest, row, dynamicProgress)
    }
    const progress = Math.min(quest.objective.target, dynamicProgress)
    return {
      ...quest,
      progress,
      target: quest.objective.target,
      completed: progress >= quest.objective.target,
      claimed: Boolean(row?.claimed),
      periodKey,
      expiresAt: questExpiresAt(quest.cadence),
    }
  })

  return { ok: true, quests, summary: buildQuestSummary(quests) }
}

export function claimQuestReward(accountId, questId) {
  const overview = getQuestOverview(accountId)
  if (!overview.ok) return overview
  const quest = overview.quests.find((entry) => entry.id === questId)
  if (!quest) return { ok: false, error: 'Quest is not active.' }
  if (!quest.completed) return { ok: false, error: 'Quest is not complete yet.' }
  if (quest.claimed) return { ok: false, error: 'Quest reward already claimed.' }

  const tx = db.transaction(() => {
    _claimQuest.run(accountId, quest.id, quest.periodKey)
    _grantShards.run(quest.reward.shards, quest.reward.shards, accountId)
  })
  tx()

  const refreshed = getProfile(accountId)
  return {
    ok: true,
    quest: { ...quest, claimed: true },
    reward: quest.reward,
    shards: refreshed.shards,
    totalEarned: refreshed.total_earned,
    overview: getQuestOverview(accountId),
  }
}

export function claimDailyReward(accountId) {
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  const todayKey = new Date().toISOString().slice(0, 10)
  if (profile.last_daily === todayKey) {
    return { ok: false, error: 'Daily reward already claimed today.' }
  }

  _setDailyClaim.run(todayKey, DAILY_SHARDS, DAILY_SHARDS, accountId)
  recordQuestEvent(accountId, 'claim_daily')
  const newBalance = profile.shards + DAILY_SHARDS
  const totalEarned = (profile.total_earned ?? 0) + DAILY_SHARDS
  return { ok: true, amount: DAILY_SHARDS, newBalance, shards: newBalance, totalEarned }
}

export function purchaseTheme(accountId, themeId) {
  const cost = THEME_COSTS[themeId]
  if (cost === undefined) return { ok: false, error: 'Unknown theme.' }

  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  if (profile.owned_themes.includes(themeId)) {
    return { ok: false, error: 'Theme already owned.' }
  }

  if (cost > 0 && profile.shards < cost) {
    return { ok: false, error: 'Not enough Shards.' }
  }

  const tx = db.transaction(() => {
    if (cost > 0) {
      _deductShards.run(cost, accountId, cost)
    }
    const updated = [...profile.owned_themes, themeId]
    _addOwnedTheme.run(JSON.stringify(updated), accountId)
    _updateTheme.run(themeId, accountId)
  })

  tx()
  const refreshed = getProfile(accountId)
  return { ok: true, shards: refreshed.shards, ownedThemes: refreshed.owned_themes }
}

// ─── Card border cosmetic system ─────────────────────────────────────
//
// Borders are pure-cosmetic frames applied to every rendered card in
// the deck builder, vault, and battlefield. Pricing is server-side so
// the catalog cannot be tampered with from the client.

const CARD_BORDER_CATALOG = [
  { id: 'default', name: 'Standard Frame', cost: 0,   description: 'The default arcane bezel every player starts with.' },
  { id: 'bronze',  name: 'Bronze Filigree', cost: 90, description: 'Warm bronze trim with hammered edges.' },
  { id: 'frost',   name: 'Frost Shard',     cost: 180, description: 'Cool ice-shard etching with a soft inner glow.' },
  { id: 'solar',   name: 'Solar Ember',     cost: 280, description: 'Living ember frame with a sunlit inner aura.' },
  { id: 'void',    name: 'Voidweave',       cost: 420, description: 'Animated dark-matter weave with a violet halo.' },
]

export function listCardBorders() {
  return CARD_BORDER_CATALOG.map((entry) => ({ ...entry }))
}

const _setCardBorder = db.prepare(`
  UPDATE player_profiles
  SET selected_card_border = ?, updated_at = datetime('now')
  WHERE account_id = ?
`)
const _setOwnedCardBorders = db.prepare(`
  UPDATE player_profiles
  SET owned_card_borders = ?, updated_at = datetime('now')
  WHERE account_id = ?
`)

export function purchaseCardBorder(accountId, borderId) {
  const entry = CARD_BORDER_CATALOG.find((b) => b.id === borderId)
  if (!entry) return { ok: false, error: 'Unknown card border.' }

  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  if (profile.owned_card_borders.includes(borderId)) {
    return { ok: false, error: 'Card border already owned.' }
  }

  if (entry.cost > 0 && profile.shards < entry.cost) {
    return { ok: false, error: 'Not enough Shards.' }
  }

  const tx = db.transaction(() => {
    if (entry.cost > 0) {
      _deductShards.run(entry.cost, accountId, entry.cost)
    }
    const updated = [...profile.owned_card_borders, borderId]
    _setOwnedCardBorders.run(JSON.stringify(updated), accountId)
    _setCardBorder.run(borderId, accountId)
  })
  tx()

  const refreshed = getProfile(accountId)
  return {
    ok: true,
    shards: refreshed.shards,
    ownedCardBorders: refreshed.owned_card_borders,
    selectedCardBorder: refreshed.selected_card_border,
  }
}

export function selectCardBorder(accountId, borderId) {
  const entry = CARD_BORDER_CATALOG.find((b) => b.id === borderId)
  if (!entry) return { ok: false, error: 'Unknown card border.' }
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }
  if (!profile.owned_card_borders.includes(borderId)) {
    return { ok: false, error: 'Card border not owned.' }
  }
  _setCardBorder.run(borderId, accountId)
  return { ok: true, selectedCardBorder: borderId }
}

// ─── Shard breakdown (excess copies → currency) ─────────────────────
//
// Refund value is the same per-rarity table used to compensate dupes
// from packs, so breaking down a copy yields exactly what opening a
// duplicate of the same rarity would have refunded. Players can never
// reduce a card below the maximum copy count required by any of their
// saved decks (so an active deck never breaks).

const RARITY_BREAKDOWN_VALUE = { common: 5, rare: 10, epic: 25, legendary: 100 }

function deckCopiesIncluding(decks, cardId) {
  let max = 0
  for (const deck of decks) {
    const n = deck.deckConfig?.[cardId] ?? 0
    if (n > max) max = n
  }
  return max
}

export function breakdownCard(accountId, cardId, qty) {
  if (typeof cardId !== 'string' || !DECK_CARD_ID_RE.test(cardId)) {
    return { ok: false, error: 'Invalid card identifier.' }
  }
  const requested = Number(qty)
  if (!Number.isInteger(requested) || requested < 1 || requested > 10) {
    return { ok: false, error: 'Quantity must be an integer between 1 and 10.' }
  }
  const cardMeta = CARD_LIBRARY.find((c) => c.id === cardId)
  if (!cardMeta) return { ok: false, error: 'Unknown card.' }

  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  const owned = profile.owned_cards?.[cardId] ?? 0
  if (owned <= 0) return { ok: false, error: 'You do not own that card.' }

  const decks = listDecks(accountId)
  const deckMin = deckCopiesIncluding(decks, cardId)
  const breakable = owned - deckMin
  if (breakable <= 0) {
    return { ok: false, error: 'All copies of that card are needed by one of your saved decks.' }
  }
  if (requested > breakable) {
    return { ok: false, error: `You can only break down ${breakable} extra copy/copies of that card.` }
  }

  const refundPer = RARITY_BREAKDOWN_VALUE[cardMeta.rarity] ?? 5
  const totalRefund = refundPer * requested

  const updatedOwned = { ...profile.owned_cards }
  const newCount = owned - requested
  if (newCount > 0) {
    updatedOwned[cardId] = newCount
  } else {
    delete updatedOwned[cardId]
  }

  const tx = db.transaction(() => {
    _setOwnedCards.run(JSON.stringify(updatedOwned), accountId)
    _grantShards.run(totalRefund, totalRefund, accountId)
  })
  tx()
  recordQuestEvent(accountId, 'breakdown_cards', { amount: requested })

  const refreshed = getProfile(accountId)
  return {
    ok: true,
    cardId,
    refunded: totalRefund,
    refundPer,
    qty: requested,
    shards: refreshed.shards,
    owned: refreshed.owned_cards,
  }
}

export function resolveMatchResult(accountId, opponent, mode, result, turns, metadata = {}) {
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  let shardsEarned = 0
  let ratingDelta = 0
  let newStreak = profile.streak

  // Only server-authoritative modes (duel) affect season rating
  const ratingEligible = mode === 'duel'

  if (result === 'win') {
    shardsEarned = WIN_SHARDS
    ratingDelta = ratingEligible ? WIN_RATING : 0
    newStreak = profile.streak + 1
    // Streak bonus: extra 5 shards per streak after 2
    if (newStreak > 2) {
      shardsEarned += Math.min(20, (newStreak - 2) * 5)
    }
  } else if (result === 'loss') {
    shardsEarned = LOSS_SHARDS
    ratingDelta = ratingEligible ? -LOSS_RATING : 0
    newStreak = 0
  }

  const matchId = `m-${randomBytes(8).toString('hex')}`

  const tx = db.transaction(() => {
    _grantShards.run(shardsEarned, shardsEarned, accountId)
    _updateRating.run(RATING_FLOOR, ratingDelta, accountId)
    _updateRecord.run(
      result === 'win' ? 1 : 0,
      result === 'loss' ? 1 : 0,
      newStreak,
      accountId,
    )
    _insertMatch.run(matchId, accountId, opponent, mode, result, turns, shardsEarned, ratingDelta)
  })

  tx()
  recordQuestEvent(accountId, 'play_matches')
  if (result === 'win') {
    recordQuestEvent(accountId, 'win_any_match')
    if (mode === 'ai') {
      recordQuestEvent(accountId, 'win_ai')
      recordQuestEvent(accountId, 'win_ai_difficulty', { aiDifficulty: metadata.aiDifficulty ?? 'adept' })
    }
  }
  const refreshed = getProfile(accountId)
  return {
    ok: true,
    matchId,
    shardsEarned,
    ratingDelta,
    streak: refreshed.streak,
    shards: refreshed.shards,
    seasonRating: refreshed.season_rating,
    wins: refreshed.wins,
    losses: refreshed.losses,
  }
}

// ─── Match history ───────────────────────────────────────────────────────────

const _getRecentMatches = db.prepare(`
  SELECT * FROM match_log WHERE account_id = ? ORDER BY played_at DESC LIMIT 20
`)

export function getRecentMatches(accountId) {
  return _getRecentMatches.all(accountId)
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

const _getLeaderboard = db.prepare(`
  SELECT p.account_id, a.display_name, p.season_rating, p.wins, p.losses, p.updated_at
  FROM player_profiles p JOIN accounts a ON a.id = p.account_id
  ORDER BY p.season_rating DESC, p.wins DESC, p.losses ASC, p.updated_at DESC
  LIMIT 25
`)

export function getLeaderboard() {
  return _getLeaderboard.all()
}

// ─── Social (friends + clans) ───────────────────────────────────────────────

const CLAN_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 '\-]{2,31}$/
const CLAN_TAG_RE = /^[A-Z0-9]{2,6}$/

const _getFriends = db.prepare(`
  SELECT sf.friend_account_id as accountId, a.username, a.display_name as displayName, sf.created_at as since
  FROM social_friends sf
  JOIN accounts a ON a.id = sf.friend_account_id
  WHERE sf.account_id = ?
  ORDER BY a.display_name COLLATE NOCASE ASC
`)

const _hasFriendEdge = db.prepare(`
  SELECT 1 as linked FROM social_friends WHERE account_id = ? AND friend_account_id = ? LIMIT 1
`)

export function isFriendOf(accountId, otherAccountId) {
  if (!accountId || !otherAccountId || accountId === otherAccountId) return false
  const row = _hasFriendEdge.get(accountId, otherAccountId)
  return Boolean(row?.linked)
}

const _insertFriendEdge = db.prepare(`
  INSERT OR IGNORE INTO social_friends (account_id, friend_account_id) VALUES (?, ?)
`)

const _deleteFriendEdge = db.prepare(`
  DELETE FROM social_friends WHERE account_id = ? AND friend_account_id = ?
`)

const _getClanMembership = db.prepare(`
  SELECT cm.clan_id as clanId, cm.role, c.name, c.tag, c.invite_code as inviteCode, c.owner_account_id as ownerAccountId, c.created_at as createdAt
  FROM clan_members cm
  JOIN clans c ON c.id = cm.clan_id
  WHERE cm.account_id = ?
`)

const _getClanMembers = db.prepare(`
  SELECT
    cm.account_id as accountId,
    cm.role,
    cm.joined_at as joinedAt,
    a.username,
    a.display_name as displayName
  FROM clan_members cm
  JOIN accounts a ON a.id = cm.account_id
  WHERE cm.clan_id = ?
  ORDER BY
    CASE WHEN cm.role = 'owner' THEN 0 ELSE 1 END,
    a.display_name COLLATE NOCASE ASC
`)

const _createClan = db.prepare(`
  INSERT INTO clans (id, name, tag, invite_code, owner_account_id)
  VALUES (?, ?, ?, ?, ?)
`)

const _addClanMember = db.prepare(`
  INSERT INTO clan_members (clan_id, account_id, role) VALUES (?, ?, ?)
`)

const _removeClanMember = db.prepare(`
  DELETE FROM clan_members WHERE clan_id = ? AND account_id = ?
`)

const _setClanOwner = db.prepare(`
  UPDATE clans SET owner_account_id = ? WHERE id = ?
`)

const _setClanMemberRole = db.prepare(`
  UPDATE clan_members SET role = ? WHERE clan_id = ? AND account_id = ?
`)

const _deleteClan = db.prepare(`
  DELETE FROM clans WHERE id = ?
`)

const _findClanByInvite = db.prepare(`
  SELECT id, name, tag, invite_code as inviteCode, owner_account_id as ownerAccountId, created_at as createdAt
  FROM clans
  WHERE invite_code = ?
`)

const _findFallbackOwner = db.prepare(`
  SELECT account_id as accountId
  FROM clan_members
  WHERE clan_id = ? AND account_id != ?
  ORDER BY joined_at ASC
  LIMIT 1
`)

function normalizeClanTag(rawTag) {
  return String(rawTag ?? '').trim().toUpperCase()
}

function normalizeClanName(rawName) {
  return String(rawName ?? '').trim().replace(/\s+/g, ' ')
}

function normalizeInviteCode(rawInviteCode) {
  return String(rawInviteCode ?? '').trim().toUpperCase()
}

function mapClanPayload(clanInfo, members, yourAccountId) {
  if (!clanInfo) {
    return null
  }

  return {
    id: clanInfo.clanId ?? clanInfo.id,
    name: clanInfo.name,
    tag: clanInfo.tag,
    inviteCode: clanInfo.inviteCode,
    ownerAccountId: clanInfo.ownerAccountId,
    createdAt: clanInfo.createdAt,
    members: members.map((member) => ({
      ...member,
      isYou: member.accountId === yourAccountId,
    })),
  }
}

export function getSocialOverview(accountId) {
  const friends = _getFriends.all(accountId)
  const membership = _getClanMembership.get(accountId)
  const members = membership ? _getClanMembers.all(membership.clanId) : []

  return {
    ok: true,
    friends,
    clan: mapClanPayload(membership, members, accountId),
  }
}

export function addFriend(accountId, username) {
  const normalizedUsername = String(username ?? '').trim().toLowerCase()

  if (!USERNAME_RE.test(normalizedUsername)) {
    return { ok: false, error: 'Enter a valid username (3-20 letters, numbers, or underscore).' }
  }

  const friend = _getByUsername.get(normalizedUsername)
  if (!friend) {
    return { ok: false, error: 'No account found for that username.' }
  }

  if (friend.id === accountId) {
    return { ok: false, error: 'You cannot add yourself as a friend.' }
  }

  if (_hasFriendEdge.get(accountId, friend.id)) {
    return { ok: false, error: 'That player is already on your friends list.' }
  }

  const tx = db.transaction(() => {
    _insertFriendEdge.run(accountId, friend.id)
    _insertFriendEdge.run(friend.id, accountId)
  })
  tx()

  return {
    ok: true,
    friend: {
      accountId: friend.id,
      username: friend.username,
      displayName: friend.display_name,
    },
  }
}

export function removeFriend(accountId, friendAccountId) {
  const normalizedFriendId = String(friendAccountId ?? '').trim()
  if (!/^acct-[a-f0-9]{24}$/.test(normalizedFriendId)) {
    return { ok: false, error: 'Invalid friend id.' }
  }

  const tx = db.transaction(() => {
    _deleteFriendEdge.run(accountId, normalizedFriendId)
    _deleteFriendEdge.run(normalizedFriendId, accountId)
  })
  tx()
  return { ok: true }
}

export function createClan(accountId, name, tag) {
  const normalizedName = normalizeClanName(name)
  const normalizedTag = normalizeClanTag(tag)

  if (!CLAN_NAME_RE.test(normalizedName)) {
    return { ok: false, error: 'Clan name must be 3-32 characters and use letters, numbers, spaces, apostrophes, or hyphens.' }
  }

  if (!CLAN_TAG_RE.test(normalizedTag)) {
    return { ok: false, error: 'Clan tag must be 2-6 uppercase letters or numbers.' }
  }

  if (_getClanMembership.get(accountId)) {
    return { ok: false, error: 'Leave your current clan before creating a new one.' }
  }

  const clanId = `clan-${randomBytes(8).toString('hex')}`
  const inviteCode = `CLN-${randomBytes(4).toString('hex').toUpperCase()}`

  try {
    const tx = db.transaction(() => {
      _createClan.run(clanId, normalizedName, normalizedTag, inviteCode, accountId)
      _addClanMember.run(clanId, accountId, 'owner')
    })
    tx()
  } catch (error) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { ok: false, error: 'That clan name or tag is already in use.' }
    }
    throw error
  }

  return { ok: true, clanId }
}

export function joinClanByInvite(accountId, inviteCode) {
  if (_getClanMembership.get(accountId)) {
    return { ok: false, error: 'Leave your current clan before joining another one.' }
  }

  const normalizedInviteCode = normalizeInviteCode(inviteCode)
  if (!/^CLN-[A-F0-9]{8}$/.test(normalizedInviteCode)) {
    return { ok: false, error: 'Invite code format is invalid.' }
  }

  const clan = _findClanByInvite.get(normalizedInviteCode)
  if (!clan) {
    return { ok: false, error: 'Invite code not found.' }
  }

  _addClanMember.run(clan.id, accountId, 'member')
  return { ok: true, clanId: clan.id }
}

export function leaveClan(accountId) {
  const membership = _getClanMembership.get(accountId)
  if (!membership) {
    return { ok: false, error: 'You are not currently in a clan.' }
  }

  const tx = db.transaction(() => {
    _removeClanMember.run(membership.clanId, accountId)

    if (membership.role !== 'owner') {
      return
    }

    const fallbackOwner = _findFallbackOwner.get(membership.clanId, accountId)
    if (!fallbackOwner) {
      _deleteClan.run(membership.clanId)
      return
    }

    _setClanOwner.run(fallbackOwner.accountId, membership.clanId)
    _setClanMemberRole.run('owner', membership.clanId, fallbackOwner.accountId)
  })

  tx()
  return { ok: true }
}

// ─── Card Pack System ────────────────────────────────────────────────────────

const CARD_POOL = {
  common: CARD_LIBRARY.filter((card) => card.rarity === 'common').map((card) => card.id),
  rare: CARD_LIBRARY.filter((card) => card.rarity === 'rare').map((card) => card.id),
  epic: CARD_LIBRARY.filter((card) => card.rarity === 'epic').map((card) => card.id),
  legendary: CARD_LIBRARY.filter((card) => card.rarity === 'legendary').map((card) => card.id),
}

const ALL_CARDS = CARD_LIBRARY.map((card) => card.id)

const PACK_DEFS = {
  basic:     { cost: 50,  slots: [ { rarity: 'common' }, { rarity: 'common' }, { rarity: 'common' }, { rarity: 'rare' } ] },
  premium:   { cost: 150, slots: [ { rarity: 'common' }, { rarity: 'common' }, { rarity: 'common' }, { rarity: 'rare' }, { rarity: 'epic' } ] },
  legendary: { cost: 400, slots: [ { rarity: 'common' }, { rarity: 'rare' }, { rarity: 'epic' }, { rarity: 'rare' }, { rarity: 'legendary' } ] },
}

const RARITY_WEIGHTS = [
  { rarity: 'legendary', weight: 0.02 },
  { rarity: 'epic',      weight: 0.08 },
  { rarity: 'rare',      weight: 0.20 },
  { rarity: 'common',    weight: 0.70 },
]

function rollRandomRarity() {
  const r = Math.random()
  let acc = 0
  for (const { rarity, weight } of RARITY_WEIGHTS) {
    acc += weight
    if (r < acc) return rarity
  }
  return 'common'
}

function pickCard(rarity) {
  const pool = CARD_POOL[rarity]
  return pool[Math.floor(Math.random() * pool.length)]
}

const _getOwnedCards = db.prepare(`SELECT owned_cards FROM player_profiles WHERE account_id = ?`)

const _setOwnedCards = db.prepare(`
  UPDATE player_profiles SET owned_cards = ?, updated_at = datetime('now') WHERE account_id = ?
`)

export function getCollection(accountId) {
  const row = _getOwnedCards.get(accountId)
  if (!row) return null
  const owned = normalizeOwnedCards(row.owned_cards)
  if (!row.owned_cards || row.owned_cards === '{}' || row.owned_cards === 'null') {
    _setOwnedCards.run(JSON.stringify(owned), accountId)
  }
  return owned
}

export function openPack(accountId, packType) {
  const packDef = PACK_DEFS[packType]
  if (!packDef) return { ok: false, error: 'Unknown pack type.' }

  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }
  if (profile.shards < packDef.cost) return { ok: false, error: 'Not enough Shards.' }

  // Roll cards
  const cards = packDef.slots.map((slot) => {
    // Each guaranteed slot also has a chance to upgrade
    const baseRarity = slot.rarity
    const rolled = rollRandomRarity()
    const rarityOrder = ['common', 'rare', 'epic', 'legendary']
    const effectiveRarity = rarityOrder.indexOf(rolled) > rarityOrder.indexOf(baseRarity)
      ? rolled : baseRarity
    return { id: pickCard(effectiveRarity), rarity: effectiveRarity }
  })

  const ownedRow = _getOwnedCards.get(accountId)
  const owned = ownedRow ? normalizeOwnedCards(ownedRow.owned_cards) : buildStarterCollection()

  // Duplicate protection: if card already max copies (common/rare/epic: 2, legendary: 1), grant shard refund
  let refund = 0
  const RARITY_REFUND = { common: 5, rare: 10, epic: 25, legendary: 100 }
  const MAX_COPIES = { common: GAME_MAX_COPIES, rare: GAME_MAX_COPIES, epic: GAME_MAX_COPIES, legendary: MAX_LEGENDARY_COPIES }

  for (const card of cards) {
    const current = owned[card.id] ?? 0
    const max = MAX_COPIES[card.rarity] ?? 2
    if (current >= max) {
      refund += RARITY_REFUND[card.rarity] ?? 5
      card.duplicate = true
    } else {
      owned[card.id] = current + 1
    }
  }

  const netCost = packDef.cost - refund

  const tx = db.transaction(() => {
    _deductShards.run(packDef.cost, accountId, packDef.cost)
    if (refund > 0) _grantShards.run(refund, 0, accountId)
    _setOwnedCards.run(JSON.stringify(owned), accountId)
  })
  tx()
  recordQuestEvent(accountId, 'open_packs')

  const refreshed = getProfile(accountId)
  return {
    ok: true,
    cards,
    refund,
    netCost,
    shards: refreshed.shards,
  }
}

export { PACK_DEFS, ALL_CARDS }

// ─── Admin role management ──────────────────────────────────────────────────
// Role is the source of truth for privileged access. Sessions are NOT
// role-stamped; every privileged request re-reads the role so demotion takes
// effect on the next request.

const ROLE_VALUES = new Set(['user', 'admin', 'owner'])
const ROLE_RANK = { user: 0, admin: 1, owner: 2 }

const _getRole = db.prepare(`SELECT role FROM accounts WHERE id = ?`)
const _setRole = db.prepare(`UPDATE accounts SET role = ? WHERE id = ?`)
const _findOwnerId = db.prepare(`SELECT id FROM accounts WHERE role = 'owner' LIMIT 1`)
const _searchAccounts = db.prepare(`
  SELECT id, username, display_name as displayName, role, created_at as createdAt, last_login as lastLogin
  FROM accounts
  WHERE (? = '' OR username LIKE ? OR display_name LIKE ? OR id = ?)
  ORDER BY
    CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    last_login DESC NULLS LAST,
    username COLLATE NOCASE ASC
  LIMIT ? OFFSET ?
`)

const _insertAudit = db.prepare(`
  INSERT INTO admin_audit (id, actor_account_id, target_account_id, action, metadata, ip_hash)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const _listAudit = db.prepare(`
  SELECT
    a.id,
    a.actor_account_id   as actorAccountId,
    actor.username       as actorUsername,
    actor.display_name   as actorDisplayName,
    a.target_account_id  as targetAccountId,
    target.username      as targetUsername,
    target.display_name  as targetDisplayName,
    a.action,
    a.metadata,
    a.created_at         as createdAt
  FROM admin_audit a
  LEFT JOIN accounts actor  ON actor.id  = a.actor_account_id
  LEFT JOIN accounts target ON target.id = a.target_account_id
  ORDER BY a.created_at DESC
  LIMIT ?
`)

export function getAccountRole(accountId) {
  if (!accountId) return 'user'
  const row = _getRole.get(accountId)
  return row?.role && ROLE_VALUES.has(row.role) ? row.role : 'user'
}

export function hasRoleAtLeast(role, minRole) {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minRole] ?? 0)
}

export function findOwnerAccountId() {
  const row = _findOwnerId.get()
  return row?.id ?? null
}

/**
 * Promote or demote another account. Owner-only. Cannot create or overwrite
 * the owner role — use transferOwnership for that.
 *
 * @param {string} actorAccountId  The account performing the action (must be owner).
 * @param {string} targetAccountId The account whose role is changing.
 * @param {'admin'|'user'} newRole The desired role.
 * @param {{ ipHash?: string | null }} [options]
 */
export function setAccountRole(actorAccountId, targetAccountId, newRole, { ipHash = null } = {}) {
  if (!actorAccountId || !targetAccountId) {
    return { ok: false, status: 400, error: 'Actor and target are required.' }
  }
  if (actorAccountId === targetAccountId) {
    return { ok: false, status: 400, error: 'You cannot change your own role.' }
  }
  if (newRole !== 'admin' && newRole !== 'user') {
    return { ok: false, status: 400, error: 'Role must be "admin" or "user".' }
  }
  const actorRole = getAccountRole(actorAccountId)
  if (actorRole !== 'owner') {
    return { ok: false, status: 403, error: 'Only the owner can change roles.' }
  }
  const targetRow = _getById.get(targetAccountId)
  if (!targetRow) {
    return { ok: false, status: 404, error: 'Target account not found.' }
  }
  if (targetRow.role === 'owner') {
    return { ok: false, status: 403, error: 'The owner role cannot be changed here. Use ownership transfer.' }
  }
  if (targetRow.role === newRole) {
    return { ok: true, role: newRole, unchanged: true, target: sanitizeAdminAccount(targetRow) }
  }

  const previousRole = targetRow.role
  const metadata = JSON.stringify({ previousRole, newRole })
  const auditId = `aud-${randomBytes(10).toString('hex')}`

  const tx = db.transaction(() => {
    _setRole.run(newRole, targetAccountId)
    _insertAudit.run(auditId, actorAccountId, targetAccountId, 'role_change', metadata, ipHash)
  })
  tx()

  return {
    ok: true,
    role: newRole,
    previousRole,
    auditId,
    target: sanitizeAdminAccount({ ...targetRow, role: newRole }),
  }
}

/**
 * Transfer ownership from the current owner to another account.
 * Demotes the current owner to 'admin' and promotes the target to 'owner'
 * atomically. The caller must verify the owner's password before calling.
 *
 * @param {string} currentOwnerId
 * @param {string} targetAccountId
 * @param {{ ipHash?: string | null }} [options]
 */
export function transferOwnership(currentOwnerId, targetAccountId, { ipHash = null } = {}) {
  if (!currentOwnerId || !targetAccountId) {
    return { ok: false, status: 400, error: 'Current owner and target are required.' }
  }
  if (currentOwnerId === targetAccountId) {
    return { ok: false, status: 400, error: 'Target must be a different account.' }
  }
  if (getAccountRole(currentOwnerId) !== 'owner') {
    return { ok: false, status: 403, error: 'Only the current owner can transfer ownership.' }
  }
  const target = _getById.get(targetAccountId)
  if (!target) {
    return { ok: false, status: 404, error: 'Target account not found.' }
  }

  const metadata = JSON.stringify({ previousOwnerId: currentOwnerId, newOwnerId: targetAccountId })
  const auditId = `aud-${randomBytes(10).toString('hex')}`

  // SQLite can't do a swap in a single UPDATE because of the unique partial
  // index; demote first, then promote, inside a transaction.
  const tx = db.transaction(() => {
    _setRole.run('admin', currentOwnerId)
    _setRole.run('owner', targetAccountId)
    _insertAudit.run(auditId, currentOwnerId, targetAccountId, 'ownership_transfer', metadata, ipHash)
  })
  tx()

  return { ok: true, auditId, previousOwnerId: currentOwnerId, newOwnerId: targetAccountId }
}

/**
 * Bootstrap or recover the owner role. Used by the setup flow on first launch
 * and by the ADMIN_KEY-gated recovery endpoint. Refuses to run if an owner
 * already exists (use transferOwnership for that path).
 *
 * @param {string} targetAccountId
 * @param {{ ipHash?: string | null, actorAccountId?: string | null, reason?: string }} [options]
 */
export function assignInitialOwner(targetAccountId, { ipHash = null, actorAccountId = null, reason = 'bootstrap' } = {}) {
  if (!targetAccountId) {
    return { ok: false, status: 400, error: 'Target is required.' }
  }
  const target = _getById.get(targetAccountId)
  if (!target) {
    return { ok: false, status: 404, error: 'Target account not found.' }
  }
  const existingOwner = findOwnerAccountId()
  if (existingOwner && existingOwner !== targetAccountId) {
    return { ok: false, status: 409, error: 'An owner already exists. Use ownership transfer instead.' }
  }

  const auditId = `aud-${randomBytes(10).toString('hex')}`
  const metadata = JSON.stringify({ reason })

  const tx = db.transaction(() => {
    _setRole.run('owner', targetAccountId)
    _insertAudit.run(auditId, actorAccountId, targetAccountId, 'owner_assigned', metadata, ipHash)
  })
  tx()

  return { ok: true, auditId }
}

function sanitizeAdminAccount(row) {
  if (!row) return null
  return {
    accountId: row.id ?? row.accountId,
    username: row.username,
    displayName: row.display_name ?? row.displayName,
    role: row.role,
    createdAt: row.created_at ?? row.createdAt,
    lastLogin: row.last_login ?? row.lastLogin,
  }
}

export function listAccounts({ search = '', limit = 25, offset = 0 } = {}) {
  const normalized = String(search ?? '').trim().toLowerCase().slice(0, 60)
  const like = normalized ? `%${normalized}%` : ''
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25))
  const safeOffset = Math.max(0, Number(offset) || 0)
  const rows = _searchAccounts.all(normalized, like, like, normalized, safeLimit, safeOffset)
  return rows.map((row) => ({
    accountId: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt,
    lastLogin: row.lastLogin,
  }))
}

/**
 * @param {string|null} actorAccountId
 * @param {string|null} targetAccountId
 * @param {string} action
 * @param {Record<string, unknown>} [metadata]
 * @param {string|null} [ipHash]
 */
export function recordAudit(actorAccountId, targetAccountId, action, metadata = {}, ipHash = null) {
  const safeAction = String(action ?? '').slice(0, 60) || 'unknown'
  const safeMeta = JSON.stringify(metadata ?? {}).slice(0, 2000)
  const id = `aud-${randomBytes(10).toString('hex')}`
  _insertAudit.run(id, actorAccountId ?? null, targetAccountId ?? null, safeAction, safeMeta, ipHash ?? null)
  return id
}

export function listAudit({ limit = 50 } = {}) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50))
  const rows = _listAudit.all(safeLimit)
  return rows.map((row) => {
    let metadata = {}
    try { metadata = JSON.parse(row.metadata) } catch { /* ignore */ }
    return {
      id: row.id,
      action: row.action,
      actor: row.actorAccountId
        ? { accountId: row.actorAccountId, username: row.actorUsername, displayName: row.actorDisplayName }
        : null,
      target: row.targetAccountId
        ? { accountId: row.targetAccountId, username: row.targetUsername, displayName: row.targetDisplayName }
        : null,
      metadata,
      createdAt: row.createdAt,
    }
  })
}

// Helper for the server.js setup endpoint: returns a narrow subset of account
// columns, used by the password-confirmation flow for ownership transfer.
// We intentionally avoid `SELECT *` to ensure the password hash is only
// surfaced through this named accessor.
const _getAccountFull = db.prepare(
  `SELECT id, username, display_name, password_hash, role FROM accounts WHERE id = ?`,
)
export function getAccountById(accountId) {
  if (!accountId) return null
  return _getAccountFull.get(accountId) ?? null
}

// ─── Card trading (v1: friends-only) ────────────────────────────────────────
// Trades are asymmetric: one side offers cards, the other offers cards in
// return. On accept, both owned_cards blobs are mutated atomically in a
// single transaction so there is no "half-traded" state.

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id                 TEXT PRIMARY KEY,
    from_account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    status             TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected','cancelled','expired')),
    offer              TEXT NOT NULL DEFAULT '[]',
    request            TEXT NOT NULL DEFAULT '[]',
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at         TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_trades_from ON trades(from_account_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_trades_to   ON trades(to_account_id, status, created_at DESC);
`)

const TRADE_TTL_DAYS = 7
const MAX_TRADE_ITEMS_PER_SIDE = 6

const _insertTrade = db.prepare(`
  INSERT INTO trades (id, from_account_id, to_account_id, status, offer, request, expires_at)
  VALUES (?, ?, ?, 'pending', ?, ?, datetime('now', ?))
`)
const _getTradeById = db.prepare(`SELECT * FROM trades WHERE id = ?`)
const _updateTradeStatus = db.prepare(
  `UPDATE trades SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'`,
)
const _listTradesForAccount = db.prepare(`
  SELECT * FROM trades
  WHERE (from_account_id = ? OR to_account_id = ?)
    AND (status = 'pending' OR updated_at > datetime('now', '-3 days'))
  ORDER BY created_at DESC
  LIMIT 50
`)
const _expireStaleTrades = db.prepare(
  `UPDATE trades SET status = 'expired', updated_at = datetime('now')
   WHERE status = 'pending' AND expires_at < datetime('now')`,
)

function normalizeTradeItems(raw) {
  if (!Array.isArray(raw)) return null
  const normalized = []
  const seen = new Set()
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const cardId = String(item.cardId ?? '').trim()
    const qty = Math.floor(Number(item.qty ?? 0))
    if (!cardId || qty <= 0 || qty > 3) return null
    if (seen.has(cardId)) return null // no duplicate entries; roll into one
    seen.add(cardId)
    normalized.push({ cardId, qty })
  }
  if (normalized.length === 0) return null
  if (normalized.length > MAX_TRADE_ITEMS_PER_SIDE) return null
  return normalized
}

function ownsAll(owned, items) {
  for (const { cardId, qty } of items) {
    if ((owned[cardId] ?? 0) < qty) return false
  }
  return true
}

export function proposeTrade(fromAccountId, toAccountId, offer, request) {
  if (!fromAccountId || !toAccountId) {
    return { ok: false, status: 400, error: 'Missing account.' }
  }
  if (fromAccountId === toAccountId) {
    return { ok: false, status: 400, error: 'You cannot trade with yourself.' }
  }
  if (!isFriendOf(fromAccountId, toAccountId)) {
    return { ok: false, status: 403, error: 'You can only trade with friends.' }
  }

  const normalizedOffer = normalizeTradeItems(offer)
  const normalizedRequest = normalizeTradeItems(request)
  if (!normalizedOffer || !normalizedRequest) {
    return { ok: false, status: 400, error: 'Each side must list 1–6 distinct cards with quantities between 1 and 3.' }
  }

  const fromOwned = _getOwnedCards.get(fromAccountId)
  if (!fromOwned) return { ok: false, status: 404, error: 'Proposer profile not found.' }
  const fromCollection = normalizeOwnedCards(fromOwned.owned_cards)
  if (!ownsAll(fromCollection, normalizedOffer)) {
    return { ok: false, status: 400, error: 'You do not own all of the offered cards.' }
  }

  // Cap: one pending trade per (from,to) pair.
  const existing = db.prepare(
    `SELECT id FROM trades WHERE from_account_id = ? AND to_account_id = ? AND status = 'pending' LIMIT 1`,
  ).get(fromAccountId, toAccountId)
  if (existing) {
    return { ok: false, status: 409, error: 'You already have a pending trade with that friend.' }
  }

  const id = `trade-${randomBytes(8).toString('hex')}`
  _insertTrade.run(
    id,
    fromAccountId,
    toAccountId,
    JSON.stringify(normalizedOffer),
    JSON.stringify(normalizedRequest),
    `+${TRADE_TTL_DAYS} days`,
  )
  return { ok: true, tradeId: id, offer: normalizedOffer, request: normalizedRequest }
}

function hydrateTradeRow(row) {
  if (!row) return null
  let offer = []
  let request = []
  try { offer = JSON.parse(row.offer) } catch { /* ignore */ }
  try { request = JSON.parse(row.request) } catch { /* ignore */ }
  return {
    id: row.id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    status: row.status,
    offer,
    request,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  }
}

export function listTradesForAccount(accountId) {
  if (!accountId) return []
  _expireStaleTrades.run() // sweep expired trades before listing
  return _listTradesForAccount.all(accountId, accountId).map(hydrateTradeRow)
}

export function getTradeById(id) {
  const row = _getTradeById.get(id)
  return hydrateTradeRow(row)
}

function applyCardDelta(owned, items, sign) {
  const next = { ...owned }
  for (const { cardId, qty } of items) {
    const current = next[cardId] ?? 0
    const updated = current + sign * qty
    if (updated < 0) return null
    if (updated === 0) delete next[cardId]
    else next[cardId] = updated
  }
  return next
}

export function acceptTrade(accepterAccountId, tradeId) {
  if (!accepterAccountId || !tradeId) {
    return { ok: false, status: 400, error: 'Missing arguments.' }
  }

  const result = db.transaction(() => {
    // Re-read the trade under the transaction to avoid races between two
    // concurrent accept calls.
    const row = _getTradeById.get(tradeId)
    if (!row) return { ok: false, status: 404, error: 'Trade not found.' }
    if (row.status !== 'pending') return { ok: false, status: 409, error: 'Trade is no longer pending.' }
    if (row.to_account_id !== accepterAccountId) {
      return { ok: false, status: 403, error: 'Only the recipient can accept this trade.' }
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      _updateTradeStatus.run('expired', row.id)
      return { ok: false, status: 410, error: 'Trade has expired.' }
    }

    const trade = hydrateTradeRow(row)

    // Friends-only check is re-verified at accept time — if the friendship
    // was broken since the proposal, the trade must fail.
    if (!isFriendOf(trade.fromAccountId, trade.toAccountId)) {
      _updateTradeStatus.run('cancelled', row.id)
      return { ok: false, status: 403, error: 'The players are no longer friends.' }
    }

    const fromRow = _getOwnedCards.get(trade.fromAccountId)
    const toRow = _getOwnedCards.get(accepterAccountId)
    if (!fromRow || !toRow) {
      return { ok: false, status: 404, error: 'One of the profiles no longer exists.' }
    }

    const fromCards = normalizeOwnedCards(fromRow.owned_cards)
    const toCards = normalizeOwnedCards(toRow.owned_cards)

    if (!ownsAll(fromCards, trade.offer)) {
      _updateTradeStatus.run('cancelled', row.id)
      return { ok: false, status: 409, error: 'Proposer no longer owns the offered cards.' }
    }
    if (!ownsAll(toCards, trade.request)) {
      return { ok: false, status: 400, error: 'You do not own all of the requested cards.' }
    }

    // Transfer: proposer loses offer, gains request; accepter gains offer, loses request.
    const fromAfter = applyCardDelta(applyCardDelta(fromCards, trade.offer, -1) ?? {}, trade.request, +1)
    const toAfter = applyCardDelta(applyCardDelta(toCards, trade.request, -1) ?? {}, trade.offer, +1)
    if (!fromAfter || !toAfter) {
      return { ok: false, status: 409, error: 'Card count underflow. Trade aborted.' }
    }

    // Enforce max-copy limits (e.g. legendary cap) on the receiving side.
    const RARITY_MAX = { common: GAME_MAX_COPIES, rare: GAME_MAX_COPIES, epic: GAME_MAX_COPIES, legendary: MAX_LEGENDARY_COPIES }
    const cardById = (id) => CARD_LIBRARY.find((c) => c.id === id)
    for (const [cardId, qty] of Object.entries(fromAfter)) {
      const card = cardById(cardId)
      const max = RARITY_MAX[card?.rarity] ?? GAME_MAX_COPIES
      if (qty > max) return { ok: false, status: 409, error: `Trade would exceed card-copy limit for ${cardId}.` }
    }
    for (const [cardId, qty] of Object.entries(toAfter)) {
      const card = cardById(cardId)
      const max = RARITY_MAX[card?.rarity] ?? GAME_MAX_COPIES
      if (qty > max) return { ok: false, status: 409, error: `Trade would exceed card-copy limit for ${cardId}.` }
    }

    _setOwnedCards.run(JSON.stringify(fromAfter), trade.fromAccountId)
    _setOwnedCards.run(JSON.stringify(toAfter), accepterAccountId)
    const updated = _updateTradeStatus.run('accepted', row.id)
    if (updated.changes === 0) {
      // Another transaction already moved this trade out of 'pending'.
      // Throw to roll back the better-sqlite3 transaction (which runs BEGIN/
      // COMMIT around the callback); we catch the sentinel error below and
      // convert it into a structured {ok:false} result for the caller.
      throw new Error('concurrent_trade_update')
    }
    return { ok: true, tradeId: row.id }
  })

  try {
    return result()
  } catch (err) {
    if (err?.message === 'concurrent_trade_update') {
      return { ok: false, status: 409, error: 'Trade was updated concurrently. Please refresh.' }
    }
    throw err
  }
}

export function cancelTrade(accountId, tradeId, reason = 'cancelled') {
  if (!accountId || !tradeId) return { ok: false, status: 400, error: 'Missing arguments.' }
  const row = _getTradeById.get(tradeId)
  if (!row) return { ok: false, status: 404, error: 'Trade not found.' }
  if (row.status !== 'pending') return { ok: false, status: 409, error: 'Trade is no longer pending.' }
  if (reason === 'cancelled' && row.from_account_id !== accountId) {
    return { ok: false, status: 403, error: 'Only the proposer can cancel.' }
  }
  if (reason === 'rejected' && row.to_account_id !== accountId) {
    return { ok: false, status: 403, error: 'Only the recipient can reject.' }
  }
  _updateTradeStatus.run(reason, tradeId)
  return { ok: true, tradeId, status: reason }
}

export default db
