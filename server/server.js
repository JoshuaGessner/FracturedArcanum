import compression from 'compression'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
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
  selectTheme,
  claimDailyReward,
  purchaseTheme,
  resolveMatchResult,
  getRecentMatches,
  getLeaderboard,
  getCollection,
  openPack,
  PACK_DEFS,
} from './db.js'
import {
  createRoom,
  getRoom,
  getRoomBySocket,
  handleDisconnect,
  destroyRoom,
} from './game-room.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '../dist')
const DATA_DIR = path.resolve(__dirname, '../data')
const ADMIN_STORE_PATH = path.join(DATA_DIR, 'arena-admin-store.json')
const CLIENT_ORIGINS = process.env.CLIENT_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean) ?? []

const DEFAULT_PORT = 43173
const PORT = Number(process.env.PORT ?? DEFAULT_PORT)
const ADMIN_KEY = (process.env.ADMIN_KEY ?? '').trim()

if (process.env.NODE_ENV === 'production' && !ADMIN_KEY) {
  console.warn('WARNING: ADMIN_KEY is not set. Admin console access is disabled until a secure value is configured.')
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

const botProfiles = [
  { name: 'Arena Bot', rank: 'Silver II', style: 'Adaptive Tempo', ping: 12 },
  { name: 'Rune Sentinel', rank: 'Gold IV', style: 'Guard Control', ping: 15 },
]

let waitingPlayer = null

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
      emotes: 0,
    },
    visitors: {},
    pageViews: {},
    deviceBuckets: {},
    dailyTraffic: {},
    complaints: [],
    activity: [],
  }
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
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

function getBotProfile() {
  return botProfiles[Math.floor(Math.random() * botProfiles.length)]
}

function removeWaitingPlayer(socketId) {
  if (!waitingPlayer || waitingPlayer.id !== socketId) {
    return
  }

  if (waitingPlayer.timer) {
    clearTimeout(waitingPlayer.timer)
  }

  waitingPlayer = null
}

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
      sessions: 0,
      events: 0,
      matches: 0,
      complaints: 0,
      installs: 0,
      lastSessionId: '',
    }
  }

  const visitor = adminStore.visitors[anonymousUser]

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
  const screen = String(meta.screen ?? 'unknown')
  const dayKey = new Date().toISOString().slice(0, 10)
  const { anonymousUser, visitor } = ensureVisitor(visitorId, sessionId, route, screen)

  visitor.events += 1
  adminStore.totals.events += 1

  if (type === 'page_view') {
    adminStore.totals.pageViews += 1
    adminStore.pageViews[route] = (adminStore.pageViews[route] ?? 0) + 1
    adminStore.dailyTraffic[dayKey] = (adminStore.dailyTraffic[dayKey] ?? 0) + 1
    adminStore.deviceBuckets[screen] = (adminStore.deviceBuckets[screen] ?? 0) + 1
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

  if (type === 'emote') {
    adminStore.totals.emotes += 1
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
      queueSize: waitingPlayer ? 1 : 0,
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

function requireAdmin(request, response, next) {
  const providedKey = request.get('x-admin-key')

  if (!providedKey || providedKey !== ADMIN_KEY) {
    response.status(401).json({
      ok: false,
      message: 'A valid admin key is required for the operations console.',
    })
    return
  }

  next()
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
  return request.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.ip ?? '0.0.0.0'
}

// ─── Account endpoints ─────────────────────────────────────────────────────

app.post('/api/auth/signup', (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`signup:${hashIp(ip)}`, 5)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many signup attempts. Try again later.' })
    return
  }

  const { username, password, displayName, deviceFingerprint } = request.body ?? {}
  const result = createAccount(
    String(username ?? ''),
    String(password ?? ''),
    String(displayName ?? username ?? ''),
    String(deviceFingerprint ?? ''),
  )

  if (!result.ok) {
    response.status(400).json(result)
    return
  }

  const session = createSession(result.accountId, ip)
  const profile = getProfile(result.accountId)

  response.status(201).json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    profile: sanitizeProfile(profile, username),
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
    profile: sanitizeProfile(profile, username),
  })
})

