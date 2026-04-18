import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { io, type Socket } from 'socket.io-client'
import { playSound } from './audio'
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
  DEFAULT_DECK_CONFIG,
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
  STORAGE_KEYS,
  THEME_OFFERS,
} from './constants'
import {
  authFetch,
  createAnonymousId,
  getDeviceFingerprint,
  getRankLabel,
  getScreenBucket,
  makeLobbyCode,
  pulseFeedback,
  readStoredValue,
} from './utils'
import { ToastStack } from './components/ToastStack'
import { ConfirmModal } from './components/ConfirmModal'
import { CardInspectModal } from './components/CardInspectModal'
import { NavBar } from './components/NavBar'
import { TopBar } from './components/TopBar'
import { BattleIntroOverlay } from './components/BattleIntroOverlay'
import { RewardOverlay } from './components/RewardOverlay'
import { OpsScreen } from './screens/OpsScreen'
import { VaultScreen } from './screens/VaultScreen'
import { DeckScreen } from './screens/DeckScreen'
import { HomeScreen } from './screens/HomeScreen'
import { BattleScreen } from './screens/BattleScreen'
import { AppContext, type AppContextValue } from './AppContext'
import type {
  AdminAuditEntry,
  AdminOverview,
  AdminUser,
  AppScreen,
  AuthScreen,
  BattleKind,
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
  QueuePresence,
  QueueSearchStatus,
  QueueState,
  SavedDeck,
  ServerProfile,
  SocialClan,
  SocialFriend,
  Trade,
  TradeItem,
} from './types'
import './App.css'

