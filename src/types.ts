import type { GameState, DeckConfig } from './game'

export type QueueState = 'idle' | 'searching' | 'found'
export type AppScreen = 'home' | 'play' | 'collection' | 'battle' | 'social' | 'shop' | 'settings'
export type SettingsSubview = 'hub' | 'preferences' | 'support' | 'admin'
export type CosmeticTheme = 'royal' | 'ember' | 'moon'
export type AuthScreen = 'login' | 'signup'
export type CardBorder = 'default' | 'bronze' | 'frost' | 'solar' | 'void'
export type BattleKind = 'ai' | 'local' | 'ranked'
export type ToastSeverity = 'info' | 'success' | 'warning' | 'error'

export type OpponentProfile = {
  name: string
  rank: string
  style: string
  ping: number
  isBot?: boolean
}

export type LeaderboardEntry = {
  account_id: string
  display_name: string
  season_rating: number
  wins: number
  losses: number
}

export type QueuePresence = {
  queueSize: number
  connectedPlayers: number
  rankedAvailable: boolean
  updatedAt: string
}

export type QueueSearchStatus = {
  position: number
  queueSize: number
  connectedPlayers: number
  waitSeconds: number
  estimatedWaitSeconds: number
  ratingWindow: number
}

export type CardCollection = Record<string, number>

export type PackOffer = {
  id: string
  cost: number
  cardCount: number
}

export type OpenedPackCard = {
  id: string
  rarity: string
  duplicate?: boolean
}

export type SocialFriend = {
  accountId: string
  username: string
  displayName: string
  since: string
}

export type SocialClanMember = {
  accountId: string
  username: string
  displayName: string
  role: 'owner' | 'member'
  joinedAt: string
  isYou: boolean
}

export type SocialClan = {
  id: string
  name: string
  tag: string
  inviteCode: string
  ownerAccountId: string
  createdAt: string
  members: SocialClanMember[]
}

export type ComplaintFormState = {
  category: string
  severity: string
  summary: string
  details: string
}

export type AdminComplaint = {
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

export type AdminOverview = {
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

export type ServerProfile = {
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
  ownedCardBorders?: CardBorder[]
  selectedCardBorder?: CardBorder
  lastDaily: string
  totalEarned: number
}

export type SavedDeck = {
  id: string
  name: string
  deckConfig: DeckConfig
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CardBorderOffer = {
  id: CardBorder
  name: string
  cost: number
  description: string
}

export type AdminUser = {
  accountId: string
  username: string
  displayName: string
  role: 'user' | 'admin' | 'owner'
  createdAt: string
  lastLogin: string | null
}

export type AdminAuditEntry = {
  id: string
  action: string
  actor: { accountId: string; username: string; displayName: string } | null
  target: { accountId: string; username: string; displayName: string } | null
  metadata: Record<string, unknown>
  createdAt: string
}

export type TradeItem = { cardId: string; qty: number }

export type Trade = {
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

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type ToastEntry = { id: string; message: string; severity: ToastSeverity }

export type ConfirmOptions = {
  title: string
  body: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  requireText?: string
  requireTextLabel?: string
}

export type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void }

export type InspectedCard = {
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

export type AdminSettings = {
  motd: string
  quest: string
  featuredMode: string
  maintenanceMode: boolean
}

export type OutgoingChallenge = {
  challengeId: string
  toAccountId: string
  toName: string
  expiresAt: number
}

export type IncomingChallenge = {
  challengeId: string
  fromAccountId: string
  fromName: string
  expiresAt: number
}

export type GameStateExport = GameState
