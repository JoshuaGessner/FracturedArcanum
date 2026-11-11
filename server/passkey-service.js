import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import {
  completePasskeyDeviceLinkRegistration,
  consumeAuthChallenge,
  completeAccountRecoveryWithPasskey,
  completeAccountRecoveryWithGrant,
  findAccountRecoveryGrant,
  createAuthChallenge,
  findAccountRecoveryCode,
  findAccountForPasskeyIdentifier,
  getAccountById,
  getPasskeyCredential,
  getPasskeyDeviceLink,
  listAccountPasskeyCredentials,
  registerAccountPasskey,
  updatePasskeyAfterAuthentication,
} from './db.js'
import { defaultPasskeyName } from './passkey-providers.js'

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

function isPrivilegedRole(role) {
  return role === 'owner' || role === 'admin'
}

/**
 * The WebAuthn user handle for an account. It must never change for an
 * existing account: a provider files passkeys under it, so a new value would
 * make the player's device hold two unrelated entries for one account.
 */
function userHandleFor(accountId) {
  return Buffer.from(String(accountId))
}

/**
 * Registration options shared by every flow that creates a passkey: signup,
 * adding one in Settings, a device link, and both recovery paths.
 *
 * `residentKey: 'required'` makes every new passkey discoverable. That is what
 * lets the sign-in screen offer it from autofill, or from one button press,
 * without asking for a username first — the pattern Google, Apple, GitHub and
 * the FIDO Alliance guidance all use. Passkeys registered before this change
 * keep working through the username path in `createPasskeyLoginOptions`.
 */
async function buildRegistrationOptions({ accountId, username, displayName, role }, rpID) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: userHandleFor(accountId),
    userName: username,
    userDisplayName: displayName || username,
    attestationType: 'none',
    excludeCredentials: credentialDescriptors(listAccountPasskeyCredentials(accountId)),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: isPrivilegedRole(role) ? 'required' : 'preferred',
    },
    timeout: 60_000,
  })
}

/** What the DB layer needs from a verified registration. */
function registrationDetails(registrationInfo, fallbackName) {
  return {
    name: defaultPasskeyName(registrationInfo.aaguid, fallbackName),
    aaguid: registrationInfo.aaguid,
    backedUp: registrationInfo.credentialBackedUp,
    deviceType: registrationInfo.credentialDeviceType,
  }
}

export async function createPasskeyRegistrationOptions(accountId, request) {
  const account = getAccountById(accountId)
  if (!account) return { ok: false, status: 404, error: 'Account not found.' }

  const context = webAuthnContext(request)
  if (!context.ok) return context
  const { origin, rpID } = context
  const options = await buildRegistrationOptions({
    accountId: account.id,
    username: account.username,
    displayName: account.display_name,
    role: account.role,
  }, rpID)
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

  return registerAccountPasskey(
    accountId,
    verification.registrationInfo.credential,
    registrationDetails(verification.registrationInfo, payload?.name),
  )
}

export async function createPasskeyDeviceLinkRegistrationOptions(token, request) {
  const link = getPasskeyDeviceLink(token)
  if (!link) return { ok: false, status: 400, error: 'Device link is invalid or expired.' }

  const context = webAuthnContext(request)
  if (!context.ok) return context
  const { origin, rpID } = context
  const options = await buildRegistrationOptions({
    accountId: link.accountId,
    username: link.username,
    displayName: link.displayName,
    role: link.role,
  }, rpID)
  const challenge = createAuthChallenge(link.accountId, 'passkey_device_link_registration', options.challenge, {
    origin,
    rpID,
    deviceLinkId: link.id,
  })
  return {
    ok: true,
    options,
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    account: {
      username: link.username,
      displayName: link.displayName,
    },
  }
}

