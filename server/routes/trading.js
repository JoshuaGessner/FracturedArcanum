/**
 * Friends-only card trading.
 *
 * Nothing else. This module used to also own the health check, the
 * live-service settings, the privacy statement, analytics ingest, complaints
 * and three admin routes — thirteen routes, of which five were trades. That
 * happened when the routes came out of server.js: the trades got a named home
 * and everything unclaimed was left sitting with them, so the file's name
 * described a third of its contents. The public surface is now `system.js`,
 * the admin surface `admin.js`.
 *
 * Registered by server.js, which owns the Express app, the Socket.IO server,
 * and every shared helper this module reads off `ctx`.
 */
import { acceptTrade, cancelTrade, checkRateLimit, getTradeById, listTradesForAccount, proposeTrade } from '../db.js'

export function registerTradingRoutes(app, ctx) {
  const {
    emitToAccount,
    requireAccountReady,
    requireAuth,
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

}
