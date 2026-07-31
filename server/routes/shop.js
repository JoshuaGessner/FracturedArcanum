/**
 * Cosmetics and card packs: borders, pack purchase and opening.
 *
 * Registered by server.js, which owns the Express app, the Socket.IO server,
 * and every shared helper this module reads off `ctx`.
 */
import { PACK_DEFS, addFriend, checkRateLimit, claimDailyReward, claimQuestReward, claimQuestRewards, createClan, getCollection, getLeaderboard, getQuestOverview, getRecentMatches, getSocialOverview, joinClanByInvite, leaveClan, listCardBorders, openPack, purchaseCardBorder, purchaseTheme, removeFriend, rerollQuest, selectCardBorder, selectTheme } from '../db.js'

export function registerShopRoutes(app, ctx) {
  const {
    requireAccountReady,
    requireAuth,
  } = ctx

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

}
