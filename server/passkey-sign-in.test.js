// @ts-check
// Passkey sign-in, end to end through real WebAuthn signature checks.
//
// A software authenticator below signs assertions with a P-256 key exactly as
// a phone or laptop would, so these tests exercise verifyAuthenticationResponse
// itself rather than a mock of it. Uses a throwaway DATA_DIR.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isoCBOR } from '@simplewebauthn/server/helpers'

const ORIGIN = 'http://localhost:5173'
const RP_ID = 'localhost'

let db
let passkeyService
let tmpDir

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'fa-passkey-test-'))
  process.env.DATA_DIR = tmpDir
  process.env.WEBAUTHN_ORIGIN = ORIGIN
  db = await import('./db.js')
  passkeyService = await import('./passkey-service.js')
})

afterAll(() => {
  delete process.env.WEBAUTHN_ORIGIN
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

afterEach(() => {
  process.env.WEBAUTHN_ORIGIN = ORIGIN
})

const request = {
  ip: '203.0.113.9',
  get(name) {
    return String(name).toLowerCase() === 'origin' ? ORIGIN : ''
  },
}

let accountSequence = 0
function makeAccount(prefix) {
  accountSequence += 1
  const username = `${prefix}${accountSequence}`.slice(0, 20)
  const result = db.createAccount(username, 'password12345', username, `fp-${username}`, `198.51.100.${accountSequence}`, `agent-${username}`)
  expect(result.ok, result.error).toBe(true)
  return { id: result.accountId, username }
}

/** A P-256 authenticator that signs WebAuthn assertions like real hardware. */
function softwareAuthenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  const cosePublicKey = isoCBOR.encode(new Map([
    [1, 2], // kty: EC2
    [3, -7], // alg: ES256
    [-1, 1], // crv: P-256
    [-2, Buffer.from(String(jwk.x), 'base64url')],
    [-3, Buffer.from(String(jwk.y), 'base64url')],
  ]))
  const credentialId = randomBytes(16).toString('base64url')
  let counter = 0

  return {
    credentialId,
    /** Save the credential against an account, as registration would. */
    register(accountId, aaguid = '') {
      const result = db.registerAccountPasskey(accountId, {
        id: credentialId,
        publicKey: cosePublicKey,
        counter: 0,
        transports: ['internal'],
      }, { name: 'Test passkey', aaguid })
      expect(result.ok, result.error).toBe(true)
      return result.passkey
    },
    /** Answer a challenge. `userHandle` is what a discoverable passkey reports. */
    assert(challenge, userHandle) {
      counter += 1
      const clientDataJSON = Buffer.from(JSON.stringify({
        type: 'webauthn.get',
        challenge,
        origin: ORIGIN,
        crossOrigin: false,
      }))
      const counterBytes = Buffer.alloc(4)
      counterBytes.writeUInt32BE(counter)
      const authenticatorData = Buffer.concat([
        createHash('sha256').update(RP_ID).digest(),
        Buffer.from([0x05]), // user present + user verified
        counterBytes,
      ])
      const signature = sign(
        'sha256',
        Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()]),
        privateKey,
      )
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientDataJSON.toString('base64url'),
          authenticatorData: authenticatorData.toString('base64url'),
          signature: signature.toString('base64url'),
          ...(userHandle ? { userHandle: Buffer.from(userHandle).toString('base64url') } : {}),
        },
      }
    },
  }
}

async function signIn(authenticator, { identifier = '', userHandle } = {}) {
  const options = await passkeyService.createPasskeyLoginOptions(identifier, request)
  expect(options.ok, options.error).toBe(true)
  return passkeyService.verifyPasskeyLogin({
    challengeId: options.challengeId,
    response: authenticator.assert(options.options.challenge, userHandle),
  }, request)
}

