/**
 * Account, authentication, and assisted recovery endpoints.
 *
 * Registered by server.js, which owns the Express app, the Socket.IO server,
 * and every shared helper this module reads off `ctx`.
 */
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { authenticateAccount, checkRateLimit, completeAccountUpgrade, createAccount, createPasskeyDeviceLink, createSession, destroySession, generateAccountRecoveryCodes, getAccountReadiness, getCurrentLegalVersions, getProfile, hashFingerprint, hashIp, listAccountPasskeys, listAccountRecoveryStatus, markAccountPendingPasskeySignup, markSessionPasskeyReauthenticated, revokeAllSessions } from '../db.js'
import { createPasskeyDeviceLinkRegistrationOptions, createPasskeyGrantRecoveryOptions, createPasskeyLoginOptions, createPasskeyReauthOptions, createPasskeyRecoveryOptions, createPasskeyRegistrationOptions, verifyPasskeyDeviceLinkRegistration, verifyPasskeyGrantRecovery, verifyPasskeyLogin, verifyPasskeyReauth, verifyPasskeyRecovery, verifyPasskeyRegistration } from '../passkey-service.js'

export function registerAccountRoutes(app, ctx) {
  const {
    allowLocalSignupClusterBypass,
    clientIp,
    clientUserAgent,
    publicAppOrigin,
    requireAuth,
    requireRecentPasskeyAuth,
    sanitizeProfile,
    skipViewportQaRateLimit,
    validateLegalSetupPayload,
  } = ctx

// ─── Account endpoints ─────────────────────────────────────────────────────

app.get('/api/legal/current', (_request, response) => {
  response.json({
    ok: true,
    legal: getCurrentLegalVersions(),
    documents: {
      terms: {
        version: getCurrentLegalVersions().termsVersion,
        title: 'Terms of Service',
        status: 'draft-pending-counsel-review',
        path: 'docs/TERMS_OF_SERVICE.md',
        noRealMoneyPurchases: true,
      },
      privacy: {
        version: getCurrentLegalVersions().privacyVersion,
        title: 'Privacy Policy',
        status: 'draft-pending-counsel-review',
      },
      ageGate: {
        version: getCurrentLegalVersions().ageGateVersion,
        title: 'Age Eligibility',
        status: 'draft-pending-counsel-review',
      },
    },
  })
})

app.post('/api/auth/signup', (request, response) => {
  response.status(410).json({ ok: false, error: 'Password signup is retired. Create a passkey account instead.' })
})

app.post('/api/auth/passkey/signup/options', async (request, response) => {
  const ip = clientIp(request)
  const userAgent = clientUserAgent(request)
  const { username, displayName, deviceFingerprint } = request.body ?? {}
  const legalValidation = validateLegalSetupPayload(request.body ?? {})
  if (!legalValidation.ok) {
    response.status(400).json({ ok: false, error: legalValidation.error })
    return
  }

  const fingerprintHash = hashFingerprint(String(deviceFingerprint ?? ''))
  const rl = checkRateLimit(`passkey-signup:start:${hashIp(ip)}`, 5)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many signup attempts. Try again later.' })
    return
  }

  if (fingerprintHash) {
    const fingerprintRateLimit = checkRateLimit(`passkey-signup-fp:${fingerprintHash}`, 3)
    if (!fingerprintRateLimit.allowed) {
      response.status(429).json({ ok: false, error: 'Too many signup attempts from this device. Try again later.' })
      return
    }
  }

  const result = createAccount(
    String(username ?? ''),
    randomBytes(32).toString('hex'),
    String(displayName ?? username ?? ''),
    String(deviceFingerprint ?? ''),
    ip,
    userAgent,
    { bypassSignupClusterLimits: allowLocalSignupClusterBypass(request) },
  )

  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }
  markAccountPendingPasskeySignup(result.accountId)

  try {
    const optionsResult = await createPasskeyRegistrationOptions(result.accountId, request)
    if (!optionsResult.ok) {
      response.status(optionsResult.status ?? 400).json({ ok: false, error: optionsResult.error })
      return
    }

    response.status(201).json({
      ok: true,
      pendingAccountId: result.accountId,
      options: optionsResult.options,
      challengeId: optionsResult.challengeId,
      expiresAt: optionsResult.expiresAt,
    })
  } catch (error) {
    console.warn('Passkey signup options failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey signup could not be started.' })
  }
})

