import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import {
  consumeAuthChallenge,
  completeAccountRecoveryWithPasskey,
  createAuthChallenge,
  findAccountRecoveryCode,
  findAccountForPasskeyIdentifier,
  getAccountById,
  getPasskeyCredential,
  listAccountPasskeyCredentials,
  registerAccountPasskey,
  updatePasskeyAfterAuthentication,
} from './db.js'

const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Fractured Arcanum'
const DEFAULT_APP_ORIGIN = 'http://localhost:43173'

function firstConfiguredOrigin() {
  return String(process.env.WEBAUTHN_ORIGIN || process.env.PUBLIC_APP_URL || process.env.CLIENT_ORIGIN || '')
    .split(',')[0]
    .trim()
}

function requestOrigin(request) {
  const configured = firstConfiguredOrigin()
  if (configured) return configured

  const origin = String(request?.get?.('origin') || '').trim()
  if (origin) return origin

  if (process.env.NODE_ENV !== 'production') return DEFAULT_APP_ORIGIN

  return ''
}

function rpIdForOrigin(origin) {
  if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID
  try {
    return new URL(origin).hostname
  } catch {
    return 'localhost'
  }
}

function isIpHostname(hostname) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':')
}

function rpIdMatchesOrigin(rpID, hostname) {
  return hostname === rpID || hostname.endsWith(`.${rpID}`)
}

function webAuthnContext(request) {
  const origin = requestOrigin(request)
  if (!origin) {
    return {
      ok: false,
      status: 500,
      error: 'Passkey origin is not configured for this domain.',
    }
  }

  try {
    const parsed = new URL(origin)
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        status: 500,
        error: 'Passkeys require an HTTPS app origin in production.',
      }
    }

    if (parsed.hostname !== 'localhost' && isIpHostname(parsed.hostname)) {
      return {
        ok: false,
        status: 500,
        error: 'Passkeys require localhost or a DNS app origin.',
      }
    }

    const rpID = rpIdForOrigin(origin)
    if (!rpIdMatchesOrigin(rpID, parsed.hostname)) {
      return {
        ok: false,
        status: 500,
        error: 'Passkey relying party ID does not match this app origin.',
      }
    }

    return { ok: true, origin, rpID }
  } catch {
    return {
      ok: false,
      status: 500,
      error: 'Passkey origin is invalid.',
    }
  }
}

function credentialDescriptors(credentials) {
  return credentials.map((credential) => ({
    id: credential.id,
    transports: credential.transports,
  }))
}

export async function createPasskeyRegistrationOptions(accountId, request) {
  const account = getAccountById(accountId)
  if (!account) return { ok: false, status: 404, error: 'Account not found.' }

  const context = webAuthnContext(request)
  if (!context.ok) return context
  const { origin, rpID } = context
  const existingCredentials = listAccountPasskeyCredentials(accountId)
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: Buffer.from(account.id),
    userName: account.username,
    userDisplayName: account.display_name || account.username,
    attestationType: 'none',
    excludeCredentials: credentialDescriptors(existingCredentials),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: account.role === 'owner' || account.role === 'admin' ? 'required' : 'preferred',
    },
    timeout: 60_000,
  })
  const challenge = createAuthChallenge(accountId, 'passkey_registration', options.challenge, { origin, rpID })
  return { ok: true, options, challengeId: challenge.id, expiresAt: challenge.expiresAt }
}