export async function verifyPasskeyDeviceLinkRegistration(payload, request) {
  const challenge = consumeAuthChallenge(payload?.challengeId, 'passkey_device_link_registration')
  if (!challenge || !challenge.metadata?.deviceLinkId) {
    return { ok: false, status: 400, error: 'Device link challenge expired. Try again from the original device.' }
  }

  const link = getPasskeyDeviceLink(payload?.deviceLinkToken)
  if (!link || link.id !== challenge.metadata.deviceLinkId || link.accountId !== challenge.accountId) {
    return { ok: false, status: 400, error: 'Device link is invalid or expired.' }
  }

  const context = challenge.metadata?.origin && challenge.metadata?.rpID ? { ok: true, ...challenge.metadata } : webAuthnContext(request)
  if (!context.ok) return context
  const verification = await verifyRegistrationResponse({
    response: payload.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: context.origin,
    expectedRPID: context.rpID,
    requireUserVerification: link.role === 'owner' || link.role === 'admin',
  })

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, status: 400, error: 'Linked device passkey could not be verified.' }
  }

  const completed = completePasskeyDeviceLinkRegistration(payload?.deviceLinkToken, link.accountId, verification.registrationInfo.credential, {
    ...registrationDetails(verification.registrationInfo, payload?.name ?? 'Linked device passkey'),
    ip: request.ip,
    userAgent: request.get('user-agent'),
    metadata: { source: 'passkey_device_link' },
  })
  if (!completed.ok) return completed

  return {
    ok: true,
    accountId: link.accountId,
    username: link.username,
    displayName: link.displayName,
    passkey: completed.passkey,
  }
}

/**
 * Start a passkey sign-in.
 *
 * With no identifier this is a discoverable ("usernameless") request: no
 * allow-list, so the device offers whichever Fractured Arcanum passkeys it
 * holds — from the username field's autofill or from one button press. That is
 * the primary path.
 *
 * With a username it narrows to that account's passkeys. That path stays for
 * passkeys created before registration required discoverable credentials, and
 * for hardware keys that cannot store them. An unknown or passkey-less username
 * gets the discoverable request instead of an error, so this endpoint no longer
 * answers "does this account exist?" for anyone who asks.
 */
export async function createPasskeyLoginOptions(identifier, request) {
  const context = webAuthnContext(request)
  if (!context.ok) return context
  const { origin, rpID } = context

  const account = String(identifier ?? '').trim() ? findAccountForPasskeyIdentifier(identifier) : null
  const credentials = account ? listAccountPasskeyCredentials(account.id) : []
  const targeted = credentials.length > 0
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: targeted ? credentialDescriptors(credentials) : undefined,
    userVerification: targeted && isPrivilegedRole(account.role) ? 'required' : 'preferred',
    timeout: 60_000,
  })
  const challenge = createAuthChallenge(targeted ? account.id : null, 'passkey_login', options.challenge, { origin, rpID })
  return { ok: true, options, challengeId: challenge.id, expiresAt: challenge.expiresAt }
}

/**
 * The account a WebAuthn user handle names, when it is one of ours. Every
 * passkey this server registers uses the account id as its handle; anything
 * else (or nothing — the field is optional for non-discoverable passkeys)
 * returns '' and the credential lookup alone decides.
 */
function accountIdFromUserHandle(userHandle) {
  if (!userHandle) return ''
  try {
    const decoded = Buffer.from(String(userHandle), 'base64url').toString('utf8')
    return decoded.startsWith('acct-') ? decoded : ''
  } catch {
    return ''
  }
}

/**
 * What the browser's Signal API needs to keep the device's passkey list in
 * step with this account: the RP ID and the base64url user handle.
 */
