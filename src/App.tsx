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
  RARITY_COLORS,
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
  isBot?: boolean
}

type LeaderboardEntry = {
  account_id: string
  display_name: string
  season_rating: number
  wins: number
  losses: number
}

type QueuePresence = {
  queueSize: number
  connectedPlayers: number
  rankedAvailable: boolean
  updatedAt: string
}

type QueueSearchStatus = {
  position: number
  queueSize: number
  connectedPlayers: number
  waitSeconds: number
  estimatedWaitSeconds: number
  ratingWindow: number
}

type CardCollection = Record<string, number>

type PackOffer = {
  id: string
  cost: number
  cardCount: number
}

type OpenedPackCard = {
  id: string
  rarity: string
  duplicate?: boolean
}

type SocialFriend = {
  accountId: string
  username: string
  displayName: string
  since: string
}

type SocialClanMember = {
  accountId: string
  username: string
  displayName: string
  role: 'owner' | 'member'
  joinedAt: string
  isYou: boolean
}

type SocialClan = {
  id: string
  name: string
  tag: string
  inviteCode: string
  ownerAccountId: string
  createdAt: string
  members: SocialClanMember[]
}

type BattleKind = 'ai' | 'local' | 'ranked'

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
  accountId?: string
  displayName?: string
  username: string
  role?: 'user' | 'admin' | 'owner'
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

type AdminUser = {
  accountId: string
  username: string
  displayName: string
  role: 'user' | 'admin' | 'owner'
  createdAt: string
  lastLogin: string | null
}

type AdminAuditEntry = {
  id: string
  action: string
  actor: { accountId: string; username: string; displayName: string } | null
  target: { accountId: string; username: string; displayName: string } | null
  metadata: Record<string, unknown>
  createdAt: string
}

type TradeItem = { cardId: string; qty: number }
type Trade = {
  id: string
  fromAccountId: string
  toAccountId: string
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired'
  offer: TradeItem[]
  request: TradeItem[]
  createdAt: string
  updatedAt: string
  expiresAt: string
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
  aiDifficulty: 'fractured-arcanum.ai-difficulty',
  visitor: 'fractured-arcanum.visitor',
  analyticsConsent: 'fractured-arcanum.analytics-consent',
  runes: 'fractured-arcanum.shards',
  ownedThemes: 'fractured-arcanum.owned-themes',
  selectedTheme: 'fractured-arcanum.selected-theme',
  lastDailyClaim: 'fractured-arcanum.last-daily-claim',
  authToken: 'fractured-arcanum.auth-token',
}

const QUICK_EMOTES = ['⚡', '🔥', '✨', '🛡️', '😈']
const AI_DIFFICULTY_OPTIONS: Array<{ id: 'auto' | AIDifficulty; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'novice', label: 'Novice' },
  { id: 'adept', label: 'Adept' },
  { id: 'veteran', label: 'Veteran' },
  { id: 'legend', label: 'Legend' },
]

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

const CARD_ART_ALIASES: Record<string, string> = {
  'cave-bat': 'plague-rat',
  'copper-automaton': 'clay-soldier',
  'bog-lurker': 'swamp-lurker',
  'militia-recruit': 'war-grunt',
  'rust-golem': 'stone-golem',
  'thornback-boar': 'wild-boar',
  'granite-sentinel': 'stone-wall',
  'field-medic': 'spirit-healer',
  'sand-elemental': 'dust-devil',
  'pack-wolf': 'thunder-wolf',
  'clockwork-knight': 'iron-sentry',
  'siege-turtle': 'moss-troll',
  'flame-juggler': 'flame-dancer',
  'highland-archer': 'elven-archer',
  'moss-treant': 'thorn-bush',
  'coral-guardian': 'coral-golem',
  'frost-weaver': 'frost-archer',
  'crimson-berserker': 'bone-knight',
  'war-mammoth': 'sunforged-giant',
  'thunder-hawk': 'tempest-eagle',
  'hex-spider': 'shadow-fiend',
  'shadow-dancer': 'shadow-fiend',
  'vine-lasher': 'nature-sprite',
  'bronze-drake': 'fire-drake',
  'blood-queen': 'crimson-witch',
  'iron-juggernaut': 'iron-sentry',
  'void-empress': 'void-stalker',
  'storm-titan': 'thunder-titan',
  'drakarion-the-eternal': 'drakarion',
  'zephyr-world-breaker': 'zephyr',
  'velara-the-lifebinder': 'velara',
  'malachar-the-undying': 'malachar',
  'kronos-the-forgemaster': 'kronos',
  'aethon-runekeeper': 'aethon',
}

function cardArtPath(cardId: string) {
  const mappedCardId = CARD_ART_ALIASES[cardId] ?? cardId
  return `/generated/cards/${mappedCardId}.svg`
}