export async function verifyPasskeyRegistration(accountId, payload, request) {
  const account = getAccountById(accountId)
  if (!account) return { ok: false, status: 404, error: 'Account not found.' }

  const challenge = consumeAuthChallenge(payload?.challengeId, 'passkey_registration')
  if (!challenge || challenge.accountId !== accountId) {
    return { ok: false, status: 400, error: 'Passkey registration challenge expired. Try again.' }
  }

  const context = challenge.metadata?.origin && challenge.metadata?.rpID ? { ok: true, ...challenge.metadata } : webAuthnContext(request)
  if (!context.ok) return context
  const verification = await verifyRegistrationResponse({
    response: payload.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: context.origin,
    expectedRPID: context.rpID,
    requireUserVerification: account.role === 'owner' || account.role === 'admin',
  })

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, status: 400, error: 'Passkey registration could not be verified.' }
  }

  const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo
  return registerAccountPasskey(accountId, credential, {
    name: payload?.name,
    backedUp: credentialBackedUp,
    deviceType: credentialDeviceType,
  })
}

export async function createPasskeyLoginOptions(identifier, request) {
  const account = findAccountForPasskeyIdentifier(identifier)
  if (!account) return { ok: false, status: 404, error: 'No active account with passkeys was found.' }

  const credentials = listAccountPasskeyCredentials(account.id)
  if (credentials.length === 0) return { ok: false, status: 404, error: 'No passkeys are registered for this account.' }

  const context = webAuthnContext(request)
  if (!context.ok) return context
  const { origin, rpID } = context
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentialDescriptors(credentials),
    userVerification: account.role === 'owner' || account.role === 'admin' ? 'required' : 'preferred',
    timeout: 60_000,
  })
  const challenge = createAuthChallenge(account.id, 'passkey_login', options.challenge, { origin, rpID })
  return { ok: true, options, challengeId: challenge.id, expiresAt: challenge.expiresAt, accountId: account.id }
}

export async function createPasskeyReauthOptions(accountId, request) {
  const account = getAccountById(accountId)
  if (!account || account.account_status !== 'active' || account.deleted_at) {
    return { ok: false, status: 404, error: 'Active account not found.' }
  }

  const credentials = listAccountPasskeyCredentials(account.id)
  if (credentials.length === 0) return { ok: false, status: 404, error: 'No passkeys are registered for this account.' }

  const context = webAuthnContext(request)
  if (!context.ok) return context
  const { origin, rpID } = context
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentialDescriptors(credentials),
    userVerification: account.role === 'owner' || account.role === 'admin' ? 'required' : 'preferred',
    timeout: 60_000,
  })
  const challenge = createAuthChallenge(account.id, 'passkey_reauth', options.challenge, { origin, rpID })
  return { ok: true, options, challengeId: challenge.id, expiresAt: challenge.expiresAt }
}

export async function verifyPasskeyReauth(accountId, payload, request) {
  const challenge = consumeAuthChallenge(payload?.challengeId, 'passkey_reauth')
  if (!challenge || challenge.accountId !== accountId) {
    return { ok: false, status: 400, error: 'Passkey confirmation challenge expired. Try again.' }
  }

  const credentialId = payload?.response?.id
  const passkey = getPasskeyCredential(credentialId)
  if (!passkey || passkey.accountId !== accountId) {
    return { ok: false, status: 400, error: 'Passkey is not registered for this account.' }
  }

  const context = challenge.metadata?.origin && challenge.metadata?.rpID ? { ok: true, ...challenge.metadata } : webAuthnContext(request)
  if (!context.ok) return context
  const verification = await verifyAuthenticationResponse({
    response: payload.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: context.origin,
    expectedRPID: context.rpID,
    credential: passkey.credential,
    requireUserVerification: passkey.role === 'owner' || passkey.role === 'admin',
  })

  if (!verification.verified) {
    return { ok: false, status: 401, error: 'Passkey could not be confirmed.' }
  }

  updatePasskeyAfterAuthentication(passkey.id, verification.authenticationInfo.newCounter, {
    backedUp: verification.authenticationInfo.credentialBackedUp,
    deviceType: verification.authenticationInfo.credentialDeviceType,
  })

  return { ok: true, accountId }
}

