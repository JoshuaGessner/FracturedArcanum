import compression from 'compression'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import {
  createAccount,
  authenticateAccount,
  createSession,
  validateSession,
  destroySession,
  revokeAllSessions,
  markSessionPasskeyReauthenticated,
  sessionHasRecentPasskeyReauth,
  hashIp,
  hashFingerprint,
  checkRateLimit,
  getProfile,
  saveDeck,
  validateDeckConfig,
  listDecks,
  createDeck,
  updateDeck,
  renameDeck,
  deleteDeck,
  selectActiveDeck,
  selectTheme,
  claimDailyReward,
  claimQuestReward,
  claimQuestRewards,
  getQuestOverview,
  rerollQuest,
  purchaseTheme,
  settleAuthoritativeMatch,
  getMatchSettlementForAccount,
  getLatestUnacknowledgedSettlement,
  acknowledgeMatchSettlement,
  validateDeckForMatch,
  getRecentMatches,
  getLeaderboard,
  getCollection,
  openPack,
  PACK_DEFS,
  breakdownCard,
  listCardBorders,
  purchaseCardBorder,
  selectCardBorder,
  getSocialOverview,
  addFriend,
  removeFriend,
  createClan,
  joinClanByInvite,
  leaveClan,
  isFriendOf,
  proposeTrade,
  listTradesForAccount,
  getTradeById,
  acceptTrade,
  cancelTrade,
  getAccountRole,
  hasRoleAtLeast,
  findOwnerAccountId,
  setAccountRole,
  transferOwnership,
  assignInitialOwner,
  listAccounts,
  listDeletedAccounts,
  getAdminAccountDetail,
  adminResetAccountCredentials,
  adminIssueRecoveryGrant,
  adminSuspendAccount,
  adminUnsuspendAccount,
  adminDeleteAccount,
  adminRestoreAccount,
  listAudit,
  recordAudit,
  getAccountById,
  getCurrentLegalVersions,
  getAccountReadiness,
  completeAccountUpgrade,
  createPasskeyDeviceLink,
  generateAccountRecoveryCodes,
  acknowledgeAccountRecoveryCodes,
  listAccountRecoveryStatus,
  expireLegacyMigrationAccounts,
  reapAbandonedSignups,
  markAccountPendingPasskeySignup,
  listAccountSessions,
  listAccountPasskeys,
  deleteAccountPasskey,
  exportAccountData,
  deleteAccount,
  resolveDataDir,
} from './db.js'
import {
  createPasskeyLoginOptions,
  createPasskeyDeviceLinkRegistrationOptions,
  createPasskeyReauthOptions,
  createPasskeyRecoveryOptions,
  createPasskeyGrantRecoveryOptions,
  verifyPasskeyGrantRecovery,
  createPasskeyRegistrationOptions,
  verifyPasskeyDeviceLinkRegistration,
  verifyPasskeyLogin,
  verifyPasskeyReauth,
  verifyPasskeyRecovery,
  verifyPasskeyRegistration,
} from './passkey-service.js'
import {
  createRoom,
  getRoom,
  getRoomBySocket,
  getRoomByAccount,
  handleDisconnect,
  destroyRoom,
  rooms,
  RECONNECT_GRACE_MS,
} from './game-room.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '../dist')
// Shared with the database rather than computed again here. The old local
// `path.resolve(__dirname, '../data')` ignored DATA_DIR, so a custom data
// directory moved the database but left the admin store and server config
// behind — splitting server state across two directories.
const DATA_DIR = resolveDataDir()
const ADMIN_STORE_PATH = path.join(DATA_DIR, 'arena-admin-store.json')
const SERVER_CONFIG_PATH = path.join(DATA_DIR, 'server-config.json')
const CLIENT_ORIGINS = process.env.CLIENT_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean) ?? []
const VIEWPORT_QA = process.env.VIEWPORT_QA === '1'
const LOCAL_AUTH_QA_BYPASS = process.env.LOCAL_AUTH_QA_BYPASS === '1'

const DEFAULT_PORT = 43173
const PORT = Number(process.env.PORT ?? DEFAULT_PORT)
const MATCH_IDLE_TIMEOUT_MS = 15 * 60 * 1000

function isLocalRequest(request) {
  const ip = request.ip ?? request.socket?.remoteAddress ?? ''
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost'
}

function skipViewportQaRateLimit(request) {
  return VIEWPORT_QA && isLocalRequest(request)
}

function allowLocalSignupClusterBypass(request) {
  return isLocalRequest(request) && (VIEWPORT_QA || LOCAL_AUTH_QA_BYPASS)
}

// ─── Server config: auto-generate admin key on first launch ──────────────

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function loadServerConfig() {
  ensureDataDir()
  try {
    if (existsSync(SERVER_CONFIG_PATH)) {
      return JSON.parse(readFileSync(SERVER_CONFIG_PATH, 'utf8'))
    }
  } catch { /* corrupt file, regenerate */ }
  return null
}

function saveServerConfig(config) {
  ensureDataDir()
  writeFileSync(SERVER_CONFIG_PATH, JSON.stringify(config, null, 2))
}

const serverConfig = loadServerConfig()
let setupComplete = Boolean(serverConfig?.setupComplete)

// Priority: env var > persisted config > auto-generate on first launch.
// NOTE: the admin key is now a break-glass recovery mechanism only. Regular
// admin and owner access uses session-bound roles; the key only grants access
// to /api/admin/owner/recover.
let ADMIN_KEY = (process.env.ADMIN_KEY ?? '').trim()
if (!ADMIN_KEY && serverConfig?.adminKey) {
  ADMIN_KEY = serverConfig.adminKey
} else if (!ADMIN_KEY) {
  ADMIN_KEY = randomBytes(32).toString('hex')
  saveServerConfig({ adminKey: ADMIN_KEY, setupComplete: false, createdAt: new Date().toISOString() })
  console.log('─────────────────────────────────────────────────────')
  console.log('First launch detected. Recovery key auto-generated.')
  console.log('Visit the app to complete server setup.')
  console.log('─────────────────────────────────────────────────────')
}

// ─── Migration: ensure the bootstrap account is marked as owner ─────────────
// Older installs stored only serverConfig.adminAccountId and relied on the
// shared ADMIN_KEY. Migrate those accounts to role='owner' so they can sign in
// to the new admin console without the key.
try {
  const existingOwner = findOwnerAccountId()
  if (!existingOwner && serverConfig?.adminAccountId) {
    const result = assignInitialOwner(serverConfig.adminAccountId, { reason: 'migration' })
    if (result.ok) {
      console.log('Migration: promoted configured admin account to owner role.')
    } else {
      console.warn(`Migration: could not promote configured admin account (${result.error}).`)
    }
  } else if (!existingOwner && setupComplete) {
    console.warn(
      'WARNING: setup was marked complete but no owner account exists. Use the /api/admin/owner/recover endpoint with ADMIN_KEY to restore access.',
    )
  }
} catch (err) {
  console.warn('Owner migration check failed:', err?.message ?? err)
}

const isProduction = process.env.NODE_ENV === 'production'
const corsOrigin = CLIENT_ORIGINS.length ? CLIENT_ORIGINS : (isProduction ? false : true)

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', isProduction ? 1 : false)

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
  },
  pingTimeout: 20000,
  pingInterval: 25000,
})

// ─── Socket.IO authentication middleware ──────────────────────────────────

io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token || typeof token !== 'string') {
    return next(new Error('Authentication required.'))
  }
  const session = validateSession(token)
  if (!session) {
    return next(new Error('Session expired. Please log in again.'))
  }
  const readiness = getAccountReadiness(session.account_id)
  if (readiness.setupRequired) {
    return next(new Error('Complete account setup before connecting to live services.'))
  }
  socket.data.accountId = session.account_id
  socket.data.username = session.username
  socket.data.displayName = session.display_name
  next()
})

let waitingPlayers = []

// ─── Presence tracking ──────────────────────────────────────────────────────
// accountId → Set<socketId>. Used for friend online indicators and to deliver
// direct challenge events. A single account may have multiple concurrent
// sockets (e.g. tabs, mobile + web); they share presence.

/** @type {Map<string, Set<string>>} */
const presence = new Map()

function trackPresence(accountId, socketId) {
  if (!accountId) return
  let set = presence.get(accountId)
  if (!set) {
    set = new Set()
    presence.set(accountId, set)
  }
  set.add(socketId)
}

function untrackPresence(accountId, socketId) {
  if (!accountId) return
  const set = presence.get(accountId)
  if (!set) return
  set.delete(socketId)
  if (set.size === 0) presence.delete(accountId)
}

function isOnline(accountId) {
  return presence.has(accountId)
}

function emitToAccount(accountId, event, payload) {
  const sockets = presence.get(accountId)
  if (!sockets) return 0
  let sent = 0
  for (const socketId of sockets) {
    const s = io.sockets.sockets.get(socketId)
    if (s) {
      s.emit(event, payload)
      sent += 1
    }
  }
  return sent
}

/**
 * Force every live socket for an account to disconnect. Revoking sessions in
 * the DB only stops the next HTTP request — an already-open socket keeps
 * working — so suspension and credential resets must also cut the socket.
 */
function disconnectAccountSockets(accountId, reason) {
  const sockets = presence.get(accountId)
  if (!sockets) return 0
  let closed = 0
  for (const socketId of [...sockets]) {
    const socket = io.sockets.sockets.get(socketId)
    if (!socket) continue
    socket.emit('server:session_revoked', { reason })
    socket.disconnect(true)
    closed += 1
  }
  return closed
}

// ─── Friend challenges (unranked duels) ─────────────────────────────────────
// In-memory state machine: pending → accepted → active → completed/declined/
// expired. Challenges live for 60s; an interval reaper cleans stale ones.

const CHALLENGE_TTL_MS = 60 * 1000

/**
 * @typedef {Object} Challenge
 * @property {string} id
 * @property {string} fromAccountId
 * @property {string} toAccountId
 * @property {string} fromName
 * @property {string} toName
 * @property {Record<string, number>} fromDeck
 * @property {number} createdAt
 * @property {'pending'|'accepted'|'declined'|'expired'|'cancelled'} status
 */

/** @type {Map<string, Challenge>} */
const pendingChallenges = new Map()

function findChallengeForAccount(accountId, direction) {
  for (const c of pendingChallenges.values()) {
    if (c.status !== 'pending') continue
    if (direction === 'from' && c.fromAccountId === accountId) return c
    if (direction === 'to' && c.toAccountId === accountId) return c
  }
  return null
}

function reapChallenges() {
  const now = Date.now()
  for (const [id, c] of pendingChallenges) {
    if (c.status !== 'pending') {
      // Drop terminal entries after 2× TTL so we don't leak memory.
      if (now - c.createdAt > CHALLENGE_TTL_MS * 2) pendingChallenges.delete(id)
      continue
    }
    if (now - c.createdAt > CHALLENGE_TTL_MS) {
      c.status = 'expired'
      emitToAccount(c.fromAccountId, 'challenge:expired', { challengeId: c.id, reason: 'timeout' })
      emitToAccount(c.toAccountId, 'challenge:expired', { challengeId: c.id, reason: 'timeout' })
    }
  }
}
setInterval(reapChallenges, 10 * 1000).unref?.()

// Legacy expiry deletes real player accounts and stays off unless an operator
// sets LEGACY_MIGRATION_EXPIRY=1; db.js enforces the same flag as a backstop.
function runLegacyMigrationExpiration() {
  try {
    const result = expireLegacyMigrationAccounts({ metadata: { source: 'server_interval' } })
    if (result.deleted > 0) {
      console.warn(`Legacy migration expiry soft-deleted ${result.deleted} account(s).`)
    }
  } catch (error) {
    console.warn('Legacy migration expiration failed:', error)
  }
}
setInterval(runLegacyMigrationExpiration, 60 * 60 * 1000).unref?.()

// Frees usernames held by passkey signups that never finished their ceremony.
function runAbandonedSignupReaper() {
  try {
    const result = reapAbandonedSignups({ metadata: { source: 'server_interval' } })
    if (result.released > 0) {
      console.log(`Released ${result.released} abandoned signup username(s).`)
    }
  } catch (error) {
    console.warn('Abandoned signup reaper failed:', error)
  }
}
runAbandonedSignupReaper()
setInterval(runAbandonedSignupReaper, 5 * 60 * 1000).unref?.()

function createDefaultAdminStore() {
  return {
    updatedAt: new Date().toISOString(),
    settings: {
      motd: 'Season of Shards is live. Queue up and climb the ladder.',
      quest: 'Win 1 ranked arena match',
      featuredMode: 'Ranked Blitz',
      maintenanceMode: false,
    },
    totals: {
      events: 0,
      pageViews: 0,
      uniqueVisitors: 0,
      sessions: 0,
      queueJoins: 0,
      matchesStarted: 0,
      matchesCompleted: 0,
      installs: 0,
    },
    visitors: {},
    pageViews: {},
    deviceBuckets: {},
    dailyTraffic: {},
    complaints: [],
    activity: [],
  }
}

