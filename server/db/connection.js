/**
 * Connection, schema, and migrations.
 *
 * Owns the SQLite handle every other db module shares. `openDatabase()` is
 * re-runnable: it re-reads DATA_DIR, reopens, and re-applies the schema, and the
 * lazy `prepare()` / `transaction()` helpers rebind to the new connection.
 *
 * Safe to run against a live production database. Every CREATE is guarded by
 * IF NOT EXISTS, columns are added only when PRAGMA table_info says they are
 * missing, and the backfill UPDATEs can only fill a blank. That is asserted
 * against a copy of the real database in db-migration-safety.test.js.
 */
import Database from 'better-sqlite3'
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CARD_LIBRARY, DEFAULT_DECK_CONFIG, MAX_COPIES as GAME_MAX_COPIES, MAX_LEGENDARY_COPIES } from '../game.js'
import {
  QUEST_DEFINITIONS,
  QUEST_TIERS,
  difficultyMeets,
  getQuestDefinition,
  renderQuestDescription,
} from '../quest-definitions.js'
import {
  QUEST_CHAINS,
  chainTier,
  chainTierLabel,
  getQuestChain,
  isChainExhausted,
  legacyChainMigrations,
} from '../quest-chains.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * The live connection. Reassigned by `openDatabase()`, never by anything else.
 *
 * Declared with `let` so ESM live bindings propagate a reopen to every importer.
 */
export let db

/**
 * Where the database lives when DATA_DIR is unset — the repo-root `data/`.
 *
 * Exported so `db-migration-safety.test.js` can assert it, because getting it
 * wrong does not fail loudly: the server starts happily against an empty
 * database and every account simply appears to be gone.
 */
export function defaultDataDir() {
  return path.resolve(__dirname, '../../data')
}

/** Resolved fresh on each open so DATA_DIR can change between opens. */
function resolveDbPath() {
  // `../../data`, not `../data`. This file lives at server/db/, one level
  // deeper than the single-file db.js it was split out of, so the old relative
  // path silently pointed at server/data — a brand-new empty database. Any
  // deploy that does not set DATA_DIR would have come up with every account
  // missing. `defaultDataDir()` is exported so a test can pin this.
  const dataDir = path.resolve(process.env.DATA_DIR ?? defaultDataDir())
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  return path.join(dataDir, 'fractured-arcanum.db')
}

/**
 * Lazily prepared statement, rebound automatically when the connection changes.
 *
 * The 134 module-scope statements in this file used to be prepared at import
 * time against whichever connection existed then. That made the connection
 * effectively permanent: reopening the database left every statement pointing
 * at a closed handle, which is why the test suite could only get a fresh
 * database by busting the ESM module cache with `import('./db.js?tag')`.
 *
 * Preparing on first use — and re-preparing whenever `db` is a different
 * object — makes `openDatabase()` genuinely re-runnable. better-sqlite3 caches
 * nothing across connections, so the re-prepare is required, not merely tidy.
 *
 * Only `.run`, `.get` and `.all` are forwarded because those are the only
 * methods this file uses on a prepared statement.
 */
export function prepare(sql) {
  let cached = null
  let cachedFor = null
  const statement = () => {
    if (cachedFor !== db) {
      cached = db.prepare(sql)
      cachedFor = db
    }
    return cached
  }
  return {
    run: (...args) => statement().run(...args),
    get: (...args) => statement().get(...args),
    all: (...args) => statement().all(...args),
  }
}

/**
 * Deferred transaction, for the same reason as `prepare()`.
 *
 * `db.transaction()` binds to a connection at call time, so it cannot be built
 * at import time either.
 */
export function transaction(fn) {
  let cached = null
  let cachedFor = null
  return (...args) => {
    if (cachedFor !== db) {
      cached = db.transaction(fn)
      cachedFor = db
    }
    return cached(...args)
  }
}

