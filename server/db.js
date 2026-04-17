import Database from 'better-sqlite3'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../data')

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

const db = new Database(path.join(DATA_DIR, 'fractured-arcanum.db'), { fileMustExist: false })
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

  CREATE TABLE IF NOT EXISTS rate_limits (
    key        TEXT PRIMARY KEY,
    count      INTEGER NOT NULL DEFAULT 1,
    window_start TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_match_log_account ON match_log(account_id);
  CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
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

const _insertAccount = db.prepare(`
  INSERT INTO accounts (id, username, password_hash, display_name, device_fp)
  VALUES (?, ?, ?, ?, ?)
`)

const _insertProfile = db.prepare(`
  INSERT INTO player_profiles (account_id, deck_config)
  VALUES (?, ?)
`)

const _getByUsername = db.prepare(`SELECT * FROM accounts WHERE username = ?`)
const _getById = db.prepare(`SELECT * FROM accounts WHERE id = ?`)

const _countByFp = db.prepare(`
  SELECT COUNT(*) as cnt FROM accounts WHERE device_fp = ? AND device_fp IS NOT NULL
`)

export function createAccount(username, password, displayName, deviceFp) {
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
  if (fpHash) {
    const fpCount = _countByFp.get(fpHash)
    if (fpCount && fpCount.cnt >= 3) {
      return { ok: false, error: 'Account limit reached for this device. Contact support if you need help.' }
    }
  }

  const id = `acct-${randomBytes(12).toString('hex')}`
  const hash = hashPassword(password)

  try {
    const tx = db.transaction(() => {
      _insertAccount.run(id, username.toLowerCase(), hash, displayName || username, fpHash)
      _insertProfile.run(id, '{}')
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

  if (result === 'win') {
    runesEarned = WIN_RUNES
    ratingDelta = WIN_RATING
    newStreak = profile.streak + 1
    // Streak bonus: extra 5 runes per streak after 2
    if (newStreak > 2) {
      runesEarned += Math.min(20, (newStreak - 2) * 5)
    }
  } else if (result === 'loss') {
    runesEarned = LOSS_RUNES
    ratingDelta = -LOSS_RATING
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
  SELECT p.account_id, a.display_name, p.season_rating, p.wins, p.losses
  FROM player_profiles p JOIN accounts a ON a.id = p.account_id
  ORDER BY p.season_rating DESC LIMIT 25
`)

export function getLeaderboard() {
  return _getLeaderboard.all()
}

// ─── Card Pack System ────────────────────────────────────────────────────────

const CARD_POOL = {
  common: [
    'flame-imp','stone-wall','elven-archer','dark-cultist','mana-wisp','shadow-fiend',
    'frost-archer','iron-guard','war-grunt','nature-sprite','fire-drake','crystal-shard',
    'swamp-lurker','battle-dog','wind-sprite','ember-mage','stone-golem','sea-serpent',
    'poison-dart','flame-dancer','iron-sentry','plague-rat','wild-boar','dust-devil',
    'moss-troll','thorn-bush','spark-elemental','clay-soldier',
  ],
  rare: [
    'fire-imp','silver-knight','golden-dragon','spirit-healer','rune-weaver',
    'blood-mage','thunder-wolf','bone-knight','sand-wurm','moon-druid',
    'lava-hound','ghost-knight','jungle-panther','coral-golem','obsidian-knight',
    'shadow-assassin','glacial-colossus','arcane-golem','storm-shaman','bone-collector',
    'ancient-hydra','druid-elder',
  ],
  epic: [
    'inferno-dragon','abyssal-tyrant','iron-clad','phoenix-ascendant',
    'crimson-witch','thunder-titan','deep-kraken','war-chief','crystal-oracle',
    'necro-sage','celestial-archer','void-stalker','arcane-artificer','tempest-eagle',
  ],
  legendary: [
    'velara','malachar','kronos','aethon','drakarion','zephyr',
  ],
}

const ALL_CARDS = [
  ...CARD_POOL.common, ...CARD_POOL.rare, ...CARD_POOL.epic, ...CARD_POOL.legendary,
]

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

// Add owned_cards column if it doesn't exist
try { db.exec(`ALTER TABLE player_profiles ADD COLUMN owned_cards TEXT NOT NULL DEFAULT '{}'`) } catch { /* column exists */ }

const _getOwnedCards = db.prepare(`SELECT owned_cards FROM player_profiles WHERE account_id = ?`)

const _setOwnedCards = db.prepare(`
  UPDATE player_profiles SET owned_cards = ?, updated_at = datetime('now') WHERE account_id = ?
`)

export function getCollection(accountId) {
  const row = _getOwnedCards.get(accountId)
  if (!row) return null
  return JSON.parse(row.owned_cards)
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
  const owned = ownedRow ? JSON.parse(ownedRow.owned_cards) : {}

  // Duplicate protection: if card already max copies (common/rare/epic: 2, legendary: 1), grant rune refund
  let refund = 0
  const RARITY_REFUND = { common: 5, rare: 10, epic: 25, legendary: 100 }
  const MAX_COPIES = { common: 2, rare: 2, epic: 2, legendary: 1 }

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

export default db