function loadAdminStore() {
  const fallback = createDefaultAdminStore()

  try {
    ensureDataDir()

    if (!existsSync(ADMIN_STORE_PATH)) {
      return fallback
    }

    const stored = JSON.parse(readFileSync(ADMIN_STORE_PATH, 'utf8'))

    return {
      ...fallback,
      ...stored,
      settings: {
        ...fallback.settings,
        ...(stored.settings ?? {}),
      },
      totals: {
        ...fallback.totals,
        ...(stored.totals ?? {}),
      },
      visitors: stored.visitors ?? {},
      pageViews: stored.pageViews ?? {},
      deviceBuckets: stored.deviceBuckets ?? {},
      dailyTraffic: stored.dailyTraffic ?? {},
      complaints: stored.complaints ?? [],
      activity: stored.activity ?? [],
    }
  } catch {
    return fallback
  }
}

const adminStore = loadAdminStore()

function saveAdminStore() {
  ensureDataDir()
  adminStore.updatedAt = new Date().toISOString()
  writeFileSync(ADMIN_STORE_PATH, JSON.stringify(adminStore, null, 2))
}

let _saveTimer = null
function debouncedSaveAdminStore() {
  if (_saveTimer) return
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    saveAdminStore()
  }, 2000)
}

function getAllowedMatchDelta(queuedAt) {
  const waitSeconds = Math.max(0, Math.floor((Date.now() - queuedAt) / 1000))
  return Math.min(800, 150 + waitSeconds * 35)
}

function getLiveArenaSnapshot() {
  return {
    queueSize: waitingPlayers.length,
    connectedPlayers: io.engine.clientsCount,
    rankedAvailable: io.engine.clientsCount >= 2 || waitingPlayers.length >= 2,
    updatedAt: new Date().toISOString(),
  }
}

function emitWaitingQueueState() {
  waitingPlayers = waitingPlayers
    .filter((entry) => io.sockets.sockets.get(entry.id)?.connected)
    .sort((left, right) => left.queuedAt - right.queuedAt)

  waitingPlayers.forEach((entry, index) => {
    const socket = io.sockets.sockets.get(entry.id)
    if (!socket) {
      return
    }

    const waitSeconds = Math.max(0, Math.floor((Date.now() - entry.queuedAt) / 1000))
    socket.emit('queue:searching', {
      ok: true,
      position: index + 1,
      queueSize: waitingPlayers.length,
      connectedPlayers: io.engine.clientsCount,
      waitSeconds,
      estimatedWaitSeconds: Math.max(10, index * 12 + 10),
      ratingWindow: getAllowedMatchDelta(entry.queuedAt),
    })
  })
}

function emitLiveArenaState(target = io) {
  target.emit('queue:status', getLiveArenaSnapshot())
  target.emit('leaderboard:update', { entries: getLeaderboard() })
  if (target === io) {
    emitWaitingQueueState()
  }
}

function removeWaitingPlayer(socketId, accountId = '') {
  waitingPlayers = waitingPlayers.filter((entry) => entry.id !== socketId && (!accountId || entry.accountId !== accountId))
}

function getRuntimeRankLabel(rating) {
  if (rating >= 1500) return 'Diamond'
  if (rating >= 1300) return 'Gold'
  if (rating >= 1150) return 'Silver'
  return 'Bronze'
}

function roomParticipants(room) {
  const winner = room.state?.winner
  return ['player', 'enemy']
    .filter((side) => room.accounts[side])
    .map((side) => ({
      accountId: room.accounts[side],
      name: room.names[side],
      opponentAccountId: side === 'player' ? room.accounts.enemy : room.accounts.player,
      opponentName: room.names[side === 'player' ? 'enemy' : 'player'],
      result: winner === 'draw' ? 'draw' : winner === side ? 'win' : 'loss',
    }))
}

function emitTerminalSettlement(room, settlement) {
  for (const participant of roomParticipants(room)) {
    const outcome = settlement.outcomes.find((entry) => entry.accountId === participant.accountId)
    const view = room.getViewForAccount(participant.accountId)
    if (!outcome || !view) continue
    emitToAccount(participant.accountId, 'game:over', {
      ...view,
      roomId: room.roomId,
      matchId: room.roomId,
      result: outcome.result,
      reason: settlement.reason,
      settlement: outcome,
    })
  }
}

function broadcastRoomState(room) {
  for (const side of ['player', 'enemy']) {
    const socketId = room.sockets[side]
    if (!socketId) continue
    const target = io.sockets.sockets.get(socketId)
    const view = room.getViewForSocket(socketId)
    if (target && view) target.emit('game:state', view)
  }
}

function finalizeRoom(room, reason = 'completed') {
  if (!room?.state?.winner) return { ok: false, error: 'Match is not terminal.' }
  if (room.terminalSettlement) return room.terminalSettlement

  const settlement = settleAuthoritativeMatch({
    matchId: room.roomId,
    mode: room.mode,
    reason,
    turns: room.state.turnNumber,
    participants: roomParticipants(room),
    metadata: room.mode === 'ai' ? { aiDifficulty: room.state.aiDifficulty } : {},
  })
  if (!settlement.ok) {
    for (const accountId of Object.values(room.accounts).filter(Boolean)) {
      emitToAccount(accountId, 'game:error', {
        matchId: room.roomId,
        revision: room.revision,
        error: 'The match ended, but settlement is pending. Your result has not been lost.',
      })
    }
    return settlement
  }

  room.terminalSettlement = settlement
  emitTerminalSettlement(room, settlement)
  trackAnalyticsEvent({
    type: 'match_complete',
    route: 'battle',
    meta: { winner: room.state.winner, mode: room.mode, reason, matchId: room.roomId },
  })
  emitLiveArenaState()
  setTimeout(() => destroyRoom(room.roomId), 10_000).unref?.()
  return settlement
}

// A connected but abandoned room must not occupy the in-memory room cap
// forever. Idle matches close as no-contests, so this never deducts currency,
// rating, or inventory from either participant.
setInterval(() => {
  const now = Date.now()
  for (const room of rooms.values()) {
    if (!room.state || room.state.winner || now - room.lastActivityAt < MATCH_IDLE_TIMEOUT_MS) continue
    const aborted = room.finalizeAbort('Match closed after 15 minutes without activity.')
    if (aborted.ok) finalizeRoom(room, 'timeout')
  }
}, 60_000).unref?.()

function findBestWaitingPlayer(socketId, rating, queuedAt = Date.now()) {
  if (!waitingPlayers.length) {
    return null
  }

  const currentAllowedDelta = getAllowedMatchDelta(queuedAt)
  let bestIndex = -1
  let bestDelta = Number.POSITIVE_INFINITY

  waitingPlayers.forEach((entry, index) => {
    if (entry.id === socketId) {
      return
    }

    const allowedDelta = Math.max(currentAllowedDelta, getAllowedMatchDelta(entry.queuedAt))
    const delta = Math.abs(entry.rating - rating)

    if (delta <= allowedDelta && delta < bestDelta) {
      bestIndex = index
      bestDelta = delta
    }
  })

  if (bestIndex === -1) {
    return null
  }

  const [matched] = waitingPlayers.splice(bestIndex, 1)
  return matched ?? null
}

function startRankedMatch(playerEntry, matchedPlayer) {
  const playerSocket = io.sockets.sockets.get(playerEntry.id)
  const otherSocket = io.sockets.sockets.get(matchedPlayer.id)

  if (!playerSocket?.connected || !otherSocket?.connected || playerEntry.accountId === matchedPlayer.accountId) {
    return false
  }

  const existingPlayerRoom = getRoomByAccount(playerEntry.accountId)
  const existingOtherRoom = getRoomByAccount(matchedPlayer.accountId)
  if (existingPlayerRoom?.state && !existingPlayerRoom.state.winner) return false
  if (existingOtherRoom?.state && !existingOtherRoom.state.winner) return false
  if (existingPlayerRoom?.state?.winner) destroyRoom(existingPlayerRoom.roomId)
  if (existingOtherRoom?.state?.winner && existingOtherRoom.roomId !== existingPlayerRoom?.roomId) {
    destroyRoom(existingOtherRoom.roomId)
  }

  const roomId = `room-${randomUUID().slice(0, 8)}`
  let room = null

  try {
    room = createRoom(roomId)

    removeWaitingPlayer(playerEntry.id, playerEntry.accountId)
    removeWaitingPlayer(matchedPlayer.id, matchedPlayer.accountId)

    playerSocket.join(roomId)
    otherSocket.join(roomId)

    room.start(
      {
        socketId: playerEntry.id,
        accountId: playerEntry.accountId,
        name: playerEntry.profile.name,
        deckConfig: playerEntry.deckConfig,
      },
      {
        socketId: matchedPlayer.id,
        accountId: matchedPlayer.accountId,
        name: matchedPlayer.profile.name,
        deckConfig: matchedPlayer.deckConfig,
      },
    )

    const playerView = room.getViewForSocket(playerEntry.id)
    const enemyView = room.getViewForSocket(matchedPlayer.id)

    playerSocket.emit('queue:matched', { roomId, opponent: matchedPlayer.profile })
    otherSocket.emit('queue:matched', { roomId, opponent: playerEntry.profile })

    playerSocket.emit('game:start', playerView)
    otherSocket.emit('game:start', enemyView)
    return true
  } catch {
    if (room) destroyRoom(roomId)
    playerSocket.leave(roomId)
    otherSocket.leave(roomId)
    playerSocket.emit('queue:error', { error: 'Could not create the live match. Please queue again.' })
    otherSocket.emit('queue:error', { error: 'Could not create the live match. Please queue again.' })
    return false
  }
}

function sweepWaitingPlayers() {
  if (waitingPlayers.length < 2) {
    emitWaitingQueueState()
    return
  }

  const orderedPlayers = [...waitingPlayers].sort((left, right) => left.queuedAt - right.queuedAt)
  let matchedAny = false

  orderedPlayers.forEach((entry) => {
    const stillQueued = waitingPlayers.some((candidate) => candidate.id === entry.id)
    if (!stillQueued) {
      return
    }

    const matchedPlayer = findBestWaitingPlayer(entry.id, entry.rating, entry.queuedAt)
    if (!matchedPlayer || matchedPlayer.id === entry.id) {
      return
    }

    removeWaitingPlayer(entry.id, entry.accountId)

    if (!startRankedMatch(entry, matchedPlayer)) return

    matchedAny = true
  })

  if (matchedAny) {
    emitLiveArenaState()
    return
  }

  emitWaitingQueueState()
}

setInterval(() => {
  sweepWaitingPlayers()
}, 3000)

function anonymizeVisitorId(visitorId = 'guest') {
  return createHash('sha256').update(`fractured-arcanum:${visitorId}`).digest('hex').slice(0, 16)
}

function pushActivity(type, payload = {}) {
  adminStore.activity = [
    {
      id: `evt-${randomUUID().slice(0, 8)}`,
      type,
      at: new Date().toISOString(),
      ...payload,
    },
    ...adminStore.activity,
  ].slice(0, 80)
}

function pruneDailyTraffic() {
  const keys = Object.keys(adminStore.dailyTraffic).sort().reverse()
  const keep = new Set(keys.slice(0, 30))

  Object.keys(adminStore.dailyTraffic).forEach((key) => {
    if (!keep.has(key)) {
      delete adminStore.dailyTraffic[key]
    }
  })

  // Prune visitors older than 30 days to prevent unbounded growth
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  for (const [id, v] of Object.entries(adminStore.visitors)) {
    if (v.lastSeen < cutoff) {
      delete adminStore.visitors[id]
    }
  }
}

function ensureVisitor(visitorId, sessionId, route, screen) {
  const anonymousUser = anonymizeVisitorId(visitorId)
  const existing = adminStore.visitors[anonymousUser]

  if (!existing) {
    adminStore.visitors[anonymousUser] = {
      anonymousUser,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      lastRoute: route,
      lastScreen: screen,
      lastViewport: 'unknown',
      sessions: 0,
      events: 0,
      matches: 0,
      complaints: 0,
      installs: 0,
      lastSessionId: '',
      pageViewWindow: {},
    }
  }

  const visitor = adminStore.visitors[anonymousUser]
  visitor.pageViewWindow = visitor.pageViewWindow ?? {}

  if (sessionId && visitor.lastSessionId !== sessionId) {
    visitor.sessions += 1
    visitor.lastSessionId = sessionId
    adminStore.totals.sessions += 1
  }

  visitor.lastSeen = new Date().toISOString()
  visitor.lastRoute = route
  visitor.lastScreen = screen
  adminStore.totals.uniqueVisitors = Object.keys(adminStore.visitors).length

  return { anonymousUser, visitor }
}

