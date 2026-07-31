import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { Socket } from 'socket.io-client'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { ARENA_URL } from '../constants'
import {
  authFetch,
  formatPasskeyCeremonyError,
  getDeviceFingerprint,
  getPasskeyOriginRequirementMessage,
} from '../utils'
import { useAccountState } from '../contexts/AccountProvider'
import { useGameState } from '../contexts/GameProvider'
import { useProfileState } from '../contexts/ProfileProvider'
import { useSocialState } from '../contexts/SocialProvider'
import type {
  AccountRecoveryStatus,
  AccountSessionSummary,
  ConfirmOptions,
  PasskeySummary,
  ServerProfile,
} from '../types'

// Derived from the library's own signatures so a version bump cannot leave a
// hand-written shape behind.
type RegistrationOptionsJSON = Parameters<typeof startRegistration>[0]['optionsJSON']
type AuthenticationOptionsJSON = Parameters<typeof startAuthentication>[0]['optionsJSON']

const PASSKEY_CEREMONY_TIMEOUT_MS = 75_000
const PASSKEY_PROMPT_STATUS = 'Complete the passkey prompt in your browser or system window.'

function createPasskeyTimeoutError(message: string): Error {
  const error = new Error(message)
  error.name = 'PasskeyCeremonyTimeout'
  return error
}

/** Strip the one-time device-link token from the URL once it has been used. */
function clearPasskeyDeviceLinkParam(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('passkeyDeviceLink')) return
  url.searchParams.delete('passkeyDeviceLink')
  window.history.replaceState({}, '', url.toString())
}

/**
 * A WebAuthn ceremony can hang indefinitely if the platform dialog is never
 * dismissed. Racing it against a timeout keeps the UI recoverable.
 */
async function withPasskeyCeremonyTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(createPasskeyTimeoutError(message)), PASSKEY_CEREMONY_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Everything a player can do to their own account: sign in, finish first-launch
 * setup, manage passkeys and device links, generate and acknowledge recovery
 * codes, review sessions, export their data, and delete the account.
 *
 * Extracted from `AppShell` only after AccountProvider existed. Measured with
 * the state still inline, this block needed 66 injected dependencies — a hook
 * with 66 parameters relocates coupling rather than removing it. Reading the
 * same state through `useAccountState()` brings that down to the list below.
 */
export type AccountActionsDeps = {
  serverProfile: ServerProfile | null
  setServerProfile: Dispatch<SetStateAction<ServerProfile | null>>
  askConfirm: (options: ConfirmOptions) => Promise<boolean>
  setToastMessage: (message: string) => void
  setBackendOnline: Dispatch<SetStateAction<boolean>>
  refreshSocialHub: () => Promise<void>
  socketClientRef: { current: Socket | null }
  sessionId: string
  visitorId: string
}