app.post('/api/auth/logout', (request, response) => {
  // Idempotent: always succeed so clients can clear local state even if
  // the token is already expired or missing.
  const token = request.get('authorization')?.replace('Bearer ', '')
  if (token) destroySession(token)
  response.json({ ok: true })
})

function sanitizeProfile(profile, username) {
  if (!profile) return null
  return {
    username: username ?? '',
    runes: profile.runes,
    seasonRating: profile.season_rating,
    wins: profile.wins,
    losses: profile.losses,
    streak: profile.streak,
    deckConfig: profile.deck_config,
    ownedThemes: profile.owned_themes,
    selectedTheme: profile.selected_theme,
    lastDaily: profile.last_daily,
    totalEarned: profile.total_earned,
  }
}

// ─── Player profile/economy endpoints (all require auth) ────────────────────

app.get('/api/me', requireAuth, (request, response) => {
  const profile = getProfile(request.accountId)
  response.json({
    ok: true,
    profile: sanitizeProfile(profile, request.username),
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
  const safeMode = ['ai', 'duel', 'ranked'].includes(String(mode)) ? String(mode) : 'ai'
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

app.get('/api/health', (_request, response) => {
  const complaintCounts = getComplaintCounts()

  response.json({
    ok: true,
    service: 'Fractured Arcanum Arena Service',
    queueSize: waitingPlayer ? 1 : 0,
    connectedPlayers: io.engine.clientsCount,
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

app.get('/api/admin/overview', requireAdmin, (_request, response) => {
  response.json(buildAdminOverview())
})

app.post('/api/admin/settings', requireAdmin, (request, response) => {
  adminStore.settings = {
    motd: String(request.body?.motd ?? adminStore.settings.motd).slice(0, 160),
    quest: String(request.body?.quest ?? adminStore.settings.quest).slice(0, 120),
    featuredMode: String(request.body?.featuredMode ?? adminStore.settings.featuredMode).slice(0, 60),
    maintenanceMode: Boolean(request.body?.maintenanceMode),
  }

  pushActivity('admin_settings_updated', {
    route: 'admin',
    anonymousUser: 'admin',
    meta: {
      maintenanceMode: adminStore.settings.maintenanceMode,
      featuredMode: adminStore.settings.featuredMode,
    },
  })
  saveAdminStore()
  io.emit('server:profileUpdated', adminStore.settings)
  debouncedSaveAdminStore()

  response.json({
    ok: true,
    settings: adminStore.settings,
  })
})

app.post('/api/admin/complaints/:id', requireAdmin, (request, response) => {
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
  })

  socket.on('queue:join', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'queue:join', 10)) return

    const name = socket.data.displayName || socket.data.username || 'Rune Captain'
    const rank = typeof payload.rank === 'string' ? payload.rank.slice(0, 20) : 'Bronze I'

    // Validate and store deck config for server-authoritative game creation
    const rawDeck = payload.deckConfig
    const deckValidation = rawDeck && typeof rawDeck === 'object' ? validateDeckConfig(rawDeck) : { ok: false }
    const deckConfig = deckValidation.ok ? rawDeck : null

    // Fall back to the player's saved deck if no valid deck was sent
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
    }

    removeWaitingPlayer(socket.id)

    if (waitingPlayer && waitingPlayer.id !== socket.id) {
      const roomId = `room-${randomUUID().slice(0, 8)}`
      const otherSocket = io.sockets.sockets.get(waitingPlayer.id)

      try {
        const room = createRoom(roomId)

        socket.join(roomId)
        otherSocket?.join(roomId)

        room.start(
          {
            socketId: socket.id,
            accountId: socket.data.accountId,
            name,
            deckConfig: finalDeck,
          },
          {
            socketId: waitingPlayer.id,
            accountId: waitingPlayer.accountId,
            name: waitingPlayer.profile.name,
            deckConfig: waitingPlayer.deckConfig,
          },
        )

        // Send match-found + initial game state to both players
        const playerView = room.getViewForSocket(socket.id)
        const enemyView = room.getViewForSocket(waitingPlayer.id)

        socket.emit('queue:matched', { roomId, opponent: waitingPlayer.profile })
        otherSocket?.emit('queue:matched', { roomId, opponent: profile })

        socket.emit('game:start', playerView)
        otherSocket?.emit('game:start', enemyView)
      } catch {
        socket.emit('queue:error', { error: 'Could not create game room. Try again.' })
      }

      clearTimeout(waitingPlayer.timer)
      waitingPlayer = null
      return
    }

    const timer = setTimeout(() => {
      if (!waitingPlayer || waitingPlayer.id !== socket.id) {
        return
      }

      socket.emit('queue:matched', {
        roomId: `bot-${randomUUID().slice(0, 6)}`,
        opponent: getBotProfile(),
      })

      waitingPlayer = null
    }, 12000)

    waitingPlayer = {
      id: socket.id,
      accountId: socket.data.accountId,
      profile,
      deckConfig: finalDeck,
      timer,
    }

    socket.emit('queue:searching', { ok: true })
  })

  socket.on('queue:leave', () => {
    removeWaitingPlayer(socket.id)
  })

  socket.on('room:emote', ({ roomId, emote, from } = {}) => {
    if (!checkSocketRate(socket.id, 'room:emote', 20)) return
    if (!roomId || typeof roomId !== 'string') return
    if (!socket.rooms.has(roomId)) return
    const safeEmote = typeof emote === 'string' ? emote.slice(0, 30) : ''
    const safeFrom = typeof from === 'string' ? from.slice(0, 24) : ''
    socket.to(roomId).emit('room:emote', { emote: safeEmote, from: safeFrom })
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
      if (winner === 'draw') {
        if (playerAccountId) resolveMatchResult(playerAccountId, room.names.enemy, 'duel', 'draw', turns)
        if (enemyAccountId) resolveMatchResult(enemyAccountId, room.names.player, 'duel', 'draw', turns)
        playerSocket?.emit('game:over', { winner: 'draw', result: 'draw' })
        enemySocket?.emit('game:over', { winner: 'draw', result: 'draw' })
      } else {
        const winnerAccountId = room.accounts[winner]
        const loserSide = winner === 'player' ? 'enemy' : 'player'
        const loserAccountId = room.accounts[loserSide]

        if (winnerAccountId) resolveMatchResult(winnerAccountId, room.names[loserSide], 'duel', 'win', turns)
        if (loserAccountId) resolveMatchResult(loserAccountId, room.names[winner], 'duel', 'loss', turns)

        playerSocket?.emit('game:over', {
          winner,
          result: winner === 'player' ? 'win' : 'loss',
        })
        enemySocket?.emit('game:over', {
          winner,
          result: winner === 'enemy' ? 'win' : 'loss',
        })
      }

      trackAnalyticsEvent({ type: 'match_complete', route: 'battle', meta: { winner, mode: 'duel' } })

      // Clean up room after a delay to let clients process the result
      setTimeout(() => destroyRoom(room.roomId), 10000)
    }
  })

  socket.on('disconnect', () => {
    removeWaitingPlayer(socket.id)
    socketRateLimits.delete(socket.id)

    // Handle in-progress game disconnection
    const room = handleDisconnect(socket.id)
    if (room && room.state && !room.state.winner) {
      const remainingSide = room.getSideForSocket(room.sockets.player) ? 'player' :
        room.getSideForSocket(room.sockets.enemy) ? 'enemy' : null
      const disconnectedSide = remainingSide === 'player' ? 'enemy' : 'player'

      if (remainingSide) {
        const remainingSocket = io.sockets.sockets.get(room.sockets[remainingSide])
        remainingSocket?.emit('game:over', {
          winner: remainingSide,
          result: 'win',
          reason: 'opponent_disconnected',
        })

        // Award win to remaining player, loss to disconnected player
        const winnerAccountId = room.accounts[remainingSide]
        const loserAccountId = room.accounts[disconnectedSide]
        const turns = room.state.turnNumber

        if (winnerAccountId) resolveMatchResult(winnerAccountId, room.names[disconnectedSide], 'duel', 'win', turns)
        if (loserAccountId) resolveMatchResult(loserAccountId, room.names[remainingSide], 'duel', 'loss', turns)
      }

      destroyRoom(room.roomId)
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
