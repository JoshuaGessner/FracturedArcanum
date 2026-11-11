// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isPasskeyCeremonyAbort,
  signalAcceptedPasskeys,
  signalPasskeyUserDetails,
  signalUnknownPasskey,
  withPasskeyCeremonyTimeout,
} from './passkeys'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** A PublicKeyCredential stand-in whose methods record the `this` they ran with. */
function stubSignalApi() {
  const calls: Array<{ method: string; options: unknown; boundToApi: boolean }> = []
  const api: Record<string, unknown> = {}
  for (const method of ['signalUnknownCredential', 'signalAllAcceptedCredentials', 'signalCurrentUserDetails']) {
    api[method] = function (this: unknown, options: unknown) {
      calls.push({ method, options, boundToApi: this === api })
      return Promise.resolve()
    }
  }
  vi.stubGlobal('PublicKeyCredential', api)
  return calls
}

const relyingParty = { rpId: 'farcanum.example', userId: 'YWNjdC0x' }

describe('Signal API helpers', () => {
  it('calls each method bound to PublicKeyCredential, as Chrome requires', async () => {
    const calls = stubSignalApi()
    await signalUnknownPasskey('farcanum.example', 'cred_A-1')
    await signalPasskeyUserDetails({ ...relyingParty, name: 'player', displayName: 'Player' })
    expect(calls.map((call) => call.method)).toEqual(['signalUnknownCredential', 'signalCurrentUserDetails'])
    expect(calls.every((call) => call.boundToApi)).toBe(true)
  })

  it('sends the accepted list only when every id is plain base64url', async () => {
    const calls = stubSignalApi()
    await signalAcceptedPasskeys(relyingParty, ['abc_DEF-123', 'xyz'])
    expect(calls).toHaveLength(1)
    expect(calls[0].options).toEqual({ ...relyingParty, allAcceptedCredentialIds: ['abc_DEF-123', 'xyz'] })

    // A padded or standard-base64 id could be stored in a different encoding
    // from the device's; sending it risks hiding a passkey that still works.
    await signalAcceptedPasskeys(relyingParty, ['abc_DEF-123', 'padded+/=='])
    // An empty list would tell the device every passkey is gone.
    await signalAcceptedPasskeys(relyingParty, [])
    expect(calls).toHaveLength(1)
  })

  it('does nothing, and never throws, where the browser lacks the API', async () => {
    vi.stubGlobal('PublicKeyCredential', {})
    await expect(signalUnknownPasskey('farcanum.example', 'abc')).resolves.toBeUndefined()
    await expect(signalAcceptedPasskeys(relyingParty, ['abc'])).resolves.toBeUndefined()
  })

  it('swallows a device that declines the signal', async () => {
    vi.stubGlobal('PublicKeyCredential', { signalUnknownCredential: () => Promise.reject(new Error('NotAllowed')) })
    await expect(signalUnknownPasskey('farcanum.example', 'abc')).resolves.toBeUndefined()
  })
})

describe('ceremony helpers', () => {
  it('recognises a ceremony this app cancelled itself', () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const libraryAbort = Object.assign(new Error('aborted'), { code: 'ERROR_CEREMONY_ABORTED' })
    expect(isPasskeyCeremonyAbort(aborted)).toBe(true)
    expect(isPasskeyCeremonyAbort(libraryAbort)).toBe(true)
    expect(isPasskeyCeremonyAbort(Object.assign(new Error('no'), { name: 'NotAllowedError' }))).toBe(false)
  })

  it('times out with the name the error formatter shows to the player', async () => {
    vi.useFakeTimers()
    const pending = withPasskeyCeremonyTimeout(new Promise<never>(() => {}), 'Prompt timed out.')
    vi.advanceTimersByTime(75_000)
    await expect(pending).rejects.toMatchObject({ name: 'PasskeyTimeoutError', message: 'Prompt timed out.' })
  })
})