function App() {
  const savedDeckConfig = readStoredValue<DeckConfig>(STORAGE_KEYS.deck, DEFAULT_DECK_CONFIG)
  const savedMode = readStoredValue<GameMode>(STORAGE_KEYS.mode, 'ai')
  const savedAIDifficulty = readStoredValue<'auto' | AIDifficulty>(STORAGE_KEYS.aiDifficulty, 'auto')
  const initialAIDifficulty = savedAIDifficulty === 'auto' ? 'adept' : savedAIDifficulty

  // ─── Auth state ───────────────────────────────────────────────────────
  const [authToken, setAuthToken] = useState(() => readStoredValue(STORAGE_KEYS.authToken, ''))
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login')
  const [authForm, setAuthForm] = useState({ username: '', password: '', displayName: '' })
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  // ─── First-launch setup state ─────────────────────────────────────────
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const [setupForm, setSetupForm] = useState({ username: '', password: '', displayName: '' })
  const [setupError, setSetupError] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)

  // ─── Server-authoritative player state ────────────────────────────────
  const [serverProfile, setServerProfile] = useState<ServerProfile | null>(null)
  const runes = serverProfile?.runes ?? 0
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

  // ─── Multi-deck state ─────────────────────────────────────────────────
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([])
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null)
  // Deck-builder UI filters.
  const [builderFilter, setBuilderFilter] = useState<{
    ownedOnly: boolean
    search: string
    rarity: 'all' | 'common' | 'rare' | 'epic' | 'legendary'
  }>({ ownedOnly: false, search: '', rarity: 'all' })
  // Pending shard breakdown confirmation. `null` when nothing is pending.
  const [pendingBreakdown, setPendingBreakdown] = useState<{
    cardId: string
    qty: number
  } | null>(null)

  // ─── Local game/UI state ──────────────────────────────────────────────
  const [deckConfig, setDeckConfig] = useState<DeckConfig>(savedDeckConfig)
  const [activeScreen, setActiveScreen] = useState<AppScreen>('home')
  const [preferredMode, setPreferredMode] = useState<GameMode>(savedMode)
  const [aiDifficultySetting, setAiDifficultySetting] = useState<'auto' | AIDifficulty>(savedAIDifficulty)
  const [, setLobbyCode] = useState(() => makeLobbyCode())
  const [game, setGame] = useState<GameState>(() => createGame(savedMode, savedDeckConfig, undefined, savedMode === 'ai' ? initialAIDifficulty : 'legend'))
  const [selectedAttacker, setSelectedAttacker] = useState<number | null>(null)
  const [queueState, setQueueState] = useState<QueueState>('idle')
  const [queueSeconds, setQueueSeconds] = useState(0)
  const [queuedOpponent, setQueuedOpponent] = useState<OpponentProfile | null>(null)
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([])
  const [queuePresence, setQueuePresence] = useState<QueuePresence>({
    queueSize: 0,
    connectedPlayers: 0,
    rankedAvailable: false,
    updatedAt: '',
  })
  const [queueSearchStatus, setQueueSearchStatus] = useState<QueueSearchStatus>({
    position: 1,
    queueSize: 0,
    connectedPlayers: 0,
    waitSeconds: 0,
    estimatedWaitSeconds: 10,
    ratingWindow: 150,
  })
  const [collection, setCollection] = useState<CardCollection>({})
  const [packOffers, setPackOffers] = useState<PackOffer[]>([])
  const [openedPackCards, setOpenedPackCards] = useState<OpenedPackCard[]>([])
  const [packOpening, setPackOpening] = useState<string | null>(null)
  const [friends, setFriends] = useState<SocialFriend[]>([])
  const [onlineFriendIds, setOnlineFriendIds] = useState<Set<string>>(new Set())
  const [outgoingChallenge, setOutgoingChallenge] = useState<{ challengeId: string; toAccountId: string; toName: string; expiresAt: number } | null>(null)
  const [incomingChallenge, setIncomingChallenge] = useState<{ challengeId: string; fromAccountId: string; fromName: string; expiresAt: number } | null>(null)
  const [challengeStatus, setChallengeStatus] = useState('')
  const [trades, setTrades] = useState<Trade[]>([])
  const [tradesTick, setTradesTick] = useState(0)
  const [tradeStatus, setTradeStatus] = useState('')
  const [tradeForm, setTradeForm] = useState<{ toAccountId: string; offer: TradeItem[]; request: TradeItem[] }>({
    toAccountId: '',
    offer: [],
    request: [],
  })
  const [tradePickerDraft, setTradePickerDraft] = useState<{ side: 'offer' | 'request'; cardId: string; qty: number }>({
    side: 'offer',
    cardId: '',
    qty: 1,
  })
  const [tradeSubmitting, setTradeSubmitting] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [clan, setClan] = useState<SocialClan | null>(null)
  const [socialLoading, setSocialLoading] = useState(false)
  const [socialStatus, setSocialStatus] = useState('Social hub ready.')
  const [friendUsernameInput, setFriendUsernameInput] = useState('')
  const [clanForm, setClanForm] = useState({ name: '', tag: '', inviteCode: '' })
  const [battleKind, setBattleKind] = useState<BattleKind>(savedMode === 'duel' ? 'local' : 'ai')
  const [battleSessionActive, setBattleSessionActive] = useState(false)
  const [serverBattleActive, setServerBattleActive] = useState(false)
  const resolvedMatchKeyRef = useRef('')
  const socketClientRef = useRef<Socket | null>(null)
  const [enemyTurnActive, setEnemyTurnActive] = useState(false)
  const [enemyTurnLabel, setEnemyTurnLabel] = useState('')
  const [backendOnline, setBackendOnline] = useState(false)
  const [, setMotd] = useState('Queue up for ranked arena play.')
  const [dailyQuest, setDailyQuest] = useState('Win 1 ranked arena match')
  const [featuredMode, setFeaturedMode] = useState('Ranked Blitz')
  const [, setMaintenanceMode] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(() => readStoredValue(STORAGE_KEYS.sound, true))
  const [analyticsConsent, setAnalyticsConsent] = useState(() =>
    readStoredValue(STORAGE_KEYS.analyticsConsent, true),
  )
  const [visitorId] = useState(() => readStoredValue(STORAGE_KEYS.visitor, createAnonymousId()))
  const [sessionId] = useState(() => `session-${Math.random().toString(36).slice(2, 10)}`)
  const [installPromptEvent, setInstallPromptEvent] = useState<InstallPromptEvent | null>(null)
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
  const [opponentDisconnected, setOpponentDisconnected] = useState(false)
  const [disconnectGraceMs, setDisconnectGraceMs] = useState(0)
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
  const [transferForm, setTransferForm] = useState({ targetAccountId: '', password: '' })
  const [transferStatus, setTransferStatus] = useState('')
  const [battleIntroVisible, setBattleIntroVisible] = useState(false)
  const [rewardOverlayVisible, setRewardOverlayVisible] = useState(false)
  const [damagedSlots, setDamagedSlots] = useState<Set<string>>(new Set())
  const [inspectedCard, setInspectedCard] = useState<InspectedCard | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
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
  }, [authToken, loggedIn])

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
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
    pulseFeedback(12)
    setInspectedCard(card)
  }

  function getLongPressProps(card: InspectedCard) {
    return {
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
          return
        }

        clearLongPressTimer()
        longPressTriggeredRef.current = false
        longPressTimerRef.current = window.setTimeout(() => inspectCard(card), 420)
      },
      onPointerUp: () => clearLongPressTimer(),
      onPointerLeave: () => clearLongPressTimer(),
      onPointerCancel: () => clearLongPressTimer(),
      onContextMenu: (event: React.MouseEvent<HTMLElement>) => event.preventDefault(),
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
          displayName: setupForm.displayName.trim() || setupForm.username.trim(),
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
    setAuthLoading(true)

    const endpoint = authScreen === 'signup' ? '/api/auth/signup' : '/api/auth/login'
    const body: Record<string, string> = {
      username: authForm.username.trim(),
      password: authForm.password,
    }
    if (authScreen === 'signup') {
      body.displayName = authForm.displayName.trim() || authForm.username.trim()
      body.deviceFingerprint = getDeviceFingerprint()
    }

    try {
      const response = await fetch(`${ARENA_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
      setAuthError('')
      setToastMessage(`Welcome${data.profile?.username ? ', ' + data.profile.username : ''}!`)
    } catch {
      setAuthError('Network error. Please try again.')
    }

    setAuthLoading(false)
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
    setServerBattleActive(false)
    setCollection({})
    setPackOffers([])
    setFriends([])
    setClan(null)
    setFriendUsernameInput('')
    setClanForm({ name: '', tag: '', inviteCode: '' })
    setAuthToken('')
    setServerProfile(null)
    setLoggedIn(false)
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
      socket.emit('game:rejoin')
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
      setToastMessage('Connection lost. Reconnecting to live services...')
    })

    socket.on('connect_error', () => {
      setBackendOnline(false)
      setQueueState('idle')
      setQueuedOpponent(null)
    })

    socket.on('server:hello', (payload: { message: string }) => {
      setMotd(payload.message)
    })

    socket.on('server:role_changed', (payload: { role?: unknown }) => {
      const nextRole = payload?.role
      if (nextRole !== 'user' && nextRole !== 'admin' && nextRole !== 'owner') return
      setServerProfile((profile) => (profile ? { ...profile, role: nextRole } : profile))
      if (nextRole === 'user') {
        setToastMessage('Your admin privileges were revoked.')
        setActiveScreen((current) => (current === 'ops' ? 'home' : current))
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
      setBattleKind('ranked') // reuse ranked-style server-authoritative flow
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
        setToastMessage(`Match found against ${payload.opponent.name}.`)
      },
    )

    socket.on('game:start', (payload: { yourSide: BattleSide; state: GameState }) => {
      setGame(payload.state)
      setBattleKind('ranked')
      setBattleSessionActive(true)
      setServerBattleActive(true)
      setActiveScreen('battle')
      setQueueState('idle')
      setQueueSeconds(0)
      setQueuedOpponent(null)
      triggerBattleIntro()
      playSound('summon', soundEnabled)
    })

    socket.on('game:state', (payload: { state: GameState }) => {
      setGame(payload.state)
    })

    socket.on('game:over', (payload: { result: string }) => {
      setOpponentDisconnected(false)
      setDisconnectGraceMs(0)
      setBattleSessionActive(false)
      setServerBattleActive(false)
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

    socket.on('game:error', (payload: { error: string }) => {
      setToastMessage(payload.error)
    })

    // ─── Reconnect / disconnect events ──────────────────────────────
    socket.on('game:rejoin', (payload: { yourSide: BattleSide; state: GameState; roomId: string; opponentDisconnected: boolean }) => {
      setGame(payload.state)
      setBattleKind('ranked')
      setBattleSessionActive(true)
      setServerBattleActive(true)
      setActiveScreen('battle')
      setQueueState('idle')
      setQueueSeconds(0)
      setQueuedOpponent(null)
      setOpponentDisconnected(payload.opponentDisconnected)
      triggerBattleIntro()
      setToastMessage('Reconnected to your ranked match.')
      playSound('summon', soundEnabled)
    })

    socket.on('game:rejoin_failed', () => {
      setOpponentDisconnected(false)
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
  }, [loggedIn])

  useEffect(() => {
    if (!authToken || !loggedIn) {
      return
    }

    void Promise.all([
      authFetch('/api/me/collection', authToken).then((r) => r.json()),
      authFetch('/api/shop/packs', authToken).then((r) => r.json()),
      authFetch('/api/social', authToken).then((r) => r.json()),
    ])
      .then(([collectionData, packData, socialData]: [
        { ok?: boolean; collection?: CardCollection },
        { ok?: boolean; packs?: PackOffer[] },
        { ok?: boolean; friends?: SocialFriend[]; clan?: SocialClan | null; error?: string },
      ]) => {
        const nextCollection = collectionData.collection ?? {}
        setCollection(nextCollection)
        setPackOffers(packData.packs ?? [])
        setFriends(socialData.friends ?? [])
        setClan(socialData.clan ?? null)
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
  }, [authToken, loggedIn])

  useEffect(() => {
    if (queueState !== 'searching') {
      return undefined
    }

    const tick = window.setInterval(() => {
      setQueueSeconds((seconds) => seconds + 1)
    }, 1000)

    return () => {
      window.clearInterval(tick)
    }
  }, [queueState])

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
    window.localStorage.setItem(STORAGE_KEYS.mode, JSON.stringify(preferredMode))
    window.localStorage.setItem(STORAGE_KEYS.aiDifficulty, JSON.stringify(aiDifficultySetting))
    window.localStorage.setItem(STORAGE_KEYS.visitor, JSON.stringify(visitorId))
    window.localStorage.setItem(STORAGE_KEYS.analyticsConsent, JSON.stringify(analyticsConsent))
    window.localStorage.setItem(STORAGE_KEYS.authToken, JSON.stringify(authToken))
  }, [
    deckConfig,
    soundEnabled,
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
    [authToken],
  )

  function handleCreateDeck() {
    if (!authToken) {
      setToastMessage('Sign in to save multiple decks.')
      return
    }
    const name = window.prompt('Name your new deck (1-30 characters):', `Deck ${savedDecks.length + 1}`)?.trim()
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
          // Switching active to the newly-created deck would discard the
          // current builder state; instead, just update the list and let
          // the player select it explicitly.
          setToastMessage(`Deck "${data.deck.name}" created.`)
        }
      })
      .catch(() => setToastMessage('Could not create deck.'))
  }

  function handleRenameDeck(deck: SavedDeck) {
    if (!authToken) return
    const name = window.prompt('Rename deck:', deck.name)?.trim()
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

  function handleDeleteDeck(deck: SavedDeck) {
    if (!authToken) return
    if (savedDecks.length <= 1) {
      setToastMessage('You need at least one deck. Create another before deleting this one.')
      return
    }
    if (!window.confirm(`Delete deck "${deck.name}"? This cannot be undone.`)) return
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
        runes?: number
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
                runes: data.runes ?? prev.runes,
              }
            : prev,
        )
        setCollection(data.owned ?? {})
        setToastMessage(`Refunded ${data.refunded ?? 0} Shards.`)
        playSound('tap', soundEnabled)
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
    if (runes < cost) {
      setToastMessage(`Need ${cost - runes} more Shards for that border.`)
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
        runes?: number
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
                runes: data.runes ?? prev.runes,
                ownedCardBorders: data.ownedCardBorders ?? prev.ownedCardBorders,
                selectedCardBorder: data.selectedCardBorder ?? prev.selectedCardBorder,
              }
            : prev,
        )
        setToastMessage(`${CARD_BORDER_OFFERS.find((b) => b.id === borderId)?.name ?? 'Border'} unlocked.`)
        playSound('summon', soundEnabled)
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
        playSound('tap', soundEnabled)
      })
      .catch(() => setToastMessage('Could not equip border.'))
  }

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPromptEvent(event as InstallPromptEvent)
      setToastMessage('Install Fractured Arcanum for a faster home-screen launch.')
    }

    const handleInstalled = () => {
      setInstallPromptEvent(null)
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

  // Drives time-based UI: trade expiration countdowns, pending challenges, etc.
  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (queueState === 'found') {
      playSound('match', soundEnabled)
      pulseFeedback(20)
    }
  }, [queueState, soundEnabled])

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
  }, [activeScreen])

  useEffect(() => {
    void sendAnalytics(
      'page_view',
      {
        screen: getScreenBucket(),
        mode: game.mode,
      },
      'home',
    )
  }, [game.mode, sendAnalytics])

  useEffect(() => {
    const prev = prevBoardRef.current
    const playerBoard = game.player.board
    const enemyBoard = game.enemy.board
    if (!prev) {
      prevBoardRef.current = { player: playerBoard, enemy: enemyBoard }
      return
    }

    const damaged = new Set<string>()

    for (const side of ['player', 'enemy'] as const) {
      const oldBoard = prev[side]
      const newBoard = side === 'player' ? playerBoard : enemyBoard
      for (let i = 0; i < oldBoard.length; i++) {
        const oldUnit = oldBoard[i]
        const newUnit = newBoard[i]
        if (oldUnit && newUnit && newUnit.uid === oldUnit.uid && newUnit.currentHealth < oldUnit.currentHealth) {
          damaged.add(newUnit.uid)
        }
      }
    }

    prevBoardRef.current = { player: playerBoard, enemy: enemyBoard }

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
  }, [game.player.board, game.enemy.board])

  useEffect(() => {
    if (enemyTurnActive) return
    if (game.winner === 'player') {
      playSound('win', soundEnabled)
    } else if (game.winner === 'enemy') {
      playSound('lose', soundEnabled)
    }

    const overlayTimer = window.setTimeout(() => {
      setRewardOverlayVisible(game.winner === 'player')
    }, 0)

    return () => {
      window.clearTimeout(overlayTimer)
    }
  }, [game.winner, soundEnabled, enemyTurnActive])

  useEffect(() => {
    if (!game.winner) {
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

    if (authToken && game.mode !== 'duel') {
      const result = game.winner === 'player' ? 'win' : game.winner === 'enemy' ? 'loss' : 'draw'
      void authFetch('/api/match/complete', authToken, {
        method: 'POST',
        body: { opponent: game.enemy.name, mode: game.mode, result, turns: game.turnNumber },
      })
        .then((r) => r.json())
        .then((data: { ok: boolean; runes?: number; seasonRating?: number; wins?: number; losses?: number; streak?: number; runesEarned?: number }) => {
          if (data.ok) {
            setServerProfile((prev) =>
              prev
                ? {
                    ...prev,
                    runes: data.runes ?? prev.runes,
                    seasonRating: data.seasonRating ?? prev.seasonRating,
                    wins: data.wins ?? prev.wins,
                    losses: data.losses ?? prev.losses,
                    streak: data.streak ?? prev.streak,
                  }
                : prev,
            )
          }
        })
        .catch(() => {})
    }

    if (authToken && game.mode === 'duel') {
      void authFetch('/api/me', authToken)
        .then((r) => r.json())
        .then((data: { ok: boolean; profile?: ServerProfile }) => {
          if (data.ok && data.profile) setServerProfile(data.profile)
        })
        .catch(() => {})
    }
  }, [game, sendAnalytics, authToken])

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
  const liveQueueLabel = queuePresence.rankedAvailable ? 'Live opponents ready' : 'Waiting for challengers'
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
  const nextRewardLabel =
    seasonRating >= 1500 ? 'Champion Vault' : seasonRating >= 1300 ? 'Gold Chest' : seasonRating >= 1150 ? 'Silver Cache' : 'Bronze Bundle'
  const todayKey = new Date().toISOString().slice(0, 10)
  const canClaimDailyReward = lastDailyClaim !== todayKey

  const screenTitle =
    activeScreen === 'home'
      ? 'Arena Home'
      : activeScreen === 'deck'
        ? 'Deck Forge'
        : activeScreen === 'battle'
          ? 'Battlefield'
          : activeScreen === 'vault'
            ? 'Vault'
            : 'Operations'


  function openScreen(screen: AppScreen) {
    playSound('tap', soundEnabled)
    setActiveScreen(screen)
  }

  function resetBattleState(mode: GameMode = preferredMode, toast = 'Battle reset. Ready when you are.', nextScreen: AppScreen = 'home') {
    const nextDifficulty = mode === 'ai' ? resolvedAIDifficulty : 'legend'
    setBattleKind(mode === 'duel' ? 'local' : 'ai')
    clearEnemyTurnTimers()
    battleStartedRef.current = false
    if (battleIntroTimerRef.current) {
      window.clearTimeout(battleIntroTimerRef.current)
      battleIntroTimerRef.current = null
    }
    resolvedMatchKeyRef.current = ''
    prevBoardRef.current = null
    setBattleSessionActive(false)
    setServerBattleActive(false)
    setSelectedAttacker(null)
    setEnemyTurnActive(false)
    setEnemyTurnLabel('')
    setRewardOverlayVisible(false)
    setDamagedSlots(new Set())
    setInspectedCard(null)
    setOpponentDisconnected(false)
    setDisconnectGraceMs(0)
    setQueueState('idle')
    setQueueSeconds(0)
    setQueuedOpponent(null)
    setGame(createGame(mode, deckConfig, undefined, nextDifficulty))
    setActiveScreen(nextScreen)
    setToastMessage(toast)
  }

  function handleResumeBattle() {
    playSound('tap', soundEnabled)
    setActiveScreen('battle')

    if (battleKind === 'ranked') {
      if (socketClientRef.current?.connected) {
        socketClientRef.current.emit('game:rejoin')
        setToastMessage(`Rejoining your live battle against ${game.enemy.name}.`)
      } else {
        setToastMessage('Reconnecting to your live battle...')
      }
      return
    }

    setToastMessage(`Resuming your battle against ${game.enemy.name}.`)
  }

  function handleAbandonBattle() {
    playSound('tap', soundEnabled)

    if (serverBattleActive && hasBattleInProgress && socketClientRef.current?.connected) {
      emitAction({ type: 'surrender' })
      resetBattleState(preferredMode, 'Ranked match abandoned. The result will be recorded by the server.')
      return
    }

    if (hasBattleInProgress) {
      resetBattleState(preferredMode, game.mode === 'ai' ? 'AI battle abandoned. Ready for a fresh match.' : 'Battle reset. Ready when you are.')
      return
    }

    resetBattleState(preferredMode)
  }

  function handleLeaveBattle() {
    playSound('tap', soundEnabled)

    if (queueState !== 'idle' && !hasBattleInProgress) {
      handleCancelQueue()
      return
    }

    if (serverBattleActive && hasBattleInProgress) {
      setActiveScreen('home')
      setToastMessage(`Battle paused vs ${game.enemy.name}. You can resume or abandon it from the lobby.`)
      return
    }

    if (hasBattleInProgress) {
      resetBattleState(preferredMode, game.mode === 'ai' ? 'AI battle abandoned. Ready for a fresh match.' : 'Battle closed. Start a new match whenever you like.')
      return
    }

    setActiveScreen('home')
  }

  function handleClaimDailyReward() {
    if (!canClaimDailyReward || !authToken) {
      setToastMessage(authToken ? 'The daily reward has already been claimed today.' : 'Log in to claim daily rewards.')
      return
    }

    playSound('win', soundEnabled)
    pulseFeedback(18)
    void authFetch('/api/me/daily', authToken, { method: 'POST' })
      .then((r) => r.json())
      .then((data: { ok: boolean; error?: string; runes?: number; totalEarned?: number }) => {
        if (data.ok) {
          setServerProfile((prev) => prev ? { ...prev, runes: data.runes ?? prev.runes, lastDaily: todayKey, totalEarned: data.totalEarned ?? prev.totalEarned } : prev)
          setToastMessage('Daily reward claimed: +50 Shards.')
        } else {
          setToastMessage(data.error ?? 'Could not claim daily reward.')
        }
      })
      .catch(() => setToastMessage('Network error claiming daily reward.'))
    void sendAnalytics('reward_claim', { amount: 50, currency: 'shards' }, 'vault')
  }

  function handleEquipTheme(themeId: CosmeticTheme, cost: number) {
    if (!authToken) {
      setToastMessage('Log in to use cosmetic themes.')
      return
    }

    const alreadyOwned = ownedThemes.includes(themeId)

    if (!alreadyOwned && runes < cost) {
      setToastMessage('Not enough Shards yet for that cosmetic theme.')
      return
    }

    if (!alreadyOwned) {
      void authFetch('/api/shop/theme', authToken, { method: 'POST', body: { themeId } })
        .then((r) => r.json())
        .then((data: { ok: boolean; error?: string; runes?: number; ownedThemes?: CosmeticTheme[] }) => {
          if (data.ok) {
            setServerProfile((prev) =>
              prev ? {
                ...prev,
                runes: data.runes ?? prev.runes,
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

    void sendAnalytics('cosmetic_equip', { themeId }, 'vault')
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

    try {
      const response = await authFetch(`/api/admin/complaints/${id}`, authToken, {
        method: 'POST',
        body: {
          status,
          note:
            status === 'resolved'
              ? 'Marked resolved from the in-app admin console.'
              : 'Marked investigating from the in-app admin console.',
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
    const deckForMatch = overrideDeckConfig ?? deckConfig
    if (getDeckSize(deckForMatch) < MIN_DECK_SIZE) {
      setToastMessage('Finish building your deck before entering the arena.')
      setActiveScreen('deck')
      return
    }

    const aiDifficulty = mode === 'ai' ? resolvedAIDifficulty : 'legend'

    setPreferredMode(mode)
    setBattleKind(mode === 'duel' ? 'local' : 'ai')
    setBattleSessionActive(true)
    setServerBattleActive(false)
    setSelectedAttacker(null)
    resolvedMatchKeyRef.current = ''
    clearEnemyTurnTimers()
    setEnemyTurnActive(false)
    setEnemyTurnLabel('')
    prevBoardRef.current = null
    setDamagedSlots(new Set())
    setActiveScreen('battle')
    setGame(createGame(mode, deckForMatch, enemyName, aiDifficulty))
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
    playSound('tap', soundEnabled)
    setPreferredMode(mode)
    setQueueState('idle')
    setQueueSeconds(0)
    setQueuedOpponent(null)
    setToastMessage(mode === 'ai' ? 'AI skirmish ready. Choose a difficulty and enter the arena.' : 'Pass-and-play duel ready. Ranked matchmaking stays available below.')
  }

  function handleAIDifficultyChange(level: 'auto' | AIDifficulty) {
    playSound('tap', soundEnabled)
    setAiDifficultySetting(level)
    setToastMessage(level === 'auto' ? `AI difficulty set to Auto. Recommended tier: ${getRecommendedAIDifficulty(seasonRating)}.` : `${level.charAt(0).toUpperCase() + level.slice(1)} AI selected.`)
  }

  async function handleOpenPack(packType: string) {
    if (!authToken) {
      setToastMessage('Log in to buy card packs.')
      return
    }

    setPackOpening(packType)
    try {
      const response = await authFetch('/api/shop/pack', authToken, { method: 'POST', body: { packType } })
      const data = (await response.json()) as {
        ok?: boolean
        error?: string
        cards?: OpenedPackCard[]
        refund?: number
        runes?: number
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Pack opening failed.')
      }

      setOpenedPackCards(data.cards ?? [])
      setServerProfile((prev) => (prev ? { ...prev, runes: data.runes ?? prev.runes } : prev))
      const collectionResponse = await authFetch('/api/me/collection', authToken)
      const collectionData = (await collectionResponse.json()) as { ok?: boolean; collection?: CardCollection }
      setCollection(collectionData.collection ?? {})
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
      setSocialStatus('Enter a username to add a friend.')
      return
    }

    setSocialLoading(true)
    try {
      const response = await authFetch('/api/social/friends', authToken, { method: 'POST', body: { username } })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setSocialStatus(data.error ?? 'Could not add friend right now.')
        return
      }
      setFriendUsernameInput('')
      setSocialStatus(`Friend added: @${username}.`)
      await refreshSocialHub()
    } catch {
      setSocialStatus('Could not add friend right now.')
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
        setSocialStatus(data.error ?? 'Could not remove friend right now.')
        return
      }
      setSocialStatus(`${displayName} removed from your friends list.`)
      await refreshSocialHub()
    } catch {
      setSocialStatus('Could not remove friend right now.')
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
  }, [authToken])

  // Fetch trades whenever a trade event bumps the tick (login, trade:incoming,
  // trade:updated). This is a plain "subscribe to external event" effect —
  // the setState call inside refreshTrades is the legitimate way to mirror
  // external updates into React state.
  useEffect(() => {
    if (!loggedIn) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      void sendAnalytics('install', { screen: getScreenBucket() }, 'install')
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
    if (!deckReady) {
      setToastMessage('Finish your deck first so matchmaking can start.')
      setActiveScreen('deck')
      return
    }

    if (!backendOnline || !socketClientRef.current?.connected) {
      setToastMessage('Live matchmaking is unavailable right now. Please reconnect and try again.')
      return
    }

    setActiveScreen('home')
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
        screen: getScreenBucket(),
      },
      'queue',
    )

    socketClientRef.current.emit('queue:join', {
      name: 'Rune Captain',
      rank: `${rankLabel} Division`,
      rating: seasonRating,
      deckConfig,
    })
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
      setActiveScreen('home')
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
    playSound('tap', soundEnabled)
    setToastMessage(`Launching quick AI match: ${name} preset.`)
    startMatch('ai', `${name} Sparring Bot`, config)
  }

  function emitAction(action: Record<string, unknown>) {
    if (isRankedBattle && socketClientRef.current?.connected) {
      socketClientRef.current.emit('game:action', { action })
    }
  }

  function handlePlayCard(index: number) {
    const card = activePlayer.hand[index]
    if (game.winner || !isMyTurn || !card || card.cost > activePlayer.mana || !activeBoardHasOpenLane) {
      return
    }

    playSound('summon', soundEnabled)
    pulseFeedback(12)

    if (isRankedBattle) {
      emitAction({ type: 'playCard', handIndex: index })
      return
    }

    setGame((current) => playCard(current, current.turn, index))
  }

  function handleSelectAttacker(index: number) {
    const unit = activePlayer.board[index]

    if (game.winner || !unit || unit.exhausted || !isMyTurn) {
      return
    }

    playSound('tap', soundEnabled)
    setSelectedAttacker((current) => (current === index ? null : index))
  }

  function handleAttackTarget(target: number | 'hero') {
    if (selectedAttacker === null || game.winner || !isMyTurn) {
      return
    }

    playSound('attack', soundEnabled)
    pulseFeedback(16)

    if (isRankedBattle) {
      emitAction({ type: 'attack', attackerIndex: selectedAttacker, target })
      setSelectedAttacker(null)
      return
    }

    setGame((current) => attack(current, current.turn, selectedAttacker, target))
    setSelectedAttacker(null)
  }

  function handleBurst() {
    if (game.winner || !isMyTurn) {
      return
    }

    playSound('burst', soundEnabled)
    pulseFeedback(22)

    if (isRankedBattle) {
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

    playSound('tap', soundEnabled)
    setSelectedAttacker(null)

    if (isRankedBattle) {
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

  const appCtx: AppContextValue = {
    // Auth / setup
    authToken, setAuthToken, authScreen, setAuthScreen, authForm, setAuthForm,
    authError, authLoading, loggedIn,
    setupRequired, setupForm, setSetupForm, setupError, setupLoading,
    handleSetup, handleAuth, handleLogout,
    // Profile
    serverProfile, setServerProfile, runes, seasonRating, record,
    ownedThemes, selectedTheme, ownedCardBorders, selectedCardBorder,
    lastDailyClaim, accountRole, isAdminRole, isOwnerRole,
    rankLabel, totalGames, winRate, rankProgress, nextRankTarget, nextRewardLabel,
    todayKey, canClaimDailyReward, totalOwnedCards,
    // Decks / collection
    collection, setCollection, deckConfig, setDeckConfig, selectedDeckSize, deckReady,
    savedDecks, activeDeckId, builderFilter, setBuilderFilter,
    pendingBreakdown, setPendingBreakdown,
    handleCreateDeck, handleRenameDeck, handleDeleteDeck, handleSelectDeck,
    handleBreakdownCard, handleDeckCount,
    // Cosmetics / shop
    packOffers, openedPackCards, packOpening,
    handleOpenPack, handlePurchaseBorder, handleSelectBorder, handleEquipTheme, handleClaimDailyReward,
    // Navigation / UI shell
    activeScreen, openScreen, screenTitle,
    toastMessage, toastSeverity, toastStack, setToastMessage, inferToastSeverity,
    confirmRequest, confirmTextInput, setConfirmTextInput, askConfirm, closeConfirm,
    inspectedCard, setInspectedCard, consumeLongPressAction, getLongPressProps,
    installPromptEvent, handleInstallApp,
    swUpdateAvailable, handleAcceptUpdate, handleDismissUpdate,
    soundEnabled, setSoundEnabled, analyticsConsent, setAnalyticsConsent, visitorId,
    // Live service
    backendOnline, dailyQuest, featuredMode,
    // Queue
    queueState, queueSeconds, queuedOpponent, queuePresence, queueSearchStatus,
    liveQueueLabel, leaderboardEntries,
    handleStartQueue, handleCancelQueue, handleAcceptQueue,
    // Battle
    game, battleKind, isRankedBattle, isLocalPassBattle,
    battleSessionActive, serverBattleActive, hasBattleInProgress, gameInProgress,
    selectedAttacker, enemyTurnActive, enemyTurnLabel,
    battleIntroVisible, rewardOverlayVisible, setRewardOverlayVisible,
    damagedSlots, opponentDisconnected, disconnectGraceMs,
    preferredMode, setPreferredMode, aiDifficultySetting, resolvedAIDifficulty,
    activePlayer, defendingPlayer, isMyTurn, defenderHasGuard, activeBoardHasOpenLane,
    startMatch, handleQuickBattle, handleResumeBattle, handleAbandonBattle, handleLeaveBattle,
    handleModeChange, handleAIDifficultyChange,
    handlePlayCard, handleSelectAttacker, handleAttackTarget,
    handleBurst, handleEndTurn,
    // Social
    friends, onlineFriendIds, outgoingChallenge, incomingChallenge, challengeStatus,
    socialLoading, socialStatus, friendUsernameInput, setFriendUsernameInput,
    clan, clanForm, setClanForm,
    handleAddFriend, handleRemoveFriend, handleChallengeFriend,
    handleAcceptChallenge, handleDeclineChallenge, handleCancelOutgoingChallenge,
    handleCreateClan, handleJoinClan, handleLeaveClan,
    // Trading
    trades, tradeStatus, tradeForm, setTradeForm, tradePickerDraft, setTradePickerDraft,
    tradeSubmitting, handleProposeTrade, handleTradeAction,
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
  }

  return (
    <AppContext.Provider value={appCtx}>
    <main className={`app-shell theme-${selectedTheme}`}>
      {/* ─── Floating toast stack (auto-fading) ──────────────────────── */}
      <ToastStack toasts={toastStack} />

      {/* ─── Branded confirmation modal ──────────────────────────────── */}
      <ConfirmModal
        request={confirmRequest}
        textInput={confirmTextInput}
        onTextInputChange={setConfirmTextInput}
        onClose={closeConfirm}
      />

      {/* ─── First-launch setup ─────────────────────────────────────── */}
      {setupRequired && (
        <div className="auth-gate">
          <div className="auth-card">
            <img className="brand-logo" src="/fractured-arcanum-logo.svg" alt="Fractured Arcanum" />
            <h1>Server Setup</h1>
            <p className="auth-tagline">Create your admin account to get started</p>
            <form className="auth-form" onSubmit={handleSetup}>
                <label>
                  Display Name
                  <input
                    type="text"
                    placeholder="Your arena name"
                    maxLength={20}
                    value={setupForm.displayName}
                    onChange={(event) => setSetupForm((f) => ({ ...f, displayName: event.target.value }))}
                  />
                </label>
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

      {/* ─── Auth gate ─────────────────────────────────────────────── */}
      {!setupRequired && !loggedIn && (
        <div className="auth-gate">
          <div className="auth-card">
            <img className="brand-logo" src="/fractured-arcanum-logo.svg" alt="Fractured Arcanum" />
            <h1>Fractured Arcanum</h1>
            <p className="auth-tagline">Cosmic horror card battles await</p>
            <form className="auth-form" onSubmit={handleAuth}>
              {authScreen === 'signup' && (
                <label>
                  Display Name
                  <input
                    type="text"
                    placeholder="Your arena name"
                    maxLength={20}
                    value={authForm.displayName}
                    onChange={(event) => setAuthForm((f) => ({ ...f, displayName: event.target.value }))}
                  />
                </label>
              )}
              <label>
                Username
                <input
                  type="text"
                  placeholder="3–20 chars, letters/numbers/_"
                  maxLength={20}
                  autoComplete="username"
                  required
                  value={authForm.username}
                  onChange={(event) => setAuthForm((f) => ({ ...f, username: event.target.value }))}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  placeholder="8+ characters"
                  minLength={8}
                  autoComplete={authScreen === 'signup' ? 'new-password' : 'current-password'}
                  required
                  value={authForm.password}
                  onChange={(event) => setAuthForm((f) => ({ ...f, password: event.target.value }))}
                />
              </label>
              {authError && <p className="auth-error">{authError}</p>}
              <button className="primary" type="submit" disabled={authLoading}>
                {authLoading ? 'Please wait…' : authScreen === 'signup' ? 'Create Account' : 'Log In'}
              </button>
            </form>
            <p className="auth-switch">
              {authScreen === 'login' ? (
                <>
                  New here?{' '}
                  <button className="link" onClick={() => { setAuthScreen('signup'); setAuthError('') }}>
                    Create account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button className="link" onClick={() => { setAuthScreen('login'); setAuthError('') }}>
                    Log in
                  </button>
                </>
              )}
            </p>
            {installPromptEvent && (
              <button className="pwa-install-btn" onClick={handleInstallApp}>
                Install App
              </button>
            )}
          </div>
        </div>
      )}

      {loggedIn && activeScreen !== 'battle' && (
        <TopBar
          screenTitle={screenTitle}
          serverProfile={serverProfile}
          soundEnabled={soundEnabled}
          onToggleSound={() => {
            playSound('tap', !soundEnabled)
            setSoundEnabled((value) => !value)
          }}
          installPromptEvent={installPromptEvent}
          onInstallApp={() => void handleInstallApp()}
          onLogout={handleLogout}
        />
      )}

      {activeScreen === 'home' && loggedIn && (
        <section className="nav-strip section-card">
          <div className="season-progress-block">
            <div>
              <p className="eyebrow">Season of Whispers</p>
              <h2>{rankLabel} League</h2>
            </div>
            <div className="progress-column">
              <div className="progress-shell">
                <div className="progress-fill" style={{ width: `${rankProgress}%` }}></div>
              </div>
              <p className="note">{seasonRating} / {nextRankTarget} rating</p>
            </div>
          </div>
        </section>
      )}

      <BattleIntroOverlay visible={battleIntroVisible} game={game} />

      <RewardOverlay
        visible={rewardOverlayVisible}
        winner={game.winner}
        isRankedBattle={isRankedBattle}
        battleKind={battleKind}
        rankLabel={rankLabel}
        streak={record.streak}
        mode={game.mode}
        onClaim={() => setRewardOverlayVisible(false)}
        onQueueAgain={(mode) => startMatch(mode)}
      />

      {inspectedCard && (
        <CardInspectModal card={inspectedCard} onClose={() => setInspectedCard(null)} />
      )}


      {loggedIn && (<>
      <HomeScreen />

      <DeckScreen />

      <BattleScreen />

      <VaultScreen />

      <OpsScreen />

      <NavBar activeScreen={activeScreen} isAdminRole={isAdminRole} onNavigate={openScreen} />
      </>)}
    </main>
    </AppContext.Provider>
  )
}

export default App
