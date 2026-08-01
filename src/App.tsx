import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
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
import { AccountProvider, useAccountState } from './contexts/AccountProvider'
import { useAccountActions } from './hooks/useAccountActions'
import { useAdminConsole } from './hooks/useAdminConsole'
import { useSocialActions } from './hooks/useSocialActions'
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
  AppScreen,
  AuthScreen,
  CardBorder,
  CardCollection,
  CosmeticTheme,
  InspectedCard,
  InstallPromptEvent,
  LeaderboardEntry,
  OpenedPackCard,
  OpponentProfile,
  PackOffer,
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
} from './types'
import { QueueProvider, useQueueState } from './contexts/QueueProvider'
import { ProfileProvider, useProfileState } from './contexts/ProfileProvider'
import { SocialProvider, useSocialState } from './contexts/SocialProvider'
import { GameProvider, useGameState } from './contexts/GameProvider'
import { PlayerProvider, usePlayerState } from './contexts/PlayerProvider'
import './App.css'



/**
 * Phase 1B — App is now a thin wrapper that exists only to host the
 * provider tree. All effects, handlers, and refs live in `AppShell`.
 *
 * Phase 1F added `QueueProvider`. Phase 1D added `ProfileProvider`.
 * Phase 1E added `SocialProvider`. Phase 1C added `GameProvider`
 * (active battle/game presentation state). `PlayerProvider` took the
 * server-authoritative player record. Refs and handlers remain in `AppShell`
 * because they are tightly coupled to socket context that hasn’t been lifted
 * yet.
 *
 * The providers are siblings, not a hierarchy — none reads another, so the
 * nesting order carries no meaning.
 */
