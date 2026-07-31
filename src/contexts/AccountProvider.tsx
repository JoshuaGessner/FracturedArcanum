import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { STORAGE_KEYS } from '../constants'
import { readStoredValue } from '../utils'
import type {
  AccountRecoveryStatus,
  AccountSessionSummary,
  AuthScreen,
  PasskeyDeviceLink,
  PasskeySummary,
} from '../types'

/**
 * Identity state: sign-in, first-launch setup, passkeys, device links,
 * recovery codes, and active sessions.
 *
 * Extracted from `AppShell`, which held these as 31 loose `useState` pairs
 * woven through a 4,000-line component. `authToken` alone was referenced 109
 * times. That is why the account handlers could not simply be lifted into a
 * hook: passing this much state as parameters needed 66 arguments, which
 * relocates coupling rather than removing it.
 *
 * With the state here, both `AppShell` and the account action hook read it
 * directly and neither has to be handed it. This is the same shape as
 * GameProvider and ProfileProvider.
 *
 * Deliberately NOT here: `serverProfile` and the economy values derived from
 * it (shards, rank, record). Those are read by three screens and five shared
 * components, so moving them is a wider change and belongs in its own pass.
 *
 * The two refs are in-flight guards for ceremonies that must not overlap —
 * `useRef` identity is already stable, so they live here with the state they
 * guard rather than in the component.
 */

/** The URL carries a one-time token when a device link is being accepted. */
function readPasskeyDeviceLinkToken(): string {
  if (typeof window === 'undefined') return ''
  const params = new URLSearchParams(window.location.search)
  return params.get('passkeyDeviceLink')?.trim() ?? ''
}

export type AccountStateValue = {
  authToken: string
  setAuthToken: Dispatch<SetStateAction<string>>
  authScreen: AuthScreen
  setAuthScreen: Dispatch<SetStateAction<AuthScreen>>
  authForm: { username: string; password: string; recoveryCode: string; grantCode: string }
  setAuthForm: Dispatch<SetStateAction<{ username: string; password: string; recoveryCode: string; grantCode: string }>>
  authError: string
  setAuthError: Dispatch<SetStateAction<string>>
  authStatus: string
  setAuthStatus: Dispatch<SetStateAction<string>>
  authLoading: boolean
  setAuthLoading: Dispatch<SetStateAction<boolean>>
  loggedIn: boolean
  setLoggedIn: Dispatch<SetStateAction<boolean>>

  recoverySupportDetails: string
  setRecoverySupportDetails: Dispatch<SetStateAction<string>>
  recoveryStatus: AccountRecoveryStatus | null
  setRecoveryStatus: Dispatch<SetStateAction<AccountRecoveryStatus | null>>
  pendingRecoveryCodes: string[]
  setPendingRecoveryCodes: Dispatch<SetStateAction<string[]>>

  accountUpgradeForm: { acceptTerms: boolean; acceptPrivacy: boolean; ageAttestation: string }
  setAccountUpgradeForm: Dispatch<SetStateAction<{ acceptTerms: boolean; acceptPrivacy: boolean; ageAttestation: string }>>
  accountUpgradeStatus: string
  setAccountUpgradeStatus: Dispatch<SetStateAction<string>>
  accountUpgradeError: string
  setAccountUpgradeError: Dispatch<SetStateAction<string>>
  accountUpgradeLoading: boolean
  setAccountUpgradeLoading: Dispatch<SetStateAction<boolean>>

  passkeys: PasskeySummary[]
  setPasskeys: Dispatch<SetStateAction<PasskeySummary[]>>
  /** Capability probe, read once at mount; there is no setter by design. */
  passkeySupported: boolean
  passkeyLoading: boolean
  setPasskeyLoading: Dispatch<SetStateAction<boolean>>
  passkeyStatus: string
  setPasskeyStatus: Dispatch<SetStateAction<string>>
  passkeyDeviceLink: PasskeyDeviceLink | null
  setPasskeyDeviceLink: Dispatch<SetStateAction<PasskeyDeviceLink | null>>
  incomingPasskeyDeviceLinkToken: string
  setIncomingPasskeyDeviceLinkToken: Dispatch<SetStateAction<string>>
  incomingPasskeyDeviceLinkStatus: string
  setIncomingPasskeyDeviceLinkStatus: Dispatch<SetStateAction<string>>
  incomingPasskeyDeviceLinkError: string
  setIncomingPasskeyDeviceLinkError: Dispatch<SetStateAction<string>>
  incomingPasskeyDeviceLinkLoading: boolean
  setIncomingPasskeyDeviceLinkLoading: Dispatch<SetStateAction<boolean>>

  accountSessions: AccountSessionSummary[]
  setAccountSessions: Dispatch<SetStateAction<AccountSessionSummary[]>>
  accountActionStatus: string
  setAccountActionStatus: Dispatch<SetStateAction<string>>
  accountActionLoading: boolean
  setAccountActionLoading: Dispatch<SetStateAction<boolean>>

  setupRequired: boolean | null
  setSetupRequired: Dispatch<SetStateAction<boolean | null>>
  setupForm: { username: string; password: string }
  setSetupForm: Dispatch<SetStateAction<{ username: string; password: string }>>
  setupError: string
  setSetupError: Dispatch<SetStateAction<string>>
  setupLoading: boolean
  setSetupLoading: Dispatch<SetStateAction<boolean>>

  /** Guards against a second WebAuthn ceremony starting mid-flight. */
  passkeyCeremonyInFlightRef: MutableRefObject<boolean>
  /** Guards against double-submitting a destructive account action. */
  accountActionInFlightRef: MutableRefObject<boolean>
}

