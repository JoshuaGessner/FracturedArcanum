import Database from 'better-sqlite3'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CARD_LIBRARY, DEFAULT_DECK_CONFIG, MAX_COPIES as GAME_MAX_COPIES, MAX_LEGENDARY_COPIES } from './game.js'

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
    runes          INTEGER NOT NULL DEFAULT 120,
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
    runes_earned INTEGER NOT NULL DEFAULT 0,
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

  CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_match_log_account ON match_log(account_id);
  CREATE INDEX IF NOT EXISTS idx_social_friends_friend ON social_friends(friend_account_id);
  CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id);
  CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
  CREATE INDEX IF NOT EXISTS idx_accounts_device_fp ON accounts(device_fp);
  CREATE INDEX IF NOT EXISTS idx_accounts_created_ip ON accounts(created_ip_hash);
  CREATE INDEX IF NOT EXISTS idx_accounts_created_ip_ua_created_at ON accounts(created_ip_hash, created_ua_hash, created_at);
`)

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
  if (columns.some((column) => column.name === columnName)) {
    return
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

ensureColumn('accounts', 'created_ip_hash', 'TEXT')
ensureColumn('accounts', 'created_ua_hash', 'TEXT')
ensureColumn('accounts', 'role', "TEXT NOT NULL DEFAULT 'user'")
ensureColumn('player_profiles', 'owned_cards', "TEXT NOT NULL DEFAULT '{}' ")

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

function buildAccountFlags({ deviceCount, ipCount, ipDayCount, ipAgentWeekCount }) {
  const flags = []

  if (deviceCount > 0) flags.push('shared-device')
  if (ipCount > 0) flags.push('shared-ip')
  if (ipDayCount > 0 || ipAgentWeekCount > 0) flags.push('signup-cluster')

  return flags.join(',')
}

export function createAccount(username, password, displayName, deviceFp, ip, userAgent) {
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: 'Username must be 3-20 characters: letters, numbers, underscore only.' }
  }

  if (!DISPLAY_RE.test(displayName || username)) {
    return { ok: false, error: 'Display name must be 1-24 characters.' }
  }

  if (!password || password.length < PASSWORD_MIN) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` }
  }

  const existing = _getByUsername.get(username)
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

  if (fpHash) {
    if (deviceCount >= MAX_ACCOUNTS_PER_DEVICE) {
      return {
        ok: false,
        status: 403,
        error: 'This device has reached the account creation limit. Use an existing account or contact support if you need help.',
      }
    }
  }

  if (ipHash && ipDayCount >= MAX_ACCOUNTS_PER_IP_PER_DAY) {
    return {
      ok: false,
      status: 429,
      error: 'This network has created too many accounts recently. Please wait and try again later.',
    }
  }

  if (ipHash && ipCount >= MAX_ACCOUNTS_PER_IP) {
    return {
      ok: false,
      status: 403,
      error: 'This network has reached the account creation limit. Use an existing account or contact support if you need help.',
    }
  }

  if (ipHash && userAgentHash && ipAgentWeekCount >= MAX_ACCOUNTS_PER_IP_AND_AGENT_PER_WEEK) {
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
        username.toLowerCase(),
        hash,
        displayName || username,
        fpHash,
        ipHash,
        userAgentHash,
        flags,
      )
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
  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, error: 'Invalid username or password.' }
  }
  return { ok: true, accountId: row.id, displayName: row.display_name }
}

// ─── Session management ─────────────────────────────────────────────────────

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const _insertSession = db.prepare(`
  INSERT INTO sessions (token, account_id, expires_at, ip_hash) VALUES (?, ?, ?, ?)
`)

const _getSession = db.prepare(`
  SELECT s.*, a.username, a.display_name FROM sessions s
  JOIN accounts a ON a.id = s.account_id
  WHERE s.token = ? AND s.expires_at > datetime('now')
`)

const _deleteSession = db.prepare(`DELETE FROM sessions WHERE token = ?`)

const _cleanExpiredSessions = db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`)

const _updateLastLogin = db.prepare(`UPDATE accounts SET last_login = datetime('now') WHERE id = ?`)

export function hashIp(ip) {
  if (!ip) return null
  return createHash('sha256').update(`rc-ip:${ip}`).digest('hex').slice(0, 24)
}

export function createSession(accountId, ip) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  _insertSession.run(token, accountId, expiresAt, hashIp(ip))
  _updateLastLogin.run(accountId)
  return { token, expiresAt }
}

export function validateSession(token) {
  if (!token || typeof token !== 'string') return null
  const row = _getSession.get(token)
  return row ?? null
}

export function destroySession(token) {
  _deleteSession.run(token)
}

export function cleanupSessions() {
  _cleanExpiredSessions.run()
}

// Run cleanup periodically
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
  return {
    ...row,
    owned_themes: JSON.parse(row.owned_themes),
    deck_config: JSON.parse(row.deck_config),
    owned_cards: normalizeOwnedCards(row.owned_cards),
  }
}

const DECK_MIN_TOTAL = 10
const DECK_MAX_TOTAL = 16
const DECK_MAX_COPIES = 3
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

export function saveDeck(accountId, deckConfig) {
  const result = validateDeckConfig(deckConfig)
  if (!result.ok) return result

  const profile = getProfile(accountId)
  if (!profile) {
    return { ok: false, error: 'Profile not found.' }
  }

  for (const [cardId, count] of Object.entries(result.deckConfig)) {
    const owned = profile.owned_cards?.[cardId] ?? 0
    if (count > owned) {
      const cardName = CARD_LIBRARY.find((card) => card.id === cardId)?.name ?? cardId
      return { ok: false, error: `You only own ${owned} copy/copies of ${cardName}. Open packs to unlock more.` }
    }
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
const WIN_RUNES = 30
const LOSS_RUNES = 10
const DAILY_RUNES = 50
const WIN_RATING = 25
const LOSS_RATING = 15
const RATING_FLOOR = 1000

const _grantRunes = db.prepare(`
  UPDATE player_profiles
  SET runes = runes + ?, total_earned = total_earned + MAX(0, ?), updated_at = datetime('now')
  WHERE account_id = ?
