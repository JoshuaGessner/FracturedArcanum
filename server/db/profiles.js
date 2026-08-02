/**
 * Player profiles and multi-deck CRUD.
 *
 * Deck CRUD reads the active profile on nearly every call, so the two stay
 * together.
 */
import { randomBytes } from 'node:crypto'
import { CARD_LIBRARY, DEFAULT_DECK_CONFIG, MAX_LEGENDARY_COPIES } from '../game.js'
import { db, prepare, transaction } from './connection.js'

// ─── Player profile operations ───────────────────────────────────────────────

// `display_name` lives on `accounts`, not here, so a bare `SELECT *` returns a
// row with no name on it at all. Callers still reach for `profile.display_name`
// — every one of them did — so the join supplies it rather than leaving four
// call sites to invent four different fallbacks for an always-undefined field.
// The COALESCE is character-for-character the one the session queries use in
// accounts.js, so a player's name resolves identically whether it arrives via a
// session handshake or a profile read.
export const _getProfile = prepare(`
  SELECT p.*, COALESCE(NULLIF(TRIM(a.display_name), ''), a.username) AS display_name
  FROM player_profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.account_id = ?
`)

export function buildStarterCollection() {
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

export function normalizeOwnedCards(rawValue) {
  const parsed = rawValue ? JSON.parse(rawValue) : {}
  if (parsed && Object.keys(parsed).length > 0) {
    return parsed
  }
  return buildStarterCollection()
}

const _updateDeck = prepare(`
  UPDATE player_profiles SET deck_config = ?, updated_at = datetime('now') WHERE account_id = ?
`)

export const _updateTheme = prepare(`
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
export const DECK_CARD_ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/

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

const _listDecks = prepare(`
  SELECT id, name, deck_config, is_active, created_at, updated_at
  FROM player_decks WHERE account_id = ?
  ORDER BY is_active DESC, created_at ASC
`)
const _getDeckById = prepare(`
  SELECT id, account_id, name, deck_config, is_active, created_at, updated_at
  FROM player_decks WHERE id = ? AND account_id = ?
`)
const _countDecks = prepare(`SELECT COUNT(*) as cnt FROM player_decks WHERE account_id = ?`)
const _insertDeck = prepare(`
  INSERT INTO player_decks (id, account_id, name, deck_config, is_active)
  VALUES (?, ?, ?, ?, ?)
`)
const _updateDeckRow = prepare(`
  UPDATE player_decks SET name = ?, deck_config = ?, updated_at = datetime('now')
  WHERE id = ? AND account_id = ?
`)
const _renameDeckRow = prepare(`
  UPDATE player_decks SET name = ?, updated_at = datetime('now') WHERE id = ? AND account_id = ?
`)
const _deleteDeckRow = prepare(`DELETE FROM player_decks WHERE id = ? AND account_id = ?`)
const _deactivateDecks = prepare(`UPDATE player_decks SET is_active = 0 WHERE account_id = ?`)
const _activateDeckRow = prepare(`
  UPDATE player_decks SET is_active = 1, updated_at = datetime('now') WHERE id = ? AND account_id = ?
`)
const _getActiveDeckRow = prepare(`
  SELECT id, name, deck_config, created_at, updated_at FROM player_decks
  WHERE account_id = ? AND is_active = 1 LIMIT 1
`)

const MATCH_DECK_CARD_IDS = new Set(CARD_LIBRARY.map((card) => card.id))

function parseDeckSnapshot(rawValue) {
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return rawValue
  }
  try {
    return JSON.parse(rawValue ?? '{}')
  } catch {
    return null
  }
}

/**
 * Build a matchmaking-safe deck snapshot without repairing or mutating profile
 * state. A supplied candidate is allowed for backwards compatibility, but it
 * is validated against the authenticated account's current ownership.
 */
export function validateDeckForMatch(accountId, candidateDeck) {
  const profileRow = _getProfile.get(accountId)
  if (!profileRow) return { ok: false, error: 'Profile not found.' }

  const activeDeck = _getActiveDeckRow.get(accountId)
  const source = candidateDeck !== undefined ? 'candidate' : activeDeck ? 'active' : 'profile'
  const rawDeck = candidateDeck !== undefined
    ? candidateDeck
    : parseDeckSnapshot(activeDeck?.deck_config ?? profileRow.deck_config)
  const validation = validateDeckConfig(rawDeck)
  if (!validation.ok) return validation
  const unknownCardId = Object.keys(rawDeck).find((cardId) => !MATCH_DECK_CARD_IDS.has(cardId))
  if (unknownCardId) {
    return { ok: false, error: `Unknown card in deck: ${unknownCardId}.` }
  }
  if (!validation.ready) {
    return { ok: false, error: `Deck must contain at least ${DECK_MIN_TOTAL} cards to enter a match.` }
  }

  let ownedCards
  try {
    ownedCards = normalizeOwnedCards(profileRow.owned_cards)
  } catch {
    return { ok: false, error: 'Owned card data is invalid.' }
  }

  for (const [cardId, count] of Object.entries(validation.deckConfig)) {
    const card = CARD_LIBRARY.find((entry) => entry.id === cardId)
    if (!card) return { ok: false, error: `Unknown card in deck: ${cardId}.` }
    if (card.rarity === 'legendary' && count > MAX_LEGENDARY_COPIES) {
      return { ok: false, error: `Legendary cards are limited to ${MAX_LEGENDARY_COPIES} copy per deck.` }
    }
    const owned = ownedCards[cardId] ?? 0
    if (count > owned) {
      return { ok: false, error: `You only own ${owned} copy/copies of ${card.name}. Open packs to unlock more.` }
    }
  }

  return {
    ok: true,
    deckConfig: { ...validation.deckConfig },
    total: validation.total,
    ready: true,
    source,
    activeDeckId: activeDeck?.id ?? null,
    activeDeckName: activeDeck?.name ?? null,
  }
}

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