export function passkeyRelyingParty(accountId, request) {
  const context = webAuthnContext(request)
  if (!context.ok) return null
  return { rpId: context.rpID, userId: userHandleFor(accountId).toString('base64url') }
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
  const options = await buildRegistrationOptions({
    accountId: account.id,
    username: account.username,
    displayName: account.display_name,
    role: account.role,
  }, rpID)
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

  const completed = completeAccountRecoveryWithPasskey(account.id, challenge.metadata.recoveryCodeId, verification.registrationInfo.credential, {
    ...registrationDetails(verification.registrationInfo, payload?.name ?? 'Recovery passkey'),
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

/**
 * Start assisted recovery from an operator-issued grant code. Unlike the
 * recovery-code flow this needs no username: the grant identifies its own
 * account, so a player who has forgotten everything can still get back in.
 * The grant is only checked here, not consumed — see verifyPasskeyGrantRecovery.
 */
export async function createPasskeyGrantRecoveryOptions(grantCode, request) {
  const grant = findAccountRecoveryGrant(grantCode)
  if (!grant) {
    return { ok: false, status: 400, error: 'That recovery code is invalid or has expired.' }
  }

  const account = grant.account
  const context = webAuthnContext(request)
  if (!context.ok) return context
  const { origin, rpID } = context
  const options = await buildRegistrationOptions({
    accountId: account.id,
    username: account.username,
    displayName: account.display_name,
    role: account.role,
  }, rpID)
  const challenge = createAuthChallenge(account.id, 'passkey_grant_registration', options.challenge, {
    origin,
    rpID,
    grantId: grant.grantId,
  })
  return {
    ok: true,
    options,
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    username: account.username,
  }
}

export async function verifyPasskeyGrantRecovery(payload, request) {
  const challenge = consumeAuthChallenge(payload?.challengeId, 'passkey_grant_registration')
  if (!challenge || !challenge.metadata?.grantId) {
    return { ok: false, status: 400, error: 'Recovery challenge expired. Start again with your code.' }
  }

  const account = getAccountById(challenge.accountId)
  if (!account || account.account_status !== 'active' || account.deleted_at) {
    return { ok: false, status: 404, error: 'Active account not found.' }
  }

  const context = challenge.metadata?.origin && challenge.metadata?.rpID
    ? { ok: true, ...challenge.metadata }
    : webAuthnContext(request)
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

  const completed = completeAccountRecoveryWithGrant(account.id, challenge.metadata.grantId, verification.registrationInfo.credential, {
    ...registrationDetails(verification.registrationInfo, payload?.name ?? 'Recovery passkey'),
    ip: request.ip,
    userAgent: request.get('user-agent'),
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
    return { ok: false, status: 400, error: 'That sign-in attempt expired. Try again.' }
  }

  const credentialId = String(payload?.response?.id ?? '')
  const passkey = getPasskeyCredential(credentialId)
  if (!passkey) {
    // The device offered a passkey this server has no record of: it was removed
    // from the account, or its account was reset or deleted. The client relays
    // `unknownCredential` to the Signal API so the device stops offering it.
    return {
      ok: false,
      status: 404,
      error: 'That passkey is no longer linked to an account here. Choose a different one, or use a recovery code.',
      unknownCredential: true,
      credentialId,
      rpId: challenge.metadata?.rpID ?? null,
    }
  }
  // A username-targeted challenge must be answered by that account's passkey.
  if (challenge.accountId && passkey.accountId !== challenge.accountId) {
    return { ok: false, status: 400, error: 'That passkey belongs to a different account than the username you entered.' }
  }
  const handleAccountId = accountIdFromUserHandle(payload?.response?.response?.userHandle)
  if (handleAccountId && handleAccountId !== passkey.accountId) {
    return { ok: false, status: 400, error: 'Passkey could not be verified.' }
  }
  // The discoverable path never looked the account up by name, so status is
  // checked here: a passkey must not open a deleted or unfinished account.
  if (passkey.accountStatus !== 'active' || passkey.deletedAt) {
    return { ok: false, status: 403, error: 'This account is not available. If you think this is a mistake, use a recovery code or contact support.' }
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
    // For the client's signalCurrentUserDetails call, so the device's passkey
    // picker shows the player's current name rather than the one at signup.
    passkeyUser: {
      rpId: context.rpID,
      userId: userHandleFor(passkey.accountId).toString('base64url'),
      name: passkey.username,
      displayName: passkey.displayName,
    },
  }
}