export function useAccountActions(deps: AccountActionsDeps) {
  const {
    serverProfile,
    setServerProfile,
    askConfirm,
    setToastMessage,
    setBackendOnline,
    refreshSocialHub,
    socketClientRef,
    sessionId,
    visitorId,
  } = deps

  const {
    authToken, setAuthToken,
    authScreen,
    authForm, setAuthForm,
    setAuthError,
    setAuthStatus,
    setAuthLoading,
    setLoggedIn,
    recoverySupportDetails, setRecoverySupportDetails,
    setRecoveryStatus,
    pendingRecoveryCodes, setPendingRecoveryCodes,
    accountUpgradeForm,
    setAccountUpgradeStatus,
    setAccountUpgradeError,
    setAccountUpgradeLoading,
    passkeys, setPasskeys,
    passkeySupported,
    setPasskeyLoading,
    setPasskeyStatus,
    passkeyDeviceLink, setPasskeyDeviceLink,
    incomingPasskeyDeviceLinkToken, setIncomingPasskeyDeviceLinkToken,
    setIncomingPasskeyDeviceLinkStatus,
    setIncomingPasskeyDeviceLinkError,
    setIncomingPasskeyDeviceLinkLoading,
    setAccountSessions,
    setAccountActionStatus,
    setAccountActionLoading,
    setSetupRequired,
    setupForm,
    setSetupError,
    setSetupLoading,
    passkeyCeremonyInFlightRef,
    accountActionInFlightRef,
  } = useAccountState()

  // handleLogout clears every domain, so it reads the other providers directly
  // rather than having a dozen setters threaded in as parameters.
  const { setBattleKind, setBattleSessionActive, setServerMatch } = useGameState()
  const { setDeckConfig, setCollection, setPackOffers, setQuestOverview } = useProfileState()
  const { setFriends, setClan, setClanForm, setFriendUsernameInput } = useSocialState()

  async function handleSetup(event: FormEvent) {
    event.preventDefault()
    setSetupError('')
    setSetupLoading(true)

    try {
      const response = await fetch(`${ARENA_URL}/api/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: setupForm.username.trim(),
          password: setupForm.password,
          displayName: setupForm.username.trim(),
        }),
      })
      const data = await response.json() as {
        ok: boolean; error?: string;
        token?: string; profile?: ServerProfile
      }

      if (!data.ok) {
        setSetupError(data.error ?? 'Setup failed.')
        setSetupLoading(false)
        return
      }

      setAuthToken(data.token ?? '')
      setServerProfile(data.profile ?? null)
      setLoggedIn(true)
      setSetupRequired(false)
      if (data.profile?.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
        setDeckConfig(data.profile.deckConfig)
      }
    } catch {
      setSetupError('Network error. Is the server running?')
    }
    setSetupLoading(false)
  }

  async function handleAuth(event: FormEvent) {
    event.preventDefault()
    setAuthError('')
    setAuthStatus('')

    if (authScreen === 'login') {
      await handlePasskeyLogin()
      return
    }

    setAuthLoading(true)

    if (authScreen === 'recover') {
      setAuthLoading(false)
      await handleRecoverAccount()
      return
    }

    if (authScreen === 'grant') {
      setAuthLoading(false)
      await handleRedeemGrantCode()
      return
    }

    if (authScreen === 'signup') {
      if (!passkeySupported) {
        setAuthError('This browser does not support passkey account creation.')
        setAuthLoading(false)
        return
      }
      const passkeyOriginMessage = getPasskeyOriginRequirementMessage()
      if (passkeyOriginMessage) {
        setAuthError(passkeyOriginMessage)
        setAuthLoading(false)
        return
      }
      if (accountUpgradeForm.acceptTerms !== true || accountUpgradeForm.acceptPrivacy !== true || !accountUpgradeForm.ageAttestation) {
        setAuthError('Accept the Terms, Privacy Policy, and age requirement to create an account.')
        setAuthLoading(false)
        return
      }

      try {
        const optionsResponse = await fetch(`${ARENA_URL}/api/auth/passkey/signup/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: authForm.username.trim(),
            displayName: authForm.username.trim(),
            deviceFingerprint: getDeviceFingerprint(),
            acceptTerms: accountUpgradeForm.acceptTerms,
            acceptPrivacy: accountUpgradeForm.acceptPrivacy,
            ageAttestation: accountUpgradeForm.ageAttestation,
            locale: navigator.language,
          }),
        })
        const optionsData = await optionsResponse.json() as {
          ok: boolean; error?: string; pendingAccountId?: string; options?: RegistrationOptionsJSON; challengeId?: string
        }
        if (!optionsData.ok || !optionsData.pendingAccountId || !optionsData.options || !optionsData.challengeId) {
          setAuthError(optionsData.error ?? 'Passkey account creation could not be started.')
          setAuthLoading(false)
          return
        }

        setAuthStatus(PASSKEY_PROMPT_STATUS)
        const credential = await withPasskeyCeremonyTimeout(
          startRegistration({ optionsJSON: optionsData.options }),
          'Passkey prompt timed out. Try again and watch for the browser or system passkey window.',
        )
        setAuthStatus('')
        const verifyResponse = await fetch(`${ARENA_URL}/api/auth/passkey/signup/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pendingAccountId: optionsData.pendingAccountId,
            challengeId: optionsData.challengeId,
            response: credential,
            name: 'Primary passkey',
            acceptTerms: accountUpgradeForm.acceptTerms,
            acceptPrivacy: accountUpgradeForm.acceptPrivacy,
            ageAttestation: accountUpgradeForm.ageAttestation,
            locale: navigator.language,
          }),
        })
        const data = await verifyResponse.json() as { ok: boolean; error?: string; token?: string; profile?: ServerProfile; recoveryCodes?: string[]; recovery?: AccountRecoveryStatus }
        if (!data.ok) {
          setAuthError(data.error ?? 'Passkey account creation failed.')
          setAuthLoading(false)
          return
        }

        setAuthToken(data.token ?? '')
        setServerProfile(data.profile ?? null)
        setLoggedIn(true)
        if (data.profile?.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
          setDeckConfig(data.profile.deckConfig)
        }
        void refreshPasskeys(data.token ?? '')
        void refreshAccountSessions(data.token ?? '')
        void refreshRecoveryStatus(data.token ?? '')
        if (data.recovery) setRecoveryStatus(data.recovery)
        if (data.recoveryCodes?.length) setPendingRecoveryCodes(data.recoveryCodes)
        setAuthError('')
        setToastMessage(`Welcome${data.profile?.username ? ', ' + data.profile.username : ''}!`)
      } catch (error) {
        setAuthStatus('')
        setAuthError(formatPasskeyCeremonyError(error, 'Passkey account creation failed. Please try again.'))
      }
      setAuthLoading(false)
      return
    }

    try {
      const response = await fetch(`${ARENA_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authForm.username.trim(),
          password: authForm.password,
        }),
      })
      const data = await response.json() as { ok: boolean; error?: string; token?: string; profile?: ServerProfile }

      if (!data.ok) {
        setAuthError(data.error ?? 'Authentication failed.')
        setAuthLoading(false)
        return
      }

      setAuthToken(data.token ?? '')
      setServerProfile(data.profile ?? null)
      setLoggedIn(true)
      if (data.profile?.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
        setDeckConfig(data.profile.deckConfig)
      }
      void refreshPasskeys(data.token ?? '')
      void refreshAccountSessions(data.token ?? '')
      void refreshRecoveryStatus(data.token ?? '')
      setAuthError('')
      setToastMessage(data.profile?.accountSetupRequired ? 'Legacy password verified. Finish passkey setup.' : `Welcome${data.profile?.username ? ', ' + data.profile.username : ''}!`)
    } catch {
      setAuthError('Network error. Please try again.')
    }

    setAuthLoading(false)
  }

  async function handlePasskeyLogin() {
    setAuthError('')
    setAuthStatus('')
    setPasskeyStatus('')
    if (!passkeySupported) {
      setAuthError('This browser does not support passkeys.')
      return
    }
    const passkeyOriginMessage = getPasskeyOriginRequirementMessage()
    if (passkeyOriginMessage) {
      setAuthError(passkeyOriginMessage)
      return
    }

    const identifier = authForm.username.trim()
    if (!identifier) {
      setAuthError('Enter your username before using a passkey.')
      return
    }

    setAuthLoading(true)
    try {
      const optionsResponse = await fetch(`${ARENA_URL}/api/auth/passkey/login/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      })
      const optionsData = await optionsResponse.json() as {
        ok: boolean; error?: string; options?: AuthenticationOptionsJSON; challengeId?: string
      }
      if (!optionsData.ok || !optionsData.options || !optionsData.challengeId) {
        setAuthError(optionsData.error ?? 'Passkey login could not be started.')
        setAuthLoading(false)
        return
      }

      setAuthStatus(PASSKEY_PROMPT_STATUS)
      const credential = await withPasskeyCeremonyTimeout(
        startAuthentication({ optionsJSON: optionsData.options }),
        'Passkey prompt timed out. Try again and watch for the browser or system passkey window.',
      )
      setAuthStatus('')
      const verifyResponse = await fetch(`${ARENA_URL}/api/auth/passkey/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: optionsData.challengeId, response: credential }),
      })
      const data = await verifyResponse.json() as { ok: boolean; error?: string; token?: string; profile?: ServerProfile }
      if (!data.ok) {
        setAuthError(data.error ?? 'Passkey login failed.')
        setAuthLoading(false)
        return
      }

      setAuthToken(data.token ?? '')
      setServerProfile(data.profile ?? null)
      setLoggedIn(true)
      if (data.profile?.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
        setDeckConfig(data.profile.deckConfig)
      }
      void refreshPasskeys(data.token ?? '')
      void refreshAccountSessions(data.token ?? '')
      void refreshRecoveryStatus(data.token ?? '')
      setAuthError('')
      setToastMessage(`Welcome${data.profile?.username ? ', ' + data.profile.username : ''}!`)
    } catch (error) {
      setAuthStatus('')
      setAuthError(formatPasskeyCeremonyError(error, 'Passkey login failed. Use account recovery if this device does not have your passkey.'))
    }

    setAuthLoading(false)
  }

  /**
   * Redeem an operator-issued recovery code. This is the last-resort path for a
   * player who lost both their device and their recovery codes: the code
   * identifies its own account, so no username is required.
   */
  async function handleRedeemGrantCode() {
    setAuthError('')
    setAuthStatus('')
    if (!passkeySupported) {
      setAuthError('This browser does not support passkey recovery.')
      return
    }
    const passkeyOriginMessage = getPasskeyOriginRequirementMessage()
    if (passkeyOriginMessage) {
      setAuthError(passkeyOriginMessage)
      return
    }

    const grantCode = authForm.grantCode.trim()
    if (!grantCode) {
      setAuthError('Enter the recovery code you were given.')
      return
    }

    setAuthLoading(true)
    try {
      const optionsResponse = await fetch(`${ARENA_URL}/api/auth/recovery/grant/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantCode }),
      })
      const optionsData = await optionsResponse.json() as {
        ok: boolean; error?: string; options?: RegistrationOptionsJSON; challengeId?: string; username?: string
      }
      if (!optionsData.ok || !optionsData.options || !optionsData.challengeId) {
        setAuthError(optionsData.error ?? 'That recovery code could not be used.')
        setAuthLoading(false)
        return
      }

      setAuthStatus(PASSKEY_PROMPT_STATUS)
      const credential = await withPasskeyCeremonyTimeout(
        startRegistration({ optionsJSON: optionsData.options }),
        'Passkey prompt timed out. Try again and watch for the browser or system passkey window.',
      )
      setAuthStatus('')
      const verifyResponse = await fetch(`${ARENA_URL}/api/auth/recovery/grant/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: optionsData.challengeId, response: credential, name: 'Recovery passkey' }),
      })
      const data = await verifyResponse.json() as {
        ok: boolean; error?: string; token?: string; profile?: ServerProfile; recoveryCodes?: string[]; recovery?: AccountRecoveryStatus
      }
      if (!data.ok) {
        setAuthError(data.error ?? 'Account recovery failed.')
        setAuthLoading(false)
        return
      }

      setAuthToken(data.token ?? '')
      setServerProfile(data.profile ?? null)
      setLoggedIn(true)
      if (data.profile?.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
        setDeckConfig(data.profile.deckConfig)
      }
      if (data.recovery) setRecoveryStatus(data.recovery)
      // A grant is redeemed when the player has nothing left, so a fresh batch
      // of recovery codes always comes back with it. Surface it immediately.
      if (data.recoveryCodes?.length) setPendingRecoveryCodes(data.recoveryCodes)
      setAuthForm((form) => ({ ...form, grantCode: '' }))
      void refreshPasskeys(data.token ?? '')
      void refreshAccountSessions(data.token ?? '')
      void refreshRecoveryStatus(data.token ?? '')
      setToastMessage('Welcome back. Save the new recovery codes before you close this.')
    } catch (error) {
      setAuthStatus('')
      setAuthError(formatPasskeyCeremonyError(error, 'Account recovery failed. Please try again.'))
    }
    setAuthLoading(false)
  }

  async function handleRecoverAccount() {
    setAuthError('')
    setAuthStatus('')
    if (!passkeySupported) {
      setAuthError('This browser does not support passkey recovery.')
      return
    }
    const passkeyOriginMessage = getPasskeyOriginRequirementMessage()
    if (passkeyOriginMessage) {
      setAuthError(passkeyOriginMessage)
      return
    }

    const username = authForm.username.trim()
    const recoveryCode = authForm.recoveryCode.trim()
    if (!username || !recoveryCode) {
      setAuthError('Enter your username and recovery code.')
      return
    }

    setAuthLoading(true)
    try {
      const optionsResponse = await fetch(`${ARENA_URL}/api/auth/recovery/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, recoveryCode }),
      })
      const optionsData = await optionsResponse.json() as {
        ok: boolean; error?: string; options?: RegistrationOptionsJSON; challengeId?: string
      }
      if (!optionsData.ok || !optionsData.options || !optionsData.challengeId) {
        setAuthError(optionsData.error ?? 'Account recovery could not be started.')
        setAuthLoading(false)
        return
      }

      setAuthStatus(PASSKEY_PROMPT_STATUS)
      const credential = await withPasskeyCeremonyTimeout(
        startRegistration({ optionsJSON: optionsData.options }),
        'Passkey prompt timed out. Try again and watch for the browser or system passkey window.',
      )
      setAuthStatus('')
      const verifyResponse = await fetch(`${ARENA_URL}/api/auth/recovery/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: optionsData.challengeId, response: credential, name: 'Recovery passkey' }),
      })
      const data = await verifyResponse.json() as {
        ok: boolean; error?: string; token?: string; profile?: ServerProfile; recoveryCodes?: string[]; recovery?: AccountRecoveryStatus
      }
      if (!data.ok) {
        setAuthError(data.error ?? 'Account recovery failed.')
        setAuthLoading(false)
        return
      }

      setAuthToken(data.token ?? '')
      setServerProfile(data.profile ?? null)
      setLoggedIn(true)
      if (data.profile?.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
        setDeckConfig(data.profile.deckConfig)
      }
      if (data.recovery) setRecoveryStatus(data.recovery)
      if (data.recoveryCodes?.length) setPendingRecoveryCodes(data.recoveryCodes)
      void refreshPasskeys(data.token ?? '')
      void refreshAccountSessions(data.token ?? '')
      void refreshRecoveryStatus(data.token ?? '')
      setToastMessage('Account recovered. Old passkeys and sessions were revoked.')
    } catch (error) {
      setAuthStatus('')
      setAuthError(formatPasskeyCeremonyError(error, 'Account recovery failed. Please try again.'))
    }
    setAuthLoading(false)
  }

  async function handleSubmitRecoverySupport() {
    const username = authForm.username.trim()
    const details = recoverySupportDetails.trim()
    if (!username || !details) {
      setAuthError('Enter your username and recovery support details before sending a ticket.')
      return
    }

    setAuthLoading(true)
    setAuthError('')
    try {
      const response = await fetch(`${ARENA_URL}/api/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId,
          sessionId,
          page: 'account-recovery',
          category: 'account_recovery',
          severity: 'high',
          summary: `Lost access for ${username}`,
          details: `Username: ${username}\n${details}`,
        }),
      })
      const data = await response.json() as { ok?: boolean; complaintId?: string; message?: string; error?: string }
      if (!response.ok || data.ok === false) {
        setAuthError(data.message ?? data.error ?? 'Recovery support ticket could not be sent.')
        setAuthLoading(false)
        return
      }
      setRecoverySupportDetails('')
      setAuthError(`Recovery support ticket ${data.complaintId ?? ''} sent. An admin can review it in Operations.`)
    } catch {
      setAuthError('Recovery support ticket could not be sent.')
    }
    setAuthLoading(false)
  }

  async function ensureRecentPasskeyAuth(): Promise<boolean> {
    if (!authToken) return false
    if (passkeyCeremonyInFlightRef.current) {
      setAccountActionStatus('Passkey confirmation is already in progress.')
      return false
    }
    if (!passkeySupported) {
      setAccountActionStatus('This browser does not support passkey confirmation.')
      return false
    }
    const passkeyOriginMessage = getPasskeyOriginRequirementMessage()
    if (passkeyOriginMessage) {
      setAccountActionStatus(passkeyOriginMessage)
      return false
    }

    passkeyCeremonyInFlightRef.current = true
    try {
      const optionsResponse = await authFetch('/api/auth/passkey/reauth/options', authToken, { method: 'POST' })
      const optionsData = await optionsResponse.json() as { ok: boolean; error?: string; options?: AuthenticationOptionsJSON; challengeId?: string }
      if (!optionsData.ok || !optionsData.options || !optionsData.challengeId) {
        setAccountActionStatus(optionsData.error ?? 'Passkey confirmation could not be started.')
        return false
      }

      setAccountActionStatus(PASSKEY_PROMPT_STATUS)
      const credential = await withPasskeyCeremonyTimeout(
        startAuthentication({ optionsJSON: optionsData.options }),
        'Passkey prompt timed out. Try again and watch for the browser or system passkey window.',
      )
      const verifyResponse = await authFetch('/api/auth/passkey/reauth/verify', authToken, {
        method: 'POST',
        body: { challengeId: optionsData.challengeId, response: credential },
      })
      const data = await verifyResponse.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!verifyResponse.ok || data.ok !== true) {
        setAccountActionStatus(data.error ?? 'Passkey confirmation failed.')
        return false
      }
      setAccountActionStatus('')
      return true
    } catch (error) {
      setAccountActionStatus(formatPasskeyCeremonyError(error, 'Passkey confirmation failed.', 'Passkey confirmation was cancelled.'))
      return false
    } finally {
      passkeyCeremonyInFlightRef.current = false
    }
  }


  async function refreshServerProfile(tokenOverride = authToken): Promise<ServerProfile | null> {
    if (!tokenOverride) return null
    try {
      const response = await authFetch('/api/me', tokenOverride)
      const data = await response.json() as { ok: boolean; profile?: ServerProfile }
      if (!response.ok || !data.ok || !data.profile) return null
      setServerProfile(data.profile)
      if (data.profile.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
        setDeckConfig(data.profile.deckConfig)
      }
      return data.profile
    } catch {
      return null
    }
  }

  async function refreshPasskeys(tokenOverride = authToken) {
    if (!tokenOverride) return
    try {
      const response = await authFetch('/api/me/passkeys', tokenOverride)
      const data = await response.json() as { ok: boolean; passkeys?: PasskeySummary[] }
      if (data.ok) setPasskeys(data.passkeys ?? [])
    } catch {
      setPasskeyStatus('Passkeys could not be loaded.')
    }
  }

  async function refreshAccountSessions(tokenOverride = authToken) {
    if (!tokenOverride) return
    try {
      const response = await authFetch('/api/me/sessions', tokenOverride)
      const data = await response.json() as { ok: boolean; sessions?: AccountSessionSummary[] }
      if (data.ok) setAccountSessions(data.sessions ?? [])
    } catch {
      setAccountActionStatus('Sessions could not be loaded.')
    }
  }

  async function refreshRecoveryStatus(tokenOverride = authToken) {
    if (!tokenOverride) return
    try {
      const response = await authFetch('/api/me/recovery-codes', tokenOverride)
      const data = await response.json() as { ok: boolean; recovery?: AccountRecoveryStatus }
      if (data.ok) setRecoveryStatus(data.recovery ?? null)
    } catch {
      setAccountActionStatus('Recovery code status could not be loaded.')
    }
  }

  function downloadRecoveryCodes() {
    if (pendingRecoveryCodes.length === 0) return
    const body = [
      'Fractured Arcanum recovery codes',
      'Save these somewhere private. Each code can be used once to recover your account and replace old passkeys.',
      '',
      ...pendingRecoveryCodes,
      '',
    ].join('\n')
    const blob = new Blob([body], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fractured-arcanum-recovery-codes-${serverProfile?.username ?? 'account'}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function copyRecoveryCodes() {
    if (pendingRecoveryCodes.length === 0) return
    try {
      await navigator.clipboard.writeText(pendingRecoveryCodes.join('\n'))
      setAccountActionStatus('Recovery codes copied.')
    } catch {
      setAccountActionStatus('Copy failed. Download the codes instead.')
    }
  }

  async function handleGenerateRecoveryCodes() {
    if (!authToken) return
    if (accountActionInFlightRef.current) {
      setAccountActionStatus('Recovery code setup is already in progress.')
      return
    }
    if (pendingRecoveryCodes.length > 0) {
      setAccountActionStatus('Recovery codes are already generated. Save this batch before continuing.')
      return
    }
    accountActionInFlightRef.current = true
    setAccountActionLoading(true)
    if (!await ensureRecentPasskeyAuth()) {
      accountActionInFlightRef.current = false
      setAccountActionLoading(false)
      return
    }
    setAccountActionStatus('')
    try {
      const response = await authFetch('/api/me/recovery-codes/generate', authToken, { method: 'POST' })
      const data = await response.json() as { ok: boolean; error?: string; recoveryCodes?: string[]; recovery?: AccountRecoveryStatus; profile?: ServerProfile }
      if (!data.ok || !data.recoveryCodes?.length) {
        setAccountActionStatus(data.error ?? 'Recovery codes could not be generated.')
        return
      }
      setPendingRecoveryCodes(data.recoveryCodes)
      setRecoveryStatus(data.recovery ?? null)
      if (data.profile) setServerProfile(data.profile)
      await refreshServerProfile()
      setAccountActionStatus('Recovery codes generated. Save them before continuing.')
    } catch {
      setAccountActionStatus('Recovery codes could not be generated.')
    } finally {
      accountActionInFlightRef.current = false
      setAccountActionLoading(false)
    }
  }

  async function handleAcknowledgeRecoveryCodes() {
    if (!authToken || pendingRecoveryCodes.length === 0) return
    setAccountActionLoading(true)
    setAccountActionStatus('')
    try {
      const response = await authFetch('/api/me/recovery-codes/acknowledge', authToken, { method: 'POST' })
      const data = await response.json() as { ok: boolean; error?: string; recovery?: AccountRecoveryStatus; profile?: ServerProfile }
      if (!data.ok) {
        setAccountActionStatus(data.error ?? 'Recovery codes could not be confirmed.')
        setAccountActionLoading(false)
        return
      }
      setPendingRecoveryCodes([])
      setRecoveryStatus(data.recovery ?? null)
      if (data.profile) setServerProfile(data.profile)
      await refreshServerProfile()
      await refreshSocialHub()
      setToastMessage('Recovery codes saved.')
    } catch {
      setAccountActionStatus('Recovery codes could not be confirmed.')
    }
    setAccountActionLoading(false)
  }

  function clearPasskeyDeviceLink() {
    setPasskeyDeviceLink(null)
    setAccountActionStatus('')
  }

  async function handleCopyPasskeyDeviceLink() {
    if (!passkeyDeviceLink?.linkUrl) return
    try {
      await navigator.clipboard.writeText(passkeyDeviceLink.linkUrl)
      setAccountActionStatus('Device link copied. Open it on the device you want to add.')
    } catch {
      setAccountActionStatus('Copy failed. Select the link and send it to your other device.')
    }
  }

  async function handleCreatePasskeyDeviceLink() {
    if (!authToken) return
    if (accountActionInFlightRef.current) {
      setAccountActionStatus('Account security action is already in progress.')
      return
    }
    accountActionInFlightRef.current = true
    setAccountActionLoading(true)
    setAccountActionStatus('')
    if (!await ensureRecentPasskeyAuth()) {
      accountActionInFlightRef.current = false
      setAccountActionLoading(false)
      return
    }

    try {
      const response = await authFetch('/api/me/passkey-device-links', authToken, { method: 'POST' })
      const data = await response.json() as { ok: boolean; error?: string; token?: string; linkUrl?: string; link?: { expiresAt?: string } }
      if (!response.ok || !data.ok || !data.token || !data.linkUrl) {
        setAccountActionStatus(data.error ?? 'Device link could not be created.')
        return
      }
      setPasskeyDeviceLink({ token: data.token, linkUrl: data.linkUrl, expiresAt: data.link?.expiresAt ?? '' })
      setAccountActionStatus('Device link created. Open it on the device you want to add.')
    } catch {
      setAccountActionStatus('Device link could not be created.')
    } finally {
      accountActionInFlightRef.current = false
      setAccountActionLoading(false)
    }
  }

  function cancelIncomingPasskeyDeviceLink() {
    setIncomingPasskeyDeviceLinkToken('')
    setIncomingPasskeyDeviceLinkStatus('')
    setIncomingPasskeyDeviceLinkError('')
    clearPasskeyDeviceLinkParam()
  }

  async function handleCompleteIncomingPasskeyDeviceLink() {
    const deviceLinkToken = incomingPasskeyDeviceLinkToken.trim()
    setIncomingPasskeyDeviceLinkError('')
    setIncomingPasskeyDeviceLinkStatus('')
    if (!deviceLinkToken) {
      setIncomingPasskeyDeviceLinkError('Device link is missing or expired.')
      return
    }
    if (!passkeySupported) {
      setIncomingPasskeyDeviceLinkError('This browser does not support passkeys.')
      return
    }
    const passkeyOriginMessage = getPasskeyOriginRequirementMessage()
    if (passkeyOriginMessage) {
      setIncomingPasskeyDeviceLinkError(passkeyOriginMessage)
      return
    }

    setIncomingPasskeyDeviceLinkLoading(true)
    try {
      const optionsResponse = await fetch(`${ARENA_URL}/api/auth/passkey/device-link/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceLinkToken }),
      })
      const optionsData = await optionsResponse.json() as {
        ok: boolean; error?: string; options?: RegistrationOptionsJSON; challengeId?: string; account?: { username?: string; displayName?: string }
      }
      if (!optionsResponse.ok || !optionsData.ok || !optionsData.options || !optionsData.challengeId) {
        setIncomingPasskeyDeviceLinkError(optionsData.error ?? 'Device link passkey setup could not be started.')
        setIncomingPasskeyDeviceLinkLoading(false)
        return
      }

      setIncomingPasskeyDeviceLinkStatus(PASSKEY_PROMPT_STATUS)
      const credential = await withPasskeyCeremonyTimeout(
        startRegistration({ optionsJSON: optionsData.options }),
        'Passkey prompt timed out. Try again and watch for the browser or system passkey window.',
      )
      setIncomingPasskeyDeviceLinkStatus('')
      const verifyResponse = await fetch(`${ARENA_URL}/api/auth/passkey/device-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceLinkToken,
          challengeId: optionsData.challengeId,
          response: credential,
          name: 'Linked device passkey',
        }),
      })
      const data = await verifyResponse.json() as { ok: boolean; error?: string; token?: string; profile?: ServerProfile; passkeys?: PasskeySummary[] }
      if (!verifyResponse.ok || !data.ok) {
        setIncomingPasskeyDeviceLinkError(data.error ?? 'Device link passkey setup failed.')
        setIncomingPasskeyDeviceLinkLoading(false)
        return
      }

      setAuthToken(data.token ?? '')
      setServerProfile(data.profile ?? null)
      setLoggedIn(true)
      if (data.profile?.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
        setDeckConfig(data.profile.deckConfig)
      }
      if (data.passkeys) setPasskeys(data.passkeys)
      setIncomingPasskeyDeviceLinkToken('')
      clearPasskeyDeviceLinkParam()
      void refreshPasskeys(data.token ?? '')
      void refreshAccountSessions(data.token ?? '')
      void refreshRecoveryStatus(data.token ?? '')
      setToastMessage('This device is linked to your account.')
    } catch (error) {
      setIncomingPasskeyDeviceLinkStatus('')
      setIncomingPasskeyDeviceLinkError(formatPasskeyCeremonyError(error, 'Device link passkey setup failed. Please try again.'))
    }
    setIncomingPasskeyDeviceLinkLoading(false)
  }

  async function handleLogoutAllSessions() {
    if (!authToken) return
    const ok = await askConfirm({
      title: 'Log out all sessions?',
      body: 'This signs out every device for this account, including this one.',
      confirmLabel: 'Log Out All',
      danger: true,
    })
    if (!ok) return
    if (!await ensureRecentPasskeyAuth()) return

    setAccountActionLoading(true)
    try {
      await authFetch('/api/auth/logout-all', authToken, { method: 'POST' })
      handleLogout()
    } catch {
      setAccountActionStatus('Could not log out all sessions.')
    }
    setAccountActionLoading(false)
  }

  async function handleExportAccountData() {
    if (!authToken) return
    setAccountActionLoading(true)
    setAccountActionStatus('')
    try {
      const response = await authFetch('/api/me/export', authToken)
      const data = await response.json() as { ok: boolean; error?: string; export?: unknown }
      if (!data.ok || !data.export) {
        setAccountActionStatus(data.error ?? 'Account export failed.')
        setAccountActionLoading(false)
        return
      }
      const blob = new Blob([JSON.stringify(data.export, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `fractured-arcanum-account-${serverProfile?.username ?? 'export'}.json`
      link.click()
      URL.revokeObjectURL(url)
      setAccountActionStatus('Account export downloaded.')
    } catch {
      setAccountActionStatus('Account export failed.')
    }
    setAccountActionLoading(false)
  }

  async function handleDeleteAccount(password: string) {
    if (!authToken) return
    const ok = await askConfirm({
      title: 'Delete account?',
      body: 'This disables login, removes passkeys, cancels pending trades, and signs out all sessions.',
      confirmLabel: 'Delete Account',
      danger: true,
    })
    if (!ok) return
    if (!await ensureRecentPasskeyAuth()) return

    setAccountActionLoading(true)
    setAccountActionStatus('')
    try {
      const response = await authFetch('/api/me/delete', authToken, {
        method: 'POST',
        body: { password },
      })
      const data = await response.json() as { ok: boolean; error?: string }
      if (!data.ok) {
        setAccountActionStatus(data.error ?? 'Account could not be deleted.')
        setAccountActionLoading(false)
        return
      }
      handleLogout()
    } catch {
      setAccountActionStatus('Account could not be deleted.')
    }
    setAccountActionLoading(false)
  }

  async function handleRegisterPasskey() {
    if (!authToken) return
    if (passkeyCeremonyInFlightRef.current) {
      setPasskeyStatus('Passkey setup is already in progress. Finish the browser or system prompt before trying again.')
      return
    }
    setPasskeyStatus('')
    if (!passkeySupported) {
      setPasskeyStatus('This browser does not support passkeys.')
      return
    }
    const passkeyOriginMessage = getPasskeyOriginRequirementMessage()
    if (passkeyOriginMessage) {
      setPasskeyStatus(passkeyOriginMessage)
      return
    }

    passkeyCeremonyInFlightRef.current = true
    setPasskeyLoading(true)
    try {
      const optionsResponse = await authFetch('/api/auth/passkey/register/options', authToken, { method: 'POST' })
      const optionsData = await optionsResponse.json() as {
        ok: boolean; error?: string; options?: RegistrationOptionsJSON; challengeId?: string
      }
      if (!optionsData.ok || !optionsData.options || !optionsData.challengeId) {
        setPasskeyStatus(optionsData.error ?? 'Passkey registration could not be started.')
        return
      }

      setPasskeyStatus(PASSKEY_PROMPT_STATUS)
      const credential = await withPasskeyCeremonyTimeout(
        startRegistration({ optionsJSON: optionsData.options }),
        'Passkey prompt timed out. Try again and watch for the browser or system passkey window.',
      )
      const verifyResponse = await authFetch('/api/auth/passkey/register/verify', authToken, {
        method: 'POST',
        body: {
          challengeId: optionsData.challengeId,
          response: credential,
          name: `Passkey ${passkeys.length + 1}`,
        },
      })
      const data = await verifyResponse.json() as {
        ok: boolean; error?: string; passkeys?: PasskeySummary[]; profile?: ServerProfile
      }
      if (!data.ok) {
        setPasskeyStatus(data.error ?? 'Passkey registration could not be verified.')
        return
      }

      setPasskeys(data.passkeys ?? [])
      if (data.profile) setServerProfile(data.profile)
      await Promise.all([
        refreshPasskeys(authToken),
        refreshRecoveryStatus(authToken),
        refreshServerProfile(authToken),
      ])
      setPasskeyStatus('Passkey added.')
      setToastMessage('Passkey added.')
    } catch (error) {
      setPasskeyStatus(formatPasskeyCeremonyError(error, 'Passkey creation did not finish. Try again and watch for the browser or system passkey window.'))
    } finally {
      passkeyCeremonyInFlightRef.current = false
      setPasskeyLoading(false)
    }
  }

  async function handleDeletePasskey(passkeyId: string) {
    if (!authToken) return
    if (!await ensureRecentPasskeyAuth()) return
    setPasskeyLoading(true)
    setPasskeyStatus('')
    try {
      const response = await authFetch(`/api/me/passkeys/${encodeURIComponent(passkeyId)}`, authToken, { method: 'DELETE' })
      const data = await response.json() as { ok: boolean; error?: string; passkeys?: PasskeySummary[] }
      if (!data.ok) {
        setPasskeyStatus(data.error ?? 'Passkey could not be removed.')
        setPasskeyLoading(false)
        return
      }
      setPasskeys(data.passkeys ?? [])
      setPasskeyStatus('Passkey removed.')
    } catch {
      setPasskeyStatus('Network error. Please try again.')
    }

    setPasskeyLoading(false)
  }

  async function handleCompleteAccountUpgrade(event: FormEvent) {
    event.preventDefault()
    if (!authToken) return
    setAccountUpgradeError('')
    setAccountUpgradeStatus('')
    setAccountUpgradeLoading(true)

    try {
      const response = await authFetch('/api/me/account-upgrade/complete', authToken, {
        method: 'POST',
        body: {
          acceptTerms: accountUpgradeForm.acceptTerms,
          acceptPrivacy: accountUpgradeForm.acceptPrivacy,
          ageAttestation: accountUpgradeForm.ageAttestation,
          locale: navigator.language,
        },
      })
      const data = await response.json() as { ok: boolean; error?: string; profile?: ServerProfile; recoveryCodes?: string[]; recovery?: AccountRecoveryStatus }
      if (!data.ok) {
        setAccountUpgradeError(data.error ?? 'Account setup could not be completed.')
        setAccountUpgradeLoading(false)
        return
      }

      setServerProfile(data.profile ?? serverProfile)
      if (data.recovery) setRecoveryStatus(data.recovery)
      if (data.recoveryCodes?.length) setPendingRecoveryCodes(data.recoveryCodes)
      await refreshServerProfile()
      setAccountUpgradeStatus('Account setup complete.')
      setToastMessage('Account setup complete.')
    } catch {
      setAccountUpgradeError('Network error. Please try again.')
    }

    setAccountUpgradeLoading(false)
  }

  function handleLogout() {
    if (authToken) {
      void authFetch('/api/auth/logout', authToken, { method: 'POST' }).catch(() => {})
    }
    socketClientRef.current?.disconnect()
    socketClientRef.current = null
    setBackendOnline(false)
    setBattleKind('ai')
    setBattleSessionActive(false)
    setServerMatch({ phase: 'idle', matchId: null, revision: 0, kind: null, outcome: null })
    setCollection({})
    setPackOffers([])
    setQuestOverview(null)
    setFriends([])
    setClan(null)
    setFriendUsernameInput('')
    setClanForm({ name: '', tag: '', inviteCode: '' })
    setAuthToken('')
    setServerProfile(null)
    setLoggedIn(false)
    setAccountUpgradeStatus('')
    setAccountUpgradeError('')
    setPasskeys([])
    setPasskeyStatus('')
    setPasskeyDeviceLink(null)
    setIncomingPasskeyDeviceLinkToken('')
    setIncomingPasskeyDeviceLinkStatus('')
    setIncomingPasskeyDeviceLinkError('')
    setAccountSessions([])
    setRecoveryStatus(null)
    setPendingRecoveryCodes([])
    setRecoverySupportDetails('')
    setAccountActionStatus('')
    setToastMessage('Logged out.')
  }

  return {
    handleSetup,
    handleAuth,
    handlePasskeyLogin,
    handleRedeemGrantCode,
    handleRecoverAccount,
    handleSubmitRecoverySupport,
    ensureRecentPasskeyAuth,
    refreshServerProfile,
    refreshPasskeys,
    refreshAccountSessions,
    refreshRecoveryStatus,
    downloadRecoveryCodes,
    copyRecoveryCodes,
    handleGenerateRecoveryCodes,
    handleAcknowledgeRecoveryCodes,
    clearPasskeyDeviceLink,
    handleCopyPasskeyDeviceLink,
    handleCreatePasskeyDeviceLink,
    cancelIncomingPasskeyDeviceLink,
    handleCompleteIncomingPasskeyDeviceLink,
    handleLogoutAllSessions,
    handleExportAccountData,
    handleDeleteAccount,
    handleRegisterPasskey,
    handleDeletePasskey,
    handleCompleteAccountUpgrade,
    handleLogout,
  }
}
