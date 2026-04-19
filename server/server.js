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
  purchaseTheme,
  resolveMatchResult,
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
  listAudit,
  recordAudit,
  getAccountById,
  verifyPassword,
} from './db.js'
import {
  createRoom,
  getRoom,
  getRoomBySocket,
  getRoomByAccount,
  handleDisconnect,
  destroyRoom,
  RECONNECT_GRACE_MS,
} from './game-room.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '../dist')
const DATA_DIR = path.resolve(__dirname, '../data')
const ADMIN_STORE_PATH = path.join(DATA_DIR, 'arena-admin-store.json')
const SERVER_CONFIG_PATH = path.join(DATA_DIR, 'server-config.json')
const CLIENT_ORIGINS = process.env.CLIENT_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean) ?? []

const DEFAULT_PORT = 43173
const PORT = Number(process.env.PORT ?? DEFAULT_PORT)

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

function createDefaultAdminStore() {
  return {
    updatedAt: new Date().toISOString(),
    settings: {
      motd: 'Season of Runes is live. Queue up and climb the ladder.',
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

function getMatchmakingRating(value) {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return Math.max(800, Math.min(2200, Math.round(numeric)))
  }
  return 1200
}

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

  if (!playerSocket?.connected || !otherSocket?.connected) {
    return false
  }

  const roomId = `room-${randomUUID().slice(0, 8)}`

  try {
    const room = createRoom(roomId)

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
    playerSocket.emit('queue:error', { error: 'Could not create a live match. Please keep waiting.' })
    otherSocket.emit('queue:error', { error: 'Could not create a live match. Please keep waiting.' })
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

    if (!startRankedMatch(entry, matchedPlayer)) {
      waitingPlayers.push(entry, matchedPlayer)
      return
    }

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
    request.accountId = session.account_id
    request.displayName = session.display_name
    request.username = session.username
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
  next()
}

function clientIp(request) {
  const ip = request.ip ?? request.socket?.remoteAddress ?? '0.0.0.0'
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

function clientUserAgent(request) {
  return String(request.get('user-agent') ?? '').slice(0, 512)
}

// ─── Account endpoints ─────────────────────────────────────────────────────

app.post('/api/auth/signup', (request, response) => {
  const ip = clientIp(request)
  const userAgent = clientUserAgent(request)
  const { username, password, displayName, deviceFingerprint } = request.body ?? {}
  const fingerprintHash = hashFingerprint(String(deviceFingerprint ?? ''))
  const rl = checkRateLimit(`signup:${hashIp(ip)}`, 5)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many signup attempts. Try again later.' })
    return
  }

  if (fingerprintHash) {
    const fingerprintRateLimit = checkRateLimit(`signup-fp:${fingerprintHash}`, 3)
    if (!fingerprintRateLimit.allowed) {
      response.status(429).json({ ok: false, error: 'Too many signup attempts from this device. Try again later.' })
      return
    }
  }

  const result = createAccount(
    String(username ?? ''),
    String(password ?? ''),
    String(displayName ?? username ?? ''),
    String(deviceFingerprint ?? ''),
    ip,
    userAgent,
  )

  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }

  const session = createSession(result.accountId, ip)
  const profile = getProfile(result.accountId)

  response.status(201).json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    profile: sanitizeProfile(profile, username, result.accountId),
  })
})

app.post('/api/auth/login', (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`login:${hashIp(ip)}`, 10)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many login attempts. Try again later.' })
    return
  }

  const { username, password } = request.body ?? {}
  const result = authenticateAccount(String(username ?? ''), String(password ?? ''))
  if (!result.ok) {
    response.status(401).json(result)
    return
  }

  const session = createSession(result.accountId, ip)
  const profile = getProfile(result.accountId)

  response.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    profile: sanitizeProfile(profile, username, result.accountId),
  })
})