app.post('/api/auth/passkey/signup/verify', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`passkey-signup:verify:${hashIp(ip)}`, 10)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many signup attempts. Try again later.' })
    return
  }

  const pendingAccountId = String(request.body?.pendingAccountId ?? '')
  const legalValidation = validateLegalSetupPayload(request.body ?? {})
  if (!legalValidation.ok) {
    response.status(400).json({ ok: false, error: legalValidation.error })
    return
  }

  try {
    const passkeyResult = await verifyPasskeyRegistration(pendingAccountId, request.body ?? {}, request)
    if (!passkeyResult.ok) {
      response.status(passkeyResult.status ?? 400).json({ ok: false, error: passkeyResult.error })
      return
    }

    const setupResult = completeAccountUpgrade(pendingAccountId, {
      acceptTerms: request.body?.acceptTerms === true,
      acceptPrivacy: request.body?.acceptPrivacy === true,
      ageAttestation: request.body?.ageAttestation,
      locale: request.body?.locale,
      ip,
      userAgent: clientUserAgent(request),
    })
    if (!setupResult.ok) {
      response.status(setupResult.status ?? 400).json({ ok: false, error: setupResult.error })
      return
    }

    const session = createSession(pendingAccountId, ip, clientUserAgent(request), 'passkey')
    const recoveryResult = generateAccountRecoveryCodes(pendingAccountId, {
      ip,
      userAgent: clientUserAgent(request),
      metadata: { source: 'passkey_signup' },
    })
    const profile = getProfile(pendingAccountId)

    response.status(201).json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      profile: sanitizeProfile(profile, profile?.username, pendingAccountId),
      recoveryCodes: recoveryResult.ok ? recoveryResult.codes : [],
      recovery: recoveryResult.ok ? recoveryResult.recovery : listAccountRecoveryStatus(pendingAccountId),
    })
  } catch (error) {
    console.warn('Passkey signup verification failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey signup could not be verified.' })
  }
})

app.post('/api/auth/login', (request, response) => {
  const ip = clientIp(request)
  if (!skipViewportQaRateLimit(request)) {
    const rl = checkRateLimit(`login:${hashIp(ip)}`, 10)
    if (!rl.allowed) {
      response.status(429).json({ ok: false, error: 'Too many login attempts. Try again later.' })
      return
    }
  }

  const { username, password } = request.body ?? {}
  const result = authenticateAccount(String(username ?? ''), String(password ?? ''))
  if (!result.ok) {
    response.status(401).json(result)
    return
  }

  const readiness = getAccountReadiness(result.accountId)
  if (!readiness.setupRequired && readiness.passkeyCount > 0) {
    response.status(403).json({ ok: false, error: 'This account now uses passkey sign-in. Use your passkey to log in.' })
    return
  }

  const session = createSession(result.accountId, ip, clientUserAgent(request), 'password')
  const profile = getProfile(result.accountId)

  response.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    profile: sanitizeProfile(profile, username, result.accountId),
  })
})

app.post('/api/auth/passkey/login/options', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`passkey-login:start:${hashIp(ip)}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many passkey attempts. Try again later.' })
    return
  }

  try {
    const result = await createPasskeyLoginOptions(String(request.body?.identifier ?? ''), request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    response.json(result)
  } catch (error) {
    console.warn('Passkey login options failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey login could not be started.' })
  }
})

app.post('/api/auth/passkey/login/verify', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`passkey-login:verify:${hashIp(ip)}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many passkey attempts. Try again later.' })
    return
  }

  try {
    const result = await verifyPasskeyLogin(request.body ?? {}, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }

    const session = createSession(result.accountId, ip, clientUserAgent(request), 'passkey')
    const profile = getProfile(result.accountId)
    response.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      profile: sanitizeProfile(profile, result.username, result.accountId),
    })
  } catch (error) {
    console.warn('Passkey login verification failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey login could not be verified.' })
  }
})