function App() {
  return (
    <AccountProvider>
      <PlayerProvider>
        <QueueProvider>
          <ProfileProvider>
            <SocialProvider>
              <GameProvider>
                <AppShell />
              </GameProvider>
            </SocialProvider>
          </ProfileProvider>
        </QueueProvider>
      </PlayerProvider>
    </AccountProvider>
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
  // ─── Identity state lives in AccountProvider ──────────────────────────
  // Auth, first-launch setup, passkeys, device links, recovery codes and
  // sessions. Read here rather than declared here so the account handlers can
  // reach the same state without it being threaded through as parameters.
  const {
    authToken, setAuthToken,
    authScreen, setAuthScreen,
    authForm, setAuthForm,
    authError, setAuthError,
    authStatus, setAuthStatus,
    authLoading, 
    loggedIn, setLoggedIn,
    recoverySupportDetails, setRecoverySupportDetails,
    recoveryStatus, 
    pendingRecoveryCodes, 
    accountUpgradeForm, setAccountUpgradeForm,
    accountUpgradeStatus, 
    accountUpgradeError, 
    accountUpgradeLoading, 
    passkeys, 
    passkeySupported,
    passkeyLoading, 
    passkeyStatus, 
    passkeyDeviceLink, 
    incomingPasskeyDeviceLinkToken, 
    incomingPasskeyDeviceLinkStatus, 
    incomingPasskeyDeviceLinkError, 
    incomingPasskeyDeviceLinkLoading, 
    accountSessions, 
    accountActionStatus, 
    accountActionLoading, 
    setupRequired, setSetupRequired,
    setupForm, setSetupForm,
    setupError, 
    setupLoading, 
  } = useAccountState()

  // ─── Server-authoritative player state lives in PlayerProvider ────────
  // The record itself plus everything read straight off it: balances, rank,
  // record, cosmetics, role.
  // Only what AppShell's own handlers and JSX need. Screens read the rest of
  // the slice straight from `useProfile()`, so it does not pass through here.
  const {
    serverProfile, setServerProfile,
    shards, seasonRating, rankLabel,
    ownedThemes, selectedTheme, ownedCardBorders,
    isAdminRole, isOwnerRole,
    todayKey, canClaimDailyReward,
  } = usePlayerState()

  // Account readiness stays here: it reads the profile but decides with
  // AccountProvider's state, so it belongs to neither provider alone.
  const accountReadiness = serverProfile?.accountReadiness ?? null
  const accountRequirements = accountReadiness?.requirements ?? []
  const accountSetupRequired = serverProfile?.accountSetupRequired === true || accountReadiness?.setupRequired === true
  const hasPasskeySetupRequirement = accountRequirements.some((item) => item.id === 'passkey' || item.id === 'owner_second_passkey')
  const hasLegalSetupRequirement = accountRequirements.some((item) => item.id === 'terms' || item.id === 'privacy' || item.id === 'age_attestation')
  const hasRecoverySetupRequirement = accountRequirements.some((item) => item.id === 'recovery_codes' || item.id === 'recovery_codes_saved')
  const incomingPasskeyDeviceLinkActive = setupRequired === false && Boolean(incomingPasskeyDeviceLinkToken)
  const forcedAccountGateActive = incomingPasskeyDeviceLinkActive || (loggedIn && (pendingRecoveryCodes.length > 0 || (accountSetupRequired && accountRequirements.length > 0)))

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
  // Only what AppShell itself still touches: socket payload handlers and the
  // hub refresh. The action handlers moved to useSocialActions, which reads the
  // rest of this slice directly.
  const {
    setFriends,
    setOnlineFriendIds,
    setOutgoingChallenge,
    incomingChallenge, setIncomingChallenge,
    setChallengeStatus,
    setTradesTick,
    setSocialLoading,
    setClan,
    setSocialStatus,
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
  const longPressTimerRef = useRef<number | null>(null)
  const longPressOriginRef = useRef<{ pointerId: number; clientX: number; clientY: number; moveTolerancePx: number; axisCancel: NonNullable<LongPressOptions['axisCancel']> } | null>(null)
  const longPressTriggeredRef = useRef(false)
  const battleStartedRef = useRef(false)
  const battleIntroTimerRef = useRef<number | null>(null)
  const enemyTurnTimers = useRef<number[]>([])
  const prevBoardRef = useRef<{ player: Array<Unit | null>; enemy: Array<Unit | null> } | null>(null)

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
          adminConsole.setAdminSettings({
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
  const resolvedAIDifficulty = aiDifficultySetting === 'auto' ? getRecommendedAIDifficulty(seasonRating) : aiDifficultySetting
  // liveQueueLabel comes from QueueProvider via useQueueState above.
  // rankLabel, totalGames, winRate, rankProgress, nextRankTarget, todayKey and
  // canClaimDailyReward come from usePlayerState() above — they are arithmetic
  // over the server profile and nothing else.
  const totalOwnedCards = Object.values(collection).reduce((sum, count) => sum + count, 0)
  const nextRewardLabel = '25 Shards'

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

  // Sign-in, first-launch setup, passkeys, device links, recovery codes,
  // sessions, export and deletion. Reads identity state through
  // useAccountState(), so only the cross-cutting values are passed in.
  const accountActions = useAccountActions({
    serverProfile,
    setServerProfile,
    askConfirm,
    setToastMessage,
    setBackendOnline,
    refreshSocialHub,
    socketClientRef,
    sessionId,
    visitorId,
  })
  const {
    handleSetup, handleAuth, handlePasskeyLogin, 
    handleSubmitRecoverySupport, ensureRecentPasskeyAuth,
    refreshPasskeys, refreshAccountSessions, refreshRecoveryStatus,
    downloadRecoveryCodes, copyRecoveryCodes, handleGenerateRecoveryCodes,
    handleAcknowledgeRecoveryCodes,
    clearPasskeyDeviceLink, handleCopyPasskeyDeviceLink, handleCreatePasskeyDeviceLink,
    cancelIncomingPasskeyDeviceLink, handleCompleteIncomingPasskeyDeviceLink,
    handleLogoutAllSessions, handleExportAccountData, handleDeleteAccount,
    handleRegisterPasskey, handleDeletePasskey, handleCompleteAccountUpgrade,
    handleLogout,
  } = accountActions

  // Owner/admin operations console. Declared after the account actions because
  // privileged operations re-prompt for a passkey through
  // `ensureRecentPasskeyAuth`, which comes from there.
  const adminConsole = useAdminConsole({
    authToken,
    isAdminRole,
    isOwnerRole,
    serverProfile,
    setServerProfile,
    ensureRecentPasskeyAuth,
    askConfirm,
    askTextPrompt,
    setToastMessage,
    sessionId,
    visitorId,
    setMotd,
    setDailyQuest,
    setFeaturedMode,
    setMaintenanceMode,
  })

  const socialActions = useSocialActions({
    authToken,
    loggedIn,
    deckReady,
    refreshSocialHub,
    setToastMessage,
    socketClientRef,
  })

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
    // Rewards + collection (the player record itself is in PlayerProvider)
    nextRewardLabel, justClaimedDaily, totalOwnedCards,
    passkeys, passkeySupported, passkeyLoading, passkeyStatus,
    accountSessions, accountActionStatus, accountActionLoading, recoveryStatus, passkeyDeviceLink,
    refreshPasskeys, refreshAccountSessions, refreshRecoveryStatus, handleGenerateRecoveryCodes,
    handleCreatePasskeyDeviceLink, handleCopyPasskeyDeviceLink, clearPasskeyDeviceLink,
    handleRegisterPasskey, handleDeletePasskey,
    handleLogoutAllSessions, handleExportAccountData, handleDeleteAccount,
    // Deck / collection handlers + derived (state lives in ProfileProvider)
    selectedDeckSize, deckReady,
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
    // Social + trading actions (state lives in SocialProvider)
    ...socialActions,
    // Settings, admin console, complaints — all owned by useAdminConsole.
    ...adminConsole,
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
            <button className="primary small" onClick={socialActions.handleAcceptChallenge}>Accept</button>
            <button className="ghost small" onClick={socialActions.handleDeclineChallenge}>Decline</button>
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
