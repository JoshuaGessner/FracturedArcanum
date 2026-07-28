import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { io, type Socket } from 'socket.io-client'
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { playSound } from './audio'
import { setAmbientScene, type AmbientScene } from './ambient'
import { feedback } from './feedback'
import {
  type GameMode,
  type AIDifficulty,
  type BattleSide,
  type DeckConfig,
  type GameState,
  type Unit,
  MIN_DECK_SIZE,
  MAX_DECK_SIZE,
  MAX_COPIES,
  MAX_LEGENDARY_COPIES,
  CARD_LIBRARY,
  otherSide,
  getDeckSize,
  boardHasGuard,
  playCard,
  attack,
  castMomentumBurst,
  passTurn,
  createGame,
  generateEnemyTurnSteps,
  getRecommendedAIDifficulty,
} from './game'
import {
  ARENA_URL,
  CARD_BORDER_OFFERS,
  ECONOMY_REWARDS,
  STORAGE_KEYS,
  THEME_OFFERS,
} from './constants'
import {
  authFetch,
  createAnonymousId,
  formatPasskeyCeremonyError,
  getDeviceFingerprint,
  getPasskeyOriginRequirementMessage,
  getRankLabel,
  getScreenBucket,
  getScreenTransitionClass,
  getScreenTransitionSound,
  pulseFeedback,
  readStoredValue,
  shouldPresentScopedReward,
  type RewardScope,
} from './utils'
import { createPwaInstallState, getInitialServiceWorkerStatus, isPwaStandaloneMode, type PwaServiceWorkerStatus } from './pwa'
import { ToastStack } from './components/ToastStack'
import { ConfirmModal } from './components/ConfirmModal'
import { TextPromptModal } from './components/TextPromptModal'
import { CardInspectModal } from './components/CardInspectModal'
import { NavBar } from './components/NavBar'
import { TopBar } from './components/TopBar'
import { BattleIntroOverlay } from './components/BattleIntroOverlay'
import { RewardCinemaOverlay } from './components/RewardCinemaOverlay'
import { OnboardingTour } from './components/OnboardingTour'
import { useSceneSwipe } from './hooks/useSceneSwipe'
import { getNeighborScreen, NAV_ORDER } from './utils/sceneSwipe'
import { useMeasuredHeightVar, useViewportMetrics } from './hooks/useViewportMetrics'
import {
  buildBattleVictorySequence,
  buildDailyClaimSequence,
  buildQuestClaimBatchSequence,
  buildRankUpSequence,
  type RewardBeat,
} from './components/RewardCinemaSequence'
import { SettingsScreen } from './screens/SettingsScreen'
import { ShopScreen } from './screens/ShopScreen'
import { CollectionScreen } from './screens/CollectionScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SocialScreen } from './screens/SocialScreen'
import { BattleScreen } from './screens/BattleScreen'
import { AppShellContext, type AppShellContextValue, type LongPressOptions } from './AppShellContext'
import type {
  AdminAuditEntry,
  AdminOverview,
  AdminUser,
  AdminAccountDetail,
  AdminDeletedAccount,
  IssuedGrant,
  AccountRecoveryStatus,
  AccountSessionSummary,
  AppScreen,
  AuthScreen,
  CardBorder,
  CardCollection,
  ComplaintFormState,
  CosmeticTheme,
  InspectedCard,
  InstallPromptEvent,
  LeaderboardEntry,
  OpenedPackCard,
  OpponentProfile,
  PackOffer,
  PasskeyDeviceLink,
  PasskeySummary,
  QuestOverview,
  QueuePresence,
  QueueSearchStatus,
  MatchSettlement,
  ServerBattleKind,
  ServerMatchLifecycle,
  SettingsSubview,
  SavedDeck,
  ServerProfile,
  SocialClan,
  SocialFriend,
  Trade,
} from './types'
import { QueueProvider, useQueueState } from './contexts/QueueProvider'
import { ProfileProvider, useProfileState } from './contexts/ProfileProvider'
import { SocialProvider, useSocialState } from './contexts/SocialProvider'
import { GameProvider, useGameState } from './contexts/GameProvider'
import './App.css'

type RegistrationOptionsJSON = Parameters<typeof startRegistration>[0]['optionsJSON']
type AuthenticationOptionsJSON = Parameters<typeof startAuthentication>[0]['optionsJSON']

const PASSKEY_CEREMONY_TIMEOUT_MS = 75_000
const PASSKEY_PROMPT_STATUS = 'Complete the passkey prompt in your browser or system window.'

function createPasskeyTimeoutError(message: string): Error {
  const error = new Error(message)
  error.name = 'PasskeyTimeoutError'
  return error
}

function readPasskeyDeviceLinkToken(): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('passkeyDeviceLink') ?? ''
}

function clearPasskeyDeviceLinkParam(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('passkeyDeviceLink')) return
  url.searchParams.delete('passkeyDeviceLink')
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
}