app.post('/api/auth/passkey/reauth/options', requireAuth, async (request, response) => {
  const rl = checkRateLimit(`passkey-reauth:start:${request.accountId}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many passkey confirmation attempts. Try again later.' })
    return
  }

  try {
    const result = await createPasskeyReauthOptions(request.accountId, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    response.json(result)
  } catch (error) {
    console.warn('Passkey reauth options failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey confirmation could not be started.' })
  }
})

app.post('/api/auth/passkey/reauth/verify', requireAuth, async (request, response) => {
  const rl = checkRateLimit(`passkey-reauth:verify:${request.accountId}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many passkey confirmation attempts. Try again later.' })
    return
  }

  try {
    const result = await verifyPasskeyReauth(request.accountId, request.body ?? {}, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    markSessionPasskeyReauthenticated(request.authToken)
    response.json({ ok: true })
  } catch (error) {
    console.warn('Passkey reauth verification failed:', error)
    response.status(400).json({ ok: false, error: 'Passkey confirmation could not be verified.' })
  }
})

app.post('/api/me/passkey-device-links', requireAuth, requireRecentPasskeyAuth, (request, response) => {
  const rl = checkRateLimit(`passkey-device-link:create:${request.accountId}`, 10)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many device link requests. Try again later.' })
    return
  }

  const result = createPasskeyDeviceLink(request.accountId, {
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
    sessionId: request.session?.token,
    metadata: { source: 'settings' },
  })
  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }

  response.json({
    ok: true,
    token: result.token,
    link: result.link,
    linkUrl: `${publicAppOrigin(request)}/?passkeyDeviceLink=${encodeURIComponent(result.token)}`,
  })
})