function handleCardArtError(event: React.SyntheticEvent<HTMLImageElement>) {
  const fallbackPath = '/generated/cards/mana-wisp.svg'
  if (event.currentTarget.src.endsWith(fallbackPath)) {
    return
  }
  event.currentTarget.src = fallbackPath
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

const EFFECT_DESCRIPTIONS: Record<string, string> = {
  charge: 'Can attack immediately when played — does not wait a turn.',
  guard: 'Enemies must attack this unit before they can target your hero or other units.',
  rally: 'Grants +1 Momentum when played (some cards grant more).',
  blast: 'Deals 2 damage to the enemy hero when played (some cards deal more or less).',
  heal: 'Restores 2 health to your hero when played (some cards heal more).',
  draw: 'Draw an extra card when played.',
  fury: 'Gains +1 attack after surviving combat.',
  drain: 'Steals enemy Momentum when played.',
  empower: 'Gives all friendly units +1 attack when played (some cards grant more).',
  poison: 'Deals damage to all enemy units when played.',
  shield: 'Grants bonus armor (extra hero health) when played.',
  siphon: 'Damages the enemy hero and heals your hero for the same amount.',
  bolster: 'Boosts friendly health when played (usually +1, with stronger card-specific variants).',
  cleave: 'Attacks all enemy lanes at once instead of just one.',
  lifesteal: 'Heals your hero for the amount of damage dealt.',
  summon: 'Creates a 1/1 token unit in an empty lane when played.',
  silence: 'Removes effects from all enemy units when played.',
  frostbite: 'Exhausts a random enemy unit when played; stronger cards can freeze all enemies.',
  enrage: 'Gains +2 attack when damaged.',
  deathrattle: 'Triggers a special effect when this unit is destroyed.',
  overwhelm: 'Excess damage to a unit carries over to the enemy hero.',
}

type InspectedCard = {
  name: string
  icon: string
  id: string
  cost: number
  attack: number
  health: number
  currentHealth?: number
  rarity: string
  tribe: string
  text: string
  effect: string | null
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
  const [setupAdminKey] = useState('') // deprecated: previously displayed the recovery key after setup; the owner now uses their account session for admin access.

  // ─── Server-authoritative player state ────────────────────────────────
  const [serverProfile, setServerProfile] = useState<ServerProfile | null>(null)
  const runes = serverProfile?.runes ?? 0
  const seasonRating = serverProfile?.seasonRating ?? 1200
  const record = { wins: serverProfile?.wins ?? 0, losses: serverProfile?.losses ?? 0, streak: serverProfile?.streak ?? 0 }
  const ownedThemes = serverProfile?.ownedThemes ?? ['royal'] as CosmeticTheme[]
  const selectedTheme = (serverProfile?.selectedTheme ?? 'royal') as CosmeticTheme
  const lastDailyClaim = serverProfile?.lastDaily ?? ''
  const accountRole = serverProfile?.role ?? 'user'
  const isAdminRole = accountRole === 'admin' || accountRole === 'owner'
  const isOwnerRole = accountRole === 'owner'

  // ─── Local game/UI state ──────────────────────────────────────────────
  const [deckConfig, setDeckConfig] = useState<DeckConfig>(savedDeckConfig)
  const [activeScreen, setActiveScreen] = useState<AppScreen>('home')
  const [preferredMode, setPreferredMode] = useState<GameMode>(savedMode)
  const [aiDifficultySetting, setAiDifficultySetting] = useState<'auto' | AIDifficulty>(savedAIDifficulty)
  const [lobbyCode, setLobbyCode] = useState(() => makeLobbyCode())
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
  const [tradeForm, setTradeForm] = useState<{ toAccountId: string; offer: string; request: string }>({
    toAccountId: '',
    offer: '',
    request: '',
  })
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
  const [toastMessage, setToastMessage] = useState('Ready your deck and enter the arena.')
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

    socket.on('server:role_changed', (payload: { role: 'user' | 'admin' | 'owner' }) => {
      setServerProfile((profile) => (profile ? { ...profile, role: payload.role } : profile))
      if (payload.role === 'user') {
        setToastMessage('Your admin privileges were revoked.')
        setActiveScreen((current) => (current === 'ops' ? 'home' : current))
      } else if (payload.role === 'admin') {
        setToastMessage('You are now an admin.')
      } else if (payload.role === 'owner') {
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

    socket.on('room:emote', (payload: { emote: string; from: string }) => {
      setToastMessage(`${payload.from} reacts ${payload.emote}`)
      setGame((current) => ({
        ...current,
        log: [`${payload.from} reacts ${payload.emote}`, ...current.log].slice(0, 10),
      }))
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
    function handleSwUpdate(event: Event) {
      const detail = (event as CustomEvent).detail as { registration: ServiceWorkerRegistration }
      swRegistrationRef.current = detail.registration
      setSwUpdateAvailable(true)
    }

    window.addEventListener('sw-update-available', handleSwUpdate)
    return () => window.removeEventListener('sw-update-available', handleSwUpdate)
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
      setToastMessage(`${target.displayName || target.username} is now ${newRole === 'admin' ? 'an admin' : 'a regular user'}.`)
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
    if (!window.confirm('Transfer ownership? You will be demoted to admin.')) return
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
      setTransferStatus('Ownership transferred. You are now an admin on this server.')
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

  function startMatch(mode: GameMode = preferredMode, enemyName?: string) {
    if (!deckReady) {
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
    setGame(createGame(mode, deckConfig, enemyName, aiDifficulty))
    void sendAnalytics(
      'match_start',
      {
        mode,
        opponent: enemyName ?? 'Arena Bot',
        aiDifficulty,
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

  const parseTradeItems = useCallback((raw: string): TradeItem[] | null => {
    // Accept "card-id x2, other-id" style shorthand.
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
    const seen = new Set<string>()
    const result: TradeItem[] = []
    for (const part of parts) {
      const match = part.match(/^([a-z0-9-]+)(?:\s*x\s*(\d+))?$/i)
      if (!match) return null
      const cardId = match[1].toLowerCase()
      const qty = match[2] ? Math.max(1, Math.min(3, Number(match[2]))) : 1
      if (seen.has(cardId)) return null
      seen.add(cardId)
      result.push({ cardId, qty })
    }
    return result
  }, [])

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
    if (!authToken) return
    const offer = parseTradeItems(tradeForm.offer)
    const request = parseTradeItems(tradeForm.request)
    if (!offer || !request) {
      setTradeStatus('Use format: "card-id x1, other-id x2" (1–6 distinct cards, qty 1–3).')
      return
    }
    try {
      const response = await authFetch('/api/trades/propose', authToken, {
        method: 'POST',
        body: { toAccountId: tradeForm.toAccountId.trim(), offer, request },
      })
      const data = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setTradeStatus(data.error ?? 'Could not propose trade.')
        return
      }
      setTradeStatus('Trade proposal sent.')
      setTradeForm({ toAccountId: '', offer: '', request: '' })
      await refreshTrades()
    } catch {
      setTradeStatus('Could not reach server.')
    }
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

  function handleSendEmote(emote: string) {
    playSound('tap', soundEnabled)
    pulseFeedback(10)
    setToastMessage(`You react ${emote}`)
    setGame((current) => ({
      ...current,
      log: [`${activePlayer.name} reacts ${emote}`, ...current.log].slice(0, 10),
    }))
    void sendAnalytics('emote', { emote }, 'social')

    if (backendOnline && socketClientRef.current?.connected) {
      socketClientRef.current.emit('room:emote', {
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

  function handleLoadPreset(name: string, config: DeckConfig) {
    playSound('tap', soundEnabled)

    const filteredConfig = Object.fromEntries(
      Object.entries(config).map(([cardId, count]) => {
        const libraryCard = CARD_LIBRARY.find((item) => item.id === cardId)
        const maxCopies = libraryCard?.rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES
        const ownedCount = loggedIn ? (collection[cardId] ?? 0) : maxCopies
        return [cardId, Math.min(count, ownedCount, maxCopies)]
      }),
    ) as DeckConfig

    setToastMessage(`${name} preset loaded${getDeckSize(filteredConfig) < MIN_DECK_SIZE ? ' with your currently owned cards.' : '.'}`)
    setDeckConfig(filteredConfig)
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
            <h2>{isRankedBattle ? 'Ranked Victory Secured' : battleKind === 'local' ? 'Casual Duel Won' : 'Season Chest Unlocked'}</h2>
            <div className="badges">
              <span className="badge">{isRankedBattle ? '+25 Rating' : battleKind === 'local' ? 'Casual Match' : '+30 Shards'}</span>
              <span className="badge">+30 Shards</span>
              <span className="badge">Win Streak {record.streak}</span>
              <span className="badge">League {rankLabel}</span>
            </div>
            <p className="note">{isRankedBattle ? 'Your crew celebrates another climb up the live ladder.' : battleKind === 'local' ? 'Great pass-and-play win. Queue online when you want leaderboard progress.' : 'Your crew celebrates a strong practice match.'}</p>
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

      {inspectedCard && (
        <section className="queue-overlay card-inspect-overlay" onClick={() => setInspectedCard(null)}>
          <div className="queue-modal card-inspect-modal section-card" onClick={(e) => e.stopPropagation()}>
            <div className="card-inspect-header">
              <span className="cost-pill">{inspectedCard.cost}</span>
              <div>
                <h2>{inspectedCard.icon} {inspectedCard.name}</h2>
                <span className="badges">
                  <span className="badge">{inspectedCard.rarity}</span>
                  <span className="badge">{inspectedCard.tribe}</span>
                </span>
              </div>
            </div>
            <div className="card-art-shell large">
              <img className="card-illustration" src={cardArtPath(inspectedCard.id)} alt={inspectedCard.name} onError={handleCardArtError} />
            </div>
            <div className="card-inspect-stats">
              <span>⚔️ Attack: {inspectedCard.attack}</span>
              <span>❤️ Health: {inspectedCard.currentHealth ?? inspectedCard.health}</span>
              {inspectedCard.currentHealth !== undefined && inspectedCard.currentHealth !== inspectedCard.health && (
                <span className="note">(Base: {inspectedCard.health})</span>
              )}
            </div>
            <p className="card-text">{inspectedCard.text}</p>
            {inspectedCard.effect && (
              <div className="card-inspect-effect">
                <span className="effect-badge">{EFFECT_LABELS[inspectedCard.effect] ?? inspectedCard.effect}</span>
                <p className="note">{EFFECT_DESCRIPTIONS[inspectedCard.effect] ?? ''}</p>
              </div>
            )}
            <button className="ghost" onClick={() => setInspectedCard(null)}>Close</button>
          </div>
        </section>
      )}


      {loggedIn && (<>
      <section className={`home-screen screen-panel ${activeScreen === 'home' ? 'active' : 'hidden'}`}>
        <article className="section-card utility-card spotlight-card">
          <div className="arena-title-block">
            <p className="eyebrow">Season of Whispers</p>
            <h2>The Arena Awaits</h2>
            <p className="note">Queue online for live browser-vs-browser battles, or start AI and local matches instantly.</p>
          </div>

          {gameInProgress && (
            <div className="game-resume-block">
              <p className="note">You have a battle in progress vs <strong>{game.enemy.name}</strong> (Turn {game.turnNumber})</p>
              <div className="controls">
                <button className="primary" onClick={handleResumeBattle}>Resume Battle</button>
                <button className="ghost" onClick={handleAbandonBattle}>Abandon &amp; Reset</button>
              </div>
            </div>
          )}

          <>
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
              Pass &amp; Play
            </button>
          </div>

          {preferredMode === 'ai' && (
            <div className="difficulty-panel">
              <p className="note">AI difficulty: <strong>{resolvedAIDifficulty.charAt(0).toUpperCase() + resolvedAIDifficulty.slice(1)}</strong>{aiDifficultySetting === 'auto' ? ` recommended from your ${seasonRating} rating.` : ' selected manually.'}</p>
              <div className="controls difficulty-row">
                {AI_DIFFICULTY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={aiDifficultySetting === option.id ? 'primary' : 'ghost'}
                    onClick={() => handleAIDifficultyChange(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="controls">
            <button className="primary" onClick={() => startMatch()} disabled={!deckReady}>
              {gameInProgress ? 'Start Fresh Battle' : 'Enter Arena'}
            </button>
            <button className="secondary" onClick={handleStartQueue} disabled={!deckReady || queueState !== 'idle'}>
              Play Online (Ranked)
            </button>
            <button className="ghost" onClick={() => openScreen('deck')}>
              Deck Forge
            </button>
          </div>
          </>

          {queueState === 'searching' && (
            <div className="queue-searching-block">
              <p className="card-text">Searching for a real opponent... {queueSeconds}s</p>
              <div className="live-status-grid">
                <div>
                  <strong>#{queueSearchStatus.position}</strong>
                  <p className="note">your queue spot</p>
                </div>
                <div>
                  <strong>{Math.max(0, queueSearchStatus.connectedPlayers - 1)}</strong>
                  <p className="note">other players online</p>
                </div>
              </div>
              <p className="note">Queue size: {queueSearchStatus.queueSize || queuePresence.queueSize} • Rating window: ±{queueSearchStatus.ratingWindow} • Estimated wait: {queueSearchStatus.estimatedWaitSeconds}s</p>
              <p className="note">Ranked only starts with another live player. No bot fallback is used.</p>
              <button className="ghost" onClick={handleCancelQueue}>Cancel Matchmaking</button>
            </div>
          )}

          {queueState === 'found' && queuedOpponent && (
            <div className="opponent-preview">
              <strong>{queuedOpponent.name}</strong>
              <span className="note">
                {queuedOpponent.rank} • {queuedOpponent.style} • {queuedOpponent.ping}ms • Live player
              </span>
              <div className="controls">
                <button className="primary" onClick={handleAcceptQueue} disabled>Starting Live Match…</button>
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
              <span className="badge">@{serverProfile?.username ?? 'guest'}</span>
              <span className="badge">{serverProfile?.displayName ?? serverProfile?.username ?? 'Player'}</span>
              <span className="badge">{rankLabel}</span>
              <span className="badge">{totalGames} games</span>
              <span className="badge">{winRate}% WR</span>
              <span className="badge">{runes} 💎</span>
            </div>
          </article>

          <article className="section-card utility-card">
            <div className="section-head">
              <h2>Live Arena</h2>
              <span className="deck-status ready">{liveQueueLabel}</span>
            </div>
            <div className="live-status-grid">
              <div>
                <strong>{queuePresence.connectedPlayers}</strong>
                <p className="note">players online</p>
              </div>
              <div>
                <strong>{queuePresence.queueSize}</strong>
                <p className="note">currently queued</p>
              </div>
            </div>
            <p className="note">{queuePresence.updatedAt ? `Live updated ${formatTimestamp(queuePresence.updatedAt)}.` : 'Waiting for live service data.'}</p>
          </article>

          <article className="section-card utility-card">
            <div className="section-head">
              <h2>Leaderboard</h2>
              <span className="badge">Top 5</span>
            </div>
            <p className="note">Online ranked matches update the live ladder automatically.</p>
            <div className="leaderboard-list">
              {leaderboardEntries.slice(0, 5).map((entry, index) => {
                const entryGames = Math.max(1, entry.wins + entry.losses)
                const entryWinRate = Math.round((entry.wins / entryGames) * 100)
                return (
                  <div className="leaderboard-row" key={`${entry.account_id}-${index}`}>
                    <span className="badge">#{index + 1}</span>
                    <div className="leaderboard-meta">
                      <strong>{entry.display_name}</strong>
                      <span className="note">{entry.season_rating} rating • {entryWinRate}% WR</span>
                    </div>
                  </div>
                )
              })}
              {!leaderboardEntries.length && <p className="note">No ladder data yet. Win ranked matches to claim the top spot.</p>}
            </div>
          </article>

          <article className="section-card utility-card">
            <div className="section-head">
              <h2>Social Hub</h2>
              <span className="badge">{friends.length} friend{friends.length === 1 ? '' : 's'}</span>
            </div>

            <form className="social-inline-form" onSubmit={(event) => void handleAddFriend(event)}>
              <input
                className="text-input"
                value={friendUsernameInput}
                maxLength={20}
                placeholder="Friend username"
                onChange={(event) => setFriendUsernameInput(event.target.value)}
              />
              <button className="secondary" disabled={socialLoading}>Add Friend</button>
            </form>

            <div className="social-list">
              {friends.slice(0, 8).map((friend) => {
                const online = onlineFriendIds.has(friend.accountId)
                const canChallenge = online && !outgoingChallenge && !incomingChallenge
                return (
                  <div className="social-row" key={friend.accountId}>
                    <div className="leaderboard-meta">
                      <strong>
                        <span
                          className={`presence-dot ${online ? 'online' : 'offline'}`}
                          aria-label={online ? 'online' : 'offline'}
                          title={online ? 'Online' : 'Offline'}
                        />
                        {friend.displayName}
                      </strong>
                      <span className="note">@{friend.username}</span>
                    </div>
                    <div className="controls">
                      <button
                        className="primary mini"
                        disabled={!canChallenge}
                        title={online ? 'Challenge to an unranked duel' : 'Friend is offline'}
                        onClick={() => handleChallengeFriend(friend)}
                      >
                        ⚔ Challenge
                      </button>
                      <button className="ghost mini" disabled={socialLoading} onClick={() => void handleRemoveFriend(friend.accountId, friend.displayName)}>
                        Remove
                      </button>
                    </div>
                  </div>
                )
              })}
              {!friends.length && <p className="note">No friends yet. Add players by username to build your roster.</p>}
              {challengeStatus && <p className="note toast-line">{challengeStatus}</p>}
              {outgoingChallenge && (
                <div className="challenge-banner outgoing">
                  <span>
                    Waiting for <strong>{outgoingChallenge.toName}</strong>…
                  </span>
                  <button className="ghost mini" onClick={handleCancelOutgoingChallenge}>Cancel</button>
                </div>
              )}
            </div>

            {clan ? (
              <div className="social-clan-block">
                <div className="section-head">
                  <strong>[{clan.tag}] {clan.name}</strong>
                  <button className="ghost mini" disabled={socialLoading} onClick={() => void handleLeaveClan()}>
                    Leave
                  </button>
                </div>
                <div className="badges">
                  <span className="badge">Invite {clan.inviteCode}</span>
                  <span className="badge">{clan.members.length} members</span>
                </div>
                <div className="social-list">
                  {clan.members.map((member) => (
                    <div className="social-row" key={member.accountId}>
                      <div className="leaderboard-meta">
                        <strong>{member.displayName} {member.isYou ? '(You)' : ''}</strong>
                        <span className="note">@{member.username} • {member.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="social-clan-block">
                <form className="form-stack" onSubmit={(event) => void handleCreateClan(event)}>
                  <label className="form-field">
                    <span>Create clan</span>
                    <div className="social-inline-form">
                      <input
                        className="text-input"
                        value={clanForm.name}
                        maxLength={32}
                        placeholder="Clan name"
                        onChange={(event) => setClanForm((current) => ({ ...current, name: event.target.value }))}
                      />
                      <input
                        className="text-input clan-tag-field"
                        value={clanForm.tag}
                        maxLength={6}
                        placeholder="TAG"
                        onChange={(event) => setClanForm((current) => ({ ...current, tag: event.target.value.toUpperCase() }))}
                      />
                      <button className="secondary" disabled={socialLoading}>Create</button>
                    </div>
                  </label>
                </form>

                <form className="social-inline-form" onSubmit={(event) => void handleJoinClan(event)}>
                  <input
                    className="text-input"
                    value={clanForm.inviteCode}
                    maxLength={12}
                    placeholder="Invite code (CLN-XXXXXXXX)"
                    onChange={(event) => setClanForm((current) => ({ ...current, inviteCode: event.target.value.toUpperCase() }))}
                  />
                  <button className="ghost" disabled={socialLoading}>Join Clan</button>
                </form>
              </div>
            )}

            <p className="note toast-line">{socialStatus}</p>

            {/* ─── Card trading (friends only) ──────────────────── */}
            <div className="social-trade-block">
              <div className="section-head">
                <h3>Card Trades</h3>
                <span className="badge">Friends Only</span>
              </div>
              <p className="note">
                Propose a trade with a friend. List card IDs separated by commas, with optional quantity (e.g. <code>spark-imp x2, shadow-whelp</code>). Max 6 distinct cards per side; up to 3 copies per card.
              </p>

              <form className="social-inline-form" onSubmit={handleProposeTrade}>
                <input
                  className="text-input"
                  value={tradeForm.toAccountId}
                  placeholder="Friend account id (acct-…)"
                  onChange={(event) => setTradeForm((f) => ({ ...f, toAccountId: event.target.value }))}
                />
                <input
                  className="text-input"
                  value={tradeForm.offer}
                  placeholder="You give: e.g. spark-imp x1"
                  onChange={(event) => setTradeForm((f) => ({ ...f, offer: event.target.value }))}
                />
                <input
                  className="text-input"
                  value={tradeForm.request}
                  placeholder="You receive: e.g. shadow-whelp x1"
                  onChange={(event) => setTradeForm((f) => ({ ...f, request: event.target.value }))}
                />
                <button className="secondary" type="submit">Propose Trade</button>
              </form>
              {tradeStatus && <p className="note toast-line">{tradeStatus}</p>}

              <ul className="trade-list">
                {trades.length === 0 ? (
                  <li className="note">No trades yet.</li>
                ) : (
                  trades.map((trade) => {
                    const youArePromoter = trade.fromAccountId === (serverProfile?.accountId ?? '')
                    const pending = trade.status === 'pending'
                    return (
                      <li className="trade-row" key={trade.id}>
                        <div className="trade-identity">
                          <strong>{youArePromoter ? 'You → friend' : 'Friend → you'}</strong>
                          <span className={`badge trade-status-${trade.status}`}>{trade.status}</span>
                        </div>
                        <div className="mini-text">
                          Offer: {trade.offer.map((i) => `${i.cardId}×${i.qty}`).join(', ')}
                          {' · '}
                          Request: {trade.request.map((i) => `${i.cardId}×${i.qty}`).join(', ')}
                        </div>
                        {pending && (
                          <div className="controls">
                            {youArePromoter ? (
                              <button className="ghost mini" onClick={() => void handleTradeAction(trade.id, 'cancel')}>
                                Cancel
                              </button>
                            ) : (
                              <>
                                <button className="primary mini" onClick={() => void handleTradeAction(trade.id, 'accept')}>
                                  Accept
                                </button>
                                <button className="ghost mini" onClick={() => void handleTradeAction(trade.id, 'reject')}>
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })
                )}
              </ul>
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
              const ownedCount = loggedIn ? (collection[card.id] ?? 0) : maxCopies
              const count = deckConfig[card.id] ?? 0
              const addDisabled = count >= Math.min(maxCopies, ownedCount)
              return (
              <div className={`builder-card rarity-${card.rarity} ${ownedCount === 0 ? 'locked' : ''}`} key={card.id} style={{ '--rarity-color': RARITY_COLORS[card.rarity] } as React.CSSProperties}>
                <div>
                  <div className="card-art-shell">
                    <img
                      className="card-illustration"
                      src={cardArtPath(card.id)}
                      alt={`${card.name} illustration`}
                      loading="lazy"
                      onError={handleCardArtError}
                    />
                  </div>
                  <div className="slot-head">
                    <strong>
                      {card.icon} {card.name}
                    </strong>
                    <span className="stats">{card.cost} 💧</span>
                  </div>
                  <div className="card-meta-row">
                    <span className="rarity-gem" style={{ color: RARITY_COLORS[card.rarity] }}>{card.rarity === 'legendary' ? '★' : card.rarity === 'epic' ? '◆' : card.rarity === 'rare' ? '◈' : '●'} {card.rarity}</span>
                    <span className="tribe-badge">{card.tribe}</span>
                    <span className="tribe-badge">Owned {ownedCount}</span>
                  </div>
                  <div className="card-stats">
                    <span>⚔️ {card.attack}</span>
                    <span>❤️ {card.health}</span>
                  </div>
                  {card.effect && <span className="effect-badge small">{EFFECT_LABELS[card.effect] ?? card.effect}</span>}
                  <p className="card-text clamped">{card.text}</p>
                </div>

                <div className="stepper">
                  <button className="ghost mini" onClick={() => handleDeckCount(card.id, -1)}>
                    −
                  </button>
                  <span className="count-chip">{count}</span>
                  <button className="ghost mini" onClick={() => handleDeckCount(card.id, 1)} disabled={addDisabled}>
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
              Play Online
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

      {activeScreen === 'battle' && !backendOnline && isRankedBattle && (
        <div className="connection-banner reconnecting">
          <span>Connection lost — reconnecting...</span>
        </div>
      )}

      {activeScreen === 'battle' && opponentDisconnected && isRankedBattle && (
        <div className="connection-banner opponent-disconnected">
          <span>Opponent disconnected — waiting for reconnect ({Math.round(disconnectGraceMs / 1000)}s window)...</span>
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
          <button className="ghost" onClick={handleLeaveBattle}>
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
                  onClick={() => {
                    if (consumeLongPressAction()) return
                    if (isSelectable) handleSelectAttacker(index)
                    else handleAttackTarget(index)
                  }}
                  {...getLongPressProps({ name: unit.name, icon: unit.icon, id: unit.id, cost: unit.cost, attack: unit.attack, health: unit.health, currentHealth: unit.currentHealth, rarity: unit.rarity, tribe: unit.tribe, text: unit.text, effect: unit.effect ?? null })}
                  aria-disabled={Boolean(game.winner) || (isSelectable ? unit.exhausted : selectedAttacker === null)}
                  title="Long press to inspect"
                >
                  <img className="unit-portrait" src={cardArtPath(unit.id)} alt={`${unit.name} artwork`} loading="lazy" onError={handleCardArtError} />
                  <div className="slot-head">
                    <strong>
                      {unit.icon} {unit.name}
                    </strong>
                    <span className="stats">
                      ⚔️{unit.attack} ❤️{unit.currentHealth}
                    </span>
                  </div>
                  {unit.effect && <span className="effect-badge small">{EFFECT_LABELS[unit.effect] ?? unit.effect}</span>}
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
                  onClick={() => {
                    if (consumeLongPressAction()) return
                    if (isSelectable) handleSelectAttacker(index)
                    else handleAttackTarget(index)
                  }}
                  {...getLongPressProps({ name: unit.name, icon: unit.icon, id: unit.id, cost: unit.cost, attack: unit.attack, health: unit.health, currentHealth: unit.currentHealth, rarity: unit.rarity, tribe: unit.tribe, text: unit.text, effect: unit.effect ?? null })}
                  aria-disabled={Boolean(game.winner) || (isSelectable ? unit.exhausted : selectedAttacker === null)}
                  title="Long press to inspect"
                >
                  <img className="unit-portrait" src={cardArtPath(unit.id)} alt={`${unit.name} artwork`} loading="lazy" onError={handleCardArtError} />
                  <div className="slot-head">
                    <strong>
                      {unit.icon} {unit.name}
                    </strong>
                    <span className="stats">
                      ⚔️{unit.attack} ❤️{unit.currentHealth}
                    </span>
                  </div>
                  {unit.effect && <span className="effect-badge small">{EFFECT_LABELS[unit.effect] ?? unit.effect}</span>}
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
              {isRankedBattle ? (game.winner === 'player' ? '+25 Rating' : game.winner === 'enemy' ? '-15 Rating' : 'Even Match') : battleKind === 'local' ? 'Casual Duel' : game.winner === 'player' ? '+30 Shards' : 'Practice Match'}
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
              <p className="note">Claim daily rewards, earn Shards, and build your card library over time.</p>
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
              <h2>Card Packs & Collection</h2>
              <p className="note">New accounts start with a starter library. Open packs with Shards to unlock more cards by rarity.</p>
            </div>
            <span className="badge">Owned {totalOwnedCards}</span>
          </div>

          <div className="theme-grid">
            {packOffers.map((pack) => (
              <div className="theme-offer-card" key={pack.id}>
                <strong>{pack.id[0].toUpperCase() + pack.id.slice(1)} Pack</strong>
                <p className="mini-text">{pack.cardCount} random cards with rarity protection.</p>
                <div className="badges">
                  <span className="badge">{pack.cost} Shards</span>
                </div>
                <button className="primary" onClick={() => void handleOpenPack(pack.id)} disabled={packOpening === pack.id || runes < pack.cost}>
                  {packOpening === pack.id ? 'Opening…' : 'Open Pack'}
                </button>
              </div>
            ))}
          </div>

          {openedPackCards.length > 0 && (
            <div className="leaderboard-list">
              {openedPackCards.map((card, index) => {
                const cardMeta = CARD_LIBRARY.find((entry) => entry.id === card.id)
                return (
                  <div className="leaderboard-row" key={`${card.id}-${index}`}>
                    <span className="badge">{card.rarity}</span>
                    <div className="leaderboard-meta">
                      <strong>{cardMeta?.icon} {cardMeta?.name ?? card.id}</strong>
                      <span className="note">{card.duplicate ? 'Duplicate converted into Shards.' : 'Added to your library.'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </article>
      </section>

      <section className={`ops-grid screen-panel ${activeScreen === 'ops' && isAdminRole ? 'active' : 'hidden'}`}>
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
                onError={handleCardArtError}
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
              <p className="note">
                {isAdminRole
                  ? 'Monitor traffic, review complaints, and control live service messaging.'
                  : 'This console is only available to owner and admin accounts.'}
              </p>
            </div>
            <span className={`badge role-badge role-${accountRole}`}>
              {accountRole === 'owner' ? 'Owner' : accountRole === 'admin' ? 'Admin' : 'Player'}
            </span>
          </div>

          {isAdminRole ? (
            <div className="admin-auth-row">
              <button className="secondary" onClick={() => void refreshAdminOverview()}>
                {adminLoading ? 'Loading…' : adminOverview ? 'Refresh Console' : 'Open Console'}
              </button>
            </div>
          ) : (
            <p className="note toast-line">
              Your account does not have admin privileges. Contact the server owner if you believe this is a mistake.
            </p>
          )}

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

              {isOwnerRole && (
                <div className="admin-panel-block admin-role-block">
                  <div className="section-head log-heading">
                    <h3>Account Roles</h3>
                    <span className="badge">Owner</span>
                  </div>

                  <div className="admin-auth-row">
                    <input
                      className="text-input"
                      value={adminUserSearch}
                      placeholder="Search users by username, name, or id"
                      onChange={(event) => setAdminUserSearch(event.target.value)}
                    />
                    <button className="secondary" onClick={() => void refreshAdminUsers(adminUserSearch)}>
                      {adminUsersLoading ? 'Loading…' : 'Search'}
                    </button>
                  </div>

                  <ul className="role-list">
                    {adminUsers.length === 0 ? (
                      <li className="note">No users loaded. Click search to list accounts.</li>
                    ) : (
                      adminUsers.map((user) => {
                        const isSelf = user.accountId === (serverProfile?.accountId ?? '')
                        const isRoleOwner = user.role === 'owner'
                        return (
                          <li className="role-row" key={user.accountId}>
                            <div className="role-identity">
                              <strong>{user.displayName || user.username}</strong>
                              <span className="mini-text">@{user.username}</span>
                              <span className={`badge role-badge role-${user.role}`}>
                                {user.role === 'owner' ? 'Owner' : user.role === 'admin' ? 'Admin' : 'Player'}
                              </span>
                            </div>
                            <div className="controls">
                              {isRoleOwner || isSelf ? (
                                <span className="mini-text">
                                  {isSelf ? 'You' : 'Cannot modify the owner'}
                                </span>
                              ) : user.role === 'admin' ? (
                                <button className="ghost" onClick={() => void handleSetUserRole(user, 'user')}>
                                  Demote to Player
                                </button>
                              ) : (
                                <button className="primary" onClick={() => void handleSetUserRole(user, 'admin')}>
                                  Promote to Admin
                                </button>
                              )}
                            </div>
                          </li>
                        )
                      })
                    )}
                  </ul>

                  <div className="section-head log-heading">
                    <h3>Transfer Ownership</h3>
                    <span className="badge">Irreversible</span>
                  </div>
                  <form className="form-stack" onSubmit={handleTransferOwnership}>
                    <label className="form-field">
                      <span>Target account id</span>
                      <input
                        className="text-input"
                        value={transferForm.targetAccountId}
                        placeholder="acct-…"
                        onChange={(event) => setTransferForm((f) => ({ ...f, targetAccountId: event.target.value }))}
                      />
                    </label>
                    <label className="form-field">
                      <span>Confirm your password</span>
                      <input
                        className="text-input"
                        type="password"
                        autoComplete="current-password"
                        value={transferForm.password}
                        onChange={(event) => setTransferForm((f) => ({ ...f, password: event.target.value }))}
                      />
                    </label>
                    {transferStatus && <p className="note toast-line">{transferStatus}</p>}
                    <div className="controls">
                      <button className="danger" type="submit">
                        Transfer ownership
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {isAdminRole && (
                <div className="admin-panel-block">
                  <div className="section-head log-heading">
                    <h3>Admin Audit Log</h3>
                    <button className="ghost" onClick={() => void refreshAdminAudit()}>Refresh</button>
                  </div>
                  <ul className="audit-list">
                    {adminAudit.length === 0 ? (
                      <li className="note">No audit entries yet.</li>
                    ) : (
                      adminAudit.slice(0, 20).map((entry) => (
                        <li key={entry.id} className="audit-row">
                          <span className="badge">{entry.action}</span>
                          <span className="mini-text">
                            {entry.actor ? `@${entry.actor.username}` : 'system'}
                            {entry.target ? ` → @${entry.target.username}` : ''}
                          </span>
                          <span className="mini-text">{formatTimestamp(entry.createdAt)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
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
                  onClick={() => {
                    if (consumeLongPressAction()) return
                    if (canPlay) handlePlayCard(index)
                  }}
                  {...getLongPressProps({ name: card.name, icon: card.icon, id: card.id, cost: card.cost, attack: card.attack, health: card.health, rarity: card.rarity, tribe: card.tribe, text: card.text, effect: card.effect ?? null })}
                  aria-disabled={!canPlay}
                  title={canPlay ? 'Tap to play or long press to inspect' : 'Long press to inspect'}
                  style={{ '--rarity-color': RARITY_COLORS[card.rarity] } as React.CSSProperties}
                >
                  <div className="card-top">
                    <span className="cost-pill">{card.cost}</span>
                    <span className="hero-label">{card.icon}</span>
                  </div>
                  <div className="card-art-shell thumb">
                    <img className="card-illustration" src={cardArtPath(card.id)} alt={`${card.name} artwork`} loading="lazy" onError={handleCardArtError} />
                  </div>
                  <div>
                    <strong className="card-name">{card.name}</strong>
                    {card.effect && <span className="effect-badge">{EFFECT_LABELS[card.effect] ?? card.effect}</span>}
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
        {isAdminRole && (
          <button className={activeScreen === 'ops' ? 'nav-chip active' : 'nav-chip'} onClick={() => openScreen('ops')}>
            📊 Ops
          </button>
        )}
      </nav>
      </>)}
    </main>
  )
}

export default App
