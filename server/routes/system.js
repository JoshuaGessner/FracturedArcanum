/**
 * The unauthenticated service surface: liveness, live-service settings, the
 * privacy statement, analytics ingest, and player-submitted complaints.
 *
 * These are the endpoints anyone can reach without an account, which is
 * exactly why they belong together rather than scattered through whichever
 * module happened to have room. They previously lived in `trading.js` — a
 * module named for card trading that also owned the health check, so its name
 * told a reader nothing about two thirds of its contents.
 *
 * Registered by server.js, which owns the Express app and every shared helper
 * this module reads off `ctx`.
 */
import rateLimit from 'express-rate-limit'
import { randomUUID } from 'node:crypto'
import { checkRateLimit, hashIp } from '../db.js'

export function registerSystemRoutes(app, ctx) {
  const {
    adminStore,
    anonymizeVisitorId,
    clientIp,
    debouncedSaveAdminStore,
    ensureVisitor,
    getComplaintCounts,
    pushActivity,
    trackAnalyticsEvent,
  } = ctx

  /**
   * Liveness. Public and unauthenticated by necessity — the Docker
   * HEALTHCHECK and `scripts/update.sh` both poll it with no credentials.
   *
   * Two things about the body are deliberate.
   *
   * It carries no operational figures. It used to answer with queue size,
   * connected players, open complaints and lifetime unique visitors, to
   * anybody on the internet: a live business dashboard for competitors, or for
   * anyone deciding whether the game looked busy enough to bother with. Those
   * moved to `/api/admin/health`, behind a role check.
   *
   * It still touches the database. `getComplaintCounts()` is called and its
   * result thrown away, because a health check that only proves the process is
   * listening would pass while the schema was unreadable — and this endpoint
   * is what the updater trusts to decide a migration succeeded. The query is
   * the assertion; the number was never the point.
   */
  app.get('/api/health', (_request, response) => {
    getComplaintCounts()

    response.json({
      ok: true,
      service: 'Fractured Arcanum Arena Service',
    })
  })

  /**
   * Live-service settings: message of the day, the featured mode, the posted
   * quest line, and the maintenance flag.
   *
   * Named `/api/profile` until this release, which described nothing it
   * returns — the *player* record is `/api/me`. The old name misled a refactor
   * of the player provider into documenting the wrong source.
   */
  app.get('/api/live-settings', (_request, response) => {
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
}
