/**
 * Friends, clans, and card trading.
 *
 * Trading is friends-gated, so it reads the social graph directly.
 */
import { randomBytes } from 'node:crypto'
import { CARD_LIBRARY, MAX_COPIES as GAME_MAX_COPIES, MAX_LEGENDARY_COPIES } from '../game.js'
import { USERNAME_RE, _getByUsername } from './accounts.js'
import { applySchema, db, openDatabase, prepare, transaction } from './connection.js'
import { _getOwnedCards, _setOwnedCards } from './economy.js'
import { normalizeOwnedCards } from './profiles.js'

// ─── Social (friends + clans) ───────────────────────────────────────────────

const CLAN_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 '\-]{2,31}$/
const CLAN_TAG_RE = /^[A-Z0-9]{2,6}$/

const _getFriends = prepare(`
  SELECT linked.friend_account_id as accountId, a.username, a.display_name as displayName, MIN(linked.created_at) as since
  FROM (
    SELECT friend_account_id, created_at
    FROM social_friends
    WHERE account_id = ?
    UNION ALL
    SELECT account_id as friend_account_id, created_at
    FROM social_friends
    WHERE friend_account_id = ?
  ) linked
  JOIN accounts a ON a.id = linked.friend_account_id
  WHERE a.account_status = 'active' AND a.deleted_at IS NULL
  GROUP BY linked.friend_account_id, a.username, a.display_name
  ORDER BY a.display_name COLLATE NOCASE ASC
`)

const _hasFriendEdge = prepare(`
  SELECT 1 as linked FROM social_friends WHERE account_id = ? AND friend_account_id = ? LIMIT 1
`)

const _hasAnyFriendEdge = prepare(`
  SELECT 1 as linked
  FROM social_friends
  WHERE (account_id = ? AND friend_account_id = ?) OR (account_id = ? AND friend_account_id = ?)
  LIMIT 1
`)

export function isFriendOf(accountId, otherAccountId) {
  if (!accountId || !otherAccountId || accountId === otherAccountId) return false
  const row = _hasAnyFriendEdge.get(accountId, otherAccountId, otherAccountId, accountId)
  return Boolean(row?.linked)
}

const _insertFriendEdge = prepare(`
  INSERT OR IGNORE INTO social_friends (account_id, friend_account_id) VALUES (?, ?)
`)

const _deleteFriendEdge = prepare(`
  DELETE FROM social_friends WHERE account_id = ? AND friend_account_id = ?
`)

const _getClanMembership = prepare(`
  SELECT cm.clan_id as clanId, cm.role, c.name, c.tag, c.invite_code as inviteCode, c.owner_account_id as ownerAccountId, c.created_at as createdAt
  FROM clan_members cm
  JOIN clans c ON c.id = cm.clan_id
  WHERE cm.account_id = ?
`)

const _getClanMembers = prepare(`
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

const _createClan = prepare(`
  INSERT INTO clans (id, name, tag, invite_code, owner_account_id)
  VALUES (?, ?, ?, ?, ?)
`)

const _addClanMember = prepare(`
  INSERT INTO clan_members (clan_id, account_id, role) VALUES (?, ?, ?)
`)

const _removeClanMember = prepare(`
  DELETE FROM clan_members WHERE clan_id = ? AND account_id = ?
`)

const _setClanOwner = prepare(`
  UPDATE clans SET owner_account_id = ? WHERE id = ?
`)

const _setClanMemberRole = prepare(`
  UPDATE clan_members SET role = ? WHERE clan_id = ? AND account_id = ?
`)

const _deleteClan = prepare(`
  DELETE FROM clans WHERE id = ?
`)

const _findClanByInvite = prepare(`
  SELECT id, name, tag, invite_code as inviteCode, owner_account_id as ownerAccountId, created_at as createdAt
  FROM clans
  WHERE invite_code = ?
`)

const _findFallbackOwner = prepare(`
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

function friendSummary(account) {
  return {
    accountId: account.id,
    username: account.username,
    displayName: account.display_name,
  }
}

function ensureFriendshipEdges(accountId, friendAccountId) {
  const tx = db.transaction(() => {
    _insertFriendEdge.run(accountId, friendAccountId)
    _insertFriendEdge.run(friendAccountId, accountId)
  })
  tx()
}

export function getSocialOverview(accountId) {
  const linkedFriends = _getFriends.all(accountId, accountId)
  for (const friend of linkedFriends) {
    ensureFriendshipEdges(accountId, friend.accountId)
  }
  const friends = _getFriends.all(accountId, accountId)
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

  const alreadyLinked = Boolean(_hasAnyFriendEdge.get(accountId, friend.id, friend.id, accountId))
  if (alreadyLinked) {
    ensureFriendshipEdges(accountId, friend.id)
    return { ok: true, alreadyFriend: true, friend: friendSummary(friend) }
  }

  ensureFriendshipEdges(accountId, friend.id)

  return {
    ok: true,
    alreadyFriend: false,
    friend: friendSummary(friend),
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

// ─── Card trading (v1: friends-only) ────────────────────────────────────────
// Trades are asymmetric: one side offers cards, the other offers cards in
// return. On accept, both owned_cards blobs are mutated atomically in a
// single transaction so there is no "half-traded" state.

// The `trades` table is created in applySchema() with the rest of the
// schema, so a reopen recreates it alongside everything else.

const TRADE_TTL_DAYS = 7
const MAX_TRADE_ITEMS_PER_SIDE = 6

const _insertTrade = prepare(`
  INSERT INTO trades (id, from_account_id, to_account_id, status, offer, request, expires_at)
  VALUES (?, ?, ?, 'pending', ?, ?, datetime('now', ?))
`)
const _getTradeById = prepare(`SELECT * FROM trades WHERE id = ?`)
const _updateTradeStatus = prepare(
  `UPDATE trades SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'`,
)
const _listTradesForAccount = prepare(`
  SELECT * FROM trades
  WHERE (from_account_id = ? OR to_account_id = ?)
    AND (status = 'pending' OR updated_at > datetime('now', '-3 days'))
  ORDER BY created_at DESC
  LIMIT 50
`)
const _expireStaleTrades = prepare(
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

// Open once at import time. This is what makes importing this module enough
// to have a migrated database, which server.js and passkey-service.js rely on.
openDatabase()

// `export { db as default }`, not `export default db`.
//
// `export default <identifier>` exports the *value* the identifier held at
// evaluation time, so it would stay pinned to the first connection and go stale
// the moment `openDatabase()` replaced it. The `as default` form creates a live
// binding, so consumers of the default export follow a reopen.
export { db as default }