app.post('/api/auth/passkey/device-link/options', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`passkey-device-link:start:${hashIp(ip)}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many device link attempts. Try again later.' })
    return
  }

  try {
    const result = await createPasskeyDeviceLinkRegistrationOptions(String(request.body?.deviceLinkToken ?? ''), request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    response.json(result)
  } catch (error) {
    console.warn('Passkey device link options failed:', error)
    response.status(400).json({ ok: false, error: 'Device link passkey setup could not be started.' })
  }
})

app.post('/api/auth/passkey/device-link/verify', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`passkey-device-link:verify:${hashIp(ip)}`, 20)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many device link attempts. Try again later.' })
    return
  }

  try {
    const result = await verifyPasskeyDeviceLinkRegistration(request.body ?? {}, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }

    const session = createSession(result.accountId, ip, clientUserAgent(request), 'passkey')
    const profile = getProfile(result.accountId)
    response.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      profile: sanitizeProfile(profile, result.username, result.accountId),
      passkey: result.passkey,
      passkeys: listAccountPasskeys(result.accountId),
    })
  } catch (error) {
    console.warn('Passkey device link verification failed:', error)
    response.status(400).json({ ok: false, error: 'Device link passkey setup could not be verified.' })
  }
})

app.post('/api/auth/recovery/options', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`account-recovery:start:${hashIp(ip)}`, 8)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many recovery attempts. Try again later.' })
    return
  }

  try {
    const result = await createPasskeyRecoveryOptions(String(request.body?.username ?? ''), String(request.body?.recoveryCode ?? ''), request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    response.json(result)
  } catch (error) {
    console.warn('Account recovery options failed:', error)
    response.status(400).json({ ok: false, error: 'Account recovery could not be started.' })
  }
})

app.post('/api/auth/recovery/verify', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`account-recovery:verify:${hashIp(ip)}`, 8)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many recovery attempts. Try again later.' })
    return
  }

  try {
    const result = await verifyPasskeyRecovery(request.body ?? {}, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    // Recovery consumes exactly one code. Silently reissuing the whole batch
    // here would kill the sheet the player still has saved, so only mint a new
    // batch when they have none left; otherwise report what remains and let
    // them regenerate deliberately.
    const remaining = listAccountRecoveryStatus(result.accountId)
    const recoveryResult = remaining.activeCount < 1
      ? generateAccountRecoveryCodes(result.accountId, {
          ip,
          userAgent: clientUserAgent(request),
          metadata: { source: 'lost_access_recovery' },
        })
      : { ok: true, codes: [], recovery: remaining }
    const session = createSession(result.accountId, ip, clientUserAgent(request), 'passkey')
    const profile = getProfile(result.accountId)
    response.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      profile: sanitizeProfile(profile, result.username, result.accountId),
      recoveryCodes: recoveryResult.ok ? recoveryResult.codes : [],
      recovery: recoveryResult.ok ? recoveryResult.recovery : listAccountRecoveryStatus(result.accountId),
      remainingRecoveryCodes: recoveryResult.recovery?.activeCount ?? 0,
    })
  } catch (error) {
    console.warn('Account recovery verification failed:', error)
    response.status(400).json({ ok: false, error: 'Account recovery could not be verified.' })
  }
})

// ─── Assisted recovery (operator-issued grant code) ─────────────────────────
// The last-resort path for a player who lost both their device and their
// recovery codes. The code is issued from the owner console and relayed over a
// support channel; it identifies its own account, so no username is needed.

app.post('/api/auth/recovery/grant/options', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`grant-recovery:start:${hashIp(ip)}`, 8)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many recovery attempts. Try again later.' })
    return
  }

  try {
    const result = await createPasskeyGrantRecoveryOptions(String(request.body?.grantCode ?? ''), request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    response.json(result)
  } catch (error) {
    console.warn('Grant recovery options failed:', error)
    response.status(400).json({ ok: false, error: 'Account recovery could not be started.' })
  }
})

app.post('/api/auth/recovery/grant/verify', async (request, response) => {
  const ip = clientIp(request)
  const rl = checkRateLimit(`grant-recovery:verify:${hashIp(ip)}`, 8)
  if (!rl.allowed) {
    response.status(429).json({ ok: false, error: 'Too many recovery attempts. Try again later.' })
    return
  }

  try {
    const result = await verifyPasskeyGrantRecovery(request.body ?? {}, request)
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
    // A grant is used precisely when the player has nothing left, so this is
    // the one place a fresh recovery-code batch is always the right call.
    const recoveryResult = generateAccountRecoveryCodes(result.accountId, {
      ip,
      userAgent: clientUserAgent(request),
      metadata: { source: 'assisted_grant_recovery' },
    })
    const session = createSession(result.accountId, ip, clientUserAgent(request), 'passkey')
    const profile = getProfile(result.accountId)
    response.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      profile: sanitizeProfile(profile, result.username, result.accountId),
      recoveryCodes: recoveryResult.ok ? recoveryResult.codes : [],
      recovery: recoveryResult.ok ? recoveryResult.recovery : listAccountRecoveryStatus(result.accountId),
    })
  } catch (error) {
    console.warn('Grant recovery verification failed:', error)
    response.status(400).json({ ok: false, error: 'Account recovery could not be verified.' })
  }
})

app.post('/api/auth/logout', (request, response) => {
  // Idempotent: always succeed so clients can clear local state even if
  // the token is already expired or missing.
  const token = request.get('authorization')?.replace('Bearer ', '')
  if (token) destroySession(token)
  response.json({ ok: true })
})

app.post('/api/auth/logout-all', requireAuth, requireRecentPasskeyAuth, (request, response) => {
  revokeAllSessions(request.accountId)
  response.json({ ok: true })
})

}