function trackAnalyticsEvent(payload = {}) {
  const visitorId = String(payload.visitorId ?? 'guest')
  const sessionId = String(payload.sessionId ?? '')
  const type = String(payload.type ?? 'page_view')
  const route = String(payload.route ?? 'home')
  const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {}
  const rawScreen = String(meta.screen ?? route)
  const screen = ['mobile', 'tablet', 'desktop', 'unknown'].includes(rawScreen) ? route : rawScreen
  const viewport = String(meta.viewport ?? (['mobile', 'tablet', 'desktop'].includes(rawScreen) ? rawScreen : 'unknown'))
  const dayKey = new Date().toISOString().slice(0, 10)
  const { anonymousUser, visitor } = ensureVisitor(visitorId, sessionId, route, screen)

  visitor.events += 1
  visitor.lastViewport = viewport
  adminStore.totals.events += 1

  if (type === 'page_view') {
    const pageKey = `${route}:${screen}`
    const lastCountedAt = Number(visitor.pageViewWindow?.[pageKey] ?? 0)
    const now = Date.now()
    if (now - lastCountedAt >= 15000) {
      adminStore.totals.pageViews += 1
      adminStore.pageViews[route] = (adminStore.pageViews[route] ?? 0) + 1
      adminStore.dailyTraffic[dayKey] = (adminStore.dailyTraffic[dayKey] ?? 0) + 1
      adminStore.deviceBuckets[viewport] = (adminStore.deviceBuckets[viewport] ?? 0) + 1
      visitor.pageViewWindow[pageKey] = now
    }
  }

  if (type === 'queue_join') {
    adminStore.totals.queueJoins += 1
  }

  if (type === 'match_start') {
    adminStore.totals.matchesStarted += 1
    visitor.matches += 1
  }

  if (type === 'match_complete') {
    adminStore.totals.matchesCompleted += 1
  }

  if (type === 'install') {
    adminStore.totals.installs += 1
    visitor.installs += 1
  }

  pushActivity(type, {
    route,
    anonymousUser,
    meta,
  })

  pruneDailyTraffic()
  debouncedSaveAdminStore()

  return anonymousUser
}

function getComplaintCounts() {
  const resolved = adminStore.complaints.filter((complaint) => complaint.status === 'resolved').length
  const open = adminStore.complaints.length - resolved

  return { open, resolved }
}

function buildAdminOverview() {
  const complaintCounts = getComplaintCounts()

  return {
    ok: true,
    service: {
      queueSize: waitingPlayers.length,
      connectedPlayers: io.engine.clientsCount,
      maintenanceMode: adminStore.settings.maintenanceMode,
      port: PORT,
    },
    privacy: {
      anonymousOnly: true,
      fieldsTracked: [
        'anonymous guest id',
        'session count',
        'page views',
        'match and queue events',
        'device size bucket',
        'complaint reports submitted by the player',
      ],
    },
    settings: adminStore.settings,
    totals: {
      ...adminStore.totals,
      complaintsOpen: complaintCounts.open,
      complaintsResolved: complaintCounts.resolved,
      complaintsTotal: adminStore.complaints.length,
    },
    traffic: {
      pages: Object.entries(adminStore.pageViews)
        .sort((left, right) => right[1] - left[1])
        .map(([route, views]) => ({ route, views })),
      devices: Object.entries(adminStore.deviceBuckets)
        .sort((left, right) => right[1] - left[1])
        .map(([label, count]) => ({ label, count })),
      daily: Object.entries(adminStore.dailyTraffic)
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([day, views]) => ({ day, views })),
    },
    complaints: adminStore.complaints,
    activity: adminStore.activity,
  }
}

function requireRoleMiddleware(minRole) {
  return function requireRole(request, response, next) {
    const token = request.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      response.status(401).json({ ok: false, error: 'Authentication required.' })
      return
    }
    const session = validateSession(token)
    if (!session) {
      response.status(401).json({ ok: false, error: 'Session expired. Please log in again.' })
      return
    }
    const role = getAccountRole(session.account_id)
    if (!hasRoleAtLeast(role, minRole)) {
      response.status(403).json({ ok: false, error: 'Insufficient privileges.' })
      return
    }
    const readiness = getAccountReadiness(session.account_id)
    if (readiness.setupRequired) {
      response.status(403).json({ ok: false, error: 'Complete account setup before using admin tools.', accountSetupRequired: true, accountReadiness: readiness })
      return
    }
    if (listAccountPasskeys(session.account_id).length < 1) {
      response.status(403).json({ ok: false, error: 'Admin accounts must register at least one passkey before using admin tools.' })
      return
    }
    request.accountId = session.account_id
    request.displayName = session.display_name
    request.username = session.username
    request.authToken = token
    request.session = session
    request.role = role
    next()
  }
}

const requireAdminRole = requireRoleMiddleware('admin')
const requireOwnerRole = requireRoleMiddleware('owner')

function requireOwnerRecoveryKey(request, response, next) {
  const providedKey = request.get('x-admin-key')
  if (!providedKey || typeof providedKey !== 'string') {
    response.status(401).json({ ok: false, error: 'Recovery key required.' })
    return
  }
  const expected = Buffer.from(ADMIN_KEY, 'utf8')
  const provided = Buffer.from(providedKey, 'utf8')
  if (expected.length !== provided.length || !timingSafeEqualBuffers(expected, provided)) {
    response.status(401).json({ ok: false, error: 'Invalid recovery key.' })
    return
  }
  next()
}

function timingSafeEqualBuffers(a, b) {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  }),
)
app.use(compression())
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipViewportQaRateLimit,
  }),
)
app.use(
  cors({
    origin: corsOrigin,
  }),
)
app.use(express.json({ limit: '100kb' }))

// ─── Auth middleware ────────────────────────────────────────────────────────

function requireAuth(request, response, next) {
  const token = request.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    response.status(401).json({ ok: false, error: 'Authentication required.' })
    return
  }
  const session = validateSession(token)
  if (!session) {
    response.status(401).json({ ok: false, error: 'Session expired. Please log in again.' })
    return
  }
  request.accountId = session.account_id
  request.displayName = session.display_name
  request.username = session.username
  request.authMethod = session.auth_method
  request.authToken = token
  request.session = session
  next()
}

const RECENT_PASSKEY_REAUTH_MS = 10 * 60 * 1000

function requireRecentPasskeyAuth(request, response, next) {
  if (!sessionHasRecentPasskeyReauth(request.session, RECENT_PASSKEY_REAUTH_MS)) {
    response.status(403).json({ ok: false, error: 'Confirm your passkey before continuing.', passkeyReauthRequired: true })
    return
  }
  next()
}

function clientIp(request) {
  const ip = request.ip ?? request.socket?.remoteAddress ?? '0.0.0.0'
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

function clientUserAgent(request) {
  return String(request.get('user-agent') ?? '').slice(0, 512)
}

function publicAppOrigin(request) {
  const configured = String(process.env.PUBLIC_APP_URL || process.env.WEBAUTHN_ORIGIN || process.env.CLIENT_ORIGIN || '')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '')
  if (configured) return configured
  const requestOrigin = String(request.get('origin') ?? '').trim().replace(/\/$/, '')
  if (requestOrigin) return requestOrigin
  return `${request.protocol}://${request.get('host')}`.replace(/\/$/, '')
}

function accountRequirementsPayload(accountId) {
  const readiness = getAccountReadiness(accountId)
  return {
    accountSetupRequired: readiness.setupRequired,
    accountReadiness: readiness,
  }
}

function validateLegalSetupPayload(body = {}) {
  const ageAttestation = String(body.ageAttestation ?? '').trim()
  if (body.acceptTerms !== true || body.acceptPrivacy !== true) {
    return { ok: false, error: 'Terms of Service and Privacy Policy acceptance are required.' }
  }
  if (!['adult', 'guardian'].includes(ageAttestation)) {
    return { ok: false, error: 'Confirm age eligibility or guardian consent.' }
  }
  return { ok: true }
}

function requireAccountReady(request, response, next) {
  const readiness = getAccountReadiness(request.accountId)
  if (readiness.setupRequired) {
    response.status(403).json({ ok: false, error: 'Complete account setup before continuing.', accountSetupRequired: true, accountReadiness: readiness })
    return
  }
  next()
}

// ─── Account endpoints ─────────────────────────────────────────────────────

app.get('/api/legal/current', (_request, response) => {
  response.json({
    ok: true,
    legal: getCurrentLegalVersions(),
    documents: {
      terms: {
        version: getCurrentLegalVersions().termsVersion,
        title: 'Terms of Service',
        status: 'draft-pending-counsel-review',
        path: 'docs/TERMS_OF_SERVICE.md',
        noRealMoneyPurchases: true,
      },
      privacy: {
        version: getCurrentLegalVersions().privacyVersion,
        title: 'Privacy Policy',
        status: 'draft-pending-counsel-review',
      },
      ageGate: {
        version: getCurrentLegalVersions().ageGateVersion,
        title: 'Age Eligibility',
        status: 'draft-pending-counsel-review',
      },
    },
  })
})

app.post('/api/auth/signup', (request, response) => {
  response.status(410).json({ ok: false, error: 'Password signup is retired. Create a passkey account instead.' })
})

app.post('/api/auth/passkey/signup/options', async (request, response) => {
  const ip = clientIp(request)
  const userAgent = clientUserAgent(request)
  const { username, displayName, deviceFingerprint } = request.body ?? {}
  const legalValidation = validateLegalSetupPayload(request.body ?? {})
  if (!legalValidation.ok) {
    response.status(400).json({ ok: false, error: legalValidation.error })
    return
  }

  const fingerprintHash = hashFingerprint(String(deviceFingerprint ?? ''))
  const rl = checkRateLimit(`passkey-signup:start:${hashIp(ip)}`, 5)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many signup attempts. Try again later.' })
    return
  }

  if (fingerprintHash) {
    const fingerprintRateLimit = checkRateLimit(`passkey-signup-fp:${fingerprintHash}`, 3)
    if (!fingerprintRateLimit.allowed) {
      response.status(429).json({ ok: false, error: 'Too many signup attempts from this device. Try again later.' })
      return
    }
  }

  const result = createAccount(
    String(username ?? ''),
    randomBytes(32).toString('hex'),
    String(displayName ?? username ?? ''),
    String(deviceFingerprint ?? ''),
    ip,
    userAgent,
    { bypassSignupClusterLimits: allowLocalSignupClusterBypass(request) },
  )

  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }
  markAccountPendingPasskeySignup(result.accountId)

  try {
    const optionsResult = await createPasskeyRegistrationOptions(result.accountId, request)
    if (!optionsResult.ok) {
      response.status(optionsResult.status ?? 400).json({ ok: false, error: optionsResult.error })
      return
    }

    response.status(201).json({
      ok: true,
      pendingAccountId: result.accountId,
      options: optionsResult.options,
      challengeId: optionsResult.challengeId,
      expiresAt: optionsResult.expiresAt,
    })
  } catch (error) {
    console.warn('Passkey signup options failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey signup could not be started.' })
  }
})

app.post('/api/auth/passkey/signup/verify', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`passkey-signup:verify:${hashIp(ip)}`, 10)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many signup attempts. Try again later.' })
    return
  }

  const pendingAccountId = String(request.body?.pendingAccountId ?? '')
  const legalValidation = validateLegalSetupPayload(request.body ?? {})
  if (!legalValidation.ok) {
    response.status(400).json({ ok: false, error: legalValidation.error })
    return
  }

  try {
    const passkeyResult = await verifyPasskeyRegistration(pendingAccountId, request.body ?? {}, request)
    if (!passkeyResult.ok) {
      response.status(passkeyResult.status ?? 400).json({ ok: false, error: passkeyResult.error })
      return
    }

    const setupResult = completeAccountUpgrade(pendingAccountId, {
      acceptTerms: request.body?.acceptTerms === true,
      acceptPrivacy: request.body?.acceptPrivacy === true,
      ageAttestation: request.body?.ageAttestation,
      locale: request.body?.locale,
      ip,
      userAgent: clientUserAgent(request),
    })
    if (!setupResult.ok) {
      response.status(setupResult.status ?? 400).json({ ok: false, error: setupResult.error })
      return
    }

    const session = createSession(pendingAccountId, ip, clientUserAgent(request), 'passkey')
    const recoveryResult = generateAccountRecoveryCodes(pendingAccountId, {
      ip,
      userAgent: clientUserAgent(request),
      metadata: { source: 'passkey_signup' },
    })
    const profile = getProfile(pendingAccountId)

    response.status(201).json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      profile: sanitizeProfile(profile, profile?.username, pendingAccountId),
      recoveryCodes: recoveryResult.ok ? recoveryResult.codes : [],
      recovery: recoveryResult.ok ? recoveryResult.recovery : listAccountRecoveryStatus(pendingAccountId),
    })
  } catch (error) {
    console.warn('Passkey signup verification failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey signup could not be verified.' })
  }
})

app.post('/api/auth/login', (request, response) => {
  const ip = clientIp(request)
  if (!skipViewportQaRateLimit(request)) {
    const rl = checkRateLimit(`login:${hashIp(ip)}`, 10)
    if (!rl.allowed) {
      response.status(429).json({ ok: false, error: 'Too many login attempts. Try again later.' })
      return
    }
  }

  const { username, password } = request.body ?? {}
  const result = authenticateAccount(String(username ?? ''), String(password ?? ''))
  if (!result.ok) {
    response.status(401).json(result)
    return
  }

  const readiness = getAccountReadiness(result.accountId)
  if (!readiness.setupRequired && readiness.passkeyCount > 0) {
    response.status(403).json({ ok: false, error: 'This account now uses passkey sign-in. Use your passkey to log in.' })
    return
  }

  const session = createSession(result.accountId, ip, clientUserAgent(request), 'password')
  const profile = getProfile(result.accountId)

  response.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    profile: sanitizeProfile(profile, username, result.accountId),
  })
})