export async function createPasskeyRecoveryOptions(identifier, recoveryCode, request) {
  const recovery = findAccountRecoveryCode(identifier, recoveryCode)
  if (!recovery) {
    return { ok: false, status: 400, error: 'Account recovery could not be verified.' }
  }

  const account = recovery.account
  const context = webAuthnContext(request)
  if (!context.ok) return context
  const { origin, rpID } = context
  const existingCredentials = listAccountPasskeyCredentials(account.id)
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: Buffer.from(account.id),
    userName: account.username,
    userDisplayName: account.display_name || account.username,
    attestationType: 'none',
    excludeCredentials: credentialDescriptors(existingCredentials),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: account.role === 'owner' || account.role === 'admin' ? 'required' : 'preferred',
    },
    timeout: 60_000,
  })
  const challenge = createAuthChallenge(account.id, 'passkey_recovery_registration', options.challenge, {
    origin,
    rpID,
    recoveryCodeId: recovery.recoveryCodeId,
  })
  return { ok: true, options, challengeId: challenge.id, expiresAt: challenge.expiresAt }
}

export async function verifyPasskeyRecovery(payload, request) {
  const challenge = consumeAuthChallenge(payload?.challengeId, 'passkey_recovery_registration')
  if (!challenge || !challenge.metadata?.recoveryCodeId) {
    return { ok: false, status: 400, error: 'Account recovery challenge expired. Try again.' }
  }

  const account = getAccountById(challenge.accountId)
  if (!account || account.account_status !== 'active' || account.deleted_at) {
    return { ok: false, status: 404, error: 'Active account not found.' }
  }

  const context = challenge.metadata?.origin && challenge.metadata?.rpID ? { ok: true, ...challenge.metadata } : webAuthnContext(request)
  if (!context.ok) return context
  const verification = await verifyRegistrationResponse({
    response: payload.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: context.origin,
    expectedRPID: context.rpID,
    requireUserVerification: account.role === 'owner' || account.role === 'admin',
  })

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, status: 400, error: 'Replacement passkey could not be verified.' }
  }

  const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo
  const completed = completeAccountRecoveryWithPasskey(account.id, challenge.metadata.recoveryCodeId, credential, {
    name: payload?.name ?? 'Recovery passkey',
    backedUp: credentialBackedUp,
    deviceType: credentialDeviceType,
    ip: request.ip,
    userAgent: request.get('user-agent'),
    metadata: { revokedOldPasskeys: true },
  })
  if (!completed.ok) return completed

  return {
    ok: true,
    accountId: account.id,
    username: account.username,
    displayName: account.display_name || account.username,
  }
}

export async function verifyPasskeyLogin(payload, request) {
  const challenge = consumeAuthChallenge(payload?.challengeId, 'passkey_login')
  if (!challenge) {
    return { ok: false, status: 400, error: 'Passkey login challenge expired. Try again.' }
  }

  const credentialId = payload?.response?.id
  const passkey = getPasskeyCredential(credentialId)
  if (!passkey || passkey.accountId !== challenge.accountId) {
    return { ok: false, status: 400, error: 'Passkey is not registered for this account.' }
  }

  const context = challenge.metadata?.origin && challenge.metadata?.rpID ? { ok: true, ...challenge.metadata } : webAuthnContext(request)
  if (!context.ok) return context
  const verification = await verifyAuthenticationResponse({
    response: payload.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: context.origin,
    expectedRPID: context.rpID,
    credential: passkey.credential,
    requireUserVerification: passkey.role === 'owner' || passkey.role === 'admin',
  })

  if (!verification.verified) {
    return { ok: false, status: 401, error: 'Passkey could not be verified.' }
  }

  updatePasskeyAfterAuthentication(passkey.id, verification.authenticationInfo.newCounter, {
    backedUp: verification.authenticationInfo.credentialBackedUp,
    deviceType: verification.authenticationInfo.credentialDeviceType,
  })

  return {
    ok: true,
    accountId: passkey.accountId,
    username: passkey.username,
    displayName: passkey.displayName,
  }
}
