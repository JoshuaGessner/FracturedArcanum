import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { io, type Socket } from 'socket.io-client'
import { playSound } from './audio'
import {
  type GameMode,
  type BattleSide,
  type DeckConfig,
  type GameState,
  type Unit,
  MIN_DECK_SIZE,
  MAX_DECK_SIZE,
  MAX_COPIES,
  MAX_LEGENDARY_COPIES,
  RARITY_COLORS,
  CARD_LIBRARY,
  DEFAULT_DECK_CONFIG,
  otherSide,
  getDeckSize,
  boardHasGuard,
  playCard,
  attack,
  castMomentumBurst,
  createGame,
  generateEnemyTurnSteps,
} from './game'
import './App.css'

type QueueState = 'idle' | 'searching' | 'found'
type AppScreen = 'home' | 'deck' | 'battle' | 'vault' | 'ops'
type CosmeticTheme = 'royal' | 'ember' | 'moon'
type AuthScreen = 'login' | 'signup'

type OpponentProfile = {
  name: string
  rank: string
  style: string
  ping: number
}

type ComplaintFormState = {
  category: string
  severity: string
  summary: string
  details: string
}

type AdminComplaint = {
  id: string
  anonymousUser: string
  category: string
  severity: string
  summary: string
  details: string
  page: string
  status: string
  createdAt: string
  updates: Array<{ at: string; note: string }>
}

type AdminOverview = {
  settings: {
    motd: string
    quest: string
    featuredMode: string
    maintenanceMode: boolean
  }
  totals: {
    uniqueVisitors: number
    sessions: number
    pageViews: number
    queueJoins: number
    matchesStarted: number
    matchesCompleted: number
    installs: number
    emotes: number
    complaintsOpen: number
    complaintsResolved: number
    complaintsTotal: number
  }
  traffic: {
    pages: Array<{ route: string; views: number }>
    devices: Array<{ label: string; count: number }>
    daily: Array<{ day: string; views: number }>
  }
  complaints: AdminComplaint[]
}

type ServerProfile = {
  username: string
  runes: number
  seasonRating: number
  wins: number
  losses: number
  streak: number
  deckConfig: DeckConfig
  ownedThemes: CosmeticTheme[]
  selectedTheme: CosmeticTheme
  lastDaily: string
  totalEarned: number
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DEFAULT_ARENA_PORT = '43173'
const ARENA_URL =
  import.meta.env.VITE_ARENA_URL ??
  (['5173', '4173'].includes(window.location.port)
    ? `${window.location.protocol}//${window.location.hostname}:${DEFAULT_ARENA_PORT}`
    : window.location.origin)

const OPPONENT_POOL: OpponentProfile[] = [
  { name: 'Nyra Gale', rank: 'Silver I', style: 'Sky Tempo', ping: 28 },
  { name: 'Bront Ember', rank: 'Gold III', style: 'Blast Midrange', ping: 34 },
  { name: 'Suri Vale', rank: 'Gold I', style: 'Moonwell Value', ping: 19 },
  { name: 'Kael Thorn', rank: 'Platinum V', style: 'Guard Control', ping: 42 },
]

const DECK_PRESETS: Array<{ name: string; config: DeckConfig }> = [
  { name: 'Balanced', config: DEFAULT_DECK_CONFIG },
  {
    name: 'Aggro',
    config: {
      'spark-imp': 3,
      'cave-bat': 2,
      'blaze-runner': 2,
      'shade-fox': 2,
      'void-leech': 1,
      'sky-raider': 2,
      'fire-imp': 1,
    },
  },
  {
    name: 'Control',
    config: {
      'ironbark-guard': 2,
      'dawn-healer': 2,
      'rust-golem': 1,
      'granite-sentinel': 1,
      'crystal-golem': 1,
      'aegis-knight': 1,
      'moonwell-sage': 1,
      'siege-turtle': 1,
      'coral-guardian': 1,
      'moss-treant': 1,
    },
  },
  {
    name: 'Tempo',
    config: {
      'spark-imp': 2,
      'void-leech': 2,
      'warcry-sentinel': 2,
      'shade-fox': 2,
      'sky-raider': 2,
      'rune-scholar': 1,
      'ember-witch': 1,
      'pack-wolf': 1,
    },
  },
]

const THEME_OFFERS: Array<{ id: CosmeticTheme; name: string; cost: number; note: string }> = [
  { id: 'royal', name: 'Royal Arcane', cost: 0, note: 'Default tournament finish.' },
  { id: 'ember', name: 'Ember Court', cost: 120, note: 'Warm volcanic glow and ember trim.' },
  { id: 'moon', name: 'Moonwell Glow', cost: 180, note: 'Cool luminous highlights and moonlight framing.' },
]

const STORAGE_KEYS = {
  deck: 'fractured-arcanum.deck',
  sound: 'fractured-arcanum.sound',
  rating: 'fractured-arcanum.rating',
  record: 'fractured-arcanum.record',
  mode: 'fractured-arcanum.mode',
  visitor: 'fractured-arcanum.visitor',
  analyticsConsent: 'fractured-arcanum.analytics-consent',
  runes: 'fractured-arcanum.shards',
  ownedThemes: 'fractured-arcanum.owned-themes',
  selectedTheme: 'fractured-arcanum.selected-theme',
  lastDailyClaim: 'fractured-arcanum.last-daily-claim',
  authToken: 'fractured-arcanum.auth-token',
}

const QUICK_EMOTES = ['⚡', '🔥', '✨', '🛡️', '😈']

function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const rawValue = window.localStorage.getItem(key)
    return rawValue ? (JSON.parse(rawValue) as T) : fallback
  } catch {
    return fallback
  }
}

function createAnonymousId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `guest-${crypto.randomUUID().slice(0, 12)}`
  }

  return `guest-${Math.random().toString(36).slice(2, 14)}`
}

function getDeviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() ?? '',
  ]
  return parts.join('|')
}