app.post('/api/auth/logout', (request, response) => {
  // Idempotent: always succeed so clients can clear local state even if
  // the token is already expired or missing.
  const token = request.get('authorization')?.replace('Bearer ', '')
  if (token) destroySession(token)
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

    const session = createSession(result.accountId, ip)
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
  return {
    accountId: resolvedAccountId,
    displayName: profile.display_name ?? username ?? '',
    username: username ?? '',
    role: resolvedRole,
    runes: profile.runes,
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

app.post('/api/me/deck', requireAuth, (request, response) => {
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

app.get('/api/me/decks', requireAuth, (request, response) => {
  const decks = listDecks(request.accountId)
  response.json({ ok: true, decks })
})

app.post('/api/me/decks', requireAuth, (request, response) => {
  const { name, deckConfig } = request.body ?? {}
  const result = createDeck(request.accountId, String(name ?? '').slice(0, 50), deckConfig ?? {})
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.patch('/api/me/decks/:deckId', requireAuth, (request, response) => {
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

app.post('/api/me/decks/:deckId/rename', requireAuth, (request, response) => {
  const { deckId } = request.params
  const { name } = request.body ?? {}
  const result = renameDeck(request.accountId, String(deckId), String(name ?? '').slice(0, 50))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.delete('/api/me/decks/:deckId', requireAuth, (request, response) => {
  const { deckId } = request.params
  const result = deleteDeck(request.accountId, String(deckId))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/me/decks/:deckId/select', requireAuth, (request, response) => {
  const { deckId } = request.params
  const result = selectActiveDeck(request.accountId, String(deckId))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

// ─── Shard breakdown of excess cards ────────────────────────────────

app.post('/api/cards/breakdown', requireAuth, (request, response) => {
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

app.get('/api/shop/borders', requireAuth, (_request, response) => {
  response.json({ ok: true, borders: listCardBorders() })
})

app.post('/api/shop/border', requireAuth, (request, response) => {
  const { borderId } = request.body ?? {}
  const result = purchaseCardBorder(request.accountId, String(borderId ?? ''))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/me/border', requireAuth, (request, response) => {
  const { borderId } = request.body ?? {}
  const result = selectCardBorder(request.accountId, String(borderId ?? ''))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/me/theme', requireAuth, (request, response) => {
  const { themeId } = request.body ?? {}
  const result = selectTheme(request.accountId, String(themeId ?? ''))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/me/daily', requireAuth, (request, response) => {
  const result = claimDailyReward(request.accountId)
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/shop/theme', requireAuth, (request, response) => {
  const { themeId } = request.body ?? {}
  const result = purchaseTheme(request.accountId, String(themeId ?? ''))
  if (!result.ok) {
    response.status(400).json(result)
    return
  }
  response.json(result)
})

app.post('/api/match/complete', requireAuth, (request, response) => {
  const rl = checkRateLimit(`match:${request.accountId}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many match reports. Slow down.' })
    return
  }

  const { opponent, mode, result, turns } = request.body ?? {}
  if (!['win', 'loss', 'draw'].includes(result)) {
    response.status(400).json({ ok: false, error: 'Invalid match result.' })
    return
  }
  if (String(mode) === 'duel') {
    response.status(400).json({ ok: false, error: 'Duel results are resolved by the server.' })
    return
  }
  const safeMode = ['ai', 'ranked'].includes(String(mode)) ? String(mode) : 'ai'
  const safeOpponent = String(opponent ?? 'Unknown').slice(0, 40) || 'Unknown'
  const rawTurns = Number(turns ?? 0)
  const safeTurns = Number.isFinite(rawTurns)
    ? Math.min(200, Math.max(0, Math.floor(rawTurns)))
    : 0
  const outcome = resolveMatchResult(
    request.accountId,
    safeOpponent,
    safeMode,
    String(result),
    safeTurns,
  )
  if (!outcome.ok) {
    response.status(400).json(outcome)
    return
  }
  response.json(outcome)
})

app.get('/api/me/matches', requireAuth, (request, response) => {
  const matches = getRecentMatches(request.accountId)
  response.json({ ok: true, matches })
})

app.get('/api/leaderboard', (_request, response) => {
  const entries = getLeaderboard()
  response.json({ ok: true, entries })
})

// ─── Card Pack endpoints ────────────────────────────────────────────────────

app.get('/api/shop/packs', requireAuth, (_request, response) => {
  const packs = Object.entries(PACK_DEFS).map(([id, def]) => ({
    id,
    cost: def.cost,
    cardCount: def.slots.length,
  }))
  response.json({ ok: true, packs })
})

app.post('/api/shop/pack', requireAuth, (request, response) => {
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

app.get('/api/me/collection', requireAuth, (request, response) => {
  const collection = getCollection(request.accountId)
  response.json({ ok: true, collection: collection ?? {} })
})

app.get('/api/social', requireAuth, (request, response) => {
  response.json(getSocialOverview(request.accountId))
})

app.post('/api/social/friends', requireAuth, (request, response) => {
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
  response.json(result)
})

app.delete('/api/social/friends/:friendAccountId', requireAuth, (request, response) => {
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

app.post('/api/social/clan/create', requireAuth, (request, response) => {
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

app.post('/api/social/clan/join', requireAuth, (request, response) => {
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

app.post('/api/social/clan/leave', requireAuth, (request, response) => {
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

app.get('/api/trades', requireAuth, (request, response) => {
  const trades = listTradesForAccount(request.accountId)
  response.json({ ok: true, trades })
})

app.post('/api/trades/propose', requireAuth, (request, response) => {
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

app.post('/api/trades/:id/accept', requireAuth, (request, response) => {
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

app.post('/api/trades/:id/reject', requireAuth, (request, response) => {
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

app.post('/api/trades/:id/cancel', requireAuth, (request, response) => {
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
app.post('/api/admin/users/:accountId/role', requireOwnerRole, adminWriteLimiter, (request, response) => {
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

// Owner-only, rate-limited (3/hour), password-gated ownership transfer.
app.post('/api/admin/owner/transfer', requireOwnerRole, ownerTransferLimiter, (request, response) => {
  const targetAccountId = String(request.body?.targetAccountId ?? '')
  const password = String(request.body?.password ?? '')
  if (!password) {
    response.status(400).json({ ok: false, error: 'Password confirmation required.' })
    return
  }
  const actor = getAccountById(request.accountId)
  if (!actor || !verifyPassword(password, actor.password_hash)) {
    // Audit even on failure to surface brute-force attempts.
    recordAudit(request.accountId, targetAccountId || null, 'ownership_transfer_failed', { reason: 'bad_password' }, hashIp(clientIp(request)))
    response.status(401).json({ ok: false, error: 'Password is incorrect.' })
    return
  }
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

  // ─── Auto-rejoin: check if this account has an active ranked game ────
  const existingRoom = getRoomByAccount(socket.data.accountId)
  if (existingRoom && existingRoom.state && !existingRoom.state.winner) {
    const side = existingRoom.reconnect(socket.data.accountId, socket.id)
    if (side) {
      socket.join(existingRoom.roomId)
      const view = existingRoom.getViewForSocket(socket.id)
      const opponentSide = side === 'player' ? 'enemy' : 'player'
      const opponentDisconnected = existingRoom.isDisconnected(opponentSide)
      socket.emit('game:rejoin', {
        ...view,
        roomId: existingRoom.roomId,
        opponentDisconnected,
      })
      // Notify the opponent that this player reconnected
      const opponentSocketId = existingRoom.sockets[opponentSide]
      if (opponentSocketId) {
        const opponentSocket = io.sockets.sockets.get(opponentSocketId)
        opponentSocket?.emit('game:opponent_reconnected')
      }
    }
  }

  // ─── Manual rejoin request ───────────────────────────────────────────
  socket.on('game:rejoin', () => {
    if (!checkSocketRate(socket.id, 'game:rejoin', 20)) return

    const room = getRoomByAccount(socket.data.accountId)
    if (!room || !room.state || room.state.winner) {
      socket.emit('game:rejoin_failed', { error: 'No active game to rejoin.' })
      return
    }

    const currentSide = room.getSideForSocket(socket.id)
    if (currentSide && !room.isDisconnected(currentSide)) {
      socket.join(room.roomId)
      const view = room.getViewForSocket(socket.id)
      const opponentSide = currentSide === 'player' ? 'enemy' : 'player'
      const opponentDisconnected = room.isDisconnected(opponentSide)
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
    const opponentDisconnected = room.isDisconnected(opponentSide)
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

  socket.on('queue:join', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'queue:join', 10)) return

    const activeRoom = getRoomByAccount(socket.data.accountId)
    if (activeRoom && activeRoom.state && !activeRoom.state.winner) {
      socket.emit('queue:error', { error: 'You already have an active live match.' })
      return
    }

    const name = socket.data.displayName || socket.data.username || 'Rune Captain'
    const rank = typeof payload.rank === 'string' ? payload.rank.slice(0, 20) : 'Bronze I'
    const rating = getMatchmakingRating(payload.rating)

    const rawDeck = payload.deckConfig
    const deckValidation = rawDeck && typeof rawDeck === 'object' ? validateDeckConfig(rawDeck) : { ok: false }
    const deckConfig = deckValidation.ok ? rawDeck : null

    let finalDeck = deckConfig
    if (!finalDeck) {
      const profile = getProfile(socket.data.accountId)
      finalDeck = profile?.deck_config && typeof profile.deck_config === 'object'
        ? profile.deck_config
        : null
    }

    if (!finalDeck) {
      socket.emit('queue:error', { error: 'No valid deck available. Build a deck first.' })
      return
    }

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
      deckConfig: finalDeck,
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
    const deckConfig = payload?.deckConfig
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
    const deckCheck = validateDeckConfig(deckConfig ?? {})
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
      fromDeck: deckConfig,
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
    const deckConfig = payload?.deckConfig
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
    const deckCheck = validateDeckConfig(deckConfig ?? {})
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

    challenge.status = 'accepted'

    // Start an unranked duel room. Both players must be hydrated into the
    // room and emitted their starting views.
    const roomId = `room-${randomUUID().slice(0, 8)}`
    try {
      const room = createRoom(roomId, 'unranked')
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
          deckConfig,
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

  socket.on('game:action', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'game:action', 120)) return

    const room = getRoomBySocket(socket.id)
    if (!room) {
      socket.emit('game:error', { error: 'Not in a game room.' })
      return
    }

    const action = payload?.action
    if (!action || typeof action !== 'object') {
      socket.emit('game:error', { error: 'Invalid action payload.' })
      return
    }

    const result = room.handleAction(socket.id, action)
    if (!result.ok) {
      socket.emit('game:error', { error: result.error })
      return
    }

    // Broadcast updated state to both players
    const playerSocket = io.sockets.sockets.get(room.sockets.player)
    const enemySocket = io.sockets.sockets.get(room.sockets.enemy)

    const playerView = room.getViewForSocket(room.sockets.player)
    const enemyView = room.getViewForSocket(room.sockets.enemy)

    playerSocket?.emit('game:state', playerView)
    enemySocket?.emit('game:state', enemyView)

    // Check for game over
    if (room.state?.winner) {
      const winner = room.state.winner
      const playerAccountId = room.accounts.player
      const enemyAccountId = room.accounts.enemy
      const turns = room.state.turnNumber

      // Resolve match results for both players
      const mode = room.mode ?? 'duel'
      if (winner === 'draw') {
        if (playerAccountId) resolveMatchResult(playerAccountId, room.names.enemy, mode, 'draw', turns)
        if (enemyAccountId) resolveMatchResult(enemyAccountId, room.names.player, mode, 'draw', turns)
        playerSocket?.emit('game:over', { winner: 'draw', result: 'draw' })
        enemySocket?.emit('game:over', { winner: 'draw', result: 'draw' })
      } else {
        const winnerAccountId = room.accounts[winner]
        const loserSide = winner === 'player' ? 'enemy' : 'player'
        const loserAccountId = room.accounts[loserSide]

        if (winnerAccountId) resolveMatchResult(winnerAccountId, room.names[loserSide], mode, 'win', turns)
        if (loserAccountId) resolveMatchResult(loserAccountId, room.names[winner], mode, 'loss', turns)

        playerSocket?.emit('game:over', {
          winner,
          result: winner === 'player' ? 'win' : 'loss',
        })
        enemySocket?.emit('game:over', {
          winner,
          result: winner === 'enemy' ? 'win' : 'loss',
        })
      }

      trackAnalyticsEvent({ type: 'match_complete', route: 'battle', meta: { winner, mode } })
      emitLiveArenaState()

      // Clean up room after a delay to let clients process the result
      setTimeout(() => destroyRoom(room.roomId), 10000)
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
      // Cancel any outstanding outgoing/incoming challenges for this account.
      for (const challenge of pendingChallenges.values()) {
        if (challenge.status !== 'pending') continue
        if (challenge.fromAccountId === accountId || challenge.toAccountId === accountId) {
          challenge.status = 'cancelled'
          const other = challenge.fromAccountId === accountId ? challenge.toAccountId : challenge.fromAccountId
          emitToAccount(other, 'challenge:cancelled', { challengeId: challenge.id, reason: 'disconnected' })
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

        const remainingSocketId2 = room.sockets[remainingSide]
        if (remainingSocketId2) {
          const remainingSocket = io.sockets.sockets.get(remainingSocketId2)
          remainingSocket?.emit('game:over', {
            winner: remainingSide,
            result: 'win',
            reason: 'opponent_disconnected',
          })
        }

        // Award win to remaining player, loss to disconnected player
        const winnerAccountId = room.accounts[remainingSide]
        const loserAccountId = room.accounts[disconnectedSide]
        const turns = room.state.turnNumber

        if (winnerAccountId) resolveMatchResult(winnerAccountId, room.names[disconnectedSide], room.mode ?? 'duel', 'win', turns)
        if (loserAccountId) resolveMatchResult(loserAccountId, room.names[remainingSide], room.mode ?? 'duel', 'loss', turns)

        destroyRoom(room.roomId)
      }, RECONNECT_GRACE_MS)
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`Fractured Arcanum arena service listening on http://localhost:${PORT}`)
})

// ─── Graceful shutdown ──────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`)

  // Flush any pending admin store writes
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  saveAdminStore()

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
