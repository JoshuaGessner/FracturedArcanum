/**
 * Friends-only card trading, plus the social, complaint, and misc endpoints that sit alongside it.
 *
 * Registered by server.js, which owns the Express app, the Socket.IO server,
 * and every shared helper this module reads off `ctx`.
 */
import rateLimit from 'express-rate-limit'
import { randomUUID } from 'node:crypto'
import { acceptTrade, cancelTrade, checkRateLimit, getTradeById, hashIp, listTradesForAccount, proposeTrade, recordAudit } from '../db.js'

export function registerTradingRoutes(app, ctx) {
  const {
    adminStore,
    anonymizeVisitorId,
    buildAdminOverview,
    clientIp,
    debouncedSaveAdminStore,
    emitToAccount,
    ensureVisitor,
    getComplaintCounts,
    getLiveArenaSnapshot,
    io,
    pushActivity,
    requireAccountReady,
    requireAdminRole,
    requireAuth,
    saveAdminStore,
    trackAnalyticsEvent,
  } = ctx

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

}
