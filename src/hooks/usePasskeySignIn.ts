import { useRef } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { ARENA_URL } from '../constants'
import { formatPasskeyCeremonyError, getPasskeyOriginRequirementMessage } from '../utils'
import { useAccountState } from '../contexts/AccountProvider'
import {
  PASSKEY_PROMPT_STATUS,
  cancelPendingPasskeyRequest,
  isPasskeyCeremonyAbort,
  passkeyAutofillAvailable,
  signalPasskeyUserDetails,
  signalUnknownPasskey,
  withPasskeyCeremonyTimeout,
  type PasskeyUserDetails,
} from '../passkeys'
import type { ServerProfile } from '../types'

type AuthenticationOptionsJSON = Parameters<typeof startAuthentication>[0]['optionsJSON']
type AuthenticationResponseJSON = Awaited<ReturnType<typeof startAuthentication>>

type LoginOptionsResponse = { ok: boolean; error?: string; options?: AuthenticationOptionsJSON; challengeId?: string }
type LoginVerifyResponse = {
  ok: boolean
  error?: string
  token?: string
  profile?: ServerProfile
  passkeyUser?: PasskeyUserDetails
  unknownCredential?: boolean
  credentialId?: string
  rpId?: string
}

export type PasskeySignInDeps = {
  /** Establish the signed-in session; shared with every other way in. */
  onSignedIn: (session: { token: string; profile: ServerProfile | null }) => void
}

/**
 * Passkey sign-in, in the two forms the FIDO Alliance and Google's passkey UX
 * research recommend together:
 *
 * - **Autofill.** While the sign-in screen is open, a conditional request sits
 *   armed behind the username field. Focusing it lists this device's
 *   Fractured Arcanum passkeys in the browser's own suggestions; picking one
 *   signs in. No typing, no button.
 * - **The button.** "Sign in with a passkey" opens the device's passkey sheet
 *   straight away — no username needed, though one typed in narrows the
 *   choice to that account (the path older, non-discoverable passkeys use).
 *
 * Only one WebAuthn request can be pending, so the button supersedes the armed
 * autofill and the autofill is re-armed if the button attempt does not sign in.
 */
export function usePasskeySignIn({ onSignedIn }: PasskeySignInDeps) {
  const {
    authForm,
    passkeySupported,
    setAuthError,
    setAuthStatus,
    setAuthLoading,
  } = useAccountState()
  // True while an autofill request is pending, so it is never armed twice.
  const autofillArmedRef = useRef(false)

  async function requestLoginOptions(identifier: string): Promise<LoginOptionsResponse> {
    const response = await fetch(`${ARENA_URL}/api/auth/passkey/login/options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    return await response.json() as LoginOptionsResponse
  }

  /** Send the device's answer to the server. True when the player is signed in. */
  async function completeSignIn(challengeId: string, credential: AuthenticationResponseJSON): Promise<boolean> {
    const response = await fetch(`${ARENA_URL}/api/auth/passkey/login/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, response: credential }),
    })
    const data = await response.json() as LoginVerifyResponse
    if (!data.ok) {
      // A passkey for an account that was reset or deleted, or a passkey that
      // was removed in Settings. Ask the device to stop offering it.
      if (data.unknownCredential && data.rpId && data.credentialId) {
        void signalUnknownPasskey(data.rpId, data.credentialId)
      }
      setAuthError(data.error ?? 'Passkey sign-in failed.')
      return false
    }
    void signalPasskeyUserDetails(data.passkeyUser)
    setAuthError('')
    onSignedIn({ token: data.token ?? '', profile: data.profile ?? null })
    return true
  }

  /** Why passkey sign-in cannot run here, or '' when it can. */
  function signInBlocker(): string {
    if (!passkeySupported) {
      return 'This browser cannot use passkeys. Open the game in an up-to-date Chrome, Safari, Edge, or Firefox, or use a recovery option below.'
    }
    return getPasskeyOriginRequirementMessage()
  }

  /**
   * Arm autofill sign-in. Safe to call repeatedly: it does nothing when the
   * browser lacks conditional mediation, or when a request is already armed.
   * Every failure here is silent — the player never asked for anything, so an
   * error banner would be noise. The button path reports its own errors.
   */
  async function armPasskeyAutofill(): Promise<void> {
    if (autofillArmedRef.current || signInBlocker()) return
    autofillArmedRef.current = true
    let answered = false
    try {
      if (!(await passkeyAutofillAvailable())) return
      const options = await requestLoginOptions('')
      if (!options.ok || !options.options || !options.challengeId) return
      const credential = await startAuthentication({ optionsJSON: options.options, useBrowserAutofill: true })
      answered = true
      setAuthLoading(true)
      await completeSignIn(options.challengeId, credential)
    } catch (error) {
      if (answered && !isPasskeyCeremonyAbort(error)) {
        setAuthError(formatPasskeyCeremonyError(error, 'Passkey sign-in failed. Try again.'))
      }
    } finally {
      autofillArmedRef.current = false
      // Only the path that took over the loading state hands it back; an
      // autofill cancelled by the button must not clear the button's spinner.
      if (answered) setAuthLoading(false)
    }
  }

  /** Withdraw armed autofill, e.g. when the player leaves the sign-in screen. */
  function cancelPasskeyAutofill(): void {
    if (autofillArmedRef.current) cancelPendingPasskeyRequest()
  }

  async function handlePasskeyLogin(): Promise<void> {
    setAuthError('')
    setAuthStatus('')
    const blocker = signInBlocker()
    if (blocker) {
      setAuthError(blocker)
      return
    }

    setAuthLoading(true)
    let signedIn = false
    try {
      const options = await requestLoginOptions(authForm.username.trim())
      if (!options.ok || !options.options || !options.challengeId) {
        setAuthError(options.error ?? 'Passkey sign-in could not be started.')
        return
      }
      setAuthStatus(PASSKEY_PROMPT_STATUS)
      // Starting this request aborts any armed autofill; the library allows
      // only one pending WebAuthn call at a time.
      const credential = await withPasskeyCeremonyTimeout(
        startAuthentication({ optionsJSON: options.options }),
        'The passkey prompt timed out. Try again and watch for the browser or system passkey window.',
      )
      setAuthStatus('')
      signedIn = await completeSignIn(options.challengeId, credential)
    } catch (error) {
      setAuthStatus('')
      if (!isPasskeyCeremonyAbort(error)) {
        setAuthError(formatPasskeyCeremonyError(
          error,
          'Passkey sign-in did not finish. If this device does not have your passkey, use a recovery option below.',
          'Passkey sign-in was cancelled.',
        ))
      }
    } finally {
      setAuthLoading(false)
    }
    if (!signedIn) void armPasskeyAutofill()
  }

  return { handlePasskeyLogin, armPasskeyAutofill, cancelPasskeyAutofill }
}