describe('passkey sign-in without a username', () => {
  it('offers a discoverable request with no allow-list', async () => {
    const result = await passkeyService.createPasskeyLoginOptions('', request)
    expect(result.ok, result.error).toBe(true)
    expect(result.options.allowCredentials ?? []).toHaveLength(0)
    expect(result.options.rpId).toBe(RP_ID)
    // The response must not name an account: nothing was asked about one.
    expect(result).not.toHaveProperty('accountId')
  })

  it('signs in from the passkey alone and identifies the account by it', async () => {
    const account = makeAccount('nouser')
    const authenticator = softwareAuthenticator()
    authenticator.register(account.id)

    const result = await signIn(authenticator, { userHandle: account.id })
    expect(result.ok, result.error).toBe(true)
    expect(result.accountId).toBe(account.id)
    expect(result.passkeyUser).toEqual({
      rpId: RP_ID,
      userId: Buffer.from(account.id).toString('base64url'),
      name: account.username,
      displayName: account.username,
    })
  })

  it('answers an unknown username with the same discoverable request, not an error', async () => {
    const result = await passkeyService.createPasskeyLoginOptions('nobody_by_this_name', request)
    expect(result.ok, result.error).toBe(true)
    expect(result.options.allowCredentials ?? []).toHaveLength(0)
  })

  it('still narrows to the account when a username is given, for older passkeys', async () => {
    const account = makeAccount('withuser')
    const authenticator = softwareAuthenticator()
    authenticator.register(account.id)

    const options = await passkeyService.createPasskeyLoginOptions(account.username, request)
    expect(options.options.allowCredentials.map((item) => item.id)).toEqual([authenticator.credentialId])

    // Non-discoverable passkeys report no user handle; the credential decides.
    const result = await signIn(authenticator, { identifier: account.username })
    expect(result.ok, result.error).toBe(true)
    expect(result.accountId).toBe(account.id)
  })

  it('flags a passkey the server no longer knows so the device can forget it', async () => {
    const stray = softwareAuthenticator()
    const result = await signIn(stray)
    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
    expect(result.unknownCredential).toBe(true)
    expect(result.credentialId).toBe(stray.credentialId)
    expect(result.rpId).toBe(RP_ID)
  })

  it('refuses a passkey whose account was deleted', async () => {
    const account = makeAccount('deletedacct')
    const authenticator = softwareAuthenticator()
    authenticator.register(account.id)
    db.default.prepare(`UPDATE accounts SET account_status = 'deleted', deleted_at = datetime('now') WHERE id = ?`).run(account.id)

    const result = await signIn(authenticator, { userHandle: account.id })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
  })

  it('refuses a user handle that names a different account than the passkey', async () => {
    const owner = makeAccount('handleowner')
    const other = makeAccount('handleother')
    const authenticator = softwareAuthenticator()
    authenticator.register(owner.id)

    const result = await signIn(authenticator, { userHandle: other.id })
    expect(result.ok).toBe(false)
  })

  it('refuses another account\'s passkey on a username-targeted request', async () => {
    const named = makeAccount('namedacct')
    const intruder = makeAccount('intruder')
    softwareAuthenticator().register(named.id)
    const intruderKey = softwareAuthenticator()
    intruderKey.register(intruder.id)

    const result = await signIn(intruderKey, { identifier: named.username })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/different account/)
  })

  it('rejects an assertion whose signature does not match the stored key', async () => {
    const account = makeAccount('forged')
    const genuine = softwareAuthenticator()
    genuine.register(account.id)
    const options = await passkeyService.createPasskeyLoginOptions('', request)
    const response = genuine.assert(options.options.challenge, account.id)
    // Same credential id, signed by a different key.
    const forger = softwareAuthenticator()
    response.response.signature = forger.assert(options.options.challenge, account.id).response.signature

    const result = await passkeyService.verifyPasskeyLogin({ challengeId: options.challengeId, response }, request)
      .catch((error) => ({ ok: false, error: String(error) }))
    expect(result.ok).toBe(false)
  })

  it('cannot replay a challenge', async () => {
    const account = makeAccount('replay')
    const authenticator = softwareAuthenticator()
    authenticator.register(account.id)
    const options = await passkeyService.createPasskeyLoginOptions('', request)
    const response = authenticator.assert(options.options.challenge, account.id)

    const first = await passkeyService.verifyPasskeyLogin({ challengeId: options.challengeId, response }, request)
    const second = await passkeyService.verifyPasskeyLogin({ challengeId: options.challengeId, response }, request)
    expect(first.ok, first.error).toBe(true)
    expect(second.ok).toBe(false)
  })
})