async function authFetch(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {},
) {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const response = await fetch(`${ARENA_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  return response
}

function getScreenBucket() {
  if (typeof window === 'undefined') {
    return 'unknown'
  }

  if (window.innerWidth < 700) {
    return 'mobile'
  }

  if (window.innerWidth < 1100) {
    return 'tablet'
  }

  return 'desktop'
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function cardArtPath(cardId: string) {
  return `/generated/cards/${cardId}.svg`
}

const EFFECT_LABELS: Record<string, string> = {
  charge: '⚡ Charge',
  guard: '🛡️ Guard',
  rally: '📣 Rally',
  blast: '💥 Blast',
  heal: '💚 Heal',
  draw: '📜 Draw',
  fury: '🔥 Fury',
  drain: '🩸 Drain',
  empower: '📯 Empower',
  poison: '☠️ Poison',
  shield: '⚜️ Shield',
  siphon: '💀 Siphon',
  bolster: '🌊 Bolster',
  cleave: '⚔️ Cleave',
  lifesteal: '🧛 Lifesteal',
  summon: '✨ Summon',
  silence: '🔇 Silence',
  frostbite: '❄️ Frostbite',
  enrage: '😡 Enrage',
  deathrattle: '💀 Deathrattle',
  overwhelm: '🦣 Overwhelm',
}

function pulseFeedback(duration = 14) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(duration)
  }
}

function makeLobbyCode(): string {
  return `RUNE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function getRankLabel(rating: number): string {
  if (rating >= 1500) {
    return 'Diamond'
  }

  if (rating >= 1300) {
    return 'Gold'
  }

  if (rating >= 1150) {
    return 'Silver'
  }

  return 'Bronze'
}

function pickOpponent(): OpponentProfile {
  return OPPONENT_POOL[Math.floor(Math.random() * OPPONENT_POOL.length)]
}

function App() {
  const savedDeckConfig = readStoredValue<DeckConfig>(STORAGE_KEYS.deck, DEFAULT_DECK_CONFIG)
  const savedMode = readStoredValue<GameMode>(STORAGE_KEYS.mode, 'ai')

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
  const [setupAdminKey, setSetupAdminKey] = useState('')

  // ─── Server-authoritative player state ────────────────────────────────
  const [serverProfile, setServerProfile] = useState<ServerProfile | null>(null)
  const runes = serverProfile?.runes ?? 0
  const seasonRating = serverProfile?.seasonRating ?? 1200
  const record = { wins: serverProfile?.wins ?? 0, losses: serverProfile?.losses ?? 0, streak: serverProfile?.streak ?? 0 }
  const ownedThemes = serverProfile?.ownedThemes ?? ['royal'] as CosmeticTheme[]
  const selectedTheme = (serverProfile?.selectedTheme ?? 'royal') as CosmeticTheme
  const lastDailyClaim = serverProfile?.lastDaily ?? ''

  // ─── Local game/UI state ──────────────────────────────────────────────
  const [deckConfig, setDeckConfig] = useState<DeckConfig>(savedDeckConfig)
  const [activeScreen, setActiveScreen] = useState<AppScreen>('home')
  const [preferredMode, setPreferredMode] = useState<GameMode>(savedMode)
  const [lobbyCode, setLobbyCode] = useState(() => makeLobbyCode())
  const [game, setGame] = useState<GameState>(() => createGame(savedMode, savedDeckConfig))
  const [selectedAttacker, setSelectedAttacker] = useState<number | null>(null)
  const [queueState, setQueueState] = useState<QueueState>('idle')
  const [queueSeconds, setQueueSeconds] = useState(0)
  const [queuedOpponent, setQueuedOpponent] = useState<OpponentProfile | null>(null)
  const [resolvedMatchKey, setResolvedMatchKey] = useState('')
  const [socketClient, setSocketClient] = useState<Socket | null>(null)
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
  const [toastMessage, setToastMessage] = useState('Ready your deck and enter the arena.')
  const [complaintForm, setComplaintForm] = useState<ComplaintFormState>({
    category: 'gameplay',
    severity: 'normal',
    summary: '',
    details: '',
  })
  const [complaintStatus, setComplaintStatus] = useState('No issue reports submitted in this session.')
  const [adminKey, setAdminKey] = useState('')
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [battleIntroVisible, setBattleIntroVisible] = useState(false)
  const [rewardOverlayVisible, setRewardOverlayVisible] = useState(false)
  const [damagedSlots, setDamagedSlots] = useState<Set<string>>(new Set())
  const battleStartedRef = useRef(false)
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
        ok: boolean; error?: string; adminKey?: string;
        token?: string; profile?: ServerProfile
      }

      if (!data.ok) {
        setSetupError(data.error ?? 'Setup failed.')
        setSetupLoading(false)
        return
      }

      setSetupAdminKey(data.adminKey ?? '')
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
    setAuthToken('')
    setServerProfile(null)
    setLoggedIn(false)
    setToastMessage('Logged out.')
  }

  useEffect(() => {
    if (!authToken) {
      setSocketClient(null)
      setBackendOnline(false)
      return
    }

    const socket = io(ARENA_URL, {
      autoConnect: true,
      auth: { token: authToken },
    })
    setSocketClient(socket)

    socket.on('connect', () => {
      setBackendOnline(true)
    })

    socket.on('disconnect', () => {
      setBackendOnline(false)
    })

    socket.on('connect_error', () => {
      setBackendOnline(false)
    })

    socket.on('server:hello', (payload: { message: string }) => {
      setMotd(payload.message)
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
      setActiveScreen('battle')
      setQueueState('idle')
      setQueueSeconds(0)
      setQueuedOpponent(null)
      playSound('summon', soundEnabled)
    })

    socket.on('game:state', (payload: { state: GameState }) => {
      setGame(payload.state)
    })

    socket.on('game:over', (payload: { result: string }) => {
      if (payload.result === 'win') {
        setToastMessage('Victory! You won the match.')
      } else if (payload.result === 'loss') {
        setToastMessage('Defeat. Better luck next time.')
      } else {
        setToastMessage('The match ended in a draw.')
      }
    })

    socket.on('game:error', (payload: { error: string }) => {
      setToastMessage(payload.error)
    })

    socket.on('room:emote', (payload: { emote: string; from: string }) => {
      setToastMessage(`${payload.from} reacts ${payload.emote}`)
      setGame((current) => ({
        ...current,
        log: [`${payload.from} reacts ${payload.emote}`, ...current.log].slice(0, 10),
      }))
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
      socket.disconnect()
    }
  }, [authToken]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (queueState !== 'searching') {
      return undefined
    }

    const tick = window.setInterval(() => {
      setQueueSeconds((seconds) => seconds + 1)
    }, 1000)

    let resolve: number | undefined

    if (!backendOnline) {
      resolve = window.setTimeout(() => {
        setQueuedOpponent(pickOpponent())
        setQueueState('found')
      }, 2600)
    }

    return () => {
      window.clearInterval(tick)
      if (resolve) {
        window.clearTimeout(resolve)
      }
    }
  }, [queueState, backendOnline])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(STORAGE_KEYS.deck, JSON.stringify(deckConfig))
    window.localStorage.setItem(STORAGE_KEYS.sound, JSON.stringify(soundEnabled))
    window.localStorage.setItem(STORAGE_KEYS.mode, JSON.stringify(preferredMode))
    window.localStorage.setItem(STORAGE_KEYS.visitor, JSON.stringify(visitorId))
    window.localStorage.setItem(STORAGE_KEYS.analyticsConsent, JSON.stringify(analyticsConsent))
    window.localStorage.setItem(STORAGE_KEYS.authToken, JSON.stringify(authToken))
  }, [
    deckConfig,
    soundEnabled,
    preferredMode,
    visitorId,
    analyticsConsent,
    authToken,
  ])

  // Sync deck config to server when changed (debounced)
  useEffect(() => {
    if (!authToken || !loggedIn) return
    const timer = window.setTimeout(() => {
      void authFetch('/api/me/deck', authToken, { method: 'POST', body: { deckConfig } }).catch(() => {})
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [deckConfig, authToken, loggedIn])

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
  }, [])

  useEffect(() => {
    if (queueState === 'found') {
      playSound('match', soundEnabled)
      pulseFeedback(20)
    }
  }, [queueState, soundEnabled])

  useEffect(() => {
    if (activeScreen !== 'battle') {
      setBattleIntroVisible(false)
      battleStartedRef.current = false
      return
    }

    if (battleStartedRef.current) return
    battleStartedRef.current = true

    setBattleIntroVisible(true)
    const timer = window.setTimeout(() => {
      setBattleIntroVisible(false)
    }, 1600)

    return () => {
      window.clearTimeout(timer)
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
      setDamagedSlots(damaged)
      const t = window.setTimeout(() => setDamagedSlots(new Set()), 400)
      return () => window.clearTimeout(t)
    }
  }, [game.player.board, game.enemy.board])

  useEffect(() => {
    if (enemyTurnActive) return
    if (game.winner === 'player') {
      playSound('win', soundEnabled)
      setRewardOverlayVisible(true)
    } else if (game.winner === 'enemy') {
      playSound('lose', soundEnabled)
      setRewardOverlayVisible(false)
    } else if (!game.winner) {
      setRewardOverlayVisible(false)
    }
  }, [game.winner, soundEnabled, enemyTurnActive])

  useEffect(() => {
    if (!game.winner) {
      return
    }

    const matchKey = `${game.enemy.name}-${game.turnNumber}-${game.winner}`
    if (matchKey === resolvedMatchKey) {
      return
    }

    setResolvedMatchKey(matchKey)
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
  }, [game, resolvedMatchKey, sendAnalytics, authToken])

  const activeSide = game.turn
  const defendingSide = otherSide(activeSide)
  const activePlayer = game[activeSide]
  const defendingPlayer = game[defendingSide]
  const isMyTurn = game.turn === 'player' && !enemyTurnActive
  const activeBoardHasOpenLane = activePlayer.board.some((slot) => slot === null)
  const selectedDeckSize = getDeckSize(deckConfig)
  const deckReady = selectedDeckSize >= MIN_DECK_SIZE
  const defenderHasGuard = boardHasGuard(defendingPlayer.board)
  const rankLabel = getRankLabel(seasonRating)
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
    if (screen !== 'battle' && enemyTurnActive) {
      clearEnemyTurnTimers()
      setEnemyTurnActive(false)
      setEnemyTurnLabel('')
    }
    setActiveScreen(screen)
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

  async function refreshAdminOverview(key = adminKey) {
    if (!key.trim()) {
      setAdminError('Enter the admin key to open the operations console.')
      return
    }

    setAdminLoading(true)

    try {
      const response = await fetch(`${ARENA_URL}/api/admin/overview`, {
        headers: {
          'x-admin-key': key.trim(),
        },
      })

      if (!response.ok) {
        throw new Error('Admin access denied')
      }

      const data = (await response.json()) as AdminOverview
      setAdminOverview(data)
      setAdminSettings(data.settings)
      setAdminError('')
    } catch {
      setAdminOverview(null)
      setAdminError('Admin access failed. Check the key and try again.')
    } finally {
      setAdminLoading(false)
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
    if (!adminKey.trim()) {
      setAdminError('Enter the admin key before saving live settings.')
      return
    }

    try {
      const response = await fetch(`${ARENA_URL}/api/admin/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey.trim(),
        },
        body: JSON.stringify(adminSettings),
      })

      if (!response.ok) {
        throw new Error('Save failed')
      }

      setMotd(adminSettings.motd)
      setDailyQuest(adminSettings.quest)
      setFeaturedMode(adminSettings.featuredMode)
      setMaintenanceMode(adminSettings.maintenanceMode)
      setToastMessage('Admin live settings updated.')
      await refreshAdminOverview(adminKey)
    } catch {
      setAdminError('The live settings could not be saved.')
    }
  }

  async function handleUpdateComplaintStatus(id: string, status: string) {
    if (!adminKey.trim()) {
      setAdminError('Enter the admin key before updating tickets.')
      return
    }

    try {
      const response = await fetch(`${ARENA_URL}/api/admin/complaints/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey.trim(),
        },
        body: JSON.stringify({
          status,
          note:
            status === 'resolved'
              ? 'Marked resolved from the in-app admin console.'
              : 'Marked investigating from the in-app admin console.',
        }),
      })

      if (!response.ok) {
        throw new Error('Update failed')
      }

      setToastMessage(`Complaint ${id} updated to ${status}.`)
      await refreshAdminOverview(adminKey)
    } catch {
      setAdminError('The complaint status could not be updated.')
    }
  }

  function startMatch(mode: GameMode = preferredMode, enemyName?: string) {
    if (!deckReady) {
      setToastMessage('Finish building your deck before entering the arena.')
      setActiveScreen('deck')
      return
    }

    setPreferredMode(mode)
    setSelectedAttacker(null)
    setResolvedMatchKey('')
    clearEnemyTurnTimers()
    setEnemyTurnActive(false)
    setEnemyTurnLabel('')
    prevBoardRef.current = null
    setDamagedSlots(new Set())
    setActiveScreen('battle')
    setGame(createGame(mode, deckConfig, enemyName))
    void sendAnalytics(
      'match_start',
      {
        mode,
        opponent: enemyName ?? 'Arena Bot',
        screen: getScreenBucket(),
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
    setToastMessage(mode === 'ai' ? 'AI skirmish ready. Tap Enter Arena to begin.' : 'Online duel ready. Tap Enter Arena to queue.')
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

  function handleSendEmote(emote: string) {
    playSound('tap', soundEnabled)
    pulseFeedback(10)
    setToastMessage(`You react ${emote}`)
    setGame((current) => ({
      ...current,
      log: [`${activePlayer.name} reacts ${emote}`, ...current.log].slice(0, 10),
    }))
    void sendAnalytics('emote', { emote }, 'social')

    if (backendOnline && socketClient?.connected) {
      socketClient.emit('room:emote', {
        roomId: lobbyCode,
        emote,
        from: activePlayer.name,
      })
    }
  }

  function handleStartQueue() {
    if (!deckReady) {
      setToastMessage('Finish your deck first so matchmaking can start.')
      setActiveScreen('deck')
      return
    }

    const isDuel = preferredMode === 'duel' && backendOnline && socketClient?.connected
    if (!isDuel) {
      setPreferredMode('ai')
    }
    setActiveScreen('battle')
    setQueueState('searching')
    setQueueSeconds(0)
    setQueuedOpponent(null)
    void sendAnalytics(
      'queue_join',
      {
        rank: rankLabel,
        deckSize: selectedDeckSize,
        screen: getScreenBucket(),
      },
      'queue',
    )

    if (backendOnline && socketClient?.connected) {
      socketClient.emit('queue:join', {
        name: 'Rune Captain',
        rank: `${rankLabel} Division`,
        deckConfig,
      })
    }
  }

  function handleCancelQueue() {
    if (backendOnline && socketClient?.connected) {
      socketClient.emit('queue:leave')
    }

    setQueueState('idle')
    setQueueSeconds(0)
    setQueuedOpponent(null)
  }

  function handleAcceptQueue() {
    if (!queuedOpponent) {
      return
    }

    const opponentName = queuedOpponent.name
    setQueueState('idle')
    setQueueSeconds(0)
    setQueuedOpponent(null)
    startMatch('ai', opponentName)
  }

  function handleDeckCount(cardId: string, delta: number) {
    setDeckConfig((current) => {
      const total = getDeckSize(current)
      const card = CARD_LIBRARY.find((c) => c.id === cardId)
      const maxCopies = card?.rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES
      const nextCount = Math.max(0, Math.min(maxCopies, (current[cardId] ?? 0) + delta))

      if (delta > 0 && total >= MAX_DECK_SIZE) {
        return current
      }

      return {
        ...current,
        [cardId]: nextCount,
      }
    })
  }

  function handleLoadPreset(name: string, config: DeckConfig) {
    playSound('tap', soundEnabled)
    setToastMessage(`${name} preset loaded.`)
    setDeckConfig(config)
  }

  function emitAction(action: Record<string, unknown>) {
    if (game.mode === 'duel' && socketClient?.connected) {
      socketClient.emit('game:action', { action })
    }
  }

  function handlePlayCard(index: number) {
    if (game.winner || !isMyTurn) {
      return
    }

    playSound('summon', soundEnabled)
    pulseFeedback(12)

    if (game.mode === 'duel') {
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

    if (game.mode === 'duel') {
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

    if (game.mode === 'duel') {
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

    if (game.mode === 'duel') {
      emitAction({ type: 'endTurn' })
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

  return (
    <main className={`app-shell theme-${selectedTheme}`}>
      {/* ─── First-launch setup ─────────────────────────────────────── */}
      {setupRequired && (
        <div className="auth-gate">
          <div className="auth-card">
            <img className="brand-logo" src="/fractured-arcanum-logo.svg" alt="Fractured Arcanum" />
            <h1>Server Setup</h1>
            <p className="auth-tagline">Create your admin account to get started</p>
            {setupAdminKey ? (
              <div className="setup-complete-block">
                <p className="auth-tagline">Setup complete! Save your admin key:</p>
                <code className="admin-key-display">{setupAdminKey}</code>
                <p className="note">Use this key in the Operations console. Store it securely — it won't be shown again.</p>
                <button className="primary" onClick={() => setSetupRequired(false)}>
                  Enter Arena
                </button>
              </div>
            ) : (
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
            )}
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
          </div>
        </div>
      )}

      {loggedIn && activeScreen !== 'battle' && (
        <header className="topbar topbar-art">
          <div className="brand-block">
            <img className="brand-logo" src="/fractured-arcanum-logo.svg" alt="Fractured Arcanum" />
            <div>
              <p className="eyebrow">{screenTitle}</p>
              <h1>Fractured Arcanum</h1>
            </div>
          </div>

          <div className="top-actions">
            <span className="username-label">{serverProfile?.username ?? ''}</span>
            <button
              className="ghost"
              onClick={() => {
                playSound('tap', !soundEnabled)
                setSoundEnabled((value) => !value)
              }}
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
            {installPromptEvent && (
              <button className="ghost" onClick={() => void handleInstallApp()}>
                Install
              </button>
            )}
            <button className="ghost" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>
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

      {battleIntroVisible && !game.winner && (
        <section className="queue-overlay intro-overlay" aria-live="polite">
          <div className="queue-modal intro-modal section-card">
            <p className="eyebrow">Fractured Arcanum Battle Intro</p>
            <h2>{game.player.name} vs {game.enemy.name}</h2>
            <p className="note">{game.mode === 'ai' ? 'The arena gates open.' : 'Pass the device and prepare for the duel.'}</p>
          </div>
        </section>
      )}

      {rewardOverlayVisible && game.winner === 'player' && (
        <section className="queue-overlay reward-overlay" aria-live="polite">
          <div className="queue-modal reward-modal section-card">
            <img className="reward-art" src="/generated/ui/reward-chest.svg" alt="Reward chest" />
            <p className="eyebrow">Victory Rewards</p>
            <h2>Season Chest Unlocked</h2>
            <div className="badges">
              <span className="badge">+25 Rating</span>
              <span className="badge">+30 Shards</span>
              <span className="badge">Win Streak {record.streak}</span>
              <span className="badge">League {rankLabel}</span>
            </div>
            <p className="note">Your crew celebrates another climb up the ranked ladder.</p>
            <div className="controls">
              <button className="primary" onClick={() => setRewardOverlayVisible(false)}>
                Claim Rewards
              </button>
              <button className="ghost" onClick={() => startMatch(game.mode)}>
                Queue Again
              </button>
            </div>
          </div>
        </section>
      )}


      {loggedIn && (<>
      <section className={`home-screen screen-panel ${activeScreen === 'home' ? 'active' : 'hidden'}`}>
        <article className="section-card utility-card spotlight-card">
          <img
            className="spotlight-banner"
            src="/generated/ui/asset-forge-banner.svg"
            alt="Fractured Arcanum spotlight banner"
          />

          <div className="mode-switch">
            <button
              className={preferredMode === 'ai' ? 'primary' : 'ghost'}
              onClick={() => handleModeChange('ai')}
            >
              AI Skirmish
            </button>
            <button
              className={preferredMode === 'duel' ? 'primary' : 'ghost'}
              onClick={() => handleModeChange('duel')}
            >
              Local Duel
            </button>
          </div>

          <div className="controls">
            <button className="primary" onClick={() => startMatch()} disabled={!deckReady}>
              Enter Arena
            </button>
            <button className="secondary" onClick={handleStartQueue} disabled={!deckReady || queueState !== 'idle'}>
              Find Ranked Match
            </button>
            <button className="ghost" onClick={() => openScreen('deck')}>
              Deck Forge
            </button>
          </div>

          {queueState === 'searching' && (
            <p className="card-text">Searching for an opponent... {queueSeconds}s</p>
          )}

          {queueState === 'found' && queuedOpponent && (
            <div className="opponent-preview">
              <strong>{queuedOpponent.name}</strong>
              <span className="note">
                {queuedOpponent.rank} • {queuedOpponent.style} • {queuedOpponent.ping}ms
              </span>
              <div className="controls">
                <button className="primary" onClick={handleAcceptQueue}>Accept Match</button>
                <button className="ghost" onClick={handleCancelQueue}>Decline</button>
              </div>
            </div>
          )}

          <p className="note toast-line">{toastMessage}</p>
        </article>

        <div className="home-cards">
          <article className="section-card utility-card">
            <div className="section-head">
              <h2>Quests</h2>
              <span className="deck-status ready">Live</span>
            </div>
            <ul className="quest-list">
              <li>{record.wins >= 1 ? '✅' : '⬜'} {dailyQuest}</li>
              <li>{winRate >= 50 ? '✅' : '⬜'} 50% win rate</li>
              <li>{selectedDeckSize >= 14 ? '✅' : '⬜'} Full deck</li>
            </ul>
          </article>

          <article className="section-card utility-card">
            <div className="section-head">
              <h2>Profile</h2>
              <span className="badge">{serverProfile?.username ?? 'Guest'}</span>
            </div>
            <div className="badges">
              <span className="badge">{rankLabel}</span>
              <span className="badge">{totalGames} games</span>
              <span className="badge">{winRate}% WR</span>
              <span className="badge">{runes} 💎</span>
            </div>
          </article>
        </div>

        <div className="controls emote-row">
          {QUICK_EMOTES.map((emote) => (
            <button className="ghost emote-chip" key={emote} onClick={() => handleSendEmote(emote)}>
              {emote}
            </button>
          ))}
        </div>
      </section>

      <section className={`meta-grid deck-focus screen-panel ${activeScreen === 'deck' ? 'active' : 'hidden'}`}>
        <article className="section-card">
          <div className="section-head">
            <div>
              <h2>Deck Builder</h2>
              <p className="note">Choose 10–16 cards, with up to 3 copies of each.</p>
            </div>
            <span className={`deck-status ${deckReady ? 'ready' : 'warning'}`}>
              {deckReady ? 'Deck ready' : 'Add more cards'}
            </span>
          </div>

          <div className="controls preset-row">
            {DECK_PRESETS.map((preset) => (
              <button
                className="ghost"
                key={preset.name}
                onClick={() => handleLoadPreset(preset.name, preset.config)}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div className="builder-grid">
            {CARD_LIBRARY.map((card) => {
              const maxCopies = card.rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES
              const count = deckConfig[card.id] ?? 0
              return (
              <div className={`builder-card rarity-${card.rarity}`} key={card.id} style={{ '--rarity-color': RARITY_COLORS[card.rarity] } as React.CSSProperties}>
                <div>
                  <div className="card-art-shell">
                    <img
                      className="card-illustration"
                      src={cardArtPath(card.id)}
                      alt={`${card.name} illustration`}
                      loading="lazy"
                    />
                  </div>
                  <div className="slot-head">
                    <strong>
                      {card.icon} {card.name}
                    </strong>
                    <span className="stats">{card.cost}</span>
                  </div>
                  <div className="card-meta-row">
                    <span className="rarity-gem" style={{ color: RARITY_COLORS[card.rarity] }}>{card.rarity === 'legendary' ? '★' : card.rarity === 'epic' ? '◆' : card.rarity === 'rare' ? '◈' : '●'} {card.rarity}</span>
                    <span className="tribe-badge">{card.tribe}</span>
                  </div>
                  <p className="card-text">{card.text}</p>
                </div>

                <div className="stepper">
                  <button className="ghost mini" onClick={() => handleDeckCount(card.id, -1)}>
                    −
                  </button>
                  <span className="count-chip">{count}</span>
                  <button className="ghost mini" onClick={() => handleDeckCount(card.id, 1)} disabled={count >= maxCopies}>
                    +
                  </button>
                </div>
              </div>
              )
            })}
          </div>

          <div className="controls">
            <button className="primary" onClick={() => startMatch()} disabled={!deckReady}>
              Play With This Deck
            </button>
            <button className="secondary" onClick={handleStartQueue} disabled={!deckReady || queueState !== 'idle'}>
              Queue Ranked
            </button>
            <button className="ghost" onClick={() => openScreen('home')}>
              Back to Home
            </button>
          </div>
        </article>
      </section>

      {enemyTurnActive && (
        <div className={`enemy-turn-banner screen-panel ${activeScreen === 'battle' ? 'active' : 'hidden'}`}>
          <span className="enemy-turn-label">{enemyTurnLabel}</span>
        </div>
      )}

      <section className={`battle-topbar section-card screen-panel ${activeScreen === 'battle' ? 'active' : 'hidden'}`}>
        <div className="battle-heroes-compact">
          <div className="hero-compact enemy">
            <strong>{game.enemy.name}</strong>
            <span className="hero-health">❤️ {game.enemy.health}</span>
          </div>
          <div className="battle-turn-label">
            <span className="eyebrow">Turn {game.turnNumber}</span>
          </div>
          <div className="hero-compact player">
            <strong>{game.player.name}</strong>
            <span className="hero-health">❤️ {game.player.health}</span>
          </div>
        </div>

        <div className="battle-resource-row">
          <div className="pip-row">
            {Array.from({ length: Math.max(activePlayer.maxMana, 1) }).map((_, index) => (
              <span
                key={`mana-${index}`}
                className={index < activePlayer.mana ? 'pip filled' : 'pip'}
              />
            ))}
            <span className="hero-label">Mana</span>
          </div>
          <div className="pip-row">
            {Array.from({ length: 10 }).map((_, index) => (
              <span
                key={`momentum-${index}`}
                className={index < activePlayer.momentum ? 'pip momentum filled' : 'pip momentum'}
              />
            ))}
            <span className="hero-label">Momentum</span>
          </div>
        </div>

        <div className="controls">
          <button
            className="primary"
            onClick={handleBurst}
            disabled={activePlayer.momentum < 3 || Boolean(game.winner) || !isMyTurn}
          >
            Burst
          </button>
          <button className="secondary" onClick={handleEndTurn} disabled={Boolean(game.winner) || !isMyTurn}>
            {!isMyTurn ? 'Opponent Turn…' : 'End Turn'}
          </button>
          <button className="ghost" onClick={() => openScreen('home')}>
            Leave
          </button>
        </div>
      </section>

      <section className={`battlefield screen-panel ${activeScreen === 'battle' ? 'active' : 'hidden'}`}>
        <article className="section-card">
          <div className="section-head">
            <h2>{game.enemy.name} Frontline</h2>
            <button
              className="ghost"
              onClick={() => handleAttackTarget('hero')}
              disabled={selectedAttacker === null || defenderHasGuard || Boolean(game.winner)}
            >
              Strike Hero
            </button>
          </div>

          <div className="board-grid">
            {game.enemy.board.map((unit, index) => {
              if (!unit) {
                return (
                  <div className="slot empty" key={`enemy-empty-${index}`}>
                    Empty lane
                  </div>
                )
              }

              const isSelectable = false
              const isSelected = false

              return (
                <button
                  className={[
                    'slot',
                    `rarity-${unit.rarity}`,
                    unit.effect === 'guard' ? 'guard' : '',
                    unit.exhausted ? 'exhausted' : '',
                    isSelected ? 'selected' : '',
                    damagedSlots.has(unit.uid) ? 'damage-flash' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={unit.uid}
                  style={{ '--rarity-color': RARITY_COLORS[unit.rarity] } as React.CSSProperties}
                  onClick={() => (isSelectable ? handleSelectAttacker(index) : handleAttackTarget(index))}
                  disabled={Boolean(game.winner) || (isSelectable ? unit.exhausted : selectedAttacker === null)}
                >
                  <div className="slot-head">
                    <strong>
                      {unit.icon} {unit.name}
                    </strong>
                    <span className="stats">
                      {unit.attack}/{unit.currentHealth}
                    </span>
                  </div>
                  {unit.effect && <span className="effect-badge small">{EFFECT_LABELS[unit.effect] ?? unit.effect}</span>}
                  <img
                    className="unit-portrait"
                    src={cardArtPath(unit.id)}
                    alt={`${unit.name} artwork`}
                    loading="lazy"
                  />
                  <span className="note">{isSelectable ? 'Tap to attack' : 'Target this lane'}</span>
                  <span className="mini-text">{unit.text}</span>
                </button>
              )
            })}
          </div>
        </article>

        <article className="section-card">
          <div className="section-head">
            <h2>{game.player.name} Frontline</h2>
            <p className="note">Ready units can attack once each turn.</p>
          </div>

          <div className="board-grid">
            {game.player.board.map((unit, index) => {
              if (!unit) {
                return (
                  <div className="slot empty" key={`player-empty-${index}`}>
                    Open lane
                  </div>
                )
              }

              const isSelectable = game.turn === 'player'
              const isSelected = isSelectable && selectedAttacker === index

              return (
                <button
                  className={[
                    'slot',
                    `rarity-${unit.rarity}`,
                    unit.effect === 'guard' ? 'guard' : '',
                    unit.exhausted ? 'exhausted' : '',
                    isSelected ? 'selected' : '',
                    damagedSlots.has(unit.uid) ? 'damage-flash' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={unit.uid}
                  style={{ '--rarity-color': RARITY_COLORS[unit.rarity] } as React.CSSProperties}
                  onClick={() => (isSelectable ? handleSelectAttacker(index) : handleAttackTarget(index))}
                  disabled={Boolean(game.winner) || (isSelectable ? unit.exhausted : selectedAttacker === null)}
                >
                  <div className="slot-head">
                    <strong>
                      {unit.icon} {unit.name}
                    </strong>
                    <span className="stats">
                      {unit.attack}/{unit.currentHealth}
                    </span>
                  </div>
                  {unit.effect && <span className="effect-badge small">{EFFECT_LABELS[unit.effect] ?? unit.effect}</span>}
                  <img
                    className="unit-portrait"
                    src={cardArtPath(unit.id)}
                    alt={`${unit.name} artwork`}
                    loading="lazy"
                  />
                  <span className="note">{isSelectable ? 'Tap to attack' : 'Target this lane'}</span>
                  <span className="mini-text">{unit.text}</span>
                </button>
              )
            })}
          </div>
        </article>
      </section>

      {game.winner && (
        <section className={`summary-card section-card screen-panel ${activeScreen === 'battle' ? 'active' : 'hidden'}`}>
          <div className="section-head">
            <div>
              <h2>{game.winner === 'player' ? 'Victory Screen' : game.winner === 'enemy' ? 'Defeat Screen' : 'Draw Screen'}</h2>
              <p className="note">
                {game.winner === 'player'
                  ? 'Rewards tallied and the crowd is roaring for a rematch.'
                  : game.winner === 'enemy'
                    ? 'Review your deck, regroup, and jump straight back into the arena.'
                    : 'A close match. Adjust your list and queue again.'}
              </p>
            </div>
            <span className={`deck-status ${game.winner === 'player' ? 'ready' : 'warning'}`}>
              {game.winner === 'player' ? '+25 Rating' : game.winner === 'enemy' ? '-15 Rating' : 'Even Match'}
            </span>
          </div>

          <div className="summary-grid">
            <div className="badges">
              <span className="badge">Rank {rankLabel}</span>
              <span className="badge">Rating {seasonRating}</span>
              <span className="badge">Win Rate {winRate}%</span>
            </div>
            <div className="controls">
              <button className="primary" onClick={() => startMatch(game.mode)}>
                Play Again
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setPreferredMode('ai')
                  openScreen('home')
                }}
              >
                Back to Lobby
              </button>
            </div>
          </div>
        </section>
      )}

      <section className={`vault-grid screen-panel ${activeScreen === 'vault' ? 'active' : 'hidden'}`}>
        <article className="section-card utility-card">
          <div className="section-head">
            <div>
              <h2>Reward Vault</h2>
              <p className="note">Claim simple daily rewards and stockpile Shards for cosmetics.</p>
            </div>
            <span className="deck-status ready">Balance {runes}</span>
          </div>

          <img className="reward-art vault-hero" src="/generated/ui/reward-chest.svg" alt="Vault reward chest" />

          <div className="badges">
            <span className="badge">Next Reward {nextRewardLabel}</span>
            <span className="badge">Claim {canClaimDailyReward ? 'Ready' : 'Tomorrow'}</span>
          </div>

          <div className="controls">
            <button className="primary" onClick={handleClaimDailyReward} disabled={!canClaimDailyReward}>
              Claim Daily +50
            </button>
            <button className="ghost" onClick={() => startMatch('ai')}>
              Earn More in Battle
            </button>
          </div>
        </article>

        <article className="section-card utility-card">
          <div className="section-head">
            <div>
              <h2>Cosmetic Themes</h2>
              <p className="note">Unlock or equip visual themes for the app shell and profile framing.</p>
            </div>
            <span className="badge">Cosmetics Only</span>
          </div>

          <div className="theme-grid">
            {THEME_OFFERS.map((theme) => {
              const owned = ownedThemes.includes(theme.id)
              const equipped = selectedTheme === theme.id

              return (
                <div className="theme-offer-card" key={theme.id}>
                  <div className={`theme-swatch ${theme.id}`}></div>
                  <strong>{theme.name}</strong>
                  <p className="mini-text">{theme.note}</p>
                  <div className="badges">
                    <span className="badge">{owned ? 'Owned' : `${theme.cost} Shards`}</span>
                    {equipped && <span className="badge">Equipped</span>}
                  </div>
                  <button className={owned ? 'secondary' : 'primary'} onClick={() => handleEquipTheme(theme.id, theme.cost)}>
                    {equipped ? 'Equipped' : owned ? 'Equip Theme' : 'Unlock Theme'}
                  </button>
                </div>
              )
            })}
          </div>
        </article>

        <article className="section-card utility-card">
          <div className="section-head">
            <div>
              <h2>Simple Monetization Plan</h2>
              <p className="note">This preview keeps the game fair and monetizes only convenience-free cosmetics.</p>
            </div>
            <span className="badge">Plan Ready</span>
          </div>

          <ul className="shop-plan-list">
            <li><strong>Starter Bundle</strong> — small cosmetic pack plus bonus Shards.</li>
            <li><strong>Season Pass</strong> — extra cosmetic track, never gameplay power.</li>
            <li><strong>Board and Theme Skins</strong> — premium visuals for collectors.</li>
            <li><strong>No pay-to-win</strong> — card strength and match fairness stay equal.</li>
          </ul>
        </article>
      </section>

      <section className={`ops-grid screen-panel ${activeScreen === 'ops' ? 'active' : 'hidden'}`}>
        <article className="section-card utility-card">
          <div className="section-head">
            <div>
              <h2>Privacy and Traffic</h2>
              <p className="note">
                Anonymous-only analytics help the team monitor traffic, stability, and queue flow.
              </p>
            </div>
            <span className={`deck-status ${analyticsConsent ? 'ready' : 'warning'}`}>
              {analyticsConsent ? 'Anonymous analytics on' : 'Analytics paused'}
            </span>
          </div>

          <div className="badges">
            <span className="badge">{serverProfile?.username ?? 'Guest'} ({visitorId.slice(-6).toUpperCase()})</span>
            <span className="badge">Featured {featuredMode}</span>
            <span className="badge">{backendOnline ? 'Server Online' : 'Fallback Mode'}</span>
          </div>

          <p className="note">
            Stored data is limited to a random guest id, aggregate traffic counters, match events,
            and any complaint tickets you explicitly submit.
          </p>

          <div className="asset-preview-row">
            {CARD_LIBRARY.slice(0, 4).map((card) => (
              <img
                key={card.id}
                className="asset-preview-thumb"
                src={cardArtPath(card.id)}
                alt={`${card.name} artwork`}
                loading="lazy"
              />
            ))}
          </div>

          <div className="controls">
            <button
              className={analyticsConsent ? 'secondary' : 'primary'}
              onClick={() => {
                const nextValue = !analyticsConsent
                setAnalyticsConsent(nextValue)
                setToastMessage(
                  nextValue
                    ? 'Anonymous traffic tracking enabled for quality monitoring.'
                    : 'Anonymous traffic tracking paused on this device.',
                )
              }}
            >
              {analyticsConsent ? 'Pause Anonymous Analytics' : 'Enable Anonymous Analytics'}
            </button>
          </div>

          <p className="note toast-line">{complaintStatus}</p>
        </article>

        <article className="section-card utility-card">
          <div className="section-head">
            <div>
              <h2>Player Complaint Desk</h2>
              <p className="note">Submit gameplay bugs, fairness issues, or live service complaints.</p>
            </div>
            <span className="badge">Support</span>
          </div>

          <form className="complaint-form" onSubmit={(event) => void handleSubmitComplaint(event)}>
            <div className="form-row split-fields">
              <label className="form-field">
                <span>Category</span>
                <select
                  className="text-input"
                  value={complaintForm.category}
                  onChange={(event) =>
                    setComplaintForm((current) => ({ ...current, category: event.target.value }))
                  }
                >
                  <option value="gameplay">Gameplay</option>
                  <option value="matchmaking">Matchmaking</option>
                  <option value="balance">Balance</option>
                  <option value="performance">Performance</option>
                  <option value="moderation">Moderation</option>
                </select>
              </label>

              <label className="form-field">
                <span>Priority</span>
                <select
                  className="text-input"
                  value={complaintForm.severity}
                  onChange={(event) =>
                    setComplaintForm((current) => ({ ...current, severity: event.target.value }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
            </div>

            <label className="form-field">
              <span>Summary</span>
              <input
                className="text-input"
                value={complaintForm.summary}
                maxLength={120}
                placeholder="Short description of the issue"
                onChange={(event) =>
                  setComplaintForm((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </label>

            <label className="form-field">
              <span>Details</span>
              <textarea
                className="text-input text-area"
                value={complaintForm.details}
                rows={4}
                placeholder="What happened, and how can it be reproduced?"
                onChange={(event) =>
                  setComplaintForm((current) => ({ ...current, details: event.target.value }))
                }
              />
            </label>

            <div className="controls">
              <button className="primary" type="submit">
                Send Report
              </button>
            </div>
          </form>
        </article>

        <article className="section-card admin-console">
          <img
            className="admin-banner-art"
            src="/generated/ui/admin-ops-banner.svg"
            alt="Arena operations banner"
          />

          <div className="section-head">
            <div>
              <h2>Admin Operations Console</h2>
              <p className="note">Monitor traffic, review complaints, and control live service messaging.</p>
            </div>
            <span className="badge">Admin</span>
          </div>

          <div className="admin-auth-row">
            <input
              className="text-input"
              type="password"
              value={adminKey}
              placeholder="Enter admin key"
              onChange={(event) => setAdminKey(event.target.value)}
            />
            <button className="secondary" onClick={() => void refreshAdminOverview()}>
              {adminLoading ? 'Loading…' : 'Open Console'}
            </button>
          </div>

          {adminError && <p className="note toast-line">{adminError}</p>}

          {adminOverview && (
            <>
              <div className="insight-grid">
                <div className="stat-tile">
                  <strong>{adminOverview.totals.uniqueVisitors}</strong>
                  <span>Unique Guests</span>
                </div>
                <div className="stat-tile">
                  <strong>{adminOverview.totals.pageViews}</strong>
                  <span>Page Views</span>
                </div>
                <div className="stat-tile">
                  <strong>{adminOverview.totals.matchesCompleted}</strong>
                  <span>Completed Matches</span>
                </div>
                <div className="stat-tile">
                  <strong>{adminOverview.totals.complaintsOpen}</strong>
                  <span>Open Complaints</span>
                </div>
              </div>

              <div className="admin-columns">
                <div className="admin-panel-block">
                  <h3>Traffic by Section</h3>
                  <ul className="stats-list">
                    {adminOverview.traffic.pages.slice(0, 5).map((entry) => (
                      <li key={entry.route}>
                        <span>{entry.route}</span>
                        <strong>{entry.views}</strong>
                      </li>
                    ))}
                  </ul>

                  <h3>Device Mix</h3>
                  <ul className="stats-list">
                    {adminOverview.traffic.devices.slice(0, 4).map((entry) => (
                      <li key={entry.label}>
                        <span>{entry.label}</span>
                        <strong>{entry.count}</strong>
                      </li>
                    ))}
                  </ul>

                  <h3>Traffic by Day</h3>
                  <ul className="stats-list">
                    {adminOverview.traffic.daily.slice(-5).reverse().map((entry) => (
                      <li key={entry.day}>
                        <span>{entry.day}</span>
                        <strong>{entry.views}</strong>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="admin-panel-block">
                  <h3>Live Ops Controls</h3>
                  <div className="form-stack">
                    <label className="form-field">
                      <span>Message of the day</span>
                      <input
                        className="text-input"
                        value={adminSettings.motd}
                        onChange={(event) =>
                          setAdminSettings((current) => ({ ...current, motd: event.target.value }))
                        }
                      />
                    </label>

                    <label className="form-field">
                      <span>Daily quest</span>
                      <input
                        className="text-input"
                        value={adminSettings.quest}
                        onChange={(event) =>
                          setAdminSettings((current) => ({ ...current, quest: event.target.value }))
                        }
                      />
                    </label>

                    <label className="form-field">
                      <span>Featured mode</span>
                      <input
                        className="text-input"
                        value={adminSettings.featuredMode}
                        onChange={(event) =>
                          setAdminSettings((current) => ({
                            ...current,
                            featuredMode: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={adminSettings.maintenanceMode}
                        onChange={(event) =>
                          setAdminSettings((current) => ({
                            ...current,
                            maintenanceMode: event.target.checked,
                          }))
                        }
                      />
                      <span>Maintenance mode</span>
                    </label>

                    <button className="primary" onClick={() => void handleSaveAdminSettings()}>
                      Save Live Settings
                    </button>
                  </div>
                </div>
              </div>

              <div className="admin-panel-block">
                <div className="section-head log-heading">
                  <h3>Recent Player Complaints</h3>
                  <span className="badge">Resolved {adminOverview.totals.complaintsResolved}</span>
                </div>

                <div className="ticket-list">
                  {adminOverview.complaints.length === 0 ? (
                    <p className="note">No complaints have been submitted yet.</p>
                  ) : (
                    adminOverview.complaints.slice(0, 5).map((complaint) => (
                      <div className="ticket-card" key={complaint.id}>
                        <div className="slot-head">
                          <strong>{complaint.summary}</strong>
                          <span
                            className={`queue-pill ${
                              complaint.status === 'resolved'
                                ? 'found'
                                : complaint.status === 'investigating'
                                  ? 'searching'
                                  : 'idle'
                            }`}
                          >
                            {complaint.status}
                          </span>
                        </div>
                        <p className="mini-text">{complaint.details}</p>
                        <div className="badges">
                          <span className="badge">{complaint.id}</span>
                          <span className="badge">{complaint.category}</span>
                          <span className="badge">{complaint.severity}</span>
                          <span className="badge">{formatTimestamp(complaint.createdAt)}</span>
                        </div>
                        <div className="controls">
                          <button
                            className="ghost"
                            onClick={() => void handleUpdateComplaintStatus(complaint.id, 'investigating')}
                          >
                            Investigating
                          </button>
                          <button
                            className="primary"
                            onClick={() => void handleUpdateComplaintStatus(complaint.id, 'resolved')}
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </article>
      </section>

      <section className={`hand-section screen-panel ${activeScreen === 'battle' ? 'active' : 'hidden'}`}>
        <article className="section-card">
          <div className="section-head">
            <h2>{activePlayer.name} Hand</h2>
            <span className="badge">Mana {activePlayer.mana}</span>
          </div>

          <div className="hand-grid">
            {activePlayer.hand.map((card, index) => {
              const canPlay = !game.winner && activeBoardHasOpenLane && card.cost <= activePlayer.mana

              return (
                <button
                  className={['hand-card', `rarity-${card.rarity}`, canPlay ? '' : 'unplayable'].filter(Boolean).join(' ')}
                  key={card.instanceId}
                  onClick={() => handlePlayCard(index)}
                  disabled={!canPlay}
                  style={{ '--rarity-color': RARITY_COLORS[card.rarity] } as React.CSSProperties}
                >
                  <div className="card-top">
                    <span className="cost-pill">{card.cost}</span>
                    <span className="hero-label">{card.icon}</span>
                  </div>
                  <div className="card-art-shell large">
                    <img
                      className="card-illustration"
                      src={cardArtPath(card.id)}
                      alt={`${card.name} illustration`}
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <strong className="card-name">{card.name}</strong>
                    <span className="rarity-gem" style={{ color: RARITY_COLORS[card.rarity] }}>{card.rarity === 'legendary' ? '★' : card.rarity === 'epic' ? '◆' : card.rarity === 'rare' ? '◈' : '●'}</span>
                    {card.effect && <span className="effect-badge">{EFFECT_LABELS[card.effect] ?? card.effect}</span>}
                    <p className="card-text">{card.text}</p>
                  </div>
                  <div className="card-stats">
                    <span>⚔️ {card.attack}</span>
                    <span>❤️ {card.health}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </article>
      </section>

      <nav className="bottom-nav section-card" aria-label="Primary screens">
        <button className={activeScreen === 'home' ? 'nav-chip active' : 'nav-chip'} onClick={() => openScreen('home')}>
          🏠 Home
        </button>
        <button className={activeScreen === 'deck' ? 'nav-chip active' : 'nav-chip'} onClick={() => openScreen('deck')}>
          🃏 Deck
        </button>
        <button className={activeScreen === 'battle' ? 'nav-chip active' : 'nav-chip'} onClick={() => openScreen('battle')}>
          ⚔️ Battle
        </button>
        <button className={activeScreen === 'vault' ? 'nav-chip active' : 'nav-chip'} onClick={() => openScreen('vault')}>
          💎 Vault
        </button>
        <button className={activeScreen === 'ops' ? 'nav-chip active' : 'nav-chip'} onClick={() => openScreen('ops')}>
          📊 Ops
        </button>
      </nav>
      </>)}
    </main>
  )
}

export default App