const AccountContext = createContext<AccountStateValue | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [authToken, setAuthToken] = useState(() => readStoredValue(STORAGE_KEYS.authToken, ''))
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login')
  const [authForm, setAuthForm] = useState({ username: '', password: '', recoveryCode: '', grantCode: '' })
  const [authError, setAuthError] = useState('')
  const [authStatus, setAuthStatus] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  const [recoverySupportDetails, setRecoverySupportDetails] = useState('')
  const [recoveryStatus, setRecoveryStatus] = useState<AccountRecoveryStatus | null>(null)
  const [pendingRecoveryCodes, setPendingRecoveryCodes] = useState<string[]>([])

  const [accountUpgradeForm, setAccountUpgradeForm] = useState({
    acceptTerms: false,
    acceptPrivacy: false,
    ageAttestation: '',
  })
  const [accountUpgradeStatus, setAccountUpgradeStatus] = useState('')
  const [accountUpgradeError, setAccountUpgradeError] = useState('')
  const [accountUpgradeLoading, setAccountUpgradeLoading] = useState(false)

  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([])
  const [passkeySupported] = useState(() => browserSupportsWebAuthn())
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyStatus, setPasskeyStatus] = useState('')
  const [passkeyDeviceLink, setPasskeyDeviceLink] = useState<PasskeyDeviceLink | null>(null)
  const [incomingPasskeyDeviceLinkToken, setIncomingPasskeyDeviceLinkToken] = useState(readPasskeyDeviceLinkToken)
  const [incomingPasskeyDeviceLinkStatus, setIncomingPasskeyDeviceLinkStatus] = useState('')
  const [incomingPasskeyDeviceLinkError, setIncomingPasskeyDeviceLinkError] = useState('')
  const [incomingPasskeyDeviceLinkLoading, setIncomingPasskeyDeviceLinkLoading] = useState(false)

  const [accountSessions, setAccountSessions] = useState<AccountSessionSummary[]>([])
  const [accountActionStatus, setAccountActionStatus] = useState('')
  const [accountActionLoading, setAccountActionLoading] = useState(false)

  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const [setupForm, setSetupForm] = useState({ username: '', password: '' })
  const [setupError, setSetupError] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)

  const passkeyCeremonyInFlightRef = useRef(false)
  const accountActionInFlightRef = useRef(false)

  const value = useMemo<AccountStateValue>(
    () => ({
      authToken, setAuthToken,
      authScreen, setAuthScreen,
      authForm, setAuthForm,
      authError, setAuthError,
      authStatus, setAuthStatus,
      authLoading, setAuthLoading,
      loggedIn, setLoggedIn,
      recoverySupportDetails, setRecoverySupportDetails,
      recoveryStatus, setRecoveryStatus,
      pendingRecoveryCodes, setPendingRecoveryCodes,
      accountUpgradeForm, setAccountUpgradeForm,
      accountUpgradeStatus, setAccountUpgradeStatus,
      accountUpgradeError, setAccountUpgradeError,
      accountUpgradeLoading, setAccountUpgradeLoading,
      passkeys, setPasskeys,
      passkeySupported,
      passkeyLoading, setPasskeyLoading,
      passkeyStatus, setPasskeyStatus,
      passkeyDeviceLink, setPasskeyDeviceLink,
      incomingPasskeyDeviceLinkToken, setIncomingPasskeyDeviceLinkToken,
      incomingPasskeyDeviceLinkStatus, setIncomingPasskeyDeviceLinkStatus,
      incomingPasskeyDeviceLinkError, setIncomingPasskeyDeviceLinkError,
      incomingPasskeyDeviceLinkLoading, setIncomingPasskeyDeviceLinkLoading,
      accountSessions, setAccountSessions,
      accountActionStatus, setAccountActionStatus,
      accountActionLoading, setAccountActionLoading,
      setupRequired, setSetupRequired,
      setupForm, setSetupForm,
      setupError, setSetupError,
      setupLoading, setSetupLoading,
      passkeyCeremonyInFlightRef,
      accountActionInFlightRef,
    }),
    [
      authToken, authScreen, authForm, authError, authStatus, authLoading, loggedIn,
      recoverySupportDetails, recoveryStatus, pendingRecoveryCodes,
      accountUpgradeForm, accountUpgradeStatus, accountUpgradeError, accountUpgradeLoading,
      passkeys, passkeySupported, passkeyLoading, passkeyStatus, passkeyDeviceLink,
      incomingPasskeyDeviceLinkToken, incomingPasskeyDeviceLinkStatus,
      incomingPasskeyDeviceLinkError, incomingPasskeyDeviceLinkLoading,
      accountSessions, accountActionStatus, accountActionLoading,
      setupRequired, setupForm, setupError, setupLoading,
    ],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

/**
 * Read identity state and its setters.
 *
 * Used by `AppShell` and by the account action handlers. Screens reach this
 * through `useAppShell()`, which republishes the readonly parts.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAccountState(): AccountStateValue {
  const ctx = useContext(AccountContext)
  if (!ctx) {
    throw new Error('useAccountState must be used inside <AccountProvider>')
  }
  return ctx
}