describe('passkey registration', () => {
  it('asks for a discoverable passkey so it can be offered without a username', async () => {
    const account = makeAccount('discoverable')
    const result = await passkeyService.createPasskeyRegistrationOptions(account.id, request)
    expect(result.ok, result.error).toBe(true)
    expect(result.options.authenticatorSelection.residentKey).toBe('required')
    expect(result.options.authenticatorSelection.requireResidentKey).toBe(true)
    // The user handle must stay the account id, or existing passkeys would be
    // filed under a different user on the player's device.
    expect(result.options.user.id).toBe(Buffer.from(account.id).toString('base64url'))
  })

  it('names a passkey after its provider and lists it that way', () => {
    const account = makeAccount('provider')
    softwareAuthenticator().register(account.id, 'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4')
    const [listed] = db.listAccountPasskeys(account.id)
    expect(listed.providerName).toBe('Google Password Manager')
  })

  it('reports the relying party the Signal API needs for this account', () => {
    const account = makeAccount('signals')
    expect(passkeyService.passkeyRelyingParty(account.id, request)).toEqual({
      rpId: RP_ID,
      userId: Buffer.from(account.id).toString('base64url'),
    })
  })
})

describe('signup retry after a cancelled passkey prompt', () => {
  function pendingSignup(username, device) {
    const result = db.createAccount(username, randomBytes(16).toString('hex'), username, device.fp, device.ip, device.agent)
    expect(result.ok, result.error).toBe(true)
    db.markAccountPendingPasskeySignup(result.accountId)
    return result.accountId
  }

  it('lets the same device take its own username straight back', () => {
    const device = { fp: 'fp-retry-device', ip: '192.0.2.50', agent: 'retry-agent' }
    const first = pendingSignup('retryname', device)
    const retry = db.createAccount('retryname', randomBytes(16).toString('hex'), 'retryname', device.fp, device.ip, device.agent)
    expect(retry.ok, retry.error).toBe(true)
    expect(retry.accountId).not.toBe(first)
  })

  it('still holds the name against a different device until the attempt expires', () => {
    pendingSignup('heldname', { fp: 'fp-holder', ip: '192.0.2.60', agent: 'holder-agent' })
    const other = db.createAccount('heldname', randomBytes(16).toString('hex'), 'heldname', 'fp-other', '192.0.2.61', 'other-agent')
    expect(other.ok).toBe(false)
    expect(other.error).toMatch(/taken/)
  })

  it('never releases a name that already has a passkey', () => {
    const device = { fp: 'fp-finished', ip: '192.0.2.70', agent: 'finished-agent' }
    const accountId = pendingSignup('finishedname', device)
    softwareAuthenticator().register(accountId)
    const retry = db.createAccount('finishedname', randomBytes(16).toString('hex'), 'finishedname', device.fp, device.ip, device.agent)
    expect(retry.ok).toBe(false)
  })
})

describe('challenge housekeeping', () => {
  it('sweeps long-expired challenges and keeps live ones', () => {
    const live = db.createAuthChallenge(null, 'passkey_login', 'live-challenge', {})
    const stale = db.createAuthChallenge(null, 'passkey_login', 'stale-challenge', {})
    db.default.prepare('UPDATE auth_challenges SET expires_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), stale.id)

    db.cleanupSessions()

    const remaining = db.default.prepare('SELECT id FROM auth_challenges WHERE id IN (?, ?)').all(live.id, stale.id).map((row) => row.id)
    expect(remaining).toEqual([live.id])
  })
})