app.post('/api/auth/passkey/login/options', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`passkey-login:start:${hashIp(ip)}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many passkey attempts. Try again later.' })
    return
  }

  try {
    const result = await createPasskeyLoginOptions(String(request.body?.identifier ?? ''), request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    response.json(result)
  } catch (error) {
    console.warn('Passkey login options failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey login could not be started.' })
  }
})

app.post('/api/auth/passkey/login/verify', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`passkey-login:verify:${hashIp(ip)}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many passkey attempts. Try again later.' })
    return
  }

  try {
    const result = await verifyPasskeyLogin(request.body ?? {}, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }

    const session = createSession(result.accountId, ip, clientUserAgent(request), 'passkey')
    const profile = getProfile(result.accountId)
    response.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      profile: sanitizeProfile(profile, result.username, result.accountId),
    })
  } catch (error) {
    console.warn('Passkey login verification failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey login could not be verified.' })
  }
})

app.post('/api/auth/passkey/reauth/options', requireAuth, async (request, response) => {
  const rl = checkRateLimit(`passkey-reauth:start:${request.accountId}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many passkey confirmation attempts. Try again later.' })
    return
  }

  try {
    const result = await createPasskeyReauthOptions(request.accountId, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    response.json(result)
  } catch (error) {
    console.warn('Passkey reauth options failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey confirmation could not be started.' })
  }
})

app.post('/api/auth/passkey/reauth/verify', requireAuth, async (request, response) => {
  const rl = checkRateLimit(`passkey-reauth:verify:${request.accountId}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many passkey confirmation attempts. Try again later.' })
    return
  }

  try {
    const result = await verifyPasskeyReauth(request.accountId, request.body ?? {}, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    markSessionPasskeyReauthenticated(request.authToken)
    response.json({ ok: true })
  } catch (error) {
    console.warn('Passkey reauth verification failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey confirmation could not be verified.' })
  }
})

app.post('/api/me/passkey-device-links', requireAuth, requireRecentPasskeyAuth, (request, response) => {
  const rl = checkRateLimit(`passkey-device-link:create:${request.accountId}`, 10)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many device link requests. Try again later.' })
    return
  }

  const result = createPasskeyDeviceLink(request.accountId, {
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
    sessionId: request.session?.token,
    metadata: { source: 'settings' },
  })
  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }

  response.json({
    ok: true,
    token: result.token,
    link: result.link,
    linkUrl: `${publicAppOrigin(request)}/?passkeyDeviceLink=${encodeURIComponent(result.token)}`,
  })
})

app.post('/api/auth/passkey/device-link/options', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`passkey-device-link:start:${hashIp(ip)}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many device link attempts. Try again later.' })
    return
  }

  try {
    const result = await createPasskeyDeviceLinkRegistrationOptions(String(request.body?.deviceLinkToken ?? ''), request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    response.json(result)
  } catch (error) {
    console.warn('Passkey device link options failed:', error)
    response.status(400).json({ ok: false, error: 'Device link passkey setup could not be started.' })
  }
})

app.post('/api/auth/passkey/device-link/verify', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`passkey-device-link:verify:${hashIp(ip)}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many device link attempts. Try again later.' })
    return
  }

  try {
    const result = await verifyPasskeyDeviceLinkRegistration(request.body ?? {}, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }

    const session = createSession(result.accountId, ip, clientUserAgent(request), 'passkey')
    const profile = getProfile(result.accountId)
    response.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      profile: sanitizeProfile(profile, result.username, result.accountId),
      passkey: result.passkey,
      passkeys: listAccountPasskeys(result.accountId),
    })
  } catch (error) {
    console.warn('Passkey device link verification failed:', error)
    response.status(400).json({ ok: false, error: 'Device link passkey setup could not be verified.' })
  }
})

app.post('/api/auth/recovery/options', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`account-recovery:start:${hashIp(ip)}`, 8)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many recovery attempts. Try again later.' })
    return
  }

  try {
    const result = await createPasskeyRecoveryOptions(String(request.body?.username ?? ''), String(request.body?.recoveryCode ?? ''), request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    response.json(result)
  } catch (error) {
    console.warn('Account recovery options failed:', error)
    response.status(400).json({ ok: false, error: 'Account recovery could not be started.' })
  }
})

app.post('/api/auth/recovery/verify', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`account-recovery:verify:${hashIp(ip)}`, 8)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many recovery attempts. Try again later.' })
    return
  }

  try {
    const result = await verifyPasskeyRecovery(request.body ?? {}, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    // Recovery consumes exactly one code. Silently reissuing the whole batch
    // here would kill the sheet the player still has saved, so only mint a new
    // batch when they have none left; otherwise report what remains and let
    // them regenerate deliberately.
    const remaining = listAccountRecoveryStatus(result.accountId)
    const recoveryResult = remaining.activeCount < 1
      ? generateAccountRecoveryCodes(result.accountId, {
          ip,
          userAgent: clientUserAgent(request),
          metadata: { source: 'lost_access_recovery' },
        })
      : { ok: true, codes: [], recovery: remaining }
    const session = createSession(result.accountId, ip, clientUserAgent(request), 'passkey')
    const profile = getProfile(result.accountId)
    response.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      profile: sanitizeProfile(profile, result.username, result.accountId),
      recoveryCodes: recoveryResult.ok ? recoveryResult.codes : [],
      recovery: recoveryResult.ok ? recoveryResult.recovery : listAccountRecoveryStatus(result.accountId),
      remainingRecoveryCodes: recoveryResult.recovery?.activeCount ?? 0,
    })
  } catch (error) {
    console.warn('Account recovery verification failed:', error)
    response.status(400).json({ ok: false, error: 'Account recovery could not be verified.' })
  }
})

// ─── Assisted recovery (operator-issued grant code) ─────────────────────────
// The last-resort path for a player who lost both their device and their
// recovery codes. The code is issued from the owner console and relayed over a
// support channel; it identifies its own account, so no username is needed.

app.post('/api/auth/recovery/grant/options', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`grant-recovery:start:${hashIp(ip)}`, 8)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many recovery attempts. Try again later.' })
    return
  }

  try {
    const result = await createPasskeyGrantRecoveryOptions(String(request.body?.grantCode ?? ''), request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    response.json(result)
  } catch (error) {
    console.warn('Grant recovery options failed:', error)
    response.status(400).json({ ok: false, error: 'Account recovery could not be started.' })
  }
})

app.post('/api/auth/recovery/grant/verify', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`grant-recovery:verify:${hashIp(ip)}`, 8)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many recovery attempts. Try again later.' })
    return
  }

  try {
    const result = await verifyPasskeyGrantRecovery(request.body ?? {}, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    // A grant is used precisely when the player has nothing left, so this is
    // the one place a fresh recovery-code batch is always the right call.
    const recoveryResult = generateAccountRecoveryCodes(result.accountId, {
      ip,
      userAgent: clientUserAgent(request),
      metadata: { source: 'assisted_grant_recovery' },
    })
    const session = createSession(result.accountId, ip, clientUserAgent(request), 'passkey')
    const profile = getProfile(result.accountId)
    response.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      profile: sanitizeProfile(profile, result.username, result.accountId),
      recoveryCodes: recoveryResult.ok ? recoveryResult.codes : [],
      recovery: recoveryResult.ok ? recoveryResult.recovery : listAccountRecoveryStatus(result.accountId),
    })
  } catch (error) {
    console.warn('Grant recovery verification failed:', error)
    response.status(400).json({ ok: false, error: 'Account recovery could not be verified.' })
  }
})

app.post('/api/auth/logout', (request, response) => {
  // Idempotent: always succeed so clients can clear local state even if
  // the token is already expired or missing.
  const token = request.get('authorization')?.replace('Bearer ', '')
  if (token) destroySession(token)
  response.json({ ok: true })
})

app.post('/api/auth/logout-all', requireAuth, requireRecentPasskeyAuth, (request, response) => {
  revokeAllSessions(request.accountId)
  response.json({ ok: true })
})

// ─── First-launch setup ────────────────────────────────────────────────────

app.get('/api/setup/status', (_request, response) => {
  response.json({ ok: true, setupComplete })
})

app.post(
  '/api/setup',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: false, legacyHeaders: false }),
  (request, response) => {
    if (setupComplete) {
      response.status(403).json({ ok: false, error: 'Setup has already been completed.' })
      return
    }

    const { username, password, displayName } = request.body ?? {}
    const uname = String(username ?? '').trim()
    const pass = String(password ?? '')
    const dname = String(displayName ?? uname).trim()

    if (!uname || !pass) {
      response.status(400).json({ ok: false, error: 'Username and password are required.' })
      return
    }

    const ip = clientIp(request)
    const result = createAccount(uname, pass, dname, '', ip, clientUserAgent(request))
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }

    const session = createSession(result.accountId, ip, clientUserAgent(request), 'password')
    const profile = getProfile(result.accountId)

    // Mark setup complete and persist
    setupComplete = true
    const config = loadServerConfig() ?? {}
    config.setupComplete = true
    config.setupAt = new Date().toISOString()
    config.adminAccountId = result.accountId
    saveServerConfig(config)

    // Bootstrap: the setup account becomes the owner. Role is the source of
    // truth going forward; the ADMIN_KEY is retained only for recovery.
    const ownerResult = assignInitialOwner(result.accountId, {
      ipHash: hashIp(ip),
      reason: 'setup',
    })
    if (!ownerResult.ok) {
      console.warn(`Setup: could not assign owner role (${ownerResult.error}).`)
    }

    console.log('Server setup completed. Owner account created.')

    const role = getAccountRole(result.accountId)

    response.status(201).json({
      ok: true,
      // Intentionally no longer returning adminKey in the setup response.
      // The owner authenticates to the admin console with their session token.
      token: session.token,
      expiresAt: session.expiresAt,
      profile: sanitizeProfile(profile, uname, result.accountId, role),
    })
  },
)

function sanitizeProfile(profile, username, accountId, role) {
  if (!profile) return null
  const resolvedAccountId = accountId ?? profile.account_id
  const resolvedRole = role ?? (resolvedAccountId ? getAccountRole(resolvedAccountId) : 'user')
  const accountRequirements = resolvedAccountId ? accountRequirementsPayload(resolvedAccountId) : null
  return {
    accountId: resolvedAccountId,
    displayName: profile.display_name ?? username ?? '',
    username: username ?? '',
    role: resolvedRole,
    shards: profile.shards,
    seasonRating: profile.season_rating,
    wins: profile.wins,
    losses: profile.losses,
    streak: profile.streak,
    deckConfig: profile.deck_config,
    ownedThemes: profile.owned_themes,
    selectedTheme: profile.selected_theme,
    ownedCardBorders: profile.owned_card_borders,
    selectedCardBorder: profile.selected_card_border,
    lastDaily: profile.last_daily,
    totalEarned: profile.total_earned,
    accountSetupRequired: accountRequirements?.accountSetupRequired ?? false,
    accountReadiness: accountRequirements?.accountReadiness ?? null,
  }
}

// ─── Player profile/economy endpoints (all require auth) ────────────────────

app.get('/api/me', requireAuth, (request, response) => {
  const profile = getProfile(request.accountId)
  response.json({
    ok: true,
    profile: sanitizeProfile(profile, request.username, request.accountId),
  })
})

app.get('/api/me/account-requirements', requireAuth, (request, response) => {
  response.json({
    ok: true,
    ...accountRequirementsPayload(request.accountId),
  })
})

app.get('/api/me/sessions', requireAuth, (request, response) => {
  response.json({ ok: true, sessions: listAccountSessions(request.accountId) })
})

app.get('/api/me/recovery-codes', requireAuth, (request, response) => {
  response.json({ ok: true, recovery: listAccountRecoveryStatus(request.accountId) })
})

app.post('/api/me/recovery-codes/generate', requireAuth, requireRecentPasskeyAuth, (request, response) => {
  const rl = checkRateLimit(`recovery-codes:generate:${request.accountId}`, 5)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many recovery code requests. Try again later.' })
    return
  }

  const result = generateAccountRecoveryCodes(request.accountId, {
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
    metadata: { source: 'settings' },
  })
  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }
  const profile = getProfile(request.accountId)
  response.json({ ok: true, recoveryCodes: result.codes, recovery: result.recovery, profile: sanitizeProfile(profile, request.username, request.accountId) })
})

app.post('/api/me/recovery-codes/acknowledge', requireAuth, (request, response) => {
  const result = acknowledgeAccountRecoveryCodes(request.accountId, {
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
    metadata: { source: 'client_acknowledgement' },
  })
  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }
  const profile = getProfile(request.accountId)
  response.json({ ok: true, recovery: result.recovery, accountReadiness: result.readiness, profile: sanitizeProfile(profile, request.username, request.accountId) })
})

