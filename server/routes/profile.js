/**
 * Player profile, economy, deck CRUD, and shard breakdown endpoints.
 *
 * Registered by server.js, which owns the Express app, the Socket.IO server,
 * and every shared helper this module reads off `ctx`.
 */
import { acknowledgeAccountRecoveryCodes, breakdownCard, checkRateLimit, completeAccountUpgrade, createDeck, deleteAccount, deleteAccountPasskey, deleteDeck, exportAccountData, generateAccountRecoveryCodes, getAccountReadiness, getProfile, listAccountPasskeys, listAccountRecoveryStatus, listAccountSessions, listDecks, markSessionPasskeyReauthenticated, renameDeck, saveDeck, selectActiveDeck, updateDeck, validateDeckConfig } from '../db.js'
import { createPasskeyRegistrationOptions, verifyPasskeyRegistration } from '../passkey-service.js'

export function registerProfileRoutes(app, ctx) {
  const {
    accountRequirementsPayload,
    clientIp,
    clientUserAgent,
    requireAccountReady,
    requireAuth,
    requireRecentPasskeyAuth,
    sanitizeProfile,
  } = ctx

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

}
