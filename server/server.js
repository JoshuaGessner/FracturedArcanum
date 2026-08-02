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
import { registerConnectionHandler } from './sockets/connection.js'
import { registerAccountRoutes } from './routes/account.js'
import { registerProfileRoutes } from './routes/profile.js'
import { registerShopRoutes } from './routes/shop.js'
import { registerTradingRoutes } from './routes/trading.js'
import { registerSystemRoutes } from './routes/system.js'
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
registerSystemRoutes(app, routeContext)
registerAdminRoutes(app, routeContext)


httpServer.listen(PORT, () => {
  console.log(`Fractured Arcanum arena service listening on http://localhost:${PORT}`)
})

// ─── Socket.IO connection handler ───────────────────────────────────────────
//
// The handler and its per-connection rate limiter live in
// server/sockets/connection.js. It receives what it needs here rather than
// importing back from this file, so the dependency runs one way.
registerConnectionHandler({
  io,
  serverConfig,
  trackPresence,
  untrackPresence,
  isOnline,
  emitToAccount,
  findChallengeForAccount,
  pendingChallenges,
  CHALLENGE_TTL_MS,
  emitLiveArenaState,
  removeWaitingPlayer,
  enqueueWaitingPlayer,
  getRuntimeRankLabel,
  broadcastRoomState,
  finalizeRoom,
  sweepWaitingPlayers,
  adminStore,
  pushActivity,
  debouncedSaveAdminStore,
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
