import { WebAuthnAbortService, browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser'

/**
 * Browser-side passkey plumbing that is not React state: ceremony timeouts,
 * autofill detection, and the WebAuthn Signal API.
 *
 * The Signal API lets a site tell the device's passkey manager what changed on
 * the server, so the device stops offering passkeys that no longer work and
 * shows the player's current name. Chrome ships it; other browsers ignore the
 * calls. Every signal here is fire-and-forget: a failure can only mean the
 * device's list stays as it was, never a failed sign-in.
 */

export const PASSKEY_PROMPT_STATUS = 'Complete the passkey prompt in your browser or system window.'
const PASSKEY_CEREMONY_TIMEOUT_MS = 75_000

export type PasskeyRelyingParty = { rpId: string; userId: string }
export type PasskeyUserDetails = PasskeyRelyingParty & { name: string; displayName: string }

/**
 * A WebAuthn ceremony can hang indefinitely if the platform dialog is never
 * dismissed. Racing it against a timeout keeps the UI recoverable. Never wrap
 * an autofill request in this: those wait for the player by design.
 */
export async function withPasskeyCeremonyTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(message)
          // The name formatPasskeyCeremonyError looks for, so the timeout
          // message reaches the player instead of a generic failure.
          error.name = 'PasskeyTimeoutError'
          reject(error)
        }, PASSKEY_CEREMONY_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * True for a ceremony this app cancelled itself — the autofill request being
 * superseded by the sign-in button, or the player leaving the sign-in screen.
 * Those are routine and must never surface as an error.
 */
export function isPasskeyCeremonyAbort(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as Error & { code?: string }).code
  return error.name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED'
}

/** Whether this browser can offer passkeys from the username field's autofill. */
export async function passkeyAutofillAvailable(): Promise<boolean> {
  try {
    return await browserSupportsWebAuthnAutofill()
  } catch {
    return false
  }
}

/** Withdraw any pending passkey request, such as an armed autofill. */
export function cancelPendingPasskeyRequest(): void {
  WebAuthnAbortService.cancelCeremony()
}

type SignalApi = {
  signalUnknownCredential?: (options: { rpId: string; credentialId: string }) => Promise<void>
  signalAllAcceptedCredentials?: (options: { rpId: string; userId: string; allAcceptedCredentialIds: string[] }) => Promise<void>
  signalCurrentUserDetails?: (options: PasskeyUserDetails) => Promise<void>
}

function signalApi(): SignalApi | null {
  if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') return null
  return window.PublicKeyCredential as unknown as SignalApi
}

const BASE64URL = /^[A-Za-z0-9_-]+$/

/**
 * Call one Signal API method if this browser has it. The methods are statics on
 * PublicKeyCredential and must be invoked bound to it; an unbound call throws
 * "Illegal invocation" in Chrome.
 */
async function sendSignal<K extends keyof SignalApi>(
  method: K,
  options: Parameters<NonNullable<SignalApi[K]>>[0],
): Promise<void> {
  const api = signalApi()
  const send = api?.[method] as ((options: unknown) => Promise<void>) | undefined
  if (!api || typeof send !== 'function') return
  try {
    await send.call(api, options)
  } catch {
    // The device declined. Nothing else changes.
  }
}

/** The server has no such passkey: ask the device to stop offering it. */
export function signalUnknownPasskey(rpId: string, credentialId: string): Promise<void> {
  if (!rpId || !BASE64URL.test(credentialId)) return Promise.resolve()
  return sendSignal('signalUnknownCredential', { rpId, credentialId })
}

/**
 * Tell the device which of this account's passkeys still work, so it hides the
 * one the player just removed. The device drops anything *not* listed, so this
 * refuses to send a list containing an id it cannot be sure is in the same
 * encoding the device uses — a wrong list could hide a working passkey.
 */
export function signalAcceptedPasskeys(relyingParty: PasskeyRelyingParty | null | undefined, credentialIds: string[]): Promise<void> {
  if (!relyingParty?.rpId || !relyingParty.userId) return Promise.resolve()
  if (credentialIds.length === 0 || !credentialIds.every((id) => BASE64URL.test(id))) return Promise.resolve()
  return sendSignal('signalAllAcceptedCredentials', {
    rpId: relyingParty.rpId,
    userId: relyingParty.userId,
    allAcceptedCredentialIds: credentialIds,
  })
}

/** Keep the name the device shows in its passkey picker current. */
export function signalPasskeyUserDetails(details: PasskeyUserDetails | null | undefined): Promise<void> {
  if (!details?.rpId || !details.userId) return Promise.resolve()
  return sendSignal('signalCurrentUserDetails', details)
}