async function withPasskeyCeremonyTimeout<T>(ceremony: Promise<T>, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(createPasskeyTimeoutError(timeoutMessage)), PASSKEY_CEREMONY_TIMEOUT_MS)
  })

  ceremony.catch(() => {})

  try {
    return await Promise.race([ceremony, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

/**
 * Phase 1B — App is now a thin wrapper that exists only to host the
 * provider tree. All effects, handlers, and refs live in `AppShell`.
 *
 * Phase 1F added `QueueProvider`. Phase 1D added `ProfileProvider`.
 * Phase 1E added `SocialProvider`. Phase 1C added `GameProvider`
 * (active battle/game presentation state). Refs and handlers remain in
 * `AppShell` because they are tightly coupled to socket/auth/profile
 * context that hasn’t been lifted yet.
 */
function App() {
  return (
    <QueueProvider>
      <ProfileProvider>
        <SocialProvider>
          <GameProvider>
            <AppShell />
          </GameProvider>
        </SocialProvider>
      </ProfileProvider>
    </QueueProvider>
  )
}

/**
 * Every way into an account, in the order a lost player should consider them.
 * The auth footer renders all of these except the current screen, so no route
 * is ever a dead end — the previous hand-written links left, for example, a
 * legacy account with no way to reach the support-code path.
 */
const AUTH_ROUTES: { screen: AuthScreen; prompt: string; label: string }[] = [
  { screen: 'login', prompt: 'Already have a passkey?', label: 'Sign in' },
  { screen: 'signup', prompt: 'New here?', label: 'Create account' },
  { screen: 'recover', prompt: 'Lost your device?', label: 'Use a recovery code' },
  { screen: 'grant', prompt: 'No codes left?', label: 'Use a support code' },
  { screen: 'legacy', prompt: 'Old password account?', label: 'Upgrade it' },
]

/** Title shown in the top bar. Exhaustive over AppScreen by construction. */
const SCREEN_TITLES: Record<AppScreen, string> = {
  home: 'Arena Home',
  collection: 'Collection',
  social: 'Social',
  battle: 'Battlefield',
  shop: 'Shop',
  settings: 'Settings',
}

/**
 * Normalize a quest payload into a complete overview.
 *
 * Chains and reroll availability come from the server, but defaulting them
 * keeps a cached service-worker response from an older build — or a server
 * mid-deploy — from blanking the ledger instead of just omitting the new parts.
 */
function toQuestOverview(data: Partial<QuestOverview>): QuestOverview | null {
  if (!data.quests || !data.summary) return null
  return {
    quests: data.quests,
    chains: data.chains ?? [],
    summary: data.summary,
    rerolls: data.rerolls ?? { daily: false, weekly: false },
  }
}

function AppShell() {
  // ─── Auth state ───────────────────────────────────────────────────────
  const [authToken, setAuthToken] = useState(() => readStoredValue(STORAGE_KEYS.authToken, ''))
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login')
  const [authForm, setAuthForm] = useState({ username: '', password: '', recoveryCode: '', grantCode: '' })
  const [authError, setAuthError] = useState('')
  const [authStatus, setAuthStatus] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [recoverySupportDetails, setRecoverySupportDetails] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
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
  const [recoveryStatus, setRecoveryStatus] = useState<AccountRecoveryStatus | null>(null)
  const [pendingRecoveryCodes, setPendingRecoveryCodes] = useState<string[]>([])
  const [accountActionStatus, setAccountActionStatus] = useState('')
  const [accountActionLoading, setAccountActionLoading] = useState(false)
  const passkeyCeremonyInFlightRef = useRef(false)
  const accountActionInFlightRef = useRef(false)

  // ─── First-launch setup state ─────────────────────────────────────────
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const [setupForm, setSetupForm] = useState({ username: '', password: '' })
  const [setupError, setSetupError] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)

  // ─── Server-authoritative player state ────────────────────────────────
  const [serverProfile, setServerProfile] = useState<ServerProfile | null>(null)
  const accountReadiness = serverProfile?.accountReadiness ?? null
  const accountRequirements = accountReadiness?.requirements ?? []
  const accountSetupRequired = serverProfile?.accountSetupRequired === true || accountReadiness?.setupRequired === true
  const hasPasskeySetupRequirement = accountRequirements.some((item) => item.id === 'passkey' || item.id === 'owner_second_passkey')
  const hasLegalSetupRequirement = accountRequirements.some((item) => item.id === 'terms' || item.id === 'privacy' || item.id === 'age_attestation')
  const hasRecoverySetupRequirement = accountRequirements.some((item) => item.id === 'recovery_codes' || item.id === 'recovery_codes_saved')
  const incomingPasskeyDeviceLinkActive = setupRequired === false && Boolean(incomingPasskeyDeviceLinkToken)
  const forcedAccountGateActive = incomingPasskeyDeviceLinkActive || (loggedIn && (pendingRecoveryCodes.length > 0 || (accountSetupRequired && accountRequirements.length > 0)))
  const shards = serverProfile?.shards ?? 0
  const seasonRating = serverProfile?.seasonRating ?? 1200
  const record = { wins: serverProfile?.wins ?? 0, losses: serverProfile?.losses ?? 0, streak: serverProfile?.streak ?? 0 }
  const ownedThemes = serverProfile?.ownedThemes ?? ['royal'] as CosmeticTheme[]
  const selectedTheme = (serverProfile?.selectedTheme ?? 'royal') as CosmeticTheme
  const ownedCardBorders: CardBorder[] = serverProfile?.ownedCardBorders ?? ['default']
  const selectedCardBorder: CardBorder = serverProfile?.selectedCardBorder ?? 'default'
  const lastDailyClaim = serverProfile?.lastDaily ?? ''
  const accountRole = serverProfile?.role ?? 'user'
  const isAdminRole = accountRole === 'admin' || accountRole === 'owner'
  const isOwnerRole = accountRole === 'owner'

  // ─── Phase 1D — deck/collection/shop state lives in ProfileProvider ──
  const {
    savedDecks, setSavedDecks,
    activeDeckId, setActiveDeckId,
    setPendingBreakdown,
    deckConfig, setDeckConfig,
    collection, setCollection,
    setPackOffers,
    setOpenedPackCards,
    setPackOpening,
    setPrevCollectionSnapshot,
    setQuestOverview,
  } = useProfileState()

  // ─── Local screen-shell state ─────────────────────────────────────────
  const [activeScreen, setActiveScreen] = useState<AppScreen>('home')
  const activeScreenRef = useRef<AppScreen>('home')
  const [settingsSubview, setSettingsSubview] = useState<SettingsSubview>('preferences')
  const [screenTransitionClass, setScreenTransitionClass] = useState<'screen-enter-forward' | 'screen-enter-back' | 'screen-enter-lateral' | 'screen-enter-battle'>('screen-enter-lateral')

  // ─── Layout runtime ───────────────────────────────────────────────────
  // Publishes --app-h / --kb-inset from visualViewport, and mirrors the dock
  // chrome heights so the scene stage can reserve exactly the right space
  // instead of guessing at it with height media queries.
  const topBarRef = useMeasuredHeightVar('--top-h')
  const navBarRef = useMeasuredHeightVar('--nav-h')
  useViewportMetrics()

  // ─── Phase 3W — Reward cinema sequence (battle / daily / pack / rank-up)
  const [cinemaSequence, setCinemaSequence] = useState<RewardBeat[] | null>(null)
  const [battleSummaryVisible, setBattleSummaryVisible] = useState(false)
  const cinemaScopeRef = useRef<RewardScope>('generic')
  const presentRewardCinema = useCallback((beats: RewardBeat[], scope: RewardScope = 'generic') => {
    if (beats.length === 0) return
    if (!shouldPresentScopedReward(scope, activeScreenRef.current)) return
    cinemaScopeRef.current = scope
    setBattleSummaryVisible(false)
    setCinemaSequence(beats)
  }, [])
  const dismissRewardCinema = useCallback(() => {
    const scope = cinemaScopeRef.current
    cinemaScopeRef.current = 'generic'
    setCinemaSequence(null)
    setBattleSummaryVisible(scope === 'battle' && activeScreenRef.current === 'battle')
  }, [])
  const dismissBattleSummary = useCallback(() => setBattleSummaryVisible(false), [])
  // Tracks the most recent pack open's duplicate refund so ShopScreen can
  // build an accurate finisher cinema after the ceremony overlay closes.
  const [lastPackRefund, setLastPackRefund] = useState<number>(0)

  // ─── Phase 3X — First-launch onboarding tour visibility ──────────────
  const [tourVisible, setTourVisible] = useState(false)
  const tourAutoTriggeredRef = useRef(false)

  // ─── Phase 3L — Transient post-claim checkmark flag ──────────────────
  const [justClaimedDaily, setJustClaimedDaily] = useState(false)

  useEffect(() => {
    activeScreenRef.current = activeScreen
  }, [activeScreen])

  // ─── Phase 1C — active battle/game state lives in GameProvider ───────
  const {
    preferredMode, setPreferredMode,
    aiDifficultySetting, setAiDifficultySetting,
    setLobbyCode,
    game, setGame,
    selectedAttacker, setSelectedAttacker,
    battleKind, setBattleKind,
    battleSessionActive, setBattleSessionActive,
    serverBattleActive, serverMatch, setServerMatch,
    enemyTurnActive, setEnemyTurnActive,
    setEnemyTurnLabel,
    setOpponentDisconnected,
    setDisconnectGraceMs,
    battleIntroVisible, setBattleIntroVisible,
    setDamagedSlots,
    inspectedCard, setInspectedCard,
  } = useGameState()
  // Phase 1F — queue state lives in QueueProvider above AppShell.
  const {
    queueState, setQueueState,
    setQueueSeconds,
    queuedOpponent, setQueuedOpponent,
    queuePresence, setQueuePresence,
    setQueueSearchStatus,
    setLeaderboardEntries,
  } = useQueueState()
  // ─── Phase 1E — social/trade/challenge state lives in SocialProvider ──
  const {
    setFriends,
    setOnlineFriendIds,
    outgoingChallenge, setOutgoingChallenge,
    incomingChallenge, setIncomingChallenge,
    setChallengeStatus,
    setTrades,
    tradesTick, setTradesTick,
    setTradeStatus,
    tradeForm, setTradeForm,
    tradePickerDraft, setTradePickerDraft,
    tradeSubmitting, setTradeSubmitting,
    nowTick,
    setClan,
    setSocialLoading,
    setSocialStatus,
    friendUsernameInput, setFriendUsernameInput,
    clanForm, setClanForm,
  } = useSocialState()
  const resolvedMatchKeyRef = useRef('')
  const socketClientRef = useRef<Socket | null>(null)
  // 3P: in-flight rejoin guard so manual Resume + auto reconnect can
  // not double-emit `game:rejoin`. Cleared by game:start, game:rejoin,
  // or game:rejoin_failed.
  const rejoinInFlightRef = useRef(false)
  const serverMatchRef = useRef<ServerMatchLifecycle>(serverMatch)
  const actionInFlightRef = useRef(false)
  const actionSequenceRef = useRef(0)
  const pendingServerBattleKindRef = useRef<ServerBattleKind | null>(null)
  useEffect(() => {
    serverMatchRef.current = serverMatch
  }, [serverMatch])
  const [backendOnline, setBackendOnline] = useState(false)
  const [, setMotd] = useState('Queue up for ranked arena play.')
  const [dailyQuest, setDailyQuest] = useState('Win 1 ranked arena match')
  const [featuredMode, setFeaturedMode] = useState('Ranked Blitz')
  const [, setMaintenanceMode] = useState(false)
  const [seasonName, setSeasonName] = useState('Season of Whispers')
  const [seasonEnd, setSeasonEnd] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(() => readStoredValue(STORAGE_KEYS.sound, true))
  const [ambientEnabled, setAmbientEnabled] = useState(() => readStoredValue(STORAGE_KEYS.ambient, false))
  const [gesturesEnabled, setGesturesEnabled] = useState(() => readStoredValue(STORAGE_KEYS.gestures, true))
  const [hapticsEnabled, setHapticsEnabled] = useState(() => readStoredValue(STORAGE_KEYS.haptics, true))
  const [analyticsConsent, setAnalyticsConsent] = useState(() =>
    readStoredValue(STORAGE_KEYS.analyticsConsent, true),
  )
  const [visitorId] = useState(() => readStoredValue(STORAGE_KEYS.visitor, createAnonymousId()))
  const [sessionId] = useState(() => `session-${Math.random().toString(36).slice(2, 10)}`)
  const [installPromptEvent, setInstallPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [pwaInstalledHint, setPwaInstalledHint] = useState(() => readStoredValue(STORAGE_KEYS.pwaInstalled, false) || isPwaStandaloneMode())
  const [pwaServiceWorkerStatus, setPwaServiceWorkerStatus] = useState<PwaServiceWorkerStatus>(() => getInitialServiceWorkerStatus())
  const [toastMessage, setToastMessageRaw] = useState('Ready your deck and enter the arena.')
  const [toastSeverity, setToastSeverity] = useState<'info' | 'success' | 'warning' | 'error'>('info')
  type ToastEntry = { id: string; message: string; severity: 'info' | 'success' | 'warning' | 'error' }
  const [toastStack, setToastStack] = useState<ToastEntry[]>([])
  const inferToastSeverity = useCallback(
    (text: string): 'info' | 'success' | 'warning' | 'error' => {
      const lc = text.toLowerCase()
      if (/(error|fail|could not|cannot|denied|invalid|wrong|disconnect|lost|revok|too short|too long|already|forbid|unavailable|not enough)/.test(lc))
        return 'error'
      if (/(warning|caution|expired|reconnect|waiting|slow|delay)/.test(lc)) return 'warning'
      if (/(welcome|claimed|unlocked|equipped|victory|won|saved|added|matched|ready|reconnected|installed|now an admin|server owner)/.test(lc))
        return 'success'
      return 'info'
    },
    [],
  )
  const setToastMessage = useCallback(
    (message: string, severityOverride?: 'info' | 'success' | 'warning' | 'error') => {
      const severity = severityOverride ?? inferToastSeverity(message)
      setToastMessageRaw(message)
      setToastSeverity(severity)
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setToastStack((current) => [...current.slice(-3), { id, message, severity }])
      window.setTimeout(() => {
        setToastStack((current) => current.filter((entry) => entry.id !== id))
      }, 4200)
    },
    [inferToastSeverity],
  )

  const refreshQuestOverview = useCallback(async (): Promise<QuestOverview | null> => {
    if (!authToken) return null
    try {
      const response = await authFetch('/api/me/quests', authToken)
      const data = (await response.json()) as { ok?: boolean; error?: string } & Partial<QuestOverview>
      if (!data.ok) return null
      const overview = toQuestOverview(data)
      if (overview) {
        setQuestOverview(overview)
        return overview
      }
    } catch {
      return null
    }
    return null
  }, [authToken, setQuestOverview])
  type ConfirmOptions = {
    title: string
    body: React.ReactNode
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    requireText?: string
    requireTextLabel?: string
  }
  type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void }
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const [confirmTextInput, setConfirmTextInput] = useState('')
  type TextPromptRequest = {
    title: string
    label: string
    confirmLabel?: string
    placeholder?: string
    initialValue?: string
    maxLength?: number
    resolve: (value: string | null) => void
  }
  const [textPromptRequest, setTextPromptRequest] = useState<TextPromptRequest | null>(null)
  const [textPromptValue, setTextPromptValue] = useState('')
  const askConfirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setConfirmTextInput('')
        setConfirmRequest({ ...options, resolve })
      }),
    [],
  )
  const closeConfirm = useCallback(
    (ok: boolean) => {
      setConfirmRequest((current) => {
        if (current) current.resolve(ok)
        return null
      })
      setConfirmTextInput('')
    },
    [],
  )
  const askTextPrompt = useCallback(
    (options: Omit<TextPromptRequest, 'resolve'>): Promise<string | null> =>
      new Promise<string | null>((resolve) => {
        setTextPromptValue(options.initialValue ?? '')
        setTextPromptRequest({ ...options, resolve })
      }),
    [],
  )
  const closeTextPrompt = useCallback(
    (ok: boolean) => {
      setTextPromptRequest((current) => {
        if (current) current.resolve(ok ? textPromptValue.trim() : null)
        return null
      })
      setTextPromptValue('')
    },
    [textPromptValue],
  )
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false)
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const [complaintForm, setComplaintForm] = useState<ComplaintFormState>({
    category: 'gameplay',
    severity: 'normal',
    summary: '',
    details: '',
  })
  const [complaintStatus, setComplaintStatus] = useState('No issue reports submitted in this session.')
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [adminUsersLoading, setAdminUsersLoading] = useState(false)
  const [adminUserSearch, setAdminUserSearch] = useState('')
  const [adminAudit, setAdminAudit] = useState<AdminAuditEntry[]>([])
  const [adminAuditFilter, setAdminAuditFilter] = useState<string>('all')
  const [adminAuditExpandedId, setAdminAuditExpandedId] = useState<string | null>(null)
  const [adminAccountDetail, setAdminAccountDetail] = useState<AdminAccountDetail | null>(null)
  const [adminAccountLoading, setAdminAccountLoading] = useState(false)
  const [adminDeletedAccounts, setAdminDeletedAccounts] = useState<AdminDeletedAccount[]>([])
  const [adminDeletedLoading, setAdminDeletedLoading] = useState(false)
  // Shown once after issuing; the code cannot be retrieved again.
  const [issuedGrant, setIssuedGrant] = useState<IssuedGrant | null>(null)
  const [transferForm, setTransferForm] = useState({ targetAccountId: '', password: '' })
  const [transferStatus, setTransferStatus] = useState('')
  const longPressTimerRef = useRef<number | null>(null)
  const longPressOriginRef = useRef<{ pointerId: number; clientX: number; clientY: number; moveTolerancePx: number; axisCancel: NonNullable<LongPressOptions['axisCancel']> } | null>(null)
  const longPressTriggeredRef = useRef(false)
  const battleStartedRef = useRef(false)
  const battleIntroTimerRef = useRef<number | null>(null)
  const enemyTurnTimers = useRef<number[]>([])
  const prevBoardRef = useRef<{ player: Array<Unit | null>; enemy: Array<Unit | null> } | null>(null)
  const [adminSettings, setAdminSettings] = useState({
    motd: 'Queue up for ranked arena play.',
    quest: 'Win 1 ranked arena match',
    featuredMode: 'Ranked Blitz',
    maintenanceMode: false,
  })

  const sendAnalytics = useCallback(
    async (type: string, meta: Record<string, unknown> = {}, route = 'home') => {
      if (!analyticsConsent) {
        return
      }

      try {
        await fetch(`${ARENA_URL}/api/analytics/track`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            visitorId,
            sessionId,
            type,
            route,
            meta,
          }),
        })
      } catch {
        // analytics is best-effort only
      }
    },
    [analyticsConsent, sessionId, visitorId],
  )

  const refreshSocialHub = useCallback(async () => {
    if (!authToken || !loggedIn) {
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch('/api/social', authToken)
      const data = (await response.json()) as { ok?: boolean; error?: string; friends?: SocialFriend[]; clan?: SocialClan | null }
      if (!response.ok || !data.ok) {
        setSocialStatus(data.error ?? 'Unable to load social hub right now.')
        return
      }

      setFriends(data.friends ?? [])
      setClan(data.clan ?? null)
      setSocialStatus(data.clan ? 'Clan and friend roster synced.' : 'No clan joined yet. Create one or join with an invite code.')
    } catch {
      setSocialStatus('Social hub is temporarily unavailable.')
    } finally {
      setSocialLoading(false)
    }
    // setFriends/setClan/setSocialStatus/setSocialLoading come from
    // SocialProvider's useState; stable but eslint can't see through useContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, loggedIn])

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressOriginRef.current = null
  }

  function consumeLongPressAction() {
    if (!longPressTriggeredRef.current) {
      return false
    }

    longPressTriggeredRef.current = false
    return true
  }

  function inspectCard(card: InspectedCard) {
    clearLongPressTimer()
    longPressTriggeredRef.current = true
    feedback('inspect', soundEnabled, hapticsEnabled)
    setInspectedCard(card)
  }

  function getLongPressProps(card: InspectedCard, options: LongPressOptions = {}) {
    return {
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
          return
        }

        clearLongPressTimer()
        longPressTriggeredRef.current = false
        longPressOriginRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          moveTolerancePx: options.moveTolerancePx ?? 8,
          axisCancel: options.axisCancel ?? 'any',
        }
        longPressTimerRef.current = window.setTimeout(() => inspectCard(card), options.delayMs ?? 420)
      },
      onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
        // Coordinate-based cancellation is more reliable on touch hardware
        // than movementX/movementY, which may stay near zero on Safari/iOS.
        if (longPressTimerRef.current === null) return
        const origin = longPressOriginRef.current
        if (!origin || origin.pointerId !== event.pointerId) return
        const horizontalDelta = Math.abs(event.clientX - origin.clientX)
        const verticalDelta = Math.abs(event.clientY - origin.clientY)
        const movement = origin.axisCancel === 'horizontal'
          ? horizontalDelta
          : origin.axisCancel === 'vertical'
            ? verticalDelta
            : Math.hypot(horizontalDelta, verticalDelta)
        if (movement > origin.moveTolerancePx) clearLongPressTimer()
      },
      onPointerUp: () => clearLongPressTimer(),
      onPointerLeave: () => clearLongPressTimer(),
      onPointerCancel: () => clearLongPressTimer(),
      onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault()
        event.stopPropagation()
      },
      onDragStart: (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault()
      },
    }
  }

  const triggerBattleIntro = useCallback(() => {
    battleStartedRef.current = true
    if (battleIntroTimerRef.current) {
      window.clearTimeout(battleIntroTimerRef.current)
    }
    setBattleIntroVisible(true)
    battleIntroTimerRef.current = window.setTimeout(() => {
      setBattleIntroVisible(false)
      battleIntroTimerRef.current = null
    }, 1600)
    // setBattleIntroVisible comes from GameProvider's useState; stable but
    // eslint can't see through useContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Auth: restore session on mount ──────────────────────────────────────
  useEffect(() => {
    if (!authToken) return
    void authFetch('/api/me', authToken)
      .then((r) => {
        if (!r.ok) throw new Error('expired')
        return r.json()
      })
      .then((data: { ok: boolean; profile?: ServerProfile }) => {
        if (data.ok && data.profile) {
          setServerProfile(data.profile)
          setLoggedIn(true)
          if (data.profile.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
            setDeckConfig(data.profile.deckConfig)
          }
          void refreshPasskeys(authToken)
          void refreshAccountSessions(authToken)
          void refreshRecoveryStatus(authToken)
        } else {
          setAuthToken('')
        }
      })
      .catch(() => setAuthToken(''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Check if first-launch setup is needed ────────────────────────────
  useEffect(() => {
    void fetch(`${ARENA_URL}/api/setup/status`)
      .then((r) => r.json())
      .then((data: { ok: boolean; setupComplete: boolean }) => {
        setSetupRequired(data.ok ? !data.setupComplete : false)
      })
      .catch(() => setSetupRequired(false))
  }, [])

  useEffect(() => {
    if (activeScreen !== 'settings' || !authToken) return
    if (settingsSubview === 'account') {
      void refreshAccountSessions(authToken)
      void refreshPasskeys(authToken)
      void refreshRecoveryStatus(authToken)
    }

    let cancelled = false
    void authFetch('/api/me', authToken)
      .then((response) => {
        if (!response.ok) throw new Error('profile refresh failed')
        return response.json()
      })
      .then((data: { ok: boolean; profile?: ServerProfile }) => {
        if (cancelled || !data.ok || !data.profile) return
        setServerProfile(data.profile)
        if (data.profile.deckConfig && Object.keys(data.profile.deckConfig).length > 0) {
          setDeckConfig(data.profile.deckConfig)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [activeScreen, authToken, settingsSubview, setDeckConfig]) // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (!authToken) {
      socketClientRef.current?.disconnect()
      socketClientRef.current = null
      return
    }

    const socket = io(ARENA_URL, {
      autoConnect: true,
      auth: { token: authToken },
    })
    socketClientRef.current = socket

    socket.on('connect', () => {
      setBackendOnline(true)
      if (serverMatchRef.current.phase !== 'idle' && serverMatchRef.current.phase !== 'terminal') {
        setServerMatch((current) => current.phase === 'idle' || current.phase === 'terminal'
          ? current
          : { ...current, phase: 'reconnecting' })
        setToastMessage('Connected. Restoring your live match…')
      }
    })

    socket.on('queue:status', (payload: QueuePresence) => {
      setQueuePresence(payload)
    })

    socket.on('queue:searching', (payload: Partial<QueueSearchStatus>) => {
      setQueueState('searching')
      setQueueSearchStatus((current) => ({
        ...current,
        position: payload.position ?? current.position,
        queueSize: payload.queueSize ?? current.queueSize,
        connectedPlayers: payload.connectedPlayers ?? current.connectedPlayers,
        waitSeconds: payload.waitSeconds ?? current.waitSeconds,
        estimatedWaitSeconds: payload.estimatedWaitSeconds ?? current.estimatedWaitSeconds,
        ratingWindow: payload.ratingWindow ?? current.ratingWindow,
      }))
    })

    socket.on('leaderboard:update', (payload: { entries: LeaderboardEntry[] }) => {
      setLeaderboardEntries(payload.entries ?? [])
    })

    socket.on('disconnect', () => {
      setBackendOnline(false)
      setQueueState('idle')
      setQueuedOpponent(null)
      // 3P: clear in-flight guard so the auto-rejoin on the next
      // `connect` event is allowed through.
      rejoinInFlightRef.current = false
      actionInFlightRef.current = false
      if (serverMatchRef.current.phase !== 'idle' && serverMatchRef.current.phase !== 'terminal') {
        setServerMatch((current) => current.phase === 'idle' || current.phase === 'terminal'
          ? current
          : { ...current, phase: 'reconnecting' })
        setToastMessage('Connection lost. Reconnecting to your match...')
      } else {
        setToastMessage('Connection lost. Reconnecting to live services...')
      }
    })

    socket.on('connect_error', () => {
      setBackendOnline(false)
      setQueueState('idle')
      setQueuedOpponent(null)
      rejoinInFlightRef.current = false
      actionInFlightRef.current = false
    })

    socket.on('server:hello', (payload: { message: string; seasonName?: string; seasonEnd?: string | null }) => {
      setMotd(payload.message)
      if (payload.seasonName) setSeasonName(payload.seasonName)
      if (payload.seasonEnd !== undefined) setSeasonEnd(payload.seasonEnd)
    })

    socket.on('server:role_changed', (payload: { role?: unknown }) => {
      const nextRole = payload?.role
      if (nextRole !== 'user' && nextRole !== 'admin' && nextRole !== 'owner') return
      setServerProfile((profile) => (profile ? { ...profile, role: nextRole } : profile))
      if (nextRole === 'user') {
        setToastMessage('Your admin privileges were revoked.')
      } else if (nextRole === 'admin') {
        setToastMessage('You are now an admin.')
      } else if (nextRole === 'owner') {
        setToastMessage('You are now the server owner.')
      }
    })

    socket.on('presence:snapshot', (payload: { onlineFriendIds?: string[] }) => {
      setOnlineFriendIds(new Set(payload?.onlineFriendIds ?? []))
    })

    socket.on('presence:update', (payload: { accountId?: string; online?: boolean }) => {
      if (!payload?.accountId) return
      setOnlineFriendIds((current) => {
        const next = new Set(current)
        if (payload.online) next.add(payload.accountId!)
        else next.delete(payload.accountId!)
        return next
      })
    })

    socket.on('challenge:incoming', (payload: { challengeId: string; fromAccountId: string; fromName: string; expiresAt: number }) => {
      setIncomingChallenge(payload)
      setToastMessage(`${payload.fromName} challenged you to an unranked duel.`)
    })

    socket.on('challenge:sent', (payload: { challengeId: string; toAccountId: string; toName: string; expiresAt: number }) => {
      setOutgoingChallenge(payload)
      setChallengeStatus(`Waiting for ${payload.toName} to accept…`)
    })

    socket.on('challenge:declined', (payload: { challengeId: string }) => {
      setOutgoingChallenge((current) => (current?.challengeId === payload.challengeId ? null : current))
      setIncomingChallenge((current) => (current?.challengeId === payload.challengeId ? null : current))
      setChallengeStatus('Challenge declined.')
    })

    socket.on('challenge:cancelled', (payload: { challengeId: string; reason?: string }) => {
      setOutgoingChallenge((current) => (current?.challengeId === payload.challengeId ? null : current))
      setIncomingChallenge((current) => (current?.challengeId === payload.challengeId ? null : current))
      setChallengeStatus(payload?.reason === 'disconnected' ? 'Challenge cancelled — player disconnected.' : 'Challenge cancelled.')
    })

    socket.on('challenge:expired', (payload: { challengeId: string }) => {
      setOutgoingChallenge((current) => (current?.challengeId === payload.challengeId ? null : current))
      setIncomingChallenge((current) => (current?.challengeId === payload.challengeId ? null : current))
      setChallengeStatus('Challenge expired.')
    })

    socket.on('challenge:error', (payload: { error?: string }) => {
      setChallengeStatus(payload?.error ?? 'Challenge failed.')
    })

    socket.on('challenge:matched', (payload: { roomId: string; opponent: OpponentProfile; mode: string }) => {
      setOutgoingChallenge(null)
      setIncomingChallenge(null)
      setChallengeStatus('')
      setQueuedOpponent(payload.opponent)
      setQueueState('found')
      setLobbyCode(payload.roomId.toUpperCase())
      pendingServerBattleKindRef.current = 'friend'
      setBattleKind('friend')
      setToastMessage(`Unranked duel ready against ${payload.opponent.name}.`)
    })

    socket.on('trade:incoming', () => {
      setToastMessage('You have a new trade proposal.')
      setTradesTick((n) => n + 1)
    })
    socket.on('trade:updated', () => {
      setTradesTick((n) => n + 1)
    })

    socket.on(
      'server:profileUpdated',
      (payload: { motd?: string; quest?: string; featuredMode?: string; maintenanceMode?: boolean }) => {
        if (payload.motd) {
          setMotd(payload.motd)
        }

        if (payload.quest) {
          setDailyQuest(payload.quest)
        }

        if (payload.featuredMode) {
          setFeaturedMode(payload.featuredMode)
        }

        setMaintenanceMode(Boolean(payload.maintenanceMode))
      },
    )

    socket.on(
      'queue:matched',
      (payload: { roomId: string; opponent: OpponentProfile }) => {
        setQueuedOpponent(payload.opponent)
        setQueueState('found')
        setLobbyCode(payload.roomId.toUpperCase())
        pendingServerBattleKindRef.current = 'ranked'
        setToastMessage(`Match found against ${payload.opponent.name}.`)
      },
    )

    socket.on('game:start', (payload: { matchId?: string; roomId?: string; revision?: number; yourSide: BattleSide; serverMode?: 'ai' | 'duel' | 'unranked'; state: GameState }) => {
      const matchId = payload.matchId ?? payload.roomId
      if (!matchId) {
        setToastMessage('The server returned an invalid match. Please queue again.')
        return
      }
      const current = serverMatchRef.current
      if (current.phase === 'terminal' && current.matchId === matchId) return
      if (current.phase !== 'idle' && current.phase !== 'terminal' && current.matchId !== matchId) return
      if (current.matchId === matchId && (payload.revision ?? current.revision) < current.revision) return
      rejoinInFlightRef.current = false
      actionInFlightRef.current = false
      setGame(payload.state)
      const nextBattleKind = pendingServerBattleKindRef.current
        ?? (payload.serverMode === 'ai' ? 'ai' : payload.serverMode === 'unranked' ? 'friend' : 'ranked')
      pendingServerBattleKindRef.current = null
      setBattleKind(nextBattleKind)
      setBattleSessionActive(true)
      resolvedMatchKeyRef.current = matchId
      setServerMatch({ phase: 'active', matchId, revision: payload.revision ?? 0, kind: nextBattleKind, outcome: null })
      transitionToScreen('battle')
      setQueueState('idle')
      setQueueSeconds(0)
      setQueuedOpponent(null)
      triggerBattleIntro()
      playSound('summon', soundEnabled)
    })

    socket.on('game:state', (payload: { matchId?: string; roomId?: string; revision?: number; state: GameState }) => {
      const matchId = payload.matchId ?? payload.roomId
      const current = serverMatchRef.current
      if (!matchId || current.phase === 'idle' || current.phase === 'terminal' || current.matchId !== matchId) return
      if ((payload.revision ?? current.revision) < current.revision) return
      actionInFlightRef.current = false
      setGame(payload.state)
      setServerMatch({ ...current, phase: 'active', revision: payload.revision ?? current.revision })
    })

    socket.on('game:over', (payload: { matchId?: string; roomId?: string; revision?: number; result: MatchSettlement['result']; reason?: MatchSettlement['reason']; serverMode?: 'ai' | 'duel' | 'unranked'; state?: GameState; settlement?: Partial<MatchSettlement> }) => {
      const matchId = payload.matchId ?? payload.roomId
      const current = serverMatchRef.current
      if (!matchId || current.phase === 'terminal') return
      const recoveringPersistedSettlement = current.phase === 'idle'
      if (!recoveringPersistedSettlement && current.matchId !== matchId) return
      if (!recoveringPersistedSettlement && (payload.revision ?? current.revision) < current.revision) return
      const matchKind: ServerBattleKind = recoveringPersistedSettlement
        ? payload.serverMode === 'ai' ? 'ai' : payload.serverMode === 'unranked' ? 'friend' : 'ranked'
        : current.kind
      const settlement: MatchSettlement = {
        matchId,
        kind: matchKind,
        result: payload.result,
        reason: payload.reason ?? 'completed',
        shardsEarned: payload.settlement?.shardsEarned ?? 0,
        ratingDelta: payload.settlement?.ratingDelta ?? 0,
        shards: payload.settlement?.shards ?? serverProfile?.shards ?? 0,
        seasonRating: payload.settlement?.seasonRating ?? serverProfile?.seasonRating ?? 1200,
        wins: payload.settlement?.wins ?? serverProfile?.wins ?? 0,
        losses: payload.settlement?.losses ?? serverProfile?.losses ?? 0,
        streak: payload.settlement?.streak ?? serverProfile?.streak ?? 0,
      }
      actionInFlightRef.current = false
      rejoinInFlightRef.current = false
      socket.emit('game:settlement_ack', { matchId })
      setServerProfile((previous) => previous ? {
        ...previous,
        shards: settlement.shards,
        seasonRating: settlement.seasonRating,
        wins: settlement.wins,
        losses: settlement.losses,
        streak: settlement.streak,
      } : previous)
      void refreshQuestOverview()
      if (recoveringPersistedSettlement) {
        setToastMessage(`Previous ${matchKind === 'ai' ? 'AI' : matchKind === 'friend' ? 'friend' : 'ranked'} result synced: ${payload.result}.`)
        return
      }
      if (payload.state) {
        setGame(payload.state)
      } else {
        setGame((currentGame) => ({
          ...currentGame,
          winner: payload.result === 'win' ? 'player' : payload.result === 'loss' ? 'enemy' : 'draw',
        }))
      }
      setOpponentDisconnected(false)
      setDisconnectGraceMs(0)
      setBattleSessionActive(false)
      setServerMatch({ phase: 'terminal', matchId, revision: payload.revision ?? current.revision, kind: current.kind, outcome: settlement })
      if (payload.result === 'win') {
        const previousRating = serverProfile?.seasonRating ?? settlement.seasonRating - settlement.ratingDelta
        const previousRankLabel = getRankLabel(previousRating)
        const nextRankLabel = getRankLabel(settlement.seasonRating)
        const beats = buildBattleVictorySequence({
          rankLabel: nextRankLabel,
          streak: settlement.streak,
          isRanked: current.kind === 'ranked',
          battleKind: current.kind,
          mode: 'duel',
          shards: settlement.shardsEarned,
          ratingDelta: settlement.ratingDelta,
        })
        if (previousRankLabel !== nextRankLabel && settlement.ratingDelta > 0) {
          beats.push(...buildRankUpSequence({ previousRankLabel, newRankLabel: nextRankLabel }))
        }
        presentRewardCinema(beats, 'battle')
      }
      if (payload.result === 'win') {
        setToastMessage('Victory! You won the match.')
      } else if (payload.result === 'loss') {
        setToastMessage('Defeat. Better luck next time.')
      } else {
        setToastMessage('The match ended in a draw.')
      }
    })

    socket.on('queue:error', (payload: { error: string }) => {
      setQueueState('idle')
      setQueuedOpponent(null)
      setToastMessage(payload.error)
    })

    socket.on('game:error', (payload: { error: string; matchId?: string; state?: GameState; revision?: number }) => {
      actionInFlightRef.current = false
      const current = serverMatchRef.current
      const revision = payload.revision ?? current.revision
      if (payload.matchId && current.phase !== 'idle' && current.phase !== 'terminal' && payload.matchId === current.matchId && payload.state && revision >= current.revision) {
        setGame(payload.state)
        setServerMatch({ ...current, revision, phase: 'active' })
      }
      setToastMessage(payload.error)
    })

    // ─── Reconnect / disconnect events ──────────────────────────────
    socket.on('game:rejoin', (payload: { matchId?: string; yourSide: BattleSide; serverMode?: 'ai' | 'duel' | 'unranked'; revision?: number; state: GameState; roomId: string; opponentDisconnected: boolean }) => {
      const matchId = payload.matchId ?? payload.roomId
      const current = serverMatchRef.current
      if (current.phase === 'terminal' && current.matchId === matchId) return
      if (current.phase !== 'idle' && current.phase !== 'terminal' && current.matchId !== matchId) return
      if (current.matchId === matchId && (payload.revision ?? current.revision) < current.revision) return
      rejoinInFlightRef.current = false
      actionInFlightRef.current = false
      setGame(payload.state)
      const kind = payload.serverMode === 'ai' ? 'ai' : payload.serverMode === 'unranked' ? 'friend' : 'ranked'
      setBattleKind(kind)
      setBattleSessionActive(true)
      resolvedMatchKeyRef.current = matchId
      setServerMatch({ phase: 'active', matchId, revision: payload.revision ?? 0, kind, outcome: null })
      transitionToScreen('battle')
      setQueueState('idle')
      setQueueSeconds(0)
      setQueuedOpponent(null)
      setOpponentDisconnected(payload.opponentDisconnected)
      triggerBattleIntro()
      setToastMessage(`Reconnected to your ${kind === 'ranked' ? 'ranked match' : kind === 'friend' ? 'friend duel' : 'AI skirmish'}.`)
      playSound('summon', soundEnabled)
    })

    socket.on('game:rejoin_failed', (payload?: { error?: string }) => {
      // 3P: clear the in-flight guard and recover the UI to a safe
      // state. The previous handler only cleared the opponent
      // disconnect indicator, which left ranked players staring at a
      // dead board with no queue/Resume affordance.
      rejoinInFlightRef.current = false
      setOpponentDisconnected(false)
      setDisconnectGraceMs(0)
      if (serverMatchRef.current.phase !== 'idle' && serverMatchRef.current.phase !== 'terminal') {
        setServerMatch({ phase: 'idle', matchId: null, revision: 0, kind: null, outcome: null })
        setBattleSessionActive(false)
        setBattleKind('ai')
        transitionToScreen('home')
        setToastMessage(payload?.error ?? 'Could not restore the live match. Returned to the arena gate.')
      }
    })

    socket.on('game:opponent_disconnected', (payload: { gracePeriodMs: number }) => {
      setOpponentDisconnected(true)
      setDisconnectGraceMs(payload.gracePeriodMs)
      setToastMessage('Opponent disconnected. Waiting for them to reconnect...')
    })

    socket.on('game:opponent_reconnected', () => {
      setOpponentDisconnected(false)
      setDisconnectGraceMs(0)
      setToastMessage('Opponent reconnected!')
    })

    socket.on('game:controller_active', (payload: { error?: string }) => {
      setToastMessage(payload.error ?? 'This match is active in another tab or device.')
    })

    void fetch(`${ARENA_URL}/api/profile`)
      .then((response) => response.json())
      .then(
        (data: {
          motd?: string
          quest?: string
          featuredMode?: string
          maintenanceMode?: boolean
        }) => {
          if (data.motd) {
            setMotd(data.motd)
          }

          if (data.quest) {
            setDailyQuest(data.quest)
          }

          if (data.featuredMode) {
            setFeaturedMode(data.featuredMode)
          }

          setMaintenanceMode(Boolean(data.maintenanceMode))
          setAdminSettings({
            motd: data.motd ?? 'Queue up for ranked arena play.',
            quest: data.quest ?? 'Win 1 ranked arena match',
            featuredMode: data.featuredMode ?? 'Ranked Blitz',
            maintenanceMode: Boolean(data.maintenanceMode),
          })
        },
      )
      .catch(() => {
        setBackendOnline(false)
      })

    return () => {
      if (socketClientRef.current === socket) {
        socketClientRef.current = null
      }
      socket.disconnect()
    }
  }, [authToken, triggerBattleIntro]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loggedIn) {
      return undefined
    }

    let cancelled = false

    const refreshLiveArena = async () => {
      try {
        const [healthResponse, leaderboardResponse] = await Promise.all([
          fetch(`${ARENA_URL}/api/health`),
          fetch(`${ARENA_URL}/api/leaderboard`),
        ])

        const healthData = (await healthResponse.json()) as QueuePresence & { ok?: boolean }
        const leaderboardData = (await leaderboardResponse.json()) as { ok?: boolean; entries?: LeaderboardEntry[] }

        if (cancelled) {
          return
        }

        setQueuePresence((current) => ({
          ...current,
          queueSize: healthData.queueSize ?? current.queueSize,
          connectedPlayers: healthData.connectedPlayers ?? current.connectedPlayers,
          rankedAvailable: Boolean(healthData.rankedAvailable),
          updatedAt: new Date().toISOString(),
        }))
        setLeaderboardEntries(leaderboardData.entries ?? [])
      } catch {
        if (!cancelled) {
          setQueuePresence((current) => ({ ...current, updatedAt: new Date().toISOString() }))
        }
      }
    }

    void refreshLiveArena()
    const refreshTimer = window.setInterval(() => {
      void refreshLiveArena()
    }, 30000)

    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
    }
    // setQueuePresence + setLeaderboardEntries come from QueueProvider's
    // useState; they're stable but eslint can't see through useContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn])

  useEffect(() => {
    if (!authToken || !loggedIn) {
      return
    }

    void Promise.all([
      authFetch('/api/me/collection', authToken).then((r) => r.json()),
      authFetch('/api/shop/packs', authToken).then((r) => r.json()),
      authFetch('/api/social', authToken).then((r) => r.json()),
      authFetch('/api/me/quests', authToken).then((r) => r.json()),
    ])
      .then(([collectionData, packData, socialData, questData]: [
        { ok?: boolean; collection?: CardCollection },
        { ok?: boolean; packs?: PackOffer[] },
        { ok?: boolean; friends?: SocialFriend[]; clan?: SocialClan | null; error?: string },
        { ok?: boolean } & Partial<QuestOverview>,
      ]) => {
        const nextCollection = collectionData.collection ?? {}
        setCollection(nextCollection)
        setPackOffers(packData.packs ?? [])
        setFriends(socialData.friends ?? [])
        setClan(socialData.clan ?? null)
        if (questData.ok) {
          const overview = toQuestOverview(questData)
          if (overview) setQuestOverview(overview)
        }
        if (!socialData.ok && socialData.error) {
          setSocialStatus(socialData.error)
        }
        setDeckConfig((current) => {
          const clampedDeck = Object.fromEntries(
            Object.entries(current).map(([cardId, count]) => {
              const card = CARD_LIBRARY.find((entry) => entry.id === cardId)
              const maxCopies = card?.rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES
              return [cardId, Math.min(count, nextCollection[cardId] ?? 0, maxCopies)]
            }),
          ) as DeckConfig
          return JSON.stringify(clampedDeck) === JSON.stringify(current) ? current : clampedDeck
        })
      })
      .catch(() => {})
    // setCollection/setPackOffers/setDeckConfig come from ProfileProvider's
    // useState; they're stable but eslint can't see through useContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, loggedIn])

  useEffect(() => {
    return () => {
      clearLongPressTimer()
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(STORAGE_KEYS.deck, JSON.stringify(deckConfig))
    window.localStorage.setItem(STORAGE_KEYS.sound, JSON.stringify(soundEnabled))
    window.localStorage.setItem(STORAGE_KEYS.ambient, JSON.stringify(ambientEnabled))
    window.localStorage.setItem(STORAGE_KEYS.gestures, JSON.stringify(gesturesEnabled))
    window.localStorage.setItem(STORAGE_KEYS.haptics, JSON.stringify(hapticsEnabled))
    window.localStorage.setItem(STORAGE_KEYS.mode, JSON.stringify(preferredMode))
    window.localStorage.setItem(STORAGE_KEYS.aiDifficulty, JSON.stringify(aiDifficultySetting))
    window.localStorage.setItem(STORAGE_KEYS.visitor, JSON.stringify(visitorId))
    window.localStorage.setItem(STORAGE_KEYS.analyticsConsent, JSON.stringify(analyticsConsent))
    window.localStorage.setItem(STORAGE_KEYS.authToken, JSON.stringify(authToken))
  }, [
    deckConfig,
    soundEnabled,
    ambientEnabled,
    gesturesEnabled,
    hapticsEnabled,
    preferredMode,
    aiDifficultySetting,
    visitorId,
    analyticsConsent,
    authToken,
  ])

  // Sync deck config to server when changed (debounced)
  useEffect(() => {
    if (!authToken || !loggedIn) return
    const timer = window.setTimeout(() => {
      void authFetch('/api/me/deck', authToken, { method: 'POST', body: { deckConfig } })
        .then((response) => response.json())
        .then((data: { ok?: boolean; error?: string }) => {
          if (data.ok === false && data.error) {
            setToastMessage(data.error)
          }
        })
        .catch(() => {})
    }, 1500)
    return () => window.clearTimeout(timer)
    // setToastMessage is a stable useCallback; only deck/auth changes should retrigger this debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckConfig, authToken, loggedIn])

  // Load saved decks on login. Server is the source of truth; the
  // setSavedDecks call inside the fetch is async and is exempt from the
  // react-hooks/set-state-in-effect rule. The early-clear branch happens
  // when authToken/loggedIn are unset (logout).
  useEffect(() => {
    if (!authToken || !loggedIn) {
      // Defer to next tick so the rule about synchronous setState in
      // effects is respected. (Logout-triggered cleanup, not derived state.)
      const handle = window.setTimeout(() => {
        setSavedDecks([])
        setActiveDeckId(null)
      }, 0)
      return () => window.clearTimeout(handle)
    }
    void authFetch('/api/me/decks', authToken)
      .then((response) => response.json())
      .then((data: { ok: boolean; decks?: SavedDeck[] }) => {
        if (data.ok && data.decks) {
          setSavedDecks(data.decks)
          const active = data.decks.find((deck) => deck.isActive)
          if (active) {
            setActiveDeckId(active.id)
          } else if (data.decks[0]) {
            setActiveDeckId(data.decks[0].id)
          }
        }
      })
      .catch(() => {})
    // setSavedDecks/setActiveDeckId come from ProfileProvider's useState;
    // they're stable but eslint can't see through useContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, loggedIn])

  // Reload deck list helper used after every CRUD mutation.
  const reloadDecks = useCallback(
    async function reloadDecks(): Promise<SavedDeck[] | null> {
      if (!authToken) return null
      try {
        const r = await authFetch('/api/me/decks', authToken)
        const data = (await r.json()) as { ok: boolean; decks?: SavedDeck[] }
        if (data.ok && data.decks) {
          setSavedDecks(data.decks)
          const active = data.decks.find((d) => d.isActive)
          if (active) setActiveDeckId(active.id)
          return data.decks
        }
      } catch { /* ignore */ }
      return null
    },
    // setSavedDecks/setActiveDeckId come from ProfileProvider's useState;
    // they're stable but eslint can't see through useContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authToken],
  )

  async function handleCreateDeck() {
    if (!authToken) {
      setToastMessage('Sign in to save multiple decks.')
      return
    }
    const name = await askTextPrompt({
      title: 'Create Deck',
      label: 'Deck name',
      confirmLabel: 'Create',
      placeholder: 'Deck name',
      initialValue: `Deck ${savedDecks.length + 1}`,
    })
    if (!name) return
    void authFetch('/api/me/decks', authToken, {
      method: 'POST',
      body: { name, deckConfig: {} },
    })
      .then((r) => r.json())
      .then(async (data: { ok: boolean; error?: string; deck?: SavedDeck }) => {
        if (!data.ok) {
          setToastMessage(data.error ?? 'Could not create deck.')
          return
        }
        await reloadDecks()
        if (data.deck) {
          setToastMessage(`Deck "${data.deck.name}" created.`)
        }
      })
      .catch(() => setToastMessage('Could not create deck.'))
  }

  async function handleRenameDeck(deck: SavedDeck) {
    if (!authToken) return
    const name = await askTextPrompt({
      title: 'Rename Deck',
      label: 'Deck name',
      confirmLabel: 'Save',
      placeholder: 'Deck name',
      initialValue: deck.name,
    })
    if (!name || name === deck.name) return
    void authFetch(`/api/me/decks/${deck.id}/rename`, authToken, {
      method: 'POST',
      body: { name },
    })
      .then((r) => r.json())
      .then(async (data: { ok: boolean; error?: string }) => {
        if (!data.ok) {
          setToastMessage(data.error ?? 'Could not rename deck.')
          return
        }
        await reloadDecks()
        setToastMessage(`Renamed to "${name}".`)
      })
      .catch(() => setToastMessage('Could not rename deck.'))
  }

  async function handleDeleteDeck(deck: SavedDeck) {
    if (!authToken) return
    if (savedDecks.length <= 1) {
      setToastMessage('You need at least one deck. Create another before deleting this one.')
      return
    }
    const ok = await askConfirm({
      title: 'Delete Deck',
      body: <p>Delete <strong>{deck.name}</strong>? This cannot be undone.</p>,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep Deck',
      danger: true,
    })
    if (!ok) return
    void authFetch(`/api/me/decks/${deck.id}`, authToken, { method: 'DELETE' })
      .then((r) => r.json())
      .then(async (data: { ok: boolean; error?: string }) => {
        if (!data.ok) {
          setToastMessage(data.error ?? 'Could not delete deck.')
          return
        }
        await reloadDecks()
        setToastMessage(`Deck "${deck.name}" deleted.`)
      })
      .catch(() => setToastMessage('Could not delete deck.'))
  }

  function handleSelectDeck(deck: SavedDeck) {
    if (!authToken) return
    if (deck.id === activeDeckId) return
    void authFetch(`/api/me/decks/${deck.id}/select`, authToken, { method: 'POST' })
      .then((r) => r.json())
      .then(async (data: { ok: boolean; error?: string; deck?: SavedDeck }) => {
        if (!data.ok) {
          setToastMessage(data.error ?? 'Could not select deck.')
          return
        }
        if (data.deck) {
          setActiveDeckId(data.deck.id)
          setDeckConfig(data.deck.deckConfig)
        }
        await reloadDecks()
        setToastMessage(`Switched to "${deck.name}".`)
      })
      .catch(() => setToastMessage('Could not select deck.'))
  }

  function handleBreakdownCard(cardId: string, qty: number) {
    if (!authToken) {
      setToastMessage('Sign in to break down cards into Shards.')
      return
    }
    void authFetch('/api/cards/breakdown', authToken, {
      method: 'POST',
      body: { cardId, qty },
    })
      .then((r) => r.json())
      .then((data: {
        ok: boolean
        error?: string
        refunded?: number
        shards?: number
        owned?: Record<string, number>
      }) => {
        if (!data.ok) {
          setToastMessage(data.error ?? 'Could not break down card.')
          return
        }
        setServerProfile((prev) =>
          prev
            ? {
                ...prev,
                shards: data.shards ?? prev.shards,
              }
            : prev,
        )
        setCollection(data.owned ?? {})
        setToastMessage(`Refunded ${data.refunded ?? 0} Shards.`)
        feedback('claim', soundEnabled, hapticsEnabled)
        void refreshQuestOverview()
      })
      .catch(() => setToastMessage('Could not break down card.'))
      .finally(() => setPendingBreakdown(null))
  }

  function handlePurchaseBorder(borderId: CardBorder, cost: number) {
    if (!authToken) {
      setToastMessage('Sign in to purchase card borders.')
      return
    }
    if (ownedCardBorders.includes(borderId)) {
      // Already owned — just equip it.
      void handleSelectBorder(borderId)
      return
    }
    if (shards < cost) {
      setToastMessage(`Need ${cost - shards} more Shards for that border.`)
      return
    }
    void authFetch('/api/shop/border', authToken, {
      method: 'POST',
      body: { borderId },
    })
      .then((r) => r.json())
      .then((data: {
        ok: boolean
        error?: string
        shards?: number
        ownedCardBorders?: CardBorder[]
        selectedCardBorder?: CardBorder
      }) => {
        if (!data.ok) {
          setToastMessage(data.error ?? 'Could not purchase border.')
          return
        }
        setServerProfile((prev) =>
          prev
            ? {
                ...prev,
                shards: data.shards ?? prev.shards,
                ownedCardBorders: data.ownedCardBorders ?? prev.ownedCardBorders,
                selectedCardBorder: data.selectedCardBorder ?? prev.selectedCardBorder,
              }
            : prev,
        )
        setToastMessage(`${CARD_BORDER_OFFERS.find((b) => b.id === borderId)?.name ?? 'Border'} unlocked.`)
        feedback('purchase', soundEnabled, hapticsEnabled)
      })
      .catch(() => setToastMessage('Could not purchase border.'))
  }

  function handleSelectBorder(borderId: CardBorder) {
    if (!authToken) return
    if (!ownedCardBorders.includes(borderId)) return
    void authFetch('/api/me/border', authToken, {
      method: 'POST',
      body: { borderId },
    })
      .then((r) => r.json())
      .then((data: { ok: boolean; error?: string; selectedCardBorder?: CardBorder }) => {
        if (!data.ok) {
          setToastMessage(data.error ?? 'Could not equip border.')
          return
        }
        setServerProfile((prev) =>
          prev
            ? {
                ...prev,
                selectedCardBorder: data.selectedCardBorder ?? borderId,
              }
            : prev,
        )
        setToastMessage(`${CARD_BORDER_OFFERS.find((b) => b.id === borderId)?.name ?? 'Border'} equipped.`)
        feedback('equip', soundEnabled, hapticsEnabled)
      })
      .catch(() => setToastMessage('Could not equip border.'))
  }

  useEffect(() => {
    if (pwaInstalledHint) {
      window.localStorage.setItem(STORAGE_KEYS.pwaInstalled, JSON.stringify(true))
    }
  }, [pwaInstalledHint])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    const markRegistered = () => setPwaServiceWorkerStatus((current) => current === 'controlling' ? current : 'ready')
    const markReady = () => setPwaServiceWorkerStatus(navigator.serviceWorker.controller ? 'controlling' : 'ready')
    const markController = () => setPwaServiceWorkerStatus('controlling')
    const markError = () => setPwaServiceWorkerStatus('error')

    window.addEventListener('sw-registration-success', markRegistered)
    window.addEventListener('sw-registration-error', markError)
    window.addEventListener('sw-ready', markReady)
    window.addEventListener('sw-controller-change', markController)

    void navigator.serviceWorker.ready.then(markReady).catch(markError)

    return () => {
      window.removeEventListener('sw-registration-success', markRegistered)
      window.removeEventListener('sw-registration-error', markError)
      window.removeEventListener('sw-ready', markReady)
      window.removeEventListener('sw-controller-change', markController)
    }
  }, [])

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPromptEvent(event as InstallPromptEvent)
      setToastMessage('Install Fractured Arcanum for a faster home-screen launch.')
    }

    const handleInstalled = () => {
      setInstallPromptEvent(null)
      setPwaInstalledHint(true)
      window.localStorage.setItem(STORAGE_KEYS.pwaInstalled, JSON.stringify(true))
      setToastMessage('Fractured Arcanum is installed and ready to play.')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
    // setToastMessage is a stable useCallback wrapper — installation listeners only need to register once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleSwUpdate(event: Event) {
      const detail = (event as CustomEvent).detail as { registration: ServiceWorkerRegistration }
      swRegistrationRef.current = detail.registration
      setSwUpdateAvailable(true)
    }

    window.addEventListener('sw-update-available', handleSwUpdate)
    return () => window.removeEventListener('sw-update-available', handleSwUpdate)
  }, [])

  // nowTick (1Hz) lives in SocialProvider — drives trade/challenge countdowns.

  useEffect(() => {
    if (queueState === 'found') {
      feedback('confirm', soundEnabled, hapticsEnabled)
    }
  }, [queueState, soundEnabled, hapticsEnabled])

  // Phase 3V — drive the per-screen ambient bed. setAmbientScene fades the
  // previous scene out and the new scene in; muting either toggle tears
  // the active loop down. We only ambient on the 7 primary scenes — the
  // setup/auth gates have no ambient bed.
  useEffect(() => {
    const ambientScene = (loggedIn ? activeScreen : null) as AmbientScene | null
    setAmbientScene(ambientScene, soundEnabled && ambientEnabled)
    return () => {
      // No per-effect teardown — the next effect run handles the swap;
      // unmount is handled below.
    }
  }, [activeScreen, soundEnabled, ambientEnabled, loggedIn])

  useEffect(() => {
    return () => {
      // App unmount: stop ambient so HMR/dev tab close does not leak audio nodes.
      setAmbientScene(null, false)
    }
  }, [])

  useEffect(() => {
    if (activeScreen === 'battle') {
      return
    }

    battleStartedRef.current = false
    if (battleIntroTimerRef.current) {
      window.clearTimeout(battleIntroTimerRef.current)
      battleIntroTimerRef.current = null
    }

    const hideTimer = window.setTimeout(() => {
      setBattleIntroVisible(false)
    }, 0)

    return () => {
      window.clearTimeout(hideTimer)
    }
    // setBattleIntroVisible comes from GameProvider's useState; stable but
    // eslint can't see through useContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScreen])

  useEffect(() => {
    void sendAnalytics(
      'page_view',
      {
        screen: activeScreen,
        viewport: getScreenBucket(),
        mode: game.mode,
      },
      activeScreen,
    )
  }, [activeScreen, game.mode, sendAnalytics])

  useEffect(() => {
    const prev = prevBoardRef.current
    const playerBoard = game.player.board
    const enemyBoard = game.enemy.board
    if (!prev) {
      prevBoardRef.current = { player: playerBoard, enemy: enemyBoard }
      return
    }

    const damaged = new Set<string>()
    let hasDeaths = false

    for (const side of ['player', 'enemy'] as const) {
      const oldBoard = prev[side]
      const newBoard = side === 'player' ? playerBoard : enemyBoard
      for (let i = 0; i < oldBoard.length; i++) {
        const oldUnit = oldBoard[i]
        const newUnit = newBoard[i]
        if (oldUnit && newUnit && newUnit.uid === oldUnit.uid && newUnit.currentHealth < oldUnit.currentHealth) {
          damaged.add(newUnit.uid)
        }
        if (oldUnit && !newUnit) {
          hasDeaths = true
        }
      }
    }

    prevBoardRef.current = { player: playerBoard, enemy: enemyBoard }

    if (hasDeaths) {
      playSound('unitDeath', soundEnabled)
    }

    if (damaged.size > 0) {
      const showTimer = window.setTimeout(() => {
        setDamagedSlots(new Set(damaged))
      }, 0)
      const clearTimer = window.setTimeout(() => setDamagedSlots(new Set()), 400)
      return () => {
        window.clearTimeout(showTimer)
        window.clearTimeout(clearTimer)
      }
    }
    // setDamagedSlots comes from GameProvider's useState; stable but eslint
    // can't see through useContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.player.board, game.enemy.board, soundEnabled])

  useEffect(() => {
    if (enemyTurnActive) return
    if (game.winner === 'player') {
      playSound('win', soundEnabled)
    } else if (game.winner === 'enemy') {
      playSound('lose', soundEnabled)
    } else if (game.winner === 'draw') {
      playSound('draw', soundEnabled)
    }
  }, [game.winner, soundEnabled, enemyTurnActive])

  useEffect(() => {
    if (!game.winner) {
      return
    }

    // Server-hosted ranked, friend, and AI matches are completed exclusively
    // by the authoritative game:over settlement handler.
    if (serverMatch.phase !== 'idle') {
      return
    }

    const matchKey = `${game.enemy.name}-${game.turnNumber}-${game.winner}`
    if (matchKey === resolvedMatchKeyRef.current) {
      return
    }

    resolvedMatchKeyRef.current = matchKey
    void sendAnalytics(
      'match_complete',
      {
        winner: game.winner,
        mode: game.mode,
        turnNumber: game.turnNumber,
      },
      'match',
    )

    if (game.winner === 'player') {
      // Offline AI practice and pass-and-play are deliberately non-economic.
      // Reward-bearing AI games are hosted and settled by the server.
      const localBeats = buildBattleVictorySequence({
        rankLabel: getRankLabel(serverProfile?.seasonRating ?? 1200),
        streak: serverProfile?.streak ?? 0,
        isRanked: false,
        battleKind: game.mode === 'duel' ? 'local' : 'ai',
        mode: game.mode,
        shards: 0,
      })
      presentRewardCinema(localBeats, 'battle')
    }
  }, [game, serverMatch.phase, sendAnalytics, presentRewardCinema, serverProfile])

  const isRankedBattle = battleKind === 'ranked'
  const isLocalPassBattle = battleKind === 'local'
  const activeSide: BattleSide = isLocalPassBattle ? game.turn : 'player'
  const defendingSide = otherSide(activeSide)
  const activePlayer = game[activeSide]
  const defendingPlayer = game[defendingSide]
  const isMyTurn = !enemyTurnActive && (isLocalPassBattle || game.turn === 'player')
  const hasBattleInProgress = battleSessionActive && !game.winner
  const gameInProgress = activeScreen !== 'battle' && hasBattleInProgress
  const activeBoardHasOpenLane = activePlayer.board.some((slot) => slot === null)
  const selectedDeckSize = getDeckSize(deckConfig)
  const deckReady = selectedDeckSize >= MIN_DECK_SIZE
  const defenderHasGuard = boardHasGuard(defendingPlayer.board)
  const rankLabel = getRankLabel(seasonRating)
  const resolvedAIDifficulty = aiDifficultySetting === 'auto' ? getRecommendedAIDifficulty(seasonRating) : aiDifficultySetting
  // liveQueueLabel comes from QueueProvider via useQueueState above.
  const totalOwnedCards = Object.values(collection).reduce((sum, count) => sum + count, 0)
  const totalGames = record.wins + record.losses
  const winRate = totalGames > 0 ? Math.round((record.wins / totalGames) * 100) : 0
  const previousRankTarget =
    seasonRating < 1150 ? 1000 : seasonRating < 1300 ? 1150 : seasonRating < 1500 ? 1300 : 1500
  const nextRankTarget =
    seasonRating < 1150 ? 1150 : seasonRating < 1300 ? 1300 : seasonRating < 1500 ? 1500 : 1700
  const rankProgress = Math.min(
    100,
    Math.round(((seasonRating - previousRankTarget) / (nextRankTarget - previousRankTarget)) * 100),
  )
  const nextRewardLabel = '25 Shards'
  const todayKey = new Date().toISOString().slice(0, 10)
  const canClaimDailyReward = lastDailyClaim !== todayKey

  const screenTitle = SCREEN_TITLES[activeScreen]
  const isBattleScreen = activeScreen === 'battle'
  const installState = createPwaInstallState({
    hasInstallPrompt: Boolean(installPromptEvent),
    serviceWorkerStatus: pwaServiceWorkerStatus,
    installedHint: pwaInstalledHint,
  })

  function transitionToScreen(screen: AppScreen, withSound = false) {
    setScreenTransitionClass(getScreenTransitionClass(activeScreen, screen))
    if (withSound) {
      playSound(getScreenTransitionSound(activeScreen, screen), soundEnabled)
    }
    if (screen !== 'battle') {
      setBattleSummaryVisible(false)
    }
    if (!shouldPresentScopedReward(cinemaScopeRef.current, screen)) {
      cinemaScopeRef.current = 'generic'
      setCinemaSequence(null)
      setBattleSummaryVisible(false)
    }
    setActiveScreen(screen)
  }

  const resetSettingsSubview = useCallback(() => {
    setSettingsSubview('preferences')
  }, [])

  const openSettingsSubview = useCallback((view: SettingsSubview) => {
    setSettingsSubview(view)
  }, [])

  function openScreen(screen: AppScreen) {
    if (screen === 'settings' || activeScreen === 'settings') {
      resetSettingsSubview()
    }
    transitionToScreen(screen, true)
  }

  // ─── Phase 3Y — Mobile swipe + keyboard arrow scene navigation ───────
  // The hook owns all gesture state. AppShell only owns the toggle, the
  // commit callback (which routes back through `transitionToScreen` so
  // the existing curtain class + paired sound fire automatically), and
  // the keyboard-parity listener below.
  const swipeEnabled = gesturesEnabled && !isBattleScreen && loggedIn && !setupRequired && !tourVisible
  const handleSceneSwipeCommit = useCallback((direction: 'prev' | 'next') => {
    const neighbor = getNeighborScreen(activeScreen, direction === 'prev' ? -1 : 1, NAV_ORDER)
    if (!neighbor) return
    transitionToScreen(neighbor, true)
  // transitionToScreen is defined inline; rely on the closure capture.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScreen])
  const sceneSwipeBind = useSceneSwipe({
    isBattleScreen,
    enabled: swipeEnabled,
    onCommit: handleSceneSwipeCommit,
  })

  useEffect(() => {
    if (!swipeEnabled || typeof window === 'undefined') return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target as HTMLElement | null
      if (target && target !== document.body) {
        const tag = target.tagName
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          tag === 'BUTTON' ||
          tag === 'A' ||
          target.isContentEditable
        ) {
          return
        }
      }
      const direction: 'prev' | 'next' = event.key === 'ArrowLeft' ? 'prev' : 'next'
      const neighbor = getNeighborScreen(activeScreen, direction === 'prev' ? -1 : 1, NAV_ORDER)
      if (!neighbor) return
      event.preventDefault()
      transitionToScreen(neighbor, true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // transitionToScreen is defined inline; rely on the closure capture.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipeEnabled, activeScreen])

  // ─── Phase 3X — Onboarding tour control ──────────────────────────────
  const dismissOnboardingTour = useCallback((reason: 'completed' | 'skipped') => {
    setTourVisible(false)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEYS.firstLaunch, '1')
      } catch {
        // Storage may be unavailable (private mode); the tour will simply
        // re-open on next launch in that case.
      }
    }
    if (reason === 'completed') {
      setToastMessage('Tour complete — welcome to the arena.')
    }
  }, [setToastMessage])

  const startOnboardingTour = useCallback(() => {
    // Always navigate to Home first so the spotlight targets exist.
    transitionToScreen('home', false)
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => setTourVisible(true))
    } else {
      setTourVisible(true)
    }
  // transitionToScreen is defined inline in AppShell so it isn't a stable
  // ref; we intentionally rely on the closure capture here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // First-launch auto-trigger: only on a fresh authenticated landing on
  // Home. Skipped during the legacy admin/owner setup flow.
  useEffect(() => {
    if (!loggedIn || setupRequired) return
    if (activeScreen !== 'home') return
    if (tourAutoTriggeredRef.current) return
    if (typeof window === 'undefined') return
    let alreadyDone = false
    try {
      alreadyDone = window.localStorage.getItem(STORAGE_KEYS.firstLaunch) === '1'
    } catch {
      alreadyDone = true
    }
    if (alreadyDone) {
      tourAutoTriggeredRef.current = true
      return
    }
    tourAutoTriggeredRef.current = true
    const id = window.setTimeout(() => setTourVisible(true), 1100)
    return () => window.clearTimeout(id)
  }, [loggedIn, setupRequired, activeScreen])

  function resetBattleState(mode: GameMode = preferredMode, toast = 'Battle reset. Ready when you are.', nextScreen: AppScreen = 'home') {
    if (serverMatchRef.current.phase === 'active' || serverMatchRef.current.phase === 'reconnecting' || serverMatchRef.current.phase === 'leaving') {
      setToastMessage('Finish or abandon the live match before starting another battle.')
      return
    }
    const nextDifficulty = mode === 'ai' ? resolvedAIDifficulty : 'legend'
    setBattleKind(mode === 'duel' ? 'local' : 'ai')
    pendingServerBattleKindRef.current = null
    clearEnemyTurnTimers()
    battleStartedRef.current = false
    if (battleIntroTimerRef.current) {
      window.clearTimeout(battleIntroTimerRef.current)
      battleIntroTimerRef.current = null
    }
    resolvedMatchKeyRef.current = ''
    setCinemaSequence(null)
    cinemaScopeRef.current = 'generic'
    prevBoardRef.current = null
    setBattleSessionActive(false)
    setServerMatch({ phase: 'idle', matchId: null, revision: 0, kind: null, outcome: null })
    setSelectedAttacker(null)
    setEnemyTurnActive(false)
    setEnemyTurnLabel('')
    setDamagedSlots(new Set())
    setInspectedCard(null)
    setOpponentDisconnected(false)
    setDisconnectGraceMs(0)
    setQueueState('idle')
    setQueueSeconds(0)
    setQueuedOpponent(null)
    setGame(createGame(mode, deckConfig, undefined, nextDifficulty))
    transitionToScreen(nextScreen)
    setToastMessage(toast)
  }

  function handleResumeBattle() {
    feedback('tap', soundEnabled, hapticsEnabled)
    transitionToScreen('battle')

    if (serverMatch.phase === 'active' || serverMatch.phase === 'reconnecting') {
      if (socketClientRef.current?.connected) {
        if (!rejoinInFlightRef.current) {
          rejoinInFlightRef.current = true
          socketClientRef.current.emit('game:rejoin')
        }
        setToastMessage(`Rejoining your live battle against ${game.enemy.name}.`)
      } else {
        setToastMessage('Reconnecting to your live battle...')
      }
      return
    }

    setToastMessage(`Resuming your battle against ${game.enemy.name}.`)
  }

  function handleAbandonBattle() {
    feedback('cancel', soundEnabled, hapticsEnabled)

    if (serverBattleActive && hasBattleInProgress) {
      if (!socketClientRef.current?.connected || serverMatch.phase === 'reconnecting') {
        setToastMessage('Reconnect before abandoning so the server can record the result safely.')
        return
      }
      actionInFlightRef.current = false
      setServerMatch((current) => current.phase === 'active' ? { ...current, phase: 'leaving' } : current)
      emitAction({ type: 'surrender' })
      transitionToScreen('home')
      setToastMessage('Surrender sent. Waiting for the server to record the result…')
      return
    }

    if (hasBattleInProgress) {
      resetBattleState(preferredMode, game.mode === 'ai' ? 'AI battle abandoned. Ready for a fresh match.' : 'Battle reset. Ready when you are.')
      return
    }

    resetBattleState(preferredMode)
  }

  function handleLeaveBattle() {
    feedback('cancel', soundEnabled, hapticsEnabled)

    if (queueState !== 'idle' && !hasBattleInProgress) {
      handleCancelQueue()
      return
    }

    if (serverBattleActive && hasBattleInProgress) {
      transitionToScreen('home')
      setToastMessage(`Battle paused vs ${game.enemy.name}. You can resume or abandon it from the lobby.`)
      return
    }

    if (hasBattleInProgress) {
      resetBattleState(preferredMode, game.mode === 'ai' ? 'AI battle abandoned. Ready for a fresh match.' : 'Battle closed. Start a new match whenever you like.')
      return
    }

    transitionToScreen('home')
  }

  function handleClaimDailyReward() {
    if (!canClaimDailyReward || !authToken) {
      setToastMessage(authToken ? 'The daily reward has already been claimed today.' : 'Log in to claim daily rewards.')
      return
    }

    feedback('claim', soundEnabled, hapticsEnabled)
    void authFetch('/api/me/daily', authToken, { method: 'POST' })
      .then((r) => r.json())
      .then((data: { ok: boolean; error?: string; amount?: number; newBalance?: number; shards?: number; totalEarned?: number }) => {
        if (data.ok) {
          const grantedShards = data.amount ?? ECONOMY_REWARDS.dailyShards
          const updatedShards = data.shards ?? data.newBalance
          setServerProfile((prev) => prev ? { ...prev, shards: updatedShards ?? prev.shards, lastDaily: todayKey, totalEarned: data.totalEarned ?? prev.totalEarned } : prev)
          setToastMessage(`Daily reward claimed: +${grantedShards} Shards.`)
          setJustClaimedDaily(true)
          window.setTimeout(() => setJustClaimedDaily(false), 2000)
          void refreshQuestOverview()
          presentRewardCinema(
            buildDailyClaimSequence({ shards: grantedShards, totalEarned: data.totalEarned }),
            'daily',
          )
        } else {
          setToastMessage(data.error ?? 'Could not claim daily reward.')
        }
      })
      .catch(() => setToastMessage('Network error claiming daily reward.'))
    void sendAnalytics('reward_claim', { amount: ECONOMY_REWARDS.dailyShards, currency: 'shards', screen: activeScreen, viewport: getScreenBucket() }, 'vault')
  }

  /**
   * Claim one, several, or every ready quest reward.
   *
   * This is deliberately a single request even for many quests: the server
   * settles them in one transaction and returns one authoritative shard
   * balance, so there is no ordering race between responses and only one
   * reward cinema to present.
   *
   * Pass no ids to claim everything currently ready.
   */
  function handleClaimQuestRewards(questIds?: string[]) {
    if (!authToken) {
      setToastMessage('Log in to claim quest rewards.')
      return
    }

    void authFetch('/api/me/quests/claim', authToken, {
      method: 'POST',
      body: questIds && questIds.length > 0 ? { questIds } : {},
    })
      .then((r) => r.json())
      .then((data: {
        ok?: boolean
        error?: string
        shards?: number
        totalEarned?: number
        totalShards?: number
        claims?: { quest: { id: string; title: string }; reward: { shards: number } }[]
        rejected?: { id: string; error: string }[]
        overview?: ({ ok?: boolean } & QuestOverview)
      }) => {
        if (!data.ok) {
          setToastMessage(data.error ?? 'Could not claim quest reward.')
          return
        }

        setServerProfile((prev) => prev ? { ...prev, shards: data.shards ?? prev.shards, totalEarned: data.totalEarned ?? prev.totalEarned } : prev)
        const claimedOverview = data.overview?.ok === true ? toQuestOverview(data.overview) : null
        if (claimedOverview) {
          setQuestOverview(claimedOverview)
        } else {
          void refreshQuestOverview()
        }

        const claims = data.claims ?? []
        if (claims.length === 0) {
          setToastMessage(data.rejected?.[0]?.error ?? 'No quest rewards are ready to claim.')
          return
        }

        const totalShards = data.totalShards ?? claims.reduce((sum, claim) => sum + claim.reward.shards, 0)
        setToastMessage(
          claims.length === 1
            ? `${claims[0].quest.title} claimed: +${totalShards} Shards.`
            : `${claims.length} quest rewards claimed: +${totalShards} Shards.`,
        )
        presentRewardCinema(
          buildQuestClaimBatchSequence(claims.map((claim) => ({ title: claim.quest.title, shards: claim.reward.shards }))),
          'daily',
        )
      })
      .catch(() => setToastMessage('Network error claiming quest reward.'))
  }

  function handleClaimQuestReward(questId: string) {
    handleClaimQuestRewards([questId])
  }

  function handleEquipTheme(themeId: CosmeticTheme, cost: number) {
    if (!authToken) {
      setToastMessage('Log in to use cosmetic themes.')
      return
    }

    const alreadyOwned = ownedThemes.includes(themeId)

    if (!alreadyOwned && shards < cost) {
      setToastMessage('Not enough Shards yet for that cosmetic theme.')
      return
    }

    if (!alreadyOwned) {
      void authFetch('/api/shop/theme', authToken, { method: 'POST', body: { themeId } })
        .then((r) => r.json())
        .then((data: { ok: boolean; error?: string; shards?: number; ownedThemes?: CosmeticTheme[] }) => {
          if (data.ok) {
            setServerProfile((prev) =>
              prev ? {
                ...prev,
                shards: data.shards ?? prev.shards,
                ownedThemes: data.ownedThemes ?? prev.ownedThemes,
                selectedTheme: themeId,
              } : prev,
            )
            setToastMessage(`${THEME_OFFERS.find((item) => item.id === themeId)?.name ?? 'Theme'} unlocked.`)
          } else {
            setToastMessage(data.error ?? 'Purchase failed.')
          }
        })
        .catch(() => setToastMessage('Network error purchasing theme.'))
    } else {
      void authFetch('/api/me/theme', authToken, { method: 'POST', body: { themeId } })
        .then((r) => r.json())
        .then((data: { ok: boolean }) => {
          if (data.ok) {
            setServerProfile((prev) => prev ? { ...prev, selectedTheme: themeId } : prev)
          }
        })
        .catch(() => {})
      setToastMessage(`${THEME_OFFERS.find((item) => item.id === themeId)?.name ?? 'Theme'} equipped.`)
    }

    void sendAnalytics('cosmetic_equip', { themeId, screen: activeScreen, viewport: getScreenBucket() }, 'vault')
  }

  async function refreshAdminOverview() {
    if (!authToken) {
      setAdminError('Sign in with your owner or admin account to open the operations console.')
      return
    }
    if (!isAdminRole) {
      setAdminError('Your account does not have admin privileges.')
      return
    }

    setAdminLoading(true)

    try {
      const response = await authFetch('/api/admin/overview', authToken)

      if (!response.ok) {
        throw new Error('Admin access denied')
      }

      const data = (await response.json()) as AdminOverview
      setAdminOverview(data)
      setAdminSettings(data.settings)
      setAdminError('')
      // Also refresh users + audit for owner UI
      if (isOwnerRole) {
        void refreshAdminUsers()
        void refreshAdminAudit()
      }
    } catch {
      setAdminOverview(null)
      setAdminError('Admin access failed. Your session may have expired.')
    } finally {
      setAdminLoading(false)
    }
  }

  async function refreshAdminUsers(searchTerm = adminUserSearch) {
    if (!authToken || !isAdminRole) return
    setAdminUsersLoading(true)
    try {
      const q = searchTerm.trim()
      const path = q ? `/api/admin/users?search=${encodeURIComponent(q)}` : '/api/admin/users'
      const response = await authFetch(path, authToken)
      if (!response.ok) throw new Error('users fetch failed')
      const data = (await response.json()) as { ok: boolean; users: AdminUser[] }
      setAdminUsers(data.users ?? [])
    } catch {
      // non-fatal
    } finally {
      setAdminUsersLoading(false)
    }
  }

  async function refreshAdminAudit() {
    if (!authToken || !isAdminRole) return
    try {
      const response = await authFetch('/api/admin/audit', authToken)
      if (!response.ok) return
      const data = (await response.json()) as { ok: boolean; audit: AdminAuditEntry[] }
      setAdminAudit(data.audit ?? [])
    } catch { /* non-fatal */ }
  }

  async function handleSetUserRole(target: AdminUser, newRole: 'admin' | 'user') {
    if (!authToken || !isOwnerRole) return
    if (target.accountId === (serverProfile?.accountId ?? '')) {
      setAdminError('You cannot change your own role.')
      return
    }
    const niceName = target.displayName || target.username
    const promoting = newRole === 'admin'
    const ok = await askConfirm({
      title: promoting ? 'Promote to admin?' : 'Demote to player?',
      body: (
        <>
          {promoting ? (
            <p>
              <strong>@{target.username}</strong> will gain access to the Ops console — including
              live service controls, user moderation, and the audit log.
            </p>
          ) : (
            <p>
              <strong>@{target.username}</strong> will immediately lose access to the Ops
              console.
            </p>
          )}
          <p className="mini-text">You can reverse this at any time.</p>
        </>
      ),
      confirmLabel: promoting ? 'Promote' : 'Demote',
      danger: !promoting,
    })
    if (!ok) return
    try {
      const response = await authFetch(
        `/api/admin/users/${encodeURIComponent(target.accountId)}/role`,
        authToken,
        { method: 'POST', body: { role: newRole } },
      )
      const data = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setAdminError(data.error ?? 'Role change failed.')
        return
      }
      setAdminError('')
      setToastMessage(`${niceName} is now ${promoting ? 'an admin' : 'a regular user'}.`)
      await refreshAdminUsers()
      await refreshAdminAudit()
    } catch {
      setAdminError('Could not change that role right now.')
    }
  }

  // ─── Account management (owner/admin console) ──────────────────────────────
  // Every action here goes through an endpoint that requires recent passkey
  // reauth and writes an audit row. Nothing here can read a credential: the
  // only thing an operator ever receives is a one-time grant code the player
  // must redeem themselves.

  async function openAdminAccount(accountId: string) {
    if (!authToken || !isAdminRole) return
    setAdminAccountLoading(true)
    setAdminError('')
    try {
      const response = await authFetch(`/api/admin/users/${encodeURIComponent(accountId)}`, authToken)
      const data = (await response.json()) as { ok: boolean; account?: AdminAccountDetail; error?: string }
      if (!response.ok || !data.ok || !data.account) {
        setAdminError(data.error ?? 'Could not load that account.')
        return
      }
      setAdminAccountDetail(data.account)
    } catch {
      setAdminError('Could not load that account right now.')
    } finally {
      setAdminAccountLoading(false)
    }
  }

  function closeAdminAccount() {
    setAdminAccountDetail(null)
    setAdminError('')
  }

  async function refreshDeletedAccounts() {
    if (!authToken || !isAdminRole) return
    setAdminDeletedLoading(true)
    try {
      const response = await authFetch('/api/admin/users/deleted/list', authToken)
      const data = (await response.json()) as { ok: boolean; accounts?: AdminDeletedAccount[] }
      if (data.ok) setAdminDeletedAccounts(data.accounts ?? [])
    } catch { /* non-fatal */ } finally {
      setAdminDeletedLoading(false)
    }
  }

  /**
   * Shared POST wrapper for the account-management endpoints.
   *
   * Every one of them sits behind `requireRecentPasskeyAuth` (a 10-minute
   * window), so a first attempt routinely comes back asking for confirmation.
   * Running the reauth ceremony and retrying once keeps that a single passkey
   * prompt instead of a dead-end error the operator cannot act on.
   */
  async function postAdminAccountAction(
    accountId: string,
    action: string,
    body: Record<string, unknown> = {},
  ): Promise<{ ok: boolean; error?: string } & Record<string, unknown>> {
    if (!authToken) return { ok: false, error: 'Not signed in.' }

    const send = async () => {
      const response = await authFetch(
        `/api/admin/users/${encodeURIComponent(accountId)}/${action}`,
        authToken,
        { method: 'POST', body },
      )
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean; error?: string; passkeyReauthRequired?: boolean
      }
      return { response, data }
    }

    try {
      let attempt = await send()

      if (!attempt.response.ok && attempt.data.passkeyReauthRequired) {
        if (!await ensureRecentPasskeyAuth()) {
          return { ok: false, error: 'Passkey confirmation is required for this action.' }
        }
        attempt = await send()
      }

      if (!attempt.response.ok || attempt.data.ok !== true) {
        return { ok: false, error: attempt.data.error ?? 'That action could not be completed.' }
      }
      return attempt.data as { ok: boolean } & Record<string, unknown>
    } catch {
      return { ok: false, error: 'Could not reach the server.' }
    }
  }

  async function afterAdminAccountAction(accountId: string) {
    await Promise.all([refreshAdminUsers(), refreshAdminAudit()])
    if (adminAccountDetail?.accountId === accountId) await openAdminAccount(accountId)
  }

  async function handleAdminIssueRecoveryGrant(target: AdminUser | AdminAccountDetail, resetCredentials: boolean) {
    if (!authToken || !isAdminRole) return
    const name = target.displayName || target.username
    const ok = await askConfirm({
      title: resetCredentials ? 'Reset credentials?' : 'Issue a recovery code?',
      body: (
        <>
          {resetCredentials ? (
            <p>
              Every passkey and session for <strong>@{target.username}</strong> will be revoked. They
              will need the one-time code below to get back in.
            </p>
          ) : (
            <p>
              <strong>@{target.username}</strong> gets a one-time code to attach a new passkey.
              Their existing passkeys keep working.
            </p>
          )}
          <p className="mini-text">
            The code is shown once and cannot be recovered afterwards. Only give it to someone you
            have confirmed is the account holder — it grants full access to the account.
          </p>
        </>
      ),
      confirmLabel: resetCredentials ? 'Reset and issue code' : 'Issue code',
      danger: resetCredentials,
    })
    if (!ok) return

    const result = await postAdminAccountAction(
      target.accountId,
      resetCredentials ? 'reset-credentials' : 'recovery-grant',
      { note: resetCredentials ? 'Admin credential reset' : 'Support-issued recovery grant' },
    )
    if (!result.ok) {
      setAdminError(result.error ?? 'Could not issue a recovery code.')
      return
    }
    setAdminError('')
    setIssuedGrant({
      username: String(result.username ?? target.username),
      grantCode: String(result.grantCode ?? ''),
      expiresAt: String(result.expiresAt ?? ''),
      revokedPasskeys: Boolean(result.revokedPasskeys),
    })
    setToastMessage(`Recovery code issued for ${name}.`)
    await afterAdminAccountAction(target.accountId)
  }

  async function handleAdminSuspendAccount(target: AdminUser | AdminAccountDetail) {
    if (!authToken || !isAdminRole) return
    const reason = await askTextPrompt({
      title: `Suspend @${target.username}?`,
      label: 'Reason (recorded in the audit log)',
      placeholder: 'e.g. confirmed cheating',
      confirmLabel: 'Suspend for 24h',
      maxLength: 200,
    })
    if (reason === null) return

    const result = await postAdminAccountAction(target.accountId, 'suspend', { hours: 24, reason })
    if (!result.ok) {
      setAdminError(result.error ?? 'Could not suspend that account.')
      return
    }
    setAdminError('')
    setToastMessage(`@${target.username} is suspended for 24 hours.`)
    await afterAdminAccountAction(target.accountId)
  }

  async function handleAdminUnsuspendAccount(target: AdminUser | AdminAccountDetail) {
    if (!authToken || !isAdminRole) return
    const result = await postAdminAccountAction(target.accountId, 'unsuspend')
    if (!result.ok) {
      setAdminError(result.error ?? 'Could not lift that suspension.')
      return
    }
    setAdminError('')
    setToastMessage(`@${target.username} can play again.`)
    await afterAdminAccountAction(target.accountId)
  }

  async function handleAdminDeleteAccount(target: AdminUser | AdminAccountDetail) {
    if (!authToken || !isOwnerRole) return
    // The server requires the typed username too; asking here means the
    // operator reads the name before the action rather than after.
    const ok = await askConfirm({
      title: `Delete @${target.username}?`,
      body: (
        <>
          <p>
            <strong>@{target.username}</strong> will lose access immediately. Their collection,
            rating, and match history are kept, and you can restore the account later.
          </p>
          <p className="mini-text">Type the username to confirm.</p>
        </>
      ),
      confirmLabel: 'Delete account',
      danger: true,
      requireText: target.username,
      requireTextLabel: 'Confirm username',
    })
    if (!ok) return

    const result = await postAdminAccountAction(target.accountId, 'delete', { confirmUsername: target.username })
    if (!result.ok) {
      setAdminError(result.error ?? 'Could not delete that account.')
      return
    }
    setAdminError('')
    setToastMessage(`@${target.username} was deleted. You can restore them from Accounts.`)
    closeAdminAccount()
    await Promise.all([refreshAdminUsers(), refreshAdminAudit(), refreshDeletedAccounts()])
  }

  async function handleAdminRestoreAccount(accountId: string, username: string) {
    if (!authToken || !isOwnerRole) return
    const result = await postAdminAccountAction(accountId, 'restore')
    if (!result.ok) {
      setAdminError(result.error ?? 'Could not restore that account.')
      return
    }
    setAdminError('')
    // Tell the operator what the player has to do next, since a restored
    // passkey-only account still needs a grant before they can sign in.
    const nextStep = String(result.nextStep ?? '')
    setToastMessage(
      nextStep === 'needs_recovery_grant'
        ? `@${username} is restored but needs a recovery code to sign in.`
        : nextStep === 'sign_in_with_legacy_password'
          ? `@${username} is restored and can sign in with their old password.`
          : `@${username} is restored and can sign in with their passkey.`,
    )
    await Promise.all([refreshAdminUsers(), refreshAdminAudit(), refreshDeletedAccounts()])
  }

  async function handleTransferOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken || !isOwnerRole) return
    const targetAccountId = transferForm.targetAccountId.trim()
    const password = transferForm.password
    if (!targetAccountId || !password) {
      setTransferStatus('Choose a target account and confirm your password.')
      return
    }
    if (targetAccountId === (serverProfile?.accountId ?? '')) {
      setTransferStatus('Target must be a different account.')
      return
    }
    const target = adminUsers.find((user) => user.accountId === targetAccountId)
    const targetUsername = target?.username ?? ''
    if (!targetUsername) {
      setTransferStatus('Search for the target account in the list above before transferring.')
      return
    }
    const ok = await askConfirm({
      title: 'Transfer server ownership',
      body: (
        <>
          <p>
            Ownership will be transferred to <strong>@{targetUsername}</strong>
            {target?.displayName ? <> ({target.displayName})</> : null}.
          </p>
          <p>
            You will be demoted to <strong>admin</strong>. Only the new owner can promote you back —
            this action cannot be reversed without their cooperation or filesystem-level recovery.
          </p>
        </>
      ),
      confirmLabel: 'Transfer ownership',
      danger: true,
      requireText: targetUsername,
      requireTextLabel: `Type @${targetUsername} to confirm`,
    })
    if (!ok) return
    try {
      const response = await authFetch('/api/admin/owner/transfer', authToken, {
        method: 'POST',
        body: { targetAccountId, password },
      })
      const data = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setTransferStatus(data.error ?? 'Ownership transfer failed.')
        return
      }
      setTransferStatus(`Ownership transferred to @${targetUsername}. You are now an admin on this server.`)
      setTransferForm({ targetAccountId: '', password: '' })
      setServerProfile((profile) => (profile ? { ...profile, role: 'admin' } : profile))
      await refreshAdminUsers()
      await refreshAdminAudit()
      await refreshAdminOverview()
    } catch {
      setTransferStatus('Could not reach the server. Try again.')
    }
  }

  async function handleSubmitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!complaintForm.summary.trim() || !complaintForm.details.trim()) {
      setComplaintStatus('Add both a short summary and clear details before sending the report.')
      return
    }

    try {
      const response = await fetch(`${ARENA_URL}/api/complaints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          visitorId,
          sessionId,
          page: 'arena',
          ...complaintForm,
        }),
      })

      const data = (await response.json()) as { ok?: boolean; complaintId?: string; message?: string }

      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? 'Complaint submission failed')
      }

      setComplaintStatus(`Report ${data.complaintId} submitted for review.`)
      setToastMessage(`Support ticket ${data.complaintId} created.`)
      setComplaintForm({
        category: 'gameplay',
        severity: 'normal',
        summary: '',
        details: '',
      })
    } catch {
      setComplaintStatus('The report could not be submitted right now. Please try again.')
    }
  }

  async function handleSaveAdminSettings() {
    if (!authToken || !isAdminRole) {
      setAdminError('Sign in with an admin account to save live settings.')
      return
    }

    try {
      const response = await authFetch('/api/admin/settings', authToken, {
        method: 'POST',
        body: adminSettings,
      })

      if (!response.ok) {
        throw new Error('Save failed')
      }

      setMotd(adminSettings.motd)
      setDailyQuest(adminSettings.quest)
      setFeaturedMode(adminSettings.featuredMode)
      setMaintenanceMode(adminSettings.maintenanceMode)
      setToastMessage('Admin live settings updated.')
      await refreshAdminOverview()
    } catch {
      setAdminError('The live settings could not be saved.')
    }
  }

  async function handleUpdateComplaintStatus(id: string, status: string) {
    if (!authToken || !isAdminRole) {
      setAdminError('Sign in with an admin account to update tickets.')
      return
    }

    const responseNote = await askTextPrompt({
      title: status === 'resolved' ? 'Resolve Ticket' : 'Respond To Ticket',
      label: 'Response note',
      placeholder: status === 'resolved' ? 'Resolution details' : 'Request details or recovery guidance',
      confirmLabel: status === 'resolved' ? 'Resolve' : 'Send Response',
      maxLength: 320,
    })
    if (!responseNote) return

    try {
      const response = await authFetch(`/api/admin/complaints/${id}`, authToken, {
        method: 'POST',
        body: {
          status,
          note: responseNote,
        },
      })

      if (!response.ok) {
        throw new Error('Update failed')
      }

      setToastMessage(`Complaint ${id} updated to ${status}.`)
      await refreshAdminOverview()
    } catch {
      setAdminError('The complaint status could not be updated.')
    }
  }

  function startMatch(
    mode: GameMode = preferredMode,
    enemyName?: string,
    overrideDeckConfig?: DeckConfig,
  ) {
    if (serverMatch.phase === 'active' || serverMatch.phase === 'reconnecting' || serverMatch.phase === 'leaving') {
      setToastMessage(`A live match is still ${serverMatch.phase === 'leaving' ? 'being closed' : 'in progress'}. Resume or abandon it first.`)
      transitionToScreen('home')
      return
    }
    const deckForMatch = overrideDeckConfig ?? deckConfig
    if (getDeckSize(deckForMatch) < MIN_DECK_SIZE) {
      setToastMessage('Finish building your deck before entering the arena.')
      transitionToScreen('collection')
      return
    }

    const aiDifficulty = mode === 'ai' ? resolvedAIDifficulty : 'legend'

    if (mode === 'ai' && backendOnline && socketClientRef.current?.connected) {
      setPreferredMode('ai')
      pendingServerBattleKindRef.current = 'ai'
      setBattleSummaryVisible(false)
      setCinemaSequence(null)
      cinemaScopeRef.current = 'generic'
      setSelectedAttacker(null)
      clearEnemyTurnTimers()
      setEnemyTurnActive(false)
      setEnemyTurnLabel('')
      prevBoardRef.current = null
      setDamagedSlots(new Set())
      transitionToScreen('home', true)
      setToastMessage(`Preparing a server-verified ${aiDifficulty} AI skirmish…`)
      socketClientRef.current.emit('game:ai_start', {
        difficulty: aiDifficulty,
        deckConfig: deckForMatch,
        enemyName: enemyName ?? 'Arena Bot',
      })
      return
    }

    setPreferredMode(mode)
    setBattleKind(mode === 'duel' ? 'local' : 'ai')
    pendingServerBattleKindRef.current = null
    setBattleSessionActive(true)
    setServerMatch({ phase: 'idle', matchId: null, revision: 0, kind: null, outcome: null })
    setBattleSummaryVisible(false)
    setCinemaSequence(null)
    cinemaScopeRef.current = 'generic'
    setSelectedAttacker(null)
    resolvedMatchKeyRef.current = ''
    clearEnemyTurnTimers()
    setEnemyTurnActive(false)
    setEnemyTurnLabel('')
    prevBoardRef.current = null
    setDamagedSlots(new Set())
    transitionToScreen('battle', true)
    setGame(createGame(mode, deckForMatch, enemyName, aiDifficulty))
    if (mode === 'ai') {
      setToastMessage('Live services are offline. This AI battle is practice-only and grants no rewards.')
    }
    void sendAnalytics(
      'match_start',
      {
        mode,
        opponent: enemyName ?? 'Arena Bot',
        aiDifficulty,
        screen: getScreenBucket(),
        preset: overrideDeckConfig ? true : false,
      },
      'match',
    )
  }

  function handleModeChange(mode: GameMode) {
    feedback('select', soundEnabled, hapticsEnabled)
    setPreferredMode(mode)
    setQueueState('idle')
    setQueueSeconds(0)
    setQueuedOpponent(null)
  }

  function handleAIDifficultyChange(level: 'auto' | AIDifficulty) {
    feedback('select', soundEnabled, hapticsEnabled)
    setAiDifficultySetting(level)
  }

  async function handleOpenPack(packType: string) {
    if (!authToken) {
      setToastMessage('Log in to buy card packs.')
      return
    }

    // Snapshot collection BEFORE the server mutates it so the ceremony overlay
    // can detect first-time card discoveries (Phase 3T NEW! ribbon).
    setPrevCollectionSnapshot(collection)
    setPackOpening(packType)
    try {
      const response = await authFetch('/api/shop/pack', authToken, { method: 'POST', body: { packType } })
      const data = (await response.json()) as {
        ok?: boolean
        error?: string
        cards?: OpenedPackCard[]
        refund?: number
        shards?: number
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Pack opening failed.')
      }

      setOpenedPackCards(data.cards ?? [])
      setLastPackRefund(data.refund ?? 0)
      setServerProfile((prev) => (prev ? { ...prev, shards: data.shards ?? prev.shards } : prev))
      const collectionResponse = await authFetch('/api/me/collection', authToken)
      const collectionData = (await collectionResponse.json()) as { ok?: boolean; collection?: CardCollection }
      setCollection(collectionData.collection ?? {})
      void refreshQuestOverview()
      setToastMessage(`Pack opened.${data.refund ? ` Duplicate refund: +${data.refund} Shards.` : ''}`)
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Pack opening failed.')
    } finally {
      setPackOpening(null)
    }
  }

  async function handleAddFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken) {
      return
    }

    const username = friendUsernameInput.trim()
    if (!username) {
      setToastMessage('Enter a username to add a friend.')
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch('/api/social/friends', authToken, { method: 'POST', body: { username } })
      const data = (await response.json()) as { ok?: boolean; error?: string; alreadyFriend?: boolean; social?: { friends?: SocialFriend[]; clan?: SocialClan | null } }
      if (!response.ok || !data.ok) {
        setToastMessage(data.error ?? 'Could not add friend right now.')
        return
      }
      if (data.social) {
        setFriends(data.social.friends ?? [])
        setClan(data.social.clan ?? null)
      }
      setFriendUsernameInput('')
      setToastMessage(data.alreadyFriend ? 'Friend list refreshed.' : `Friend added: @${username}.`)
      await refreshSocialHub()
    } catch {
      setToastMessage('Could not add friend right now.')
    } finally {
      setSocialLoading(false)
    }
  }

  async function handleRemoveFriend(friendAccountId: string, displayName: string) {
    if (!authToken) {
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch(`/api/social/friends/${friendAccountId}`, authToken, { method: 'DELETE' })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setToastMessage(data.error ?? 'Could not remove friend right now.')
        return
      }
      setToastMessage(`${displayName} removed from your friends list.`)
      await refreshSocialHub()
    } catch {
      setToastMessage('Could not remove friend right now.')
    } finally {
      setSocialLoading(false)
    }
  }

  function handleChallengeFriend(friend: SocialFriend) {
    const socket = socketClientRef.current
    if (!socket?.connected) {
      setChallengeStatus('Not connected to arena server.')
      return
    }
    if (!deckReady) {
      setChallengeStatus('Finish your deck before challenging friends.')
      return
    }
    if (outgoingChallenge) {
      setChallengeStatus('Cancel your pending challenge first.')
      return
    }
    setChallengeStatus(`Inviting ${friend.displayName}…`)
    socket.emit('challenge:send', {
      targetAccountId: friend.accountId,
      deckConfig,
    })
  }

  function handleAcceptChallenge() {
    const socket = socketClientRef.current
    if (!socket?.connected || !incomingChallenge) return
    if (!deckReady) {
      setChallengeStatus('Build a deck before accepting challenges.')
      return
    }
    socket.emit('challenge:accept', {
      challengeId: incomingChallenge.challengeId,
      deckConfig,
    })
  }

  function handleDeclineChallenge() {
    const socket = socketClientRef.current
    if (!socket?.connected || !incomingChallenge) return
    socket.emit('challenge:decline', { challengeId: incomingChallenge.challengeId })
    setIncomingChallenge(null)
  }

  function handleCancelOutgoingChallenge() {
    const socket = socketClientRef.current
    if (!socket?.connected || !outgoingChallenge) return
    socket.emit('challenge:cancel', { challengeId: outgoingChallenge.challengeId })
    setOutgoingChallenge(null)
  }

  // ─── Trading ──────────────────────────────────────────────────────

  const refreshTrades = useCallback(async () => {
    if (!authToken) return
    try {
      const response = await authFetch('/api/trades', authToken)
      if (!response.ok) return
      const data = (await response.json()) as { ok: boolean; trades: Trade[] }
      setTrades(data.trades ?? [])
    } catch {
      /* non-fatal */
    }
    // setTrades comes from SocialProvider's useState; stable but eslint
    // can't see through useContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  // Fetch trades whenever a trade event bumps the tick (login, trade:incoming,
  // trade:updated). This is a plain "subscribe to external event" effect.
  useEffect(() => {
    if (!loggedIn) return
    void refreshTrades()
  }, [loggedIn, tradesTick, refreshTrades])

  async function handleProposeTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken || tradeSubmitting) return
    const toAccountId = tradeForm.toAccountId.trim()
    if (!toAccountId) {
      setTradeStatus('Choose a friend to trade with.')
      return
    }
    if (!tradeForm.offer.length || !tradeForm.request.length) {
      setTradeStatus('Add at least one card to each side of the trade.')
      return
    }
    setTradeSubmitting(true)
    try {
      const response = await authFetch('/api/trades/propose', authToken, {
        method: 'POST',
        body: { toAccountId, offer: tradeForm.offer, request: tradeForm.request },
      })
      const data = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setTradeStatus(data.error ?? 'Could not propose trade.')
        return
      }
      setTradeStatus('Trade proposal sent.')
      setTradeForm({ toAccountId: '', offer: [], request: [] })
      setTradePickerDraft({ side: 'offer', cardId: '', qty: 1 })
      await refreshTrades()
    } catch {
      setTradeStatus('Could not reach server.')
    } finally {
      setTradeSubmitting(false)
    }
  }

  function addTradeChip() {
    const cardId = tradePickerDraft.cardId
    if (!cardId) return
    const qty = Math.max(1, Math.min(3, tradePickerDraft.qty || 1))
    const sideKey = tradePickerDraft.side
    setTradeForm((current) => {
      const sideItems = current[sideKey]
      if (sideItems.length >= 6 && !sideItems.some((item) => item.cardId === cardId)) {
        setTradeStatus('Each side can include at most 6 distinct cards.')
        return current
      }
      const nextItems = [...sideItems]
      const existingIndex = nextItems.findIndex((item) => item.cardId === cardId)
      if (existingIndex >= 0) {
        nextItems[existingIndex] = { cardId, qty: Math.min(3, nextItems[existingIndex].qty + qty) }
      } else {
        nextItems.push({ cardId, qty })
      }
      return { ...current, [sideKey]: nextItems }
    })
    setTradePickerDraft((current) => ({ ...current, cardId: '', qty: 1 }))
  }

  function removeTradeChip(side: 'offer' | 'request', cardId: string) {
    setTradeForm((current) => ({
      ...current,
      [side]: current[side].filter((item) => item.cardId !== cardId),
    }))
  }

  function formatCountdown(targetMs: number): string {
    const remaining = Math.max(0, targetMs - nowTick)
    if (remaining <= 0) return 'expired'
    const totalSec = Math.floor(remaining / 1000)
    if (totalSec >= 86400) {
      const d = Math.floor(totalSec / 86400)
      const h = Math.floor((totalSec % 86400) / 3600)
      return `${d}d ${h}h`
    }
    if (totalSec >= 3600) {
      const h = Math.floor(totalSec / 3600)
      const m = Math.floor((totalSec % 3600) / 60)
      return `${h}h ${m}m`
    }
    if (totalSec >= 60) {
      const m = Math.floor(totalSec / 60)
      const s = totalSec % 60
      return `${m}m ${s.toString().padStart(2, '0')}s`
    }
    return `${totalSec}s`
  }


  async function handleTradeAction(tradeId: string, action: 'accept' | 'reject' | 'cancel') {
    if (!authToken) return
    try {
      const response = await authFetch(`/api/trades/${encodeURIComponent(tradeId)}/${action}`, authToken, {
        method: 'POST',
      })
      const data = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setTradeStatus(data.error ?? `Could not ${action} trade.`)
        return
      }
      if (action === 'accept') setTradeStatus('Trade accepted — cards transferred.')
      else if (action === 'reject') setTradeStatus('Trade rejected.')
      else setTradeStatus('Trade cancelled.')
      await refreshTrades()
      if (action === 'accept') {
        // Collection changed; refresh it.
        try {
          const collectionResponse = await authFetch('/api/collection', authToken)
          if (collectionResponse.ok) {
            const collectionData = (await collectionResponse.json()) as { ok: boolean; collection?: Record<string, number> }
            if (collectionData.ok && collectionData.collection) {
              setCollection(collectionData.collection)
            }
          }
        } catch { /* non-fatal */ }
      }
    } catch {
      setTradeStatus('Could not reach server.')
    }
  }

  async function handleCreateClan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken) {
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch('/api/social/clan/create', authToken, {
        method: 'POST',
        body: { name: clanForm.name, tag: clanForm.tag },
      })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setSocialStatus(data.error ?? 'Could not create clan right now.')
        return
      }
      setClanForm((current) => ({ ...current, name: '', tag: '' }))
      setSocialStatus('Clan created successfully.')
      await refreshSocialHub()
    } catch {
      setSocialStatus('Could not create clan right now.')
    } finally {
      setSocialLoading(false)
    }
  }

  async function handleJoinClan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken) {
      return
    }

    const inviteCode = clanForm.inviteCode.trim().toUpperCase()
    if (!inviteCode) {
      setSocialStatus('Enter a clan invite code to join.')
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch('/api/social/clan/join', authToken, { method: 'POST', body: { inviteCode } })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setSocialStatus(data.error ?? 'Could not join clan right now.')
        return
      }
      setClanForm((current) => ({ ...current, inviteCode: '' }))
      setSocialStatus(`Joined clan via ${inviteCode}.`)
      await refreshSocialHub()
    } catch {
      setSocialStatus('Could not join clan right now.')
    } finally {
      setSocialLoading(false)
    }
  }

  async function handleLeaveClan() {
    if (!authToken) {
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch('/api/social/clan/leave', authToken, { method: 'POST' })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setSocialStatus(data.error ?? 'Could not leave clan right now.')
        return
      }
      setSocialStatus('You left your clan.')
      await refreshSocialHub()
    } catch {
      setSocialStatus('Could not leave clan right now.')
    } finally {
      setSocialLoading(false)
    }
  }

  async function handleInstallApp() {
    if (!installPromptEvent) {
      setToastMessage(installState.note)
      return
    }

    await installPromptEvent.prompt()
    const result = await installPromptEvent.userChoice
    setToastMessage(
      result.outcome === 'accepted'
        ? 'Installation accepted. Fractured Arcanum is being added to your device.'
        : 'Install prompt dismissed.',
    )

    if (result.outcome === 'accepted') {
      setPwaInstalledHint(true)
      window.localStorage.setItem(STORAGE_KEYS.pwaInstalled, JSON.stringify(true))
      void sendAnalytics('install', { screen: activeScreen, viewport: getScreenBucket() }, 'install')
    }

    setInstallPromptEvent(null)
  }

  function handleAcceptUpdate() {
    const reg = swRegistrationRef.current
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
    setSwUpdateAvailable(false)
  }

  function handleDismissUpdate() {
    setSwUpdateAvailable(false)
  }

  function handleStartQueue() {
    if (serverMatch.phase === 'active' || serverMatch.phase === 'reconnecting' || serverMatch.phase === 'leaving') {
      setToastMessage('A live match is already in progress. Resume or abandon it before queueing again.')
      transitionToScreen('home')
      return
    }
    if (!deckReady) {
      setToastMessage('Finish your deck first so matchmaking can start.')
      transitionToScreen('collection')
      return
    }

    if (!backendOnline || !socketClientRef.current?.connected) {
      setToastMessage('Live matchmaking is unavailable right now. Please reconnect and try again.')
      return
    }

    transitionToScreen('home')
    setQueueState('searching')
    setQueueSeconds(0)
    setQueuedOpponent(null)
    setQueueSearchStatus({
      position: Math.max(1, queuePresence.queueSize + 1),
      queueSize: queuePresence.queueSize + 1,
      connectedPlayers: queuePresence.connectedPlayers,
      waitSeconds: 0,
      estimatedWaitSeconds: Math.max(10, queuePresence.queueSize * 12 + 10),
      ratingWindow: 150,
    })
    setToastMessage(`Searching the live ladder for a real opponent. ${Math.max(queuePresence.connectedPlayers - 1, 0)} other players online.`)
    void sendAnalytics(
      'queue_join',
      {
        rank: rankLabel,
        deckSize: selectedDeckSize,
        screen: activeScreen,
        viewport: getScreenBucket(),
      },
      'queue',
    )

    socketClientRef.current.emit('queue:join')
  }

  function handleCancelQueue() {
    if (backendOnline && socketClientRef.current?.connected) {
      socketClientRef.current.emit('queue:leave')
    }

    setQueueState('idle')
    setQueueSeconds(0)
    setQueuedOpponent(null)
    setQueueSearchStatus({
      position: 1,
      queueSize: 0,
      connectedPlayers: queuePresence.connectedPlayers,
      waitSeconds: 0,
      estimatedWaitSeconds: 10,
      ratingWindow: 150,
    })
    setToastMessage('Ranked matchmaking canceled.')
    if (activeScreen === 'battle' && !gameInProgress) {
      transitionToScreen('home')
    }
  }

  function handleAcceptQueue() {
    if (!queuedOpponent) {
      return
    }

    setToastMessage(`Live match found against ${queuedOpponent.name}. Joining now.`)
  }

  function handleDeckCount(cardId: string, delta: number) {
    setDeckConfig((current) => {
      const total = getDeckSize(current)
      const card = CARD_LIBRARY.find((c) => c.id === cardId)
      const maxCopies = card?.rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES
      const ownedCount = loggedIn ? (collection[cardId] ?? 0) : maxCopies
      const allowedCopies = Math.min(maxCopies, ownedCount)
      const nextCount = Math.max(0, Math.min(allowedCopies, (current[cardId] ?? 0) + delta))

      if (delta > 0 && total >= MAX_DECK_SIZE) {
        return current
      }

      return {
        ...current,
        [cardId]: nextCount,
      }
    })
  }

  /**
   * Quick-battle preset launcher. Players never have to "own" the cards in
   * a preset to play it — presets are curated AI-only loadouts, intended
   * to give new players an immediate feel for the game without requiring
   * them to first build a 10-card deck. The preset deck is used directly
   * by `startMatch` and is never saved into the player's collection.
   */
  function handleQuickBattle(name: string, config: DeckConfig) {
    feedback('tap', soundEnabled, hapticsEnabled)
    setToastMessage(`Launching quick AI match: ${name} preset.`)
    startMatch('ai', `${name} Sparring Bot`, config)
  }

  function emitAction(action: Record<string, unknown>) {
    const current = serverMatchRef.current
    const socket = socketClientRef.current
    if ((current.phase !== 'active' && current.phase !== 'leaving') || !socket?.connected || actionInFlightRef.current) {
      return false
    }
    actionInFlightRef.current = true
    actionSequenceRef.current += 1
    const actionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${current.matchId}-${actionSequenceRef.current}-${Date.now()}`
    socket.emit('game:action', {
      matchId: current.matchId,
      actionId,
      expectedRevision: current.revision,
      action,
    }, (response?: { ok?: boolean; error?: string; duplicate?: boolean }) => {
      if (!response?.ok) {
        actionInFlightRef.current = false
        if (response?.error) setToastMessage(response.error)
      }
    })
    return true
  }

  function handlePlayCard(index: number, laneIndex?: number) {
    const card = activePlayer.hand[index]
    if (game.winner || !isMyTurn || !card || card.cost > activePlayer.mana || !activeBoardHasOpenLane) {
      return
    }

    if (laneIndex !== undefined && (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex >= activePlayer.board.length || activePlayer.board[laneIndex] !== null)) {
      return
    }

    playSound('cardSlam', soundEnabled)
    pulseFeedback(12, hapticsEnabled)

    if (serverBattleActive) {
      emitAction({ type: 'playCard', handIndex: index, cardInstanceId: card.instanceId, laneIndex })
      return
    }

    setGame((current) => playCard(current, current.turn, index, laneIndex))
  }

  function handleSelectAttacker(index: number) {
    const unit = activePlayer.board[index]

    if (game.winner || !unit || unit.exhausted || !isMyTurn) {
      return
    }

    feedback('select', soundEnabled, hapticsEnabled)
    setSelectedAttacker((current) => (current === index ? null : index))
  }

  function handleAttackFrom(attackerIndex: number, target: number | 'hero') {
    const attacker = activePlayer.board[attackerIndex]
    if (game.winner || !isMyTurn || !attacker || attacker.exhausted) {
      return
    }

    playSound('attackLunge', soundEnabled)
    pulseFeedback(16, hapticsEnabled)

    if (serverBattleActive) {
      emitAction({ type: 'attack', attackerIndex, target })
      setSelectedAttacker(null)
      return
    }

    setGame((current) => attack(current, current.turn, attackerIndex, target))
    setSelectedAttacker(null)
  }

  function handleAttackTarget(target: number | 'hero') {
    if (selectedAttacker === null) {
      return
    }

    handleAttackFrom(selectedAttacker, target)
  }

  function handleBurst() {
    if (game.winner || !isMyTurn) {
      return
    }

    playSound('burst', soundEnabled)
    pulseFeedback(22, hapticsEnabled)

    if (serverBattleActive) {
      emitAction({ type: 'burst' })
      return
    }

    setGame((current) => castMomentumBurst(current, current.turn))
  }

  function clearEnemyTurnTimers() {
    enemyTurnTimers.current.forEach((id) => window.clearTimeout(id))
    enemyTurnTimers.current = []
  }

  function handleEndTurn() {
    if (game.winner || !isMyTurn) {
      return
    }

    feedback('tap', soundEnabled, hapticsEnabled)
    setSelectedAttacker(null)

    if (serverBattleActive) {
      emitAction({ type: 'endTurn' })
      return
    }

    if (isLocalPassBattle) {
      setGame((current) => passTurn(current))
      setToastMessage(`Pass the device to ${game.turn === 'player' ? game.enemy.name : game.player.name}.`)
      return
    }

    const steps = generateEnemyTurnSteps(game)
    if (steps.length === 0) return

    clearEnemyTurnTimers()
    setEnemyTurnActive(true)
    setEnemyTurnLabel(steps[0].label)
    setGame(steps[0].state)
    prevBoardRef.current = { player: steps[0].state.player.board, enemy: steps[0].state.enemy.board }

    if (steps.length === 1) {
      const t = window.setTimeout(() => {
        setEnemyTurnActive(false)
        setEnemyTurnLabel('')
      }, 600)
      enemyTurnTimers.current.push(t)
      return
    }

    steps.slice(1).forEach((step, i) => {
      const t = window.setTimeout(() => {
        if (step.state.winner) {
          setGame(step.state)
          setEnemyTurnLabel(step.label)
          clearEnemyTurnTimers()
          const done = window.setTimeout(() => {
            setEnemyTurnActive(false)
            setEnemyTurnLabel('')
          }, 600)
          enemyTurnTimers.current = [done]
          return
        }

        setGame(step.state)
        setEnemyTurnLabel(step.label)
        if (i === steps.length - 2) {
          const done = window.setTimeout(() => {
            setEnemyTurnActive(false)
            setEnemyTurnLabel('')
          }, 600)
          enemyTurnTimers.current.push(done)
        }
      }, (i + 1) * 700)
      enemyTurnTimers.current.push(t)
    })
  }

  const appCtx: AppShellContextValue = {
    // Auth / setup
    authToken, setAuthToken, authScreen, setAuthScreen, authForm, setAuthForm,
    authError, authLoading,
    loggedIn,
    setupRequired, setupForm, setSetupForm, setupError, setupLoading,
    handleSetup, handleAuth, handlePasskeyLogin, handleLogout,
    // Profile (derived; raw state lives in AppShell)
    serverProfile, setServerProfile, shards, seasonRating, record,
    ownedThemes, selectedTheme, ownedCardBorders, selectedCardBorder,
    lastDailyClaim, accountRole, isAdminRole, isOwnerRole,
    rankLabel, totalGames, winRate, rankProgress, nextRankTarget, nextRewardLabel,
    todayKey, canClaimDailyReward, justClaimedDaily, totalOwnedCards,
    passkeys, passkeySupported, passkeyLoading, passkeyStatus,
    accountSessions, accountActionStatus, accountActionLoading, recoveryStatus, passkeyDeviceLink,
    refreshPasskeys, refreshAccountSessions, refreshRecoveryStatus, handleGenerateRecoveryCodes,
    handleCreatePasskeyDeviceLink, handleCopyPasskeyDeviceLink, clearPasskeyDeviceLink,
    handleRegisterPasskey, handleDeletePasskey,
    handleLogoutAllSessions, handleExportAccountData, handleDeleteAccount,
    // Deck / collection handlers + derived (state lives in ProfileProvider)
    selectedDeckSize, deckReady, savedDecks, activeDeckId,
    handleCreateDeck, handleRenameDeck, handleDeleteDeck, handleSelectDeck,
    handleBreakdownCard, handleDeckCount,
    // Cosmetics / shop handlers (state lives in ProfileProvider)
    handleOpenPack, handlePurchaseBorder, handleSelectBorder, handleEquipTheme, handleClaimDailyReward, handleClaimQuestReward, handleClaimQuestRewards,
    // Navigation / UI shell
    activeScreen, openScreen, settingsSubview, openSettingsSubview, resetSettingsSubview, screenTitle,
    toastMessage, toastSeverity, toastStack, setToastMessage, inferToastSeverity,
    confirmRequest, confirmTextInput, setConfirmTextInput, askConfirm, closeConfirm,
    consumeLongPressAction, getLongPressProps,
    cinemaSequence, presentRewardCinema, dismissRewardCinema,
    battleSummaryVisible, dismissBattleSummary,
    lastPackRefund, setLastPackRefund,
    tourVisible, startOnboardingTour, dismissOnboardingTour,
    installPromptEvent, installState, pwaServiceWorkerStatus, handleInstallApp,
    swUpdateAvailable, handleAcceptUpdate, handleDismissUpdate,
    soundEnabled, setSoundEnabled, ambientEnabled, setAmbientEnabled, analyticsConsent, setAnalyticsConsent, visitorId,
    gesturesEnabled, setGesturesEnabled,
    hapticsEnabled, setHapticsEnabled,
    // Live service
    backendOnline, dailyQuest, featuredMode, seasonName, seasonEnd,
    // Queue handlers (state lives in QueueProvider)
    handleStartQueue, handleCancelQueue, handleAcceptQueue,
    // Battle handlers + derived (state lives in GameProvider)
    isRankedBattle, isLocalPassBattle, hasBattleInProgress, gameInProgress,
    resolvedAIDifficulty,
    activePlayer, defendingPlayer, isMyTurn, defenderHasGuard, activeBoardHasOpenLane,
    startMatch, handleQuickBattle, handleResumeBattle, handleAbandonBattle, handleLeaveBattle,
    handleModeChange, handleAIDifficultyChange,
    handlePlayCard, handleSelectAttacker, handleAttackTarget,
    handleAttackFrom,
    handleBurst, handleEndTurn,
    // Social handlers (state lives in SocialProvider)
    handleAddFriend, handleRemoveFriend, handleChallengeFriend,
    handleAcceptChallenge, handleDeclineChallenge, handleCancelOutgoingChallenge,
    handleCreateClan, handleJoinClan, handleLeaveClan,
    // Trading handlers (state lives in SocialProvider)
    handleProposeTrade, handleTradeAction,
    addTradeChip, removeTradeChip, formatCountdown,
    // Settings / admin / complaints
    complaintForm, setComplaintForm, complaintStatus, handleSubmitComplaint,
    adminOverview, adminLoading, adminError,
    adminUsers, adminUsersLoading, adminUserSearch, setAdminUserSearch,
    adminAudit, adminAuditFilter, setAdminAuditFilter,
    adminAuditExpandedId, setAdminAuditExpandedId,
    adminSettings, setAdminSettings, transferForm, setTransferForm, transferStatus,
    refreshAdminOverview, refreshAdminUsers, refreshAdminAudit,
    handleSetUserRole, handleTransferOwnership, handleSaveAdminSettings, handleUpdateComplaintStatus,
    // Account management
    adminAccountDetail, adminAccountLoading, openAdminAccount, closeAdminAccount,
    adminDeletedAccounts, adminDeletedLoading, refreshDeletedAccounts,
    issuedGrant, setIssuedGrant,
    handleAdminIssueRecoveryGrant, handleAdminSuspendAccount, handleAdminUnsuspendAccount,
    handleAdminDeleteAccount, handleAdminRestoreAccount,
  }

  return (
    <AppShellContext.Provider value={appCtx}>
    <main className={`app-shell theme-${selectedTheme} ${screenTransitionClass} ${isBattleScreen ? 'battle-shell-active' : ''}`}>
      {/* ─── Floating toast stack (auto-fading) ──────────────────────── */}
      <ToastStack toasts={toastStack} />

      {/* ─── Branded confirmation modal ──────────────────────────────── */}
      <ConfirmModal
        request={confirmRequest}
        textInput={confirmTextInput}
        onTextInputChange={setConfirmTextInput}
        onClose={closeConfirm}
      />

      <TextPromptModal
        request={textPromptRequest}
        value={textPromptValue}
        onChange={setTextPromptValue}
        onClose={closeTextPrompt}
      />

      {/* ─── First-launch setup ─────────────────────────────────────── */}
      {setupRequired && (
        <div className="auth-gate">
          <div className="auth-card">
            <img className="auth-app-icon" src="/fractured-arcanum-icon-512.svg" alt="Fractured Arcanum app icon" />
            <h1>Server Setup</h1>
            <p className="auth-tagline">Create your admin account to get started</p>
            <form className="auth-form" onSubmit={handleSetup}>
                <label>
                  Username
                  <input
                    type="text"
                    placeholder="3–20 chars, letters/numbers/_"
                    maxLength={20}
                    autoComplete="username"
                    required
                    value={setupForm.username}
                    onChange={(event) => setSetupForm((f) => ({ ...f, username: event.target.value }))}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    placeholder="8+ characters"
                    minLength={8}
                    autoComplete="new-password"
                    required
                    value={setupForm.password}
                    onChange={(event) => setSetupForm((f) => ({ ...f, password: event.target.value }))}
                  />
                </label>
                {setupError && <p className="auth-error">{setupError}</p>}
                <button className="primary" type="submit" disabled={setupLoading}>
                  {setupLoading ? 'Setting up…' : 'Create Admin Account'}
                </button>
              </form>
          </div>
        </div>
      )}

      {/* ─── App update banner ────────────────────────────────────── */}
      {swUpdateAvailable && (
        <div className="update-banner">
          <span>A new version of Fractured Arcanum is available!</span>
          <div className="update-banner-actions">
            <button className="primary small" onClick={handleAcceptUpdate}>Update Now</button>
            <button className="ghost small" onClick={handleDismissUpdate}>Later</button>
          </div>
        </div>
      )}

      {/* ─── Incoming friend challenge ────────────────────────────── */}
      {incomingChallenge && (
        <div className="challenge-banner incoming update-banner">
          <span>
            <strong>{incomingChallenge.fromName}</strong> is challenging you to an unranked duel.
          </span>
          <div className="update-banner-actions">
            <button className="primary small" onClick={handleAcceptChallenge}>Accept</button>
            <button className="ghost small" onClick={handleDeclineChallenge}>Decline</button>
          </div>
        </div>
      )}

      {!incomingPasskeyDeviceLinkActive && loggedIn && pendingRecoveryCodes.length > 0 && (
        <div className="auth-gate forced-setup-gate">
          <div className="auth-card account-upgrade-card">
            <img className="auth-app-icon" src="/fractured-arcanum-icon-512.svg" alt="Fractured Arcanum app icon" />
            <h1>Save {pendingRecoveryCodes.length} Recovery Codes</h1>
            <p className="auth-tagline">This is one recovery batch. Add another device from Settings before relying on phone sign-in.</p>
            <ul className="account-requirements-list recovery-code-list">
              {pendingRecoveryCodes.map((code) => (
                <li key={code}><strong>{code}</strong><span>Store privately. Each code works once.</span></li>
              ))}
            </ul>
            {accountActionStatus && <p className="auth-note">{accountActionStatus}</p>}
            <div className="controls auth-recovery-actions">
              <button className="ghost" type="button" onClick={() => void copyRecoveryCodes()}>Copy Codes</button>
              <button className="ghost" type="button" onClick={downloadRecoveryCodes}>Download</button>
              <button className="primary" type="button" disabled={accountActionLoading} onClick={() => void handleAcknowledgeRecoveryCodes()}>
                I Saved These Codes
              </button>
            </div>
            <p className="auth-note">Lost-access recovery with one of these codes will revoke old passkeys and sessions by default.</p>
          </div>
        </div>
      )}

      {!incomingPasskeyDeviceLinkActive && loggedIn && pendingRecoveryCodes.length === 0 && accountSetupRequired && accountRequirements.length > 0 && (
        <div className="auth-gate forced-setup-gate">
          <div className="auth-card account-upgrade-card migration-setup-card">
            <img className="auth-app-icon" src="/fractured-arcanum-icon-512.svg" alt="Fractured Arcanum app icon" />
            <h1>Finish Account Setup</h1>
            <p className="auth-tagline">Your legacy password worked. Finish these passkey-only account steps to enter the arena.</p>
            <ul className="migration-steps" aria-label="Account setup steps">
              <li className={hasPasskeySetupRequirement ? 'active' : 'complete'}>
                <span className="migration-step-index">1</span>
                <span>
                  <strong>{accountReadiness?.passkeyCount ? 'Add required passkey' : 'Create passkey'}</strong>
                  <small>{hasPasskeySetupRequirement ? 'Use your browser or system passkey prompt.' : 'Passkey requirement complete.'}</small>
                </span>
              </li>
              <li className={!hasPasskeySetupRequirement && hasLegalSetupRequirement ? 'active' : hasLegalSetupRequirement ? 'pending' : 'complete'}>
                <span className="migration-step-index">2</span>
                <span>
                  <strong>Accept account terms</strong>
                  <small>{hasLegalSetupRequirement ? 'Confirm Terms, Privacy, and age eligibility.' : 'Account terms complete.'}</small>
                </span>
              </li>
              <li className={!hasPasskeySetupRequirement && !hasLegalSetupRequirement && hasRecoverySetupRequirement ? 'active' : hasRecoverySetupRequirement ? 'pending' : 'complete'}>
                <span className="migration-step-index">3</span>
                <span>
                  <strong>Save recovery codes</strong>
                  <small>{hasRecoverySetupRequirement ? 'Generate and save one-time recovery codes.' : 'Recovery codes complete.'}</small>
                </span>
              </li>
            </ul>
            {accountReadiness && hasPasskeySetupRequirement && (
              <button className="primary" type="button" disabled={passkeyLoading || !passkeySupported} onClick={() => void handleRegisterPasskey()}>
                {passkeyLoading ? 'Creating Passkey...' : accountReadiness.passkeyCount > 0 ? 'Add Required Passkey' : 'Create Passkey'}
              </button>
            )}
            {!hasPasskeySetupRequirement && !hasLegalSetupRequirement && hasRecoverySetupRequirement && (
              <button className="primary" type="button" disabled={accountActionLoading || !passkeySupported} onClick={() => void handleGenerateRecoveryCodes()}>
                {accountActionLoading ? 'Working...' : 'Confirm Passkey And Generate Recovery Codes'}
              </button>
            )}
            {passkeyStatus && <p className="auth-note">{passkeyStatus}</p>}
            {!hasPasskeySetupRequirement && hasLegalSetupRequirement && (
              <form className="auth-form migration-consent-form" onSubmit={handleCompleteAccountUpgrade}>
                <label className="legal-check">
                  <input
                    type="checkbox"
                    required
                    checked={accountUpgradeForm.acceptTerms && accountUpgradeForm.acceptPrivacy && Boolean(accountUpgradeForm.ageAttestation)}
                    onChange={(event) => setAccountUpgradeForm((current) => ({
                      ...current,
                      acceptTerms: event.target.checked,
                      acceptPrivacy: event.target.checked,
                      ageAttestation: event.target.checked ? 'adult' : '',
                    }))}
                  />
                  <span>I accept the Terms of Service and Privacy Policy and confirm I meet the age requirement or have guardian consent. I understand this passkey may stay on this device unless my passkey provider syncs it.</span>
                </label>
                {accountUpgradeStatus && <p className="auth-note">{accountUpgradeStatus}</p>}
                {accountUpgradeError && <p className="auth-error">{accountUpgradeError}</p>}
                <button className="primary" type="submit" disabled={accountUpgradeLoading}>
                  {accountUpgradeLoading ? 'Saving...' : 'Continue'}
                </button>
              </form>
            )}
            {!hasLegalSetupRequirement && accountUpgradeError && <p className="auth-error">{accountUpgradeError}</p>}
            {accountActionStatus && <p className="auth-note">{accountActionStatus}</p>}
            <button className="link migration-logout" type="button" onClick={handleLogout}>Log out instead</button>
          </div>
        </div>
      )}

      {incomingPasskeyDeviceLinkActive && (
        <div className="auth-gate">
          <div className="auth-card">
            <img className="auth-app-icon" src="/fractured-arcanum-icon-512.svg" alt="Fractured Arcanum app icon" />
            <h1>Link This Device</h1>
            <p className="auth-tagline">Create a passkey here to sign in on this device.</p>
            {incomingPasskeyDeviceLinkStatus && <p className="auth-note">{incomingPasskeyDeviceLinkStatus}</p>}
            {incomingPasskeyDeviceLinkError && <p className="auth-error">{incomingPasskeyDeviceLinkError}</p>}
            <div className="controls auth-recovery-actions">
              <button className="primary" type="button" disabled={incomingPasskeyDeviceLinkLoading || !passkeySupported} onClick={() => void handleCompleteIncomingPasskeyDeviceLink()}>
                {incomingPasskeyDeviceLinkLoading ? 'Linking...' : 'Create Passkey'}
              </button>
              <button className="ghost" type="button" disabled={incomingPasskeyDeviceLinkLoading} onClick={cancelIncomingPasskeyDeviceLink}>
                Use Another Login
              </button>
            </div>
            <p className="auth-note">The link expires quickly and can only be used once.</p>
          </div>
        </div>
      )}

      {/* ─── Auth gate ─────────────────────────────────────────────── */}
      {!setupRequired && !loggedIn && !incomingPasskeyDeviceLinkToken && (
        <div className="auth-gate">
          <div className="auth-card">
            <img className="auth-app-icon" src="/fractured-arcanum-icon-512.svg" alt="Fractured Arcanum app icon" />
            <h1>Fractured Arcanum</h1>
            <p className="auth-tagline">Cosmic horror card battles await</p>
            <form className="auth-form" onSubmit={handleAuth}>
              {/* A support-issued code carries its own account, so asking for a
                  username here would only be one more thing to remember. */}
              {authScreen !== 'grant' && (
                <label>
                  Username
                  <input
                    type="text"
                    placeholder="3-20 chars, letters/numbers/_"
                    maxLength={20}
                    autoComplete="username"
                    required
                    value={authForm.username}
                    onChange={(event) => setAuthForm((f) => ({ ...f, username: event.target.value }))}
                  />
                </label>
              )}
              {authScreen === 'legacy' ? (
                <label>
                  Legacy Password
                  <input
                    type="password"
                    placeholder="Legacy password"
                    minLength={8}
                    autoComplete="current-password"
                    required
                    value={authForm.password}
                    onChange={(event) => setAuthForm((f) => ({ ...f, password: event.target.value }))}
                  />
                </label>
              ) : authScreen === 'recover' ? (
                <>
                  <label>
                    Recovery Code
                    <input
                      type="text"
                      placeholder="FA-XXXX-XXXX-XXXX"
                      autoComplete="one-time-code"
                      required
                      value={authForm.recoveryCode}
                      onChange={(event) => setAuthForm((f) => ({ ...f, recoveryCode: event.target.value }))}
                    />
                  </label>
                  <p className="auth-note">Recovery replaces old passkeys and signs out old sessions. Use Settings on a signed-in device to link a phone without recovery. If you did not save codes, submit an account recovery support ticket with your username and details only you would know.</p>
                  <label>
                    Support Details
                    <textarea
                      className="text-input text-area"
                      rows={3}
                      placeholder="Use this only if you have no recovery code. Include account details for admin review."
                      value={recoverySupportDetails}
                      onChange={(event) => setRecoverySupportDetails(event.target.value)}
                    />
                  </label>
                  <button className="ghost" type="button" disabled={authLoading} onClick={() => void handleSubmitRecoverySupport()}>
                    Send Recovery Support Ticket
                  </button>
                </>
              ) : authScreen === 'grant' ? (
                <>
                  <label>
                    Recovery Code From Support
                    <input
                      type="text"
                      placeholder="FAR-XXXXX-XXXXX-XXXXX-XXXXX"
                      autoComplete="one-time-code"
                      required
                      value={authForm.grantCode}
                      onChange={(event) => setAuthForm((f) => ({ ...f, grantCode: event.target.value }))}
                    />
                  </label>
                  {/* The grant identifies its own account, so no username is asked for. */}
                  <p className="auth-note">
                    Use the one-time code an admin sent you. It finds your account on its own, so
                    you do not need your username. You will create a new passkey, and any old
                    passkeys and sessions will be replaced.
                  </p>
                </>
              ) : authScreen === 'signup' ? (
                <>
                  <label className="legal-check">
                    <input
                      type="checkbox"
                      required
                      checked={accountUpgradeForm.acceptTerms && accountUpgradeForm.acceptPrivacy && Boolean(accountUpgradeForm.ageAttestation)}
                      onChange={(event) => setAccountUpgradeForm((current) => ({
                        ...current,
                        acceptTerms: event.target.checked,
                        acceptPrivacy: event.target.checked,
                        ageAttestation: event.target.checked ? 'adult' : '',
                      }))}
                    />
                    <span>I accept the Terms of Service and Privacy Policy and confirm I meet the age requirement or have guardian consent. I understand this passkey may stay on this device unless my passkey provider syncs it.</span>
                  </label>
                </>
              ) : null}
              {authStatus && <p className="auth-note">{authStatus}</p>}
              {authError && <p className="auth-error">{authError}</p>}
              {authScreen === 'login' && (
                <button className="primary" type="button" disabled={authLoading || !passkeySupported} onClick={() => void handlePasskeyLogin()}>
                  Sign In With Passkey
                </button>
              )}
              {authScreen !== 'login' && (
                <button
                  className="primary"
                  type="submit"
                  disabled={authLoading || (authScreen !== 'legacy' && !passkeySupported)}
                >
                  {authLoading
                    ? 'Please wait...'
                    : authScreen === 'signup'
                      ? 'Create Passkey Account'
                      : authScreen === 'recover'
                        ? 'Recover With Code'
                        : authScreen === 'grant'
                          ? 'Restore My Account'
                          : 'Upgrade Existing Password Account'}
                </button>
              )}
            </form>
            <div className="auth-switch">
              {AUTH_ROUTES.filter((route) => route.screen !== authScreen).map((route) => (
                <span className="auth-switch-line" key={route.screen}>
                  <span>{route.prompt}</span>
                  <button
                    className="link"
                    onClick={() => { setAuthScreen(route.screen); setAuthError(''); setAuthStatus('') }}
                  >
                    {route.label}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {loggedIn && !forcedAccountGateActive && activeScreen !== 'battle' && (
        <TopBar
          screenTitle={screenTitle}
          serverProfile={serverProfile}
          shards={shards}
          onOpenSettings={() => openScreen('settings')}
          ref={topBarRef}
        />
      )}

      <BattleIntroOverlay visible={battleIntroVisible} game={game} playerRank={rankLabel} />

      <RewardCinemaOverlay
        sequence={cinemaSequence}
        soundEnabled={soundEnabled}
        hapticsEnabled={hapticsEnabled}
        onClose={dismissRewardCinema}
      />

      <OnboardingTour
        visible={tourVisible}
        soundEnabled={soundEnabled}
        hapticsEnabled={hapticsEnabled}
        onComplete={() => dismissOnboardingTour('completed')}
        onSkip={() => dismissOnboardingTour('skipped')}
      />

      {inspectedCard && (
        <CardInspectModal card={inspectedCard} onClose={() => setInspectedCard(null)} />
      )}


      {loggedIn && !forcedAccountGateActive && (<>
      <div className="scene-stage" {...sceneSwipeBind}>
        <HomeScreen />
        <CollectionScreen />

        <SocialScreen />

        <BattleScreen />

        <ShopScreen />

        <SettingsScreen />
      </div>

      {!isBattleScreen && <NavBar activeScreen={activeScreen} onNavigate={openScreen} ref={navBarRef} />}
      </>)}
    </main>
    </AppShellContext.Provider>
  )
}

export default App