/**
 * Open (or reopen) the database and bring its schema up to date.
 *
 * Safe to call against an existing production database: every CREATE is
 * guarded by IF NOT EXISTS, columns are added only when PRAGMA table_info says
 * they are missing, and the backfill UPDATEs are written so they can only fill
 * a blank. `server/db-migration-safety.test.js` asserts all of that against a
 * copy of the real database.
 */
export function openDatabase() {
  const dbPath = resolveDbPath()
  if (db) {
    try { db.close() } catch { /* already closed */ }
  }
  try {
    db = new Database(dbPath, { fileMustExist: false })
  } catch (error) {
    console.error(`Failed to open SQLite database at ${dbPath}. Ensure the data directory exists and is writable.`)
    throw error
  }
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  applySchema()
  return db
}

export const CURRENT_ACCOUNT_STANDARD_VERSION = 1
export const CURRENT_TERMS_VERSION = 'terms-2026-05-17'
export const CURRENT_PRIVACY_VERSION = 'privacy-2026-05-17'
export const CURRENT_AGE_GATE_VERSION = 'age-2026-05-17'
export const LEGACY_MIGRATION_WINDOW_DAYS = 30
export const RECOVERY_CODE_COUNT = 10
export const PASSKEY_DEVICE_LINK_TTL_MS = 10 * 60 * 1000

// A passkey signup reserves its username before the WebAuthn ceremony runs, so
// an abandoned ceremony would otherwise squat that username forever. Rows stay
// claimable for this long, after which `reapAbandonedSignups` releases them.
export const PENDING_SIGNUP_TTL_MS = 30 * 60 * 1000

// Deleting real player accounts on a timer is destructive and, from the
// player's side, irreversible: `account_status = 'deleted'` closes every login,
// recovery, and upgrade path while the username stays claimed. It runs only
// when an operator opts in explicitly, and never implicitly at import time.
export const LEGACY_MIGRATION_EXPIRY_ENABLED = process.env.LEGACY_MIGRATION_EXPIRY === '1'