app.get('/api/me/export', requireAuth, requireAccountReady, (request, response) => {
  const exported = exportAccountData(request.accountId)
  if (!exported) {
    response.status(404).json({ ok: false, error: 'Account not found.' })
    return
  }
  response.json({ ok: true, export: exported })
})

app.post('/api/me/delete', requireAuth, requireAccountReady, requireRecentPasskeyAuth, (request, response) => {
  const result = deleteAccount(request.accountId, request.body?.password, {
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
    authMethod: 'passkey',
  })
  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }
  response.json({ ok: true })
})

app.get('/api/me/passkeys', requireAuth, (request, response) => {
  response.json({ ok: true, passkeys: listAccountPasskeys(request.accountId) })
})

app.post('/api/auth/passkey/register/options', requireAuth, async (request, response) => {
  const rl = checkRateLimit(`passkey-register:start:${request.accountId}`, 10)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many passkey registration attempts. Try again later.' })
    return
  }

  try {
    const result = await createPasskeyRegistrationOptions(request.accountId, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    response.json(result)
  } catch (error) {
    console.warn('Passkey registration options failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey registration could not be started.' })
  }
})

app.post('/api/auth/passkey/register/verify', requireAuth, async (request, response) => {
  const rl = checkRateLimit(`passkey-register:verify:${request.accountId}`, 10)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many passkey registration attempts. Try again later.' })
    return
  }

  try {
    const result = await verifyPasskeyRegistration(request.accountId, request.body ?? {}, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }

    const profile = getProfile(request.accountId)
    markSessionPasskeyReauthenticated(request.authToken)
    response.json({
      ok: true,
      passkeys: listAccountPasskeys(request.accountId),
      profile: sanitizeProfile(profile, request.username, request.accountId),
    })
  } catch (error) {
    console.warn('Passkey registration verification failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey registration could not be verified.' })
  }
})

app.delete('/api/me/passkeys/:id', requireAuth, requireAccountReady, requireRecentPasskeyAuth, (request, response) => {
  const rl = checkRateLimit(`passkey-delete:${request.accountId}`, 10)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many passkey changes. Try again later.' })
    return
  }

  const result = deleteAccountPasskey(request.accountId, String(request.params.id ?? ''))
  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }
  response.json({ ok: true, passkeys: listAccountPasskeys(request.accountId) })
})

app.post('/api/me/account-upgrade/complete', requireAuth, (request, response) => {
  const rl = checkRateLimit(`account-upgrade:complete:${request.accountId}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many account setup attempts. Try again later.' })
    return
  }

  const result = completeAccountUpgrade(request.accountId, {
    acceptTerms: request.body?.acceptTerms === true,
    acceptPrivacy: request.body?.acceptPrivacy === true,
    ageAttestation: request.body?.ageAttestation,
    locale: request.body?.locale,
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
  })
  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }

  const recoveryStatus = listAccountRecoveryStatus(request.accountId)
  const recoveryResult = recoveryStatus.activeCount < 1
    ? generateAccountRecoveryCodes(request.accountId, {
        ip: clientIp(request),
        userAgent: clientUserAgent(request),
        metadata: { source: 'legacy_migration' },
      })
    : { ok: true, codes: [], recovery: recoveryStatus }

  const profile = getProfile(request.accountId)
  response.json({
    ok: true,
    accountReadiness: getAccountReadiness(request.accountId),
    recoveryCodes: recoveryResult.ok ? recoveryResult.codes : [],
    recovery: recoveryResult.ok ? recoveryResult.recovery : listAccountRecoveryStatus(request.accountId),
    profile: sanitizeProfile(profile, request.username, request.accountId),
  })
})

app.post('/api/me/deck', requireAuth, requireAccountReady, (request, response) => {
  const { deckConfig } = request.body ?? {}
  const validation = validateDeckConfig(deckConfig)
  if (!validation.ok) {
    response.status(400).json(validation)
    return
  }
  const result = saveDeck(request.accountId, deckConfig)
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

// ─── Multi-deck CRUD endpoints ──────────────────────────────────────

app.get('/api/me/decks', requireAuth, requireAccountReady, (request, response) => {
  const decks = listDecks(request.accountId)
  response.json({ ok: true, decks })
})

app.post('/api/me/decks', requireAuth, requireAccountReady, (request, response) => {
  const { name, deckConfig } = request.body ?? {}
  const result = createDeck(request.accountId, String(name ?? '').slice(0, 50), deckConfig ?? {})
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.patch('/api/me/decks/:deckId', requireAuth, requireAccountReady, (request, response) => {
  const { deckId } = request.params
  const { name, deckConfig } = request.body ?? {}
  const payload = {}
  if (name !== undefined) payload.name = String(name).slice(0, 50)
  if (deckConfig !== undefined) payload.deckConfig = deckConfig
  const result = updateDeck(request.accountId, String(deckId), payload)
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/me/decks/:deckId/rename', requireAuth, requireAccountReady, (request, response) => {
  const { deckId } = request.params
  const { name } = request.body ?? {}
  const result = renameDeck(request.accountId, String(deckId), String(name ?? '').slice(0, 50))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.delete('/api/me/decks/:deckId', requireAuth, requireAccountReady, (request, response) => {
  const { deckId } = request.params
  const result = deleteDeck(request.accountId, String(deckId))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/me/decks/:deckId/select', requireAuth, requireAccountReady, (request, response) => {
  const { deckId } = request.params
  const result = selectActiveDeck(request.accountId, String(deckId))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

// ─── Shard breakdown of excess cards ────────────────────────────────

app.post('/api/cards/breakdown', requireAuth, requireAccountReady, (request, response) => {
  const rl = checkRateLimit(`breakdown:${request.accountId}`, 30)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many breakdown requests. Slow down.' })
    return
  }
  const { cardId, qty } = request.body ?? {}
  const result = breakdownCard(request.accountId, String(cardId ?? ''), Number(qty ?? 0))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

// ─── Card border cosmetic endpoints ─────────────────────────────────

app.get('/api/shop/borders', requireAuth, requireAccountReady, (_request, response) => {
  response.json({ ok: true, borders: listCardBorders() })
})

app.post('/api/shop/border', requireAuth, requireAccountReady, (request, response) => {
  const { borderId } = request.body ?? {}
  const result = purchaseCardBorder(request.accountId, String(borderId ?? ''))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/me/border', requireAuth, requireAccountReady, (request, response) => {
  const { borderId } = request.body ?? {}
  const result = selectCardBorder(request.accountId, String(borderId ?? ''))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/me/theme', requireAuth, requireAccountReady, (request, response) => {
  const { themeId } = request.body ?? {}
  const result = selectTheme(request.accountId, String(themeId ?? ''))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/me/daily', requireAuth, requireAccountReady, (request, response) => {
  const result = claimDailyReward(request.accountId)
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.get('/api/me/quests', requireAuth, requireAccountReady, (request, response) => {
  const result = getQuestOverview(request.accountId)
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/me/quests/:questId/reroll', requireAuth, requireAccountReady, (request, response) => {
  const rl = checkRateLimit(`quest:reroll:${request.accountId}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many quest reroll requests. Slow down.' })
    return
  }
  const result = rerollQuest(request.accountId, String(request.params.questId ?? ''))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

// Batch claim. The client's "Claim Ready Rewards" button used to fan out one
// request per quest, racing shard balances against each other; this settles
// every ready reward in one transaction and returns one authoritative balance.
// An empty/absent questIds claims everything currently ready.
app.post('/api/me/quests/claim', requireAuth, requireAccountReady, (request, response) => {
  const rl = checkRateLimit(`quest:claim:${request.accountId}`, 30)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many quest claim requests. Slow down.' })
    return
  }

  const raw = request.body?.questIds
  if (raw !== undefined && !Array.isArray(raw)) {
    response.status(400).json({ ok: false, error: 'questIds must be an array.' })
    return
  }
  if (Array.isArray(raw) && raw.length > 32) {
    response.status(400).json({ ok: false, error: 'Too many quests in one claim.' })
    return
  }

  const questIds = Array.isArray(raw) ? raw.map((id) => String(id ?? '')) : null
  const result = claimQuestRewards(request.accountId, questIds)
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/me/quests/:questId/claim', requireAuth, requireAccountReady, (request, response) => {
  const rl = checkRateLimit(`quest:claim:${request.accountId}`, 30)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many quest claim requests. Slow down.' })
    return
  }
  const result = claimQuestReward(request.accountId, String(request.params.questId ?? ''))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/shop/theme', requireAuth, requireAccountReady, (request, response) => {
  const { themeId } = request.body ?? {}
  const result = purchaseTheme(request.accountId, String(themeId ?? ''))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/match/complete', requireAuth, requireAccountReady, (_request, response) => {
  response.status(410).json({
    ok: false,
    error: 'Client-reported match completion is retired. Start matches through the live game service.',
  })
})

app.get('/api/me/matches', requireAuth, requireAccountReady, (request, response) => {
  const matches = getRecentMatches(request.accountId)
  response.json({ ok: true, matches })
})

app.get('/api/leaderboard', (_request, response) => {
  const entries = getLeaderboard()
  response.json({ ok: true, entries })
})

// ─── Card Pack endpoints ────────────────────────────────────────────────────

app.get('/api/shop/packs', requireAuth, requireAccountReady, (_request, response) => {
  const packs = Object.entries(PACK_DEFS).map(([id, def]) => ({
    id,
    cost: def.cost,
    cardCount: def.slots.length,
  }))
  response.json({ ok: true, packs })
})

app.post('/api/shop/pack', requireAuth, requireAccountReady, (request, response) => {
  const { packType } = request.body ?? {}
  const validTypes = Object.keys(PACK_DEFS)
  if (!validTypes.includes(String(packType ?? ''))) {
    response.status(400).json({ ok: false, error: 'Invalid pack type.' })
    return
  }
  const result = openPack(request.accountId, String(packType))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.get('/api/me/collection', requireAuth, requireAccountReady, (request, response) => {
  const collection = getCollection(request.accountId)
  response.json({ ok: true, collection: collection ?? {} })
})

app.get('/api/social', requireAuth, requireAccountReady, (request, response) => {
  response.json(getSocialOverview(request.accountId))
})

app.post('/api/social/friends', requireAuth, requireAccountReady, (request, response) => {
  const rl = checkRateLimit(`social:friend:add:${request.accountId}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many friend actions. Please try again shortly.' })
    return
  }

  const result = addFriend(request.accountId, request.body?.username)
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json({ ...result, social: getSocialOverview(request.accountId) })
})

app.delete('/api/social/friends/:friendAccountId', requireAuth, requireAccountReady, (request, response) => {
  const rl = checkRateLimit(`social:friend:remove:${request.accountId}`, 30)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many friend actions. Please try again shortly.' })
    return
  }

  const result = removeFriend(request.accountId, request.params.friendAccountId)
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/social/clan/create', requireAuth, requireAccountReady, (request, response) => {
  const rl = checkRateLimit(`social:clan:create:${request.accountId}`, 8)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many clan actions. Please try again later.' })
    return
  }

  const result = createClan(request.accountId, request.body?.name, request.body?.tag)
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/social/clan/join', requireAuth, requireAccountReady, (request, response) => {
  const rl = checkRateLimit(`social:clan:join:${request.accountId}`, 12)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many clan actions. Please try again later.' })
    return
  }

  const result = joinClanByInvite(request.accountId, request.body?.inviteCode)
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/social/clan/leave', requireAuth, requireAccountReady, (request, response) => {
  const rl = checkRateLimit(`social:clan:leave:${request.accountId}`, 12)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many clan actions. Please try again later.' })
    return
  }

  const result = leaveClan(request.accountId)
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

// ─── Trading (friends-only v1) ───────────────────────────────────────────────

app.get('/api/trades', requireAuth, requireAccountReady, (request, response) => {
  const trades = listTradesForAccount(request.accountId)
  response.json({ ok: true, trades })
})

app.post('/api/trades/propose', requireAuth, requireAccountReady, (request, response) => {
  const rl = checkRateLimit(`trade:propose:${request.accountId}`, 10)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many trade proposals. Slow down.' })
    return
  }
  const toAccountId = String(request.body?.toAccountId ?? '')
  const offer = Array.isArray(request.body?.offer) ? request.body.offer : []
  const requestedCards = Array.isArray(request.body?.request) ? request.body.request : []
  const result = proposeTrade(request.accountId, toAccountId, offer, requestedCards)
  if (!result.ok) {
    response.status(result.status ?? 400).json(result)
    return
  }
  // Notify the target if online.
  emitToAccount(toAccountId, 'trade:incoming', { tradeId: result.tradeId })
  response.status(201).json(result)
})

app.post('/api/trades/:id/accept', requireAuth, requireAccountReady, (request, response) => {
  const rl = checkRateLimit(`trade:accept:${request.accountId}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many trade actions. Please try again later.' })
    return
  }
  const tradeId = String(request.params?.id ?? '')
  const result = acceptTrade(request.accountId, tradeId)
  if (!result.ok) {
    response.status(result.status ?? 400).json(result)
    return
  }
  const trade = getTradeById(tradeId)
  if (trade) {
    emitToAccount(trade.fromAccountId, 'trade:updated', { tradeId, status: 'accepted' })
  }
  response.json(result)
})

app.post('/api/trades/:id/reject', requireAuth, requireAccountReady, (request, response) => {
  const tradeId = String(request.params?.id ?? '')
  const result = cancelTrade(request.accountId, tradeId, 'rejected')
  if (!result.ok) {
    response.status(result.status ?? 400).json(result)
    return
  }
  const trade = getTradeById(tradeId)
  if (trade) emitToAccount(trade.fromAccountId, 'trade:updated', { tradeId, status: 'rejected' })
  response.json(result)
})

app.post('/api/trades/:id/cancel', requireAuth, requireAccountReady, (request, response) => {
  const tradeId = String(request.params?.id ?? '')
  const result = cancelTrade(request.accountId, tradeId, 'cancelled')
  if (!result.ok) {
    response.status(result.status ?? 400).json(result)
    return
  }
  const trade = getTradeById(tradeId)
  if (trade) emitToAccount(trade.toAccountId, 'trade:updated', { tradeId, status: 'cancelled' })
  response.json(result)
})

app.get('/api/health', (_request, response) => {
  const complaintCounts = getComplaintCounts()
  const liveSnapshot = getLiveArenaSnapshot()

  response.json({
    ok: true,
    service: 'Fractured Arcanum Arena Service',
    queueSize: liveSnapshot.queueSize,
    connectedPlayers: liveSnapshot.connectedPlayers,
    rankedAvailable: liveSnapshot.rankedAvailable,
    complaintsOpen: complaintCounts.open,
    uniqueVisitors: adminStore.totals.uniqueVisitors,
  })
})

app.get('/api/profile', (_request, response) => {
  response.json(adminStore.settings)
})

app.get('/api/privacy', (_request, response) => {
  response.json({
    ok: true,
    anonymousOnly: true,
    message:
      'Fractured Arcanum uses a local anonymous guest id for traffic and gameplay quality monitoring. No hidden personal profile, IP history, or account identity is stored by this prototype analytics system.',
    trackedFields: [
      'anonymous guest id generated on the device',
      'page and section views',
      'queue and match outcomes',
      'device size bucket',
      'complaint tickets you choose to submit',
    ],
  })
})

app.post('/api/analytics/track', rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: false, legacyHeaders: false }), (request, response) => {
  const anonymousUser = trackAnalyticsEvent(request.body ?? {})

  response.json({
    ok: true,
    anonymousUser,
  })
})