`)

const _deductRunes = db.prepare(`
  UPDATE player_profiles
  SET runes = runes - ?, updated_at = datetime('now')
  WHERE account_id = ? AND runes >= ?
`)

const _addOwnedTheme = db.prepare(`
  UPDATE player_profiles
  SET owned_themes = ?, updated_at = datetime('now')
  WHERE account_id = ?
`)

const _setDailyClaim = db.prepare(`
  UPDATE player_profiles
  SET last_daily = ?, runes = runes + ?, total_earned = total_earned + ?, updated_at = datetime('now')
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
  INSERT INTO match_log (id, account_id, opponent, mode, result, turns, runes_earned, rating_delta)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

export function claimDailyReward(accountId) {
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  const todayKey = new Date().toISOString().slice(0, 10)
  if (profile.last_daily === todayKey) {
    return { ok: false, error: 'Daily reward already claimed today.' }
  }

  _setDailyClaim.run(todayKey, DAILY_RUNES, DAILY_RUNES, accountId)
  return { ok: true, amount: DAILY_RUNES, newBalance: profile.runes + DAILY_RUNES }
}

export function purchaseTheme(accountId, themeId) {
  const cost = THEME_COSTS[themeId]
  if (cost === undefined) return { ok: false, error: 'Unknown theme.' }

  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  if (profile.owned_themes.includes(themeId)) {
    return { ok: false, error: 'Theme already owned.' }
  }

  if (cost > 0 && profile.runes < cost) {
    return { ok: false, error: 'Not enough Runestones.' }
  }

  const tx = db.transaction(() => {
    if (cost > 0) {
      _deductRunes.run(cost, accountId, cost)
    }
    const updated = [...profile.owned_themes, themeId]
    _addOwnedTheme.run(JSON.stringify(updated), accountId)
    _updateTheme.run(themeId, accountId)
  })

  tx()
  const refreshed = getProfile(accountId)
  return { ok: true, runes: refreshed.runes, ownedThemes: refreshed.owned_themes }
}

export function resolveMatchResult(accountId, opponent, mode, result, turns) {
  const profile = getProfile(accountId)
  if (!profile) return { ok: false, error: 'Profile not found.' }

  let runesEarned = 0
  let ratingDelta = 0
  let newStreak = profile.streak

  // Only server-authoritative modes (duel) affect season rating
  const ratingEligible = mode === 'duel'

  if (result === 'win') {
    runesEarned = WIN_RUNES
    ratingDelta = ratingEligible ? WIN_RATING : 0
    newStreak = profile.streak + 1
    // Streak bonus: extra 5 runes per streak after 2
    if (newStreak > 2) {
      runesEarned += Math.min(20, (newStreak - 2) * 5)
    }
  } else if (result === 'loss') {
    runesEarned = LOSS_RUNES
    ratingDelta = ratingEligible ? -LOSS_RATING : 0
    newStreak = 0
  }

  const matchId = `m-${randomBytes(8).toString('hex')}`

  const tx = db.transaction(() => {
    _grantRunes.run(runesEarned, runesEarned, accountId)
    _updateRating.run(RATING_FLOOR, ratingDelta, accountId)
    _updateRecord.run(
      result === 'win' ? 1 : 0,
      result === 'loss' ? 1 : 0,
      newStreak,
      accountId,
    )
    _insertMatch.run(matchId, accountId, opponent, mode, result, turns, runesEarned, ratingDelta)
  })

  tx()
  const refreshed = getProfile(accountId)
  return {
    ok: true,
    matchId,
    runesEarned,
    ratingDelta,
    streak: refreshed.streak,
    runes: refreshed.runes,
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
  if (profile.runes < packDef.cost) return { ok: false, error: 'Not enough Runestones.' }

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

  // Duplicate protection: if card already max copies (common/rare/epic: 2, legendary: 1), grant rune refund
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
    _deductRunes.run(packDef.cost, accountId, packDef.cost)
    if (refund > 0) _grantRunes.run(refund, 0, accountId)
    _setOwnedCards.run(JSON.stringify(owned), accountId)
  })
  tx()

  const refreshed = getProfile(accountId)
  return {
    ok: true,
    cards,
    refund,
    netCost,
    runes: refreshed.runes,
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

// Helper for the server.js setup endpoint: returns the account row by id,
// used to look up password_hash for password-confirmation flows.
const _getAccountFull = db.prepare(`SELECT * FROM accounts WHERE id = ?`)
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
      // Another transaction accepted/cancelled first. Roll back implicitly by throwing.
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
