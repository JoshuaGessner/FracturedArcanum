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
import {
  adminStore,
  anonymizeVisitorId,
  buildAdminOverview,
  debouncedSaveAdminStore,
  ensureVisitor,
  flushAdminStore,
  getComplaintCounts,
  pruneDailyTraffic,
  pushActivity,
  saveAdminStore,
  trackAnalyticsEvent,
} from './admin-store.js'
import { createRealtime } from './realtime.js'
import { registerAccountRoutes } from './routes/account.js'
import { registerProfileRoutes } from './routes/profile.js'
import { registerShopRoutes } from './routes/shop.js'
import { registerTradingRoutes } from './routes/trading.js'
import { registerAdminRoutes } from './routes/admin.js'

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

// Live server state — presence, challenges, the matchmaking queue, reapers.
// A factory so the queue and presence map have exactly one owner; see
// realtime.js for why that matters.
const realtime = createRealtime({ io, matchIdleTimeoutMs: MATCH_IDLE_TIMEOUT_MS })
const {
  trackPresence,
  untrackPresence,
  isOnline,
  emitToAccount,
  disconnectAccountSockets,
  findChallengeForAccount,
  reapChallenges,
  pendingChallenges,
  CHALLENGE_TTL_MS,
  runLegacyMigrationExpiration,
  runAbandonedSignupReaper,
  getAllowedMatchDelta,
  getLiveArenaSnapshot,
  emitWaitingQueueState,
  emitLiveArenaState,
  enqueueWaitingPlayer,
  removeWaitingPlayer,
  getRuntimeRankLabel,
  roomParticipants,
  emitTerminalSettlement,
  broadcastRoomState,
  finalizeRoom,
  findBestWaitingPlayer,
  startRankedMatch,
  sweepWaitingPlayers,
} = realtime

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

// ─── Route registration ─────────────────────────────────────────────────────
//
// The route bodies live in server/routes/*.js. Everything they share — auth
// middleware, request helpers, payload shapers, the admin store, socket
// helpers — is handed over in one context object rather than imported back
// from here, so the dependency runs one way and there is no cycle.
//
// ADMIN_KEY is a getter, not a plain property. It is reassigned when
// first-launch setup generates a key, and a value copied at registration time
// would leave every admin route validating against the pre-setup key. Same
// failure as exporting a value where a live binding is needed.
const routeContext = {
  get ADMIN_KEY() { return ADMIN_KEY },
  DIST_DIR,
  accountRequirementsPayload,
  adminStore,
  allowLocalSignupClusterBypass,
  anonymizeVisitorId,
  // Bound to the live counts here so route callers keep the behaviour they had
  // when buildAdminOverview read the socket server and the queue directly.
  // Passing the bare function would silently serve zeros for both.
  buildAdminOverview: () => buildAdminOverview({
    queueSize: getLiveArenaSnapshot().queueSize,
    connectedPlayers: io.engine.clientsCount,
    port: PORT,
  }),
  clientIp,
  clientUserAgent,
  debouncedSaveAdminStore,
  disconnectAccountSockets,
  emitToAccount,
  ensureVisitor,
  getComplaintCounts,
  getLiveArenaSnapshot,
  io,
  loadServerConfig,
  publicAppOrigin,
  pushActivity,
  requireAccountReady,
  requireAdminRole,
  requireAuth,
  requireOwnerRecoveryKey,
  requireOwnerRole,
  requireRecentPasskeyAuth,
  sanitizeProfile,
  saveAdminStore,
  saveServerConfig,
  skipViewportQaRateLimit,
  trackAnalyticsEvent,
  validateLegalSetupPayload,
}

registerAccountRoutes(app, routeContext)
registerProfileRoutes(app, routeContext)
registerShopRoutes(app, routeContext)
registerTradingRoutes(app, routeContext)
registerAdminRoutes(app, routeContext)

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
    enqueueWaitingPlayer({
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

  // Flush any pending admin store writes. The debounce handle lives inside
  // admin-store.js, which owns it.
  flushAdminStore()

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