app.post('/api/complaints', (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`complaint:${hashIp(ip)}`, 5)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many complaints. Try again later.' })
    return
  }

  const visitorId = String(request.body?.visitorId ?? 'guest')
  const category = String(request.body?.category ?? 'gameplay').slice(0, 40)
  const severity = String(request.body?.severity ?? 'normal').slice(0, 20)
  const summary = String(request.body?.summary ?? '').trim().slice(0, 120)
  const details = String(request.body?.details ?? '').trim().slice(0, 1200)
  const page = String(request.body?.page ?? 'arena').slice(0, 40)
  const sessionId = String(request.body?.sessionId ?? '')
  const anonymousUser = anonymizeVisitorId(visitorId)

  if (!summary || !details) {
    response.status(400).json({
      ok: false,
      message: 'Please include a short summary and clear complaint details.',
    })
    return
  }

  const complaint = {
    id: `CMP-${randomUUID().slice(0, 8).toUpperCase()}`,
    anonymousUser,
    category,
    severity,
    summary,
    details,
    page,
    status: 'open',
    createdAt: new Date().toISOString(),
    updates: [
      {
        at: new Date().toISOString(),
        note: 'Complaint submitted by player.',
      },
    ],
  }

  const { visitor } = ensureVisitor(visitorId, sessionId, page, 'unknown')
  visitor.complaints += 1
  adminStore.complaints.unshift(complaint)
  // Cap stored complaints to prevent unbounded growth
  if (adminStore.complaints.length > 500) {
    adminStore.complaints = adminStore.complaints.slice(0, 500)
  }
  pushActivity('complaint_submit', {
    route: page,
    anonymousUser,
    meta: { category, severity, complaintId: complaint.id },
  })
  debouncedSaveAdminStore()

  response.status(201).json({
    ok: true,
    complaintId: complaint.id,
    status: complaint.status,
  })
})

app.get('/api/admin/overview', requireAdminRole, (request, response) => {
  response.json({
    ...buildAdminOverview(),
    viewer: { accountId: request.accountId, role: request.role, displayName: request.displayName },
  })
})

app.post('/api/admin/settings', requireAdminRole, (request, response) => {
  adminStore.settings = {
    motd: String(request.body?.motd ?? adminStore.settings.motd).slice(0, 160),
    quest: String(request.body?.quest ?? adminStore.settings.quest).slice(0, 120),
    featuredMode: String(request.body?.featuredMode ?? adminStore.settings.featuredMode).slice(0, 60),
    maintenanceMode: Boolean(request.body?.maintenanceMode),
  }

  pushActivity('admin_settings_updated', {
    route: 'admin',
    anonymousUser: request.accountId ?? 'admin',
    meta: {
      maintenanceMode: adminStore.settings.maintenanceMode,
      featuredMode: adminStore.settings.featuredMode,
    },
  })
  recordAudit(request.accountId, null, 'settings_updated', {
    maintenanceMode: adminStore.settings.maintenanceMode,
    featuredMode: adminStore.settings.featuredMode,
    motd: adminStore.settings.motd.slice(0, 60),
  }, hashIp(clientIp(request)))
  saveAdminStore()
  io.emit('server:profileUpdated', adminStore.settings)
  debouncedSaveAdminStore()

  response.json({
    ok: true,
    settings: adminStore.settings,
  })
})

app.post('/api/admin/complaints/:id', requireAdminRole, (request, response) => {
  const complaint = adminStore.complaints.find((item) => item.id === request.params.id)

  if (!complaint) {
    response.status(404).json({
      ok: false,
      message: 'Complaint not found.',
    })
    return
  }

  const nextStatus = String(request.body?.status ?? complaint.status)
  const note = String(request.body?.note ?? '').trim().slice(0, 240)

  complaint.status = nextStatus

  if (note) {
    complaint.updates.unshift({
      at: new Date().toISOString(),
      note,
    })
  }

  pushActivity('complaint_status_updated', {
    route: 'admin',
    anonymousUser: 'admin',
    meta: {
      complaintId: complaint.id,
      status: nextStatus,
    },
  })
  saveAdminStore()

  response.json({
    ok: true,
    complaint,
  })
})

// ─── Role management (admin + owner) ────────────────────────────────────────

const adminWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: false,
  legacyHeaders: false,
})
const ownerTransferLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: false,
  legacyHeaders: false,
})

// Any admin-or-owner may list accounts (for moderation search / audit UI).
app.get('/api/admin/users', requireAdminRole, (request, response) => {
  const users = listAccounts({
    search: String(request.query?.search ?? ''),
    limit: Number(request.query?.limit ?? 25),
    offset: Number(request.query?.offset ?? 0),
  })
  response.json({ ok: true, users })
})

// Only the owner can promote/demote admins.
app.post('/api/admin/users/:accountId/role', requireOwnerRole, requireRecentPasskeyAuth, adminWriteLimiter, (request, response) => {
  const targetAccountId = String(request.params?.accountId ?? '')
  const newRole = String(request.body?.role ?? '')
  const result = setAccountRole(request.accountId, targetAccountId, newRole, {
    ipHash: hashIp(clientIp(request)),
  })
  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }

  pushActivity('admin_role_change', {
    route: 'admin',
    anonymousUser: request.accountId,
    meta: { targetAccountId, newRole, previousRole: result.previousRole },
  })

  // Notify the affected user (if online) so their UI refreshes privileges.
  try {
    io.sockets.sockets.forEach((socket) => {
      if (socket.data?.accountId === targetAccountId) {
        socket.emit('server:role_changed', { role: newRole })
      }
    })
  } catch { /* non-fatal */ }

  response.json(result)
})

// Owner-only, rate-limited (3/hour), recent-passkey gated ownership transfer.
app.post('/api/admin/owner/transfer', requireOwnerRole, requireRecentPasskeyAuth, ownerTransferLimiter, (request, response) => {
  const targetAccountId = String(request.body?.targetAccountId ?? '')
  const result = transferOwnership(request.accountId, targetAccountId, {
    ipHash: hashIp(clientIp(request)),
  })
  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }

  // Persist the new owner in server config for future recovery reference.
  try {
    const config = loadServerConfig() ?? {}
    config.adminAccountId = targetAccountId
    saveServerConfig(config)
  } catch (err) {
    console.warn('Failed to persist new owner in server config:', err?.message ?? err)
  }

  pushActivity('admin_owner_transfer', {
    route: 'admin',
    anonymousUser: request.accountId,
    meta: { previousOwnerId: request.accountId, newOwnerId: targetAccountId },
  })

  try {
    io.sockets.sockets.forEach((socket) => {
      if (socket.data?.accountId === request.accountId) {
        socket.emit('server:role_changed', { role: 'admin' })
      } else if (socket.data?.accountId === targetAccountId) {
        socket.emit('server:role_changed', { role: 'owner' })
      }
    })
  } catch { /* non-fatal */ }

  response.json(result)
})

// ─── Owner/admin account management ──────────────────────────────────────────
// Destructive and credential-affecting actions all require recent passkey
// reauth on the operator's own session, are rate limited, and write an
// admin_audit row. No endpoint here ever returns a credential for an account:
// the one-time grant code is a single-use token the player must redeem
// themselves through a WebAuthn ceremony.

app.get('/api/admin/users/:accountId', requireAdminRole, (request, response) => {
  const detail = getAdminAccountDetail(String(request.params?.accountId ?? ''))
  if (!detail) {
    response.status(404).json({ ok: false, error: 'Account not found.' })
    return
  }
  // Admins may inspect users; only the owner may inspect another admin.
  if (detail.role !== 'user' && request.role !== 'owner') {
    response.status(403).json({ ok: false, error: 'Only the owner can inspect privileged accounts.' })
    return
  }
  response.json({ ok: true, account: detail })
})

app.get('/api/admin/users/deleted/list', requireAdminRole, (request, response) => {
  response.json({
    ok: true,
    accounts: listDeletedAccounts({
      limit: Number(request.query?.limit ?? 100),
      reason: String(request.query?.reason ?? ''),
    }),
  })
})

