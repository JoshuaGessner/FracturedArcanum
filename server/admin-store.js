/**
 * Admin store and analytics.
 *
 * Owns `arena-admin-store.json` — live-service settings, visitor and traffic
 * counters, complaints, and the activity feed — plus the debounce that persists
 * it.
 *
 * The debounce timer lives here rather than in server.js on purpose. It is
 * mutable state written from more than one place, including the shutdown path,
 * and module-scope mutable state left behind by a refactor is how the database
 * split came to open an empty file. Shutdown calls `flushAdminStore()` instead
 * of reaching for the handle.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { resolveDataDir } from './db/connection.js'

const ADMIN_STORE_PATH = path.join(resolveDataDir(), 'arena-admin-store.json')

function ensureDataDir() {
  const dir = resolveDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

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

export const adminStore = loadAdminStore()

export function saveAdminStore() {
  ensureDataDir()
  adminStore.updatedAt = new Date().toISOString()
  writeFileSync(ADMIN_STORE_PATH, JSON.stringify(adminStore, null, 2))
}

let _saveTimer = null
export function debouncedSaveAdminStore() {
  if (_saveTimer) return
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    saveAdminStore()
  }, 2000)
}


export function anonymizeVisitorId(visitorId = 'guest') {
  return createHash('sha256').update(`fractured-arcanum:${visitorId}`).digest('hex').slice(0, 16)
}

export function pushActivity(type, payload = {}) {
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

export function pruneDailyTraffic() {
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

export function ensureVisitor(visitorId, sessionId, route, screen) {
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

export function trackAnalyticsEvent(payload = {}) {
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

export function getComplaintCounts() {
  const resolved = adminStore.complaints.filter((complaint) => complaint.status === 'resolved').length
  const open = adminStore.complaints.length - resolved

  return { open, resolved }
}

/**
 * Assemble the operations overview.
 *
 * `liveCounts` is passed in rather than read from the socket server and the
 * matchmaking queue directly: this module would otherwise depend on both, and
 * both already depend on the store.
 */
export function buildAdminOverview({ queueSize = 0, connectedPlayers = 0, port = 0 } = {}) {
  const complaintCounts = getComplaintCounts()

  return {
    ok: true,
    service: {
      queueSize,
      connectedPlayers,
      maintenanceMode: adminStore.settings.maintenanceMode,
      port,
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


/**
 * Persist immediately, cancelling any pending debounce.
 *
 * Called on SIGTERM/SIGINT so a shutdown cannot drop the last two seconds of
 * writes.
 */
export function flushAdminStore() {
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  saveAdminStore()
}