export function getCurrentLegalVersions() {
  return {
    accountStandardVersion: CURRENT_ACCOUNT_STANDARD_VERSION,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    ageGateVersion: CURRENT_AGE_GATE_VERSION,
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * Create or migrate every table, index and column, then run the backfills.
 *
 * Called by `openDatabase()`, so it runs on import and again on any reopen.
 * Every statement is written to be safe to re-run against a database that is
 * already up to date — see the header on `openDatabase()`.
 */
export function applySchema() {

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

    -- Rotating (daily/weekly) quests live in fixed slots rather than being
    -- re-derived from a hash of the current period. Storing the assignment is
    -- what makes carryover, reroll, and "never assign a duplicate of an active
    -- quest" possible — none of which a stateless derivation can express.
    -- Permanent cadences (milestone/skirmish) stay in player_quests.
    CREATE TABLE IF NOT EXISTS player_quest_slots (
      account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      cadence      TEXT NOT NULL,
      slot_index   INTEGER NOT NULL,
      quest_id      TEXT NOT NULL,
      target        INTEGER NOT NULL,
      reward_shards INTEGER NOT NULL DEFAULT 0,
      progress     INTEGER NOT NULL DEFAULT 0,
      claimed      INTEGER NOT NULL DEFAULT 0,
      rerolled     INTEGER NOT NULL DEFAULT 0,
      assigned_key TEXT NOT NULL,
      assigned_at  TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at   TEXT NOT NULL,
      completed_at TEXT,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (account_id, cadence, slot_index)
    );

    -- Permanent progression. Progress is a lifetime total and is never reset;
    -- claimed_tier is how far up the ladder the player has collected, so a
    -- returning player with a large total simply has several tiers waiting.
    CREATE TABLE IF NOT EXISTS player_quest_chains (
      account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      chain_id     TEXT NOT NULL,
      progress     INTEGER NOT NULL DEFAULT 0,
      claimed_tier INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (account_id, chain_id)
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
    CREATE INDEX IF NOT EXISTS idx_player_quest_slots_account ON player_quest_slots(account_id);
    CREATE INDEX IF NOT EXISTS idx_player_quest_chains_account ON player_quest_chains(account_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_player_decks_active
      ON player_decks(account_id) WHERE is_active = 1;

    CREATE TABLE IF NOT EXISTS authoritative_matches (
      match_id      TEXT PRIMARY KEY,
      mode          TEXT NOT NULL,
      reason        TEXT NOT NULL,
      turns         INTEGER NOT NULL DEFAULT 0,
      metadata      TEXT NOT NULL DEFAULT '{}',
      settled_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS authoritative_match_participants (
      match_id            TEXT NOT NULL REFERENCES authoritative_matches(match_id) ON DELETE CASCADE,
      account_id          TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      opponent_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      opponent_name       TEXT NOT NULL DEFAULT '',
      result              TEXT NOT NULL,
      shards_earned       INTEGER NOT NULL DEFAULT 0,
      rating_delta        INTEGER NOT NULL DEFAULT 0,
      streak_after        INTEGER NOT NULL DEFAULT 0,
      balance_after       INTEGER NOT NULL DEFAULT 0,
      rating_after        INTEGER NOT NULL DEFAULT 0,
      wins_after          INTEGER NOT NULL DEFAULT 0,
      losses_after        INTEGER NOT NULL DEFAULT 0,
      match_log_id        TEXT NOT NULL,
      acknowledged_at     TEXT,
      PRIMARY KEY (match_id, account_id)
    );

    CREATE TABLE IF NOT EXISTS economy_ledger (
      id              TEXT PRIMARY KEY,
      account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL UNIQUE,
      source          TEXT NOT NULL,
      amount          INTEGER NOT NULL,
      balance_after   INTEGER NOT NULL,
      match_id        TEXT REFERENCES authoritative_matches(match_id) ON DELETE SET NULL,
      metadata        TEXT NOT NULL DEFAULT '{}',
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_authoritative_match_participants_account
      ON authoritative_match_participants(account_id, match_id);
    CREATE INDEX IF NOT EXISTS idx_economy_ledger_account_created
      ON economy_ledger(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_economy_ledger_match
      ON economy_ledger(match_id);
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
    // Day key of the last free reroll spent, per cadence.
    ['quest_reroll_daily_key', "TEXT NOT NULL DEFAULT ''"],
    ['quest_reroll_weekly_key', "TEXT NOT NULL DEFAULT ''"],
  ])

  // Slot rows predate variant targets, which introduced a per-assignment payout.
  ensureColumns('player_quest_slots', [
    ['reward_shards', 'INTEGER NOT NULL DEFAULT 0'],
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

    CREATE TABLE IF NOT EXISTS passkey_device_links (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      secret_hash TEXT NOT NULL,
      created_by_session TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
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

    CREATE TABLE IF NOT EXISTS account_recovery_grants (
      id                   TEXT PRIMARY KEY,
      account_id           TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      token_hash           TEXT NOT NULL UNIQUE,
      token_prefix         TEXT NOT NULL,
      channel              TEXT NOT NULL DEFAULT 'manual',
      purpose              TEXT NOT NULL DEFAULT 'account_recovery',
      issued_by_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      delivery_hint        TEXT NOT NULL DEFAULT '',
      note                 TEXT NOT NULL DEFAULT '',
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at           TEXT NOT NULL,
      consumed_at          TEXT,
      revoked_at           TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_recovery_grants_account
      ON account_recovery_grants(account_id, consumed_at, revoked_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_recovery_grants_prefix
      ON account_recovery_grants(token_prefix);

    CREATE INDEX IF NOT EXISTS idx_account_authenticators_account ON account_authenticators(account_id);
    CREATE INDEX IF NOT EXISTS idx_auth_challenges_account ON auth_challenges(account_id, purpose, expires_at);
    CREATE INDEX IF NOT EXISTS idx_passkey_device_links_account ON passkey_device_links(account_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_passkey_device_links_secret ON passkey_device_links(id, secret_hash, status, expires_at);
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


  // Card trading. Declared here rather than beside the trading helpers so
  // every CREATE lives in one re-runnable place.
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
}