app.post(
  '/api/admin/users/:accountId/reset-credentials',
  requireAdminRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const result = adminResetAccountCredentials(request.accountId, String(request.params?.accountId ?? ''), {
      revokePasskeys: request.body?.revokePasskeys !== false,
      note: request.body?.note,
      ttlMs: Number(request.body?.ttlMs) || undefined,
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    disconnectAccountSockets(String(request.params?.accountId ?? ''), 'credentials_reset')
    response.json(result)
  },
)

app.post(
  '/api/admin/users/:accountId/recovery-grant',
  requireAdminRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const result = adminIssueRecoveryGrant(request.accountId, String(request.params?.accountId ?? ''), {
      note: request.body?.note,
      ttlMs: Number(request.body?.ttlMs) || undefined,
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    response.json(result)
  },
)

app.post(
  '/api/admin/users/:accountId/suspend',
  requireAdminRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const targetAccountId = String(request.params?.accountId ?? '')
    const result = adminSuspendAccount(request.accountId, targetAccountId, {
      hours: request.body?.hours,
      reason: request.body?.reason,
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    disconnectAccountSockets(targetAccountId, 'account_suspended')
    response.json(result)
  },
)

app.post(
  '/api/admin/users/:accountId/unsuspend',
  requireAdminRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const result = adminUnsuspendAccount(request.accountId, String(request.params?.accountId ?? ''), {
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    response.json(result)
  },
)

app.post(
  '/api/admin/users/:accountId/delete',
  requireOwnerRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const targetAccountId = String(request.params?.accountId ?? '')
    // Typed confirmation guards against a misclick on an irreversible-feeling
    // action; the username is the thing the operator must have looked at.
    const detail = getAdminAccountDetail(targetAccountId)
    if (!detail) {
      response.status(404).json({ ok: false, error: 'Account not found.' })
      return
    }
    if (String(request.body?.confirmUsername ?? '').toLowerCase() !== detail.username.toLowerCase()) {
      response.status(400).json({ ok: false, error: 'Type the exact username to confirm deletion.' })
      return
    }
    const result = adminDeleteAccount(request.accountId, targetAccountId, {
      reason: request.body?.reason,
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    disconnectAccountSockets(targetAccountId, 'account_deleted')
    response.json(result)
  },
)

app.post(
  '/api/admin/users/:accountId/restore',
  requireOwnerRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const result = adminRestoreAccount(request.accountId, String(request.params?.accountId ?? ''), {
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    response.json(result)
  },
)

app.get('/api/admin/audit', requireAdminRole, (request, response) => {
  const limit = Number(request.query?.limit ?? 50)
  response.json({ ok: true, audit: listAudit({ limit }) })
})

// Break-glass: recover owner access by promoting any account via ADMIN_KEY.
// Intended for operators who have filesystem access to the server's config
// file (where the recovery key is stored). Rate-limited and audit-logged.
const ownerRecoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: false,
  legacyHeaders: false,
})

app.post('/api/admin/owner/recover', ownerRecoveryLimiter, requireOwnerRecoveryKey, (request, response) => {
  const targetAccountId = String(request.body?.targetAccountId ?? '')
  if (!targetAccountId) {
    response.status(400).json({ ok: false, error: 'targetAccountId is required.' })
    return
  }
  const target = getAccountById(targetAccountId)
  if (!target) {
    response.status(404).json({ ok: false, error: 'Target account not found.' })
    return
  }

  const existingOwner = findOwnerAccountId()
  const ipHash = hashIp(clientIp(request))

  // If someone else is currently the owner, demote them first — the recovery
  // key is explicitly documented as override-capable.
  let previousOwnerId = null
  if (existingOwner && existingOwner !== targetAccountId) {
    previousOwnerId = existingOwner
    const transfer = transferOwnership(existingOwner, targetAccountId, { ipHash })
    if (!transfer.ok) {
      response.status(transfer.status ?? 400).json({ ok: false, error: transfer.error })
      return
    }
  } else {
    const result = assignInitialOwner(targetAccountId, { ipHash, reason: 'recovery' })
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
  }

  recordAudit(null, targetAccountId, 'owner_recovered', { previousOwnerId }, ipHash)

  try {
    const config = loadServerConfig() ?? {}
    config.adminAccountId = targetAccountId
    saveServerConfig(config)
  } catch (err) {
    console.warn('Failed to persist recovered owner in server config:', err?.message ?? err)
  }

  response.json({ ok: true, newOwnerId: targetAccountId, previousOwnerId })
})

if (existsSync(DIST_DIR)) {
  app.use(
    express.static(DIST_DIR, {
      etag: true,
      lastModified: true,
      setHeaders: (response, filePath) => {
        if (
          filePath.endsWith('index.html') ||
          filePath.endsWith('sw.js') ||
          filePath.endsWith('manifest.webmanifest')
        ) {
          response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          response.setHeader('Pragma', 'no-cache')
          response.setHeader('Expires', '0')
          return
        }

        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          return
        }

        if (filePath.includes(`${path.sep}generated${path.sep}`)) {
          response.setHeader('Cache-Control', 'public, max-age=3600')
          return
        }

        response.setHeader('Cache-Control', 'public, max-age=300')
      },
    }),
  )

  app.get(/^(?!\/api).*/, (_request, response) => {
    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

// ─── Socket.IO rate limiting per connection ─────────────────────────────────

const socketRateLimits = new Map()

function checkSocketRate(socketId, event, maxPerMinute = 30) {
  const key = `${socketId}:${event}`
  const now = Date.now()
  let entry = socketRateLimits.get(key)
  if (!entry || now - entry.start > 60000) {
    entry = { start: now, count: 0 }
    socketRateLimits.set(key, entry)
  }
  entry.count++
  return entry.count <= maxPerMinute
}

// Clean up old socket rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of socketRateLimits) {
    if (now - entry.start > 120000) socketRateLimits.delete(key)
  }
}, 5 * 60 * 1000)

io.on('connection', (socket) => {
  socket.emit('server:hello', {
    message: adminStore.settings.maintenanceMode
      ? 'Arena maintenance is active. You can still test local matches.'
      : 'Live arena service connected.',
    seasonName: serverConfig.seasonName ?? 'Season of Whispers',
    seasonEnd: serverConfig.seasonEnd ?? null,
  })
  emitLiveArenaState(socket)

  // ─── Presence tracking: announce this account's online friends ────────
  trackPresence(socket.data.accountId, socket.id)
  try {
    const social = getSocialOverview(socket.data.accountId)
    const online = (social.friends ?? [])
      .filter((friend) => isOnline(friend.accountId))
      .map((friend) => friend.accountId)
    socket.emit('presence:snapshot', { onlineFriendIds: online })

    // Notify any friend already online that we came online.
    for (const friend of social.friends ?? []) {
      if (isOnline(friend.accountId)) {
        emitToAccount(friend.accountId, 'presence:update', {
          accountId: socket.data.accountId,
          online: true,
        })
      }
    }
  } catch {
    /* non-fatal */
  }

  const emitPersistedSettlement = (settlement) => {
    if (!settlement?.outcome) return false
    socket.emit('game:over', {
      matchId: settlement.matchId,
      roomId: settlement.matchId,
      result: settlement.outcome.result,
      reason: settlement.reason,
      serverMode: settlement.mode,
      settlement: settlement.outcome,
    })
    return true
  }

  // ─── Auto-rejoin: return a definitive active, terminal, or none state ────
  const existingRoom = getRoomByAccount(socket.data.accountId)
  if (existingRoom && existingRoom.state && !existingRoom.state.winner) {
    const accountSide = existingRoom.getSideForAccount(socket.data.accountId)
    const controllerSocketId = accountSide ? existingRoom.sockets[accountSide] : null
    const controllerConnected = controllerSocketId && io.sockets.sockets.get(controllerSocketId)?.connected
    if (controllerConnected && controllerSocketId !== socket.id) {
      socket.emit('game:controller_active', {
        matchId: existingRoom.roomId,
        error: 'This match is active in another tab or device.',
      })
    } else {
      const side = existingRoom.reconnect(socket.data.accountId, socket.id)
      if (side) {
        socket.join(existingRoom.roomId)
        const view = existingRoom.getViewForSocket(socket.id)
        const opponentSide = side === 'player' ? 'enemy' : 'player'
        const opponentDisconnected = existingRoom.mode === 'ai' ? false : existingRoom.isDisconnected(opponentSide)
        socket.emit('game:rejoin', {
          ...view,
          roomId: existingRoom.roomId,
          opponentDisconnected,
        })
        const opponentSocketId = existingRoom.sockets[opponentSide]
        if (opponentSocketId) io.sockets.sockets.get(opponentSocketId)?.emit('game:opponent_reconnected')
      }
    }
  } else if (existingRoom?.state?.winner) {
    const settlement = existingRoom.terminalSettlement
      ?? getMatchSettlementForAccount(existingRoom.roomId, socket.data.accountId)
    emitPersistedSettlement(settlement)
  } else {
    emitPersistedSettlement(getLatestUnacknowledgedSettlement(socket.data.accountId))
  }

  // ─── Manual rejoin request ───────────────────────────────────────────
  socket.on('game:rejoin', () => {
    if (!checkSocketRate(socket.id, 'game:rejoin', 20)) return

    const room = getRoomByAccount(socket.data.accountId)
    if (!room || !room.state) {
      const terminal = getLatestUnacknowledgedSettlement(socket.data.accountId)
      if (!emitPersistedSettlement(terminal)) {
        socket.emit('game:rejoin_failed', { error: 'No active game to rejoin.' })
      }
      return
    }
    if (room.state.winner) {
      emitPersistedSettlement(room.terminalSettlement ?? getMatchSettlementForAccount(room.roomId, socket.data.accountId))
      return
    }

    const accountSide = room.getSideForAccount(socket.data.accountId)
    const controllerSocketId = accountSide ? room.sockets[accountSide] : null
    if (controllerSocketId && controllerSocketId !== socket.id && io.sockets.sockets.get(controllerSocketId)?.connected) {
      socket.emit('game:rejoin_failed', { error: 'This match is active in another tab or device.' })
      return
    }

    if (!accountSide) {
      socket.emit('game:rejoin_failed', { error: 'No active game to rejoin.' })
      return
    }

    const currentSide = room.getSideForSocket(socket.id)
    if (currentSide && !room.isDisconnected(currentSide)) {
      socket.join(room.roomId)
      const view = room.getViewForSocket(socket.id)
      const opponentSide = currentSide === 'player' ? 'enemy' : 'player'
      const opponentDisconnected = room.mode === 'ai' ? false : room.isDisconnected(opponentSide)
      socket.emit('game:rejoin', {
        ...view,
        roomId: room.roomId,
        opponentDisconnected,
      })
      return
    }

    const side = room.reconnect(socket.data.accountId, socket.id)
    if (!side) {
      socket.emit('game:rejoin_failed', { error: 'Could not rejoin game.' })
      return
    }

    socket.join(room.roomId)
    const view = room.getViewForSocket(socket.id)
    const opponentSide = side === 'player' ? 'enemy' : 'player'
    const opponentDisconnected = room.mode === 'ai' ? false : room.isDisconnected(opponentSide)
    socket.emit('game:rejoin', {
      ...view,
      roomId: room.roomId,
      opponentDisconnected,
    })

    const opponentSocketId = room.sockets[opponentSide]
    if (opponentSocketId && opponentSocketId !== socket.id) {
      const opponentSocket = io.sockets.sockets.get(opponentSocketId)
      opponentSocket?.emit('game:opponent_reconnected')
    }
  })

  socket.on('game:settlement_ack', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'game:settlement_ack', 30)) return
    acknowledgeMatchSettlement(payload?.matchId, socket.data.accountId)
  })

  socket.on('game:ai_start', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'game:ai_start', 10)) return
    const accountId = socket.data.accountId
    const activeRoom = getRoomByAccount(accountId)
    if (activeRoom?.state && !activeRoom.state.winner) {
      socket.emit('game:error', { error: 'Finish or abandon the active live match first.' })
      return
    }
    if (activeRoom?.state?.winner) destroyRoom(activeRoom.roomId)

    const candidateDeck = payload?.deckConfig && typeof payload.deckConfig === 'object'
      ? payload.deckConfig
      : undefined
    const validatedDeck = validateDeckForMatch(accountId, candidateDeck)
    if (!validatedDeck.ok) {
      socket.emit('game:error', { error: validatedDeck.error ?? 'No valid deck is available.' })
      return
    }
    const profile = getProfile(accountId)
    if (!profile) {
      socket.emit('game:error', { error: 'Profile not found.' })
      return
    }

    const difficulty = ['novice', 'adept', 'veteran', 'legend'].includes(String(payload?.difficulty))
      ? String(payload.difficulty)
      : 'adept'
    const enemyName = String(payload?.enemyName ?? 'Arena Bot').slice(0, 40)
    const roomId = `room-${randomUUID().slice(0, 8)}`
    let room = null
    try {
      room = createRoom(roomId, 'ai')
      socket.join(roomId)
      removeWaitingPlayer(socket.id, accountId)
      room.startAi({
        socketId: socket.id,
        accountId,
        name: profile.display_name || socket.data.displayName || 'Rune Captain',
        deckConfig: validatedDeck.deckConfig,
      }, { enemyName, difficulty })
      socket.emit('game:start', room.getViewForSocket(socket.id))
      emitLiveArenaState()
    } catch (error) {
      if (room) destroyRoom(roomId)
      socket.leave(roomId)
      socket.emit('game:error', { error: 'Could not start the AI skirmish.' })
      console.warn('game:ai_start failed', error?.message ?? error)
    }
  })

  socket.on('queue:join', () => {
    if (!checkSocketRate(socket.id, 'queue:join', 10)) return

    const activeRoom = getRoomByAccount(socket.data.accountId)
    if (activeRoom && activeRoom.state && !activeRoom.state.winner) {
      socket.emit('queue:error', { error: 'You already have an active live match.' })
      return
    }
    if (activeRoom?.state?.winner) destroyRoom(activeRoom.roomId)

    const accountProfile = getProfile(socket.data.accountId)
    const validatedDeck = validateDeckForMatch(socket.data.accountId)
    if (!accountProfile || !validatedDeck.ok) {
      socket.emit('queue:error', { error: validatedDeck.error ?? 'No valid deck available. Build a deck first.' })
      return
    }
    const name = accountProfile.display_name || socket.data.displayName || socket.data.username || 'Rune Captain'
    const rating = Number(accountProfile.season_rating ?? 1200)
    const rank = `${getRuntimeRankLabel(rating)} Division`

    const profile = {
      name,
      rank,
      style: 'Custom Deck',
      ping: Math.floor(Math.random() * 40) + 12,
      isBot: false,
    }

    removeWaitingPlayer(socket.id, socket.data.accountId)
    waitingPlayers.push({
      id: socket.id,
      accountId: socket.data.accountId,
      rating,
      queuedAt: Date.now(),
      profile,
      deckConfig: validatedDeck.deckConfig,
    })

    adminStore.totals.queueJoins += 1
    pushActivity('queue_join', { accountId: socket.data.accountId, rank, rating })
    debouncedSaveAdminStore()

    emitLiveArenaState()
    sweepWaitingPlayers()
  })

  socket.on('queue:leave', () => {
    removeWaitingPlayer(socket.id, socket.data.accountId)
    emitLiveArenaState()
  })

  // ─── Friend challenges (unranked duels) ─────────────────────────────────

  socket.on('challenge:send', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'challenge:send', 10)) return
    const fromAccountId = socket.data.accountId
    if (!fromAccountId) {
      socket.emit('challenge:error', { error: 'Sign in to challenge friends.' })
      return
    }
    const toAccountId = String(payload?.targetAccountId ?? '')
    if (!toAccountId || toAccountId === fromAccountId) {
      socket.emit('challenge:error', { error: 'Invalid challenge target.' })
      return
    }

    // Friends-only for v1.
    if (!isFriendOf(fromAccountId, toAccountId)) {
      socket.emit('challenge:error', { error: 'You can only challenge accounts on your friends list.' })
      return
    }

    // Must be online.
    if (!isOnline(toAccountId)) {
      socket.emit('challenge:error', { error: 'That friend is offline.' })
      return
    }

    // Only one outgoing challenge at a time per account.
    if (findChallengeForAccount(fromAccountId, 'from')) {
      socket.emit('challenge:error', { error: 'You already have a pending challenge.' })
      return
    }

    // Validate the challenger's deck (server-side safety net).
    const deckCheck = validateDeckForMatch(fromAccountId)
    if (!deckCheck.ok) {
      socket.emit('challenge:error', { error: deckCheck.error ?? 'Invalid deck.' })
      return
    }

    const fromProfile = getProfile(fromAccountId)
    const toProfile = getProfile(toAccountId)
    if (!fromProfile || !toProfile) {
      socket.emit('challenge:error', { error: 'Account profile not found.' })
      return
    }

    const challenge = {
      id: `chal-${randomBytes(8).toString('hex')}`,
      fromAccountId,
      toAccountId,
      fromName: fromProfile.display_name || socket.data.displayName || 'Challenger',
      toName: toProfile.display_name || 'Friend',
      fromDeck: deckCheck.deckConfig,
      createdAt: Date.now(),
      status: 'pending',
    }
    pendingChallenges.set(challenge.id, challenge)

    socket.emit('challenge:sent', {
      challengeId: challenge.id,
      toAccountId,
      toName: challenge.toName,
      expiresAt: challenge.createdAt + CHALLENGE_TTL_MS,
    })
    emitToAccount(toAccountId, 'challenge:incoming', {
      challengeId: challenge.id,
      fromAccountId,
      fromName: challenge.fromName,
      expiresAt: challenge.createdAt + CHALLENGE_TTL_MS,
    })
  })

  socket.on('challenge:accept', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'challenge:accept', 10)) return
    const accountId = socket.data.accountId
    const challengeId = String(payload?.challengeId ?? '')
    const challenge = pendingChallenges.get(challengeId)
    if (!challenge || challenge.status !== 'pending' || challenge.toAccountId !== accountId) {
      socket.emit('challenge:error', { error: 'Challenge not found or already closed.' })
      return
    }
    if (Date.now() - challenge.createdAt > CHALLENGE_TTL_MS) {
      challenge.status = 'expired'
      emitToAccount(challenge.fromAccountId, 'challenge:expired', { challengeId: challenge.id })
      socket.emit('challenge:expired', { challengeId: challenge.id })
      return
    }
    const deckCheck = validateDeckForMatch(accountId)
    if (!deckCheck.ok) {
      socket.emit('challenge:error', { error: deckCheck.error ?? 'Invalid deck.' })
      return
    }

    // Make sure the challenger is still connected with at least one socket.
    const challengerSocketIds = presence.get(challenge.fromAccountId)
    if (!challengerSocketIds || challengerSocketIds.size === 0) {
      challenge.status = 'cancelled'
      socket.emit('challenge:error', { error: 'Challenger disconnected.' })
      return
    }
    // Pick the first still-connected socket as the "room owner" for the
    // challenger's side. If there are multiple tabs, all of them will be
    // notified via emitToAccount below so every tab's UI stays in sync.
    let challengerSocket = null
    for (const socketId of challengerSocketIds) {
      const candidate = io.sockets.sockets.get(socketId)
      if (candidate?.connected) {
        challengerSocket = candidate
        break
      }
    }
    if (!challengerSocket) {
      challenge.status = 'cancelled'
      socket.emit('challenge:error', { error: 'Challenger disconnected.' })
      return
    }

    // Make sure neither player is currently in a ranked game.
    const challengerActive = getRoomByAccount(challenge.fromAccountId)
    const accepterActive = getRoomByAccount(accountId)
    if ((challengerActive && !challengerActive.state?.winner) || (accepterActive && !accepterActive.state?.winner)) {
      socket.emit('challenge:error', { error: 'One of the players is in a live match.' })
      return
    }
    if (challengerActive?.state?.winner) destroyRoom(challengerActive.roomId)
    if (accepterActive?.state?.winner && accepterActive.roomId !== challengerActive?.roomId) {
      destroyRoom(accepterActive.roomId)
    }

    challenge.status = 'accepted'
    removeWaitingPlayer(challengerSocket.id, challenge.fromAccountId)
    removeWaitingPlayer(socket.id, accountId)

    // Start an unranked duel room. Both players must be hydrated into the
    // room and emitted their starting views.
    const roomId = `room-${randomUUID().slice(0, 8)}`
    let room = null
    try {
      room = createRoom(roomId, 'unranked')
      challengerSocket.join(roomId)
      socket.join(roomId)
      room.start(
        {
          socketId: challengerSocket.id,
          accountId: challenge.fromAccountId,
          name: challenge.fromName,
          deckConfig: challenge.fromDeck,
        },
        {
          socketId: socket.id,
          accountId: accountId,
          name: challenge.toName,
          deckConfig: deckCheck.deckConfig,
        },
      )
      const challengerView = room.getViewForSocket(challengerSocket.id)
      const accepterView = room.getViewForSocket(socket.id)
      challengerSocket.emit('challenge:matched', {
        roomId,
        opponent: { name: challenge.toName, accountId: accountId, isBot: false, rank: 'Friend', style: 'Unranked', ping: 0 },
        mode: 'unranked',
      })
      socket.emit('challenge:matched', {
        roomId,
        opponent: { name: challenge.fromName, accountId: challenge.fromAccountId, isBot: false, rank: 'Friend', style: 'Unranked', ping: 0 },
        mode: 'unranked',
      })
      challengerSocket.emit('game:start', challengerView)
      socket.emit('game:start', accepterView)
    } catch (err) {
      if (room) destroyRoom(roomId)
      challengerSocket.leave(roomId)
      socket.leave(roomId)
      challenge.status = 'cancelled'
      socket.emit('challenge:error', { error: 'Could not create the duel room.' })
      emitToAccount(challenge.fromAccountId, 'challenge:error', { error: 'Could not create the duel room.' })
      console.warn('challenge:accept room start failed', err?.message ?? err)
    }
  })

  socket.on('challenge:decline', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'challenge:decline', 20)) return
    const challenge = pendingChallenges.get(String(payload?.challengeId ?? ''))
    if (!challenge || challenge.status !== 'pending') return
    if (challenge.toAccountId !== socket.data.accountId) return
    challenge.status = 'declined'
    emitToAccount(challenge.fromAccountId, 'challenge:declined', { challengeId: challenge.id })
    socket.emit('challenge:declined', { challengeId: challenge.id })
  })

  socket.on('challenge:cancel', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'challenge:cancel', 20)) return
    const challenge = pendingChallenges.get(String(payload?.challengeId ?? ''))
    if (!challenge || challenge.status !== 'pending') return
    if (challenge.fromAccountId !== socket.data.accountId) return
    challenge.status = 'cancelled'
    emitToAccount(challenge.toAccountId, 'challenge:cancelled', { challengeId: challenge.id, reason: 'cancelled_by_sender' })
    socket.emit('challenge:cancelled', { challengeId: challenge.id, reason: 'cancelled_by_sender' })
  })

  // ─── Server-authoritative game actions ────────────────────────────────

  socket.on('game:action', (payload = {}, acknowledge = () => {}) => {
    if (!checkSocketRate(socket.id, 'game:action', 120)) {
      acknowledge({ ok: false, error: 'Too many game actions. Wait for the latest state.' })
      return
    }

    const room = getRoomBySocket(socket.id)
    if (!room) {
      socket.emit('game:error', { error: 'Not in a game room.' })
      acknowledge({ ok: false, error: 'Not in a game room.' })
      return
    }

    const action = payload?.action
    if (!action || typeof action !== 'object') {
      socket.emit('game:error', { error: 'Invalid action payload.' })
      acknowledge({ ok: false, error: 'Invalid action payload.' })
      return
    }

    const result = room.handleAction(socket.id, payload)
    if (!result.ok) {
      const view = room.getViewForSocket(socket.id)
      socket.emit('game:error', {
        error: result.error,
        matchId: room.roomId,
        revision: room.revision,
        state: view?.state,
      })
      acknowledge({ ok: false, error: result.error, revision: room.revision })
      return
    }
    acknowledge({ ok: true, duplicate: result.duplicate, revision: result.revision })
    if (result.duplicate) {
      const view = room.getViewForSocket(socket.id)
      if (view) socket.emit('game:state', view)
      return
    }

    broadcastRoomState(room)
    if (room.state?.winner) {
      finalizeRoom(room, action.type === 'surrender' ? 'surrender' : 'completed')
      return
    }

    if (room.mode === 'ai' && action.type === 'endTurn') {
      setTimeout(() => {
        const currentRoom = getRoom(room.roomId)
        if (currentRoom !== room || room.state?.winner) return
        const advanced = room.advanceAiTurn()
        if (!advanced.ok) {
          socket.emit('game:error', { matchId: room.roomId, revision: room.revision, error: advanced.error })
          return
        }
        broadcastRoomState(room)
        if (room.state?.winner) finalizeRoom(room, 'completed')
      }, 450).unref?.()
    }
  })

  socket.on('disconnect', () => {
    removeWaitingPlayer(socket.id, socket.data.accountId)
    socketRateLimits.delete(socket.id)

    // Presence: drop this socket; if it was the last one for the account,
    // notify online friends so their UI can grey out the challenge button.
    const accountId = socket.data.accountId
    if (accountId) {
      untrackPresence(accountId, socket.id)
      if (!isOnline(accountId)) {
        try {
          const social = getSocialOverview(accountId)
          for (const friend of social.friends ?? []) {
            if (isOnline(friend.accountId)) {
              emitToAccount(friend.accountId, 'presence:update', {
                accountId,
                online: false,
              })
            }
          }
        } catch { /* non-fatal */ }
      }
      if (!isOnline(accountId)) {
        // A challenge belongs to the account, not one browser tab.
        for (const challenge of pendingChallenges.values()) {
          if (challenge.status !== 'pending') continue
          if (challenge.fromAccountId === accountId || challenge.toAccountId === accountId) {
            challenge.status = 'cancelled'
            const other = challenge.fromAccountId === accountId ? challenge.toAccountId : challenge.fromAccountId
            emitToAccount(other, 'challenge:cancelled', { challengeId: challenge.id, reason: 'disconnected' })
          }
        }
      }
    }

    emitLiveArenaState()

    // Handle in-progress game disconnection with reconnect grace period
    const room = handleDisconnect(socket.id)
    if (room && room.state && !room.state.winner) {
      const disconnectedSide = room.getSideForAccount(socket.data.accountId)
      if (!disconnectedSide) return
      const remainingSide = disconnectedSide === 'player' ? 'enemy' : 'player'

      // Notify remaining player that opponent disconnected
      const remainingSocketId = room.sockets[remainingSide]
      if (remainingSocketId) {
        const remainingSocket = io.sockets.sockets.get(remainingSocketId)
        remainingSocket?.emit('game:opponent_disconnected', {
          gracePeriodMs: RECONNECT_GRACE_MS,
        })
      }

      // Start forfeit timer — if disconnected player doesn't reconnect in time, they lose
      room.forfeitTimers[disconnectedSide] = setTimeout(() => {
        // Double-check: still disconnected and game not over
        if (!room.isDisconnected(disconnectedSide) || room.state?.winner) return

        const finalized = room.finalizeForfeit(disconnectedSide)
        if (!finalized.ok) return
        broadcastRoomState(room)
        finalizeRoom(room, 'disconnect_forfeit')
      }, RECONNECT_GRACE_MS)
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`Fractured Arcanum arena service listening on http://localhost:${PORT}`)
})

// ─── Graceful shutdown ──────────────────────────────────────────────────────

let shutdownStarted = false

function shutdown(signal) {
  if (shutdownStarted) return
  shutdownStarted = true
  console.log(`\n${signal} received. Shutting down gracefully...`)

  // Flush any pending admin store writes
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  saveAdminStore()

  // Preserve a durable terminal record for every in-memory match before an
  // update closes sockets. No balances or ratings are deducted for this
  // maintenance no-contest path.
  for (const room of rooms.values()) {
    if (!room.state || room.state.winner) continue
    const aborted = room.finalizeAbort()
    if (aborted.ok) finalizeRoom(room, 'server_abort')
  }

  io.close(() => {
    httpServer.close(() => {
      console.log('Server closed.')
      process.exit(0)
    })
  })

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout.')
    process.exit(1)
  }, 10000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
