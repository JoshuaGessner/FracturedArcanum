import type { AIDifficulty, GameState, DeckConfig } from './game'

export type QueueState = 'idle' | 'searching' | 'found'
export type AppScreen = 'home' | 'play' | 'collection' | 'battle' | 'social' | 'shop' | 'settings'
export type SettingsSubview = 'preferences' | 'account' | 'support' | 'admin'
export type CosmeticTheme = 'royal' | 'ember' | 'moon'
export type AuthScreen = 'login' | 'signup' | 'recover' | 'grant' | 'legacy'
export type CardBorder = 'default' | 'bronze' | 'frost' | 'solar' | 'void'
export type BattleKind = 'ai' | 'local' | 'ranked' | 'friend'
export type ServerBattleKind = Extract<BattleKind, 'ai' | 'ranked' | 'friend'>
export type MatchEndReason = 'completed' | 'surrender' | 'disconnect_forfeit' | 'timeout' | 'server_abort'
export type MatchResult = 'win' | 'loss' | 'draw'

export type MatchSettlement = {
  matchId: string
  kind: ServerBattleKind
  result: MatchResult
  reason: MatchEndReason
  shardsEarned: number
  ratingDelta: number
  shards: number
  seasonRating: number
  wins: number
  losses: number
  streak: number
}

export type ServerMatchLifecycle =
  | { phase: 'idle'; matchId: null; revision: 0; kind: null; outcome: null }
  | { phase: 'active' | 'reconnecting' | 'leaving'; matchId: string; revision: number; kind: ServerBattleKind; outcome: null }
  | { phase: 'terminal'; matchId: string; revision: number; kind: ServerBattleKind; outcome: MatchSettlement }
export type ToastSeverity = 'info' | 'success' | 'warning' | 'error'
export type QuestCadence = 'daily' | 'weekly' | 'milestone' | 'skirmish'
export type QuestObjectiveType = 'win_any_match' | 'win_ai' | 'win_ai_difficulty' | 'play_matches' | 'open_packs' | 'breakdown_cards' | 'claim_daily' | 'build_deck'

export type QuestDefinition = {
  id: string
  cadence: QuestCadence
  title: string
  description: string
  category: string
  objective: {
    type: QuestObjectiveType
    target: number
    difficulty?: AIDifficulty
  }
  reward: {
    shards: number
  }
  icon: 'battle' | 'skirmish' | 'momentum' | 'pack' | 'shards' | 'deck'
}

export type QuestProgress = QuestDefinition & {
  progress: number
  target: number
  completed: boolean
  claimed: boolean
  periodKey: string
  expiresAt: string | null
}

export type QuestOverview = {
  quests: QuestProgress[]
  summary: {
    total: number
    completed: number
    claimable: number
    claimed: number
    dailyClaimable: number
    weeklyClaimable: number
    milestoneClaimable: number
    skirmishClaimable: number
  }
}

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
  shards: number
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
  accountSetupRequired?: boolean
  accountReadiness?: AccountReadiness | null
}

export type AccountRequirement = {
  id: string
  label: string
  description: string
  blocking: boolean
}

export type AccountReadiness = {
  ready: boolean
  setupRequired: boolean
  accountStatus: string
  accountStandardVersion: number
  passkeyCount: number
  legacyMigration?: {
    startedAt: string | null
    deadlineAt: string | null
    completedAt: string | null
    windowDays: number
  }
  recovery?: AccountRecoveryStatus
  requirements: AccountRequirement[]
  legal: {
    accountStandardVersion: number
    termsVersion: string
    privacyVersion: string
    ageGateVersion: string
  }
}

export type AccountRecoveryStatus = {
  activeCount: number
  acknowledgedAt: string | null
  generatedAt: string | null
  requiredCount: number
}

export type PasskeySummary = {
  id: string
  credentialId: string
  transports: string[]
  backedUp: boolean
  deviceType: string
  name: string
  createdAt: string
  lastUsedAt: string | null
}

export type PasskeyDeviceLink = {
  token: string
  linkUrl: string
  expiresAt: string
}

export type AccountSessionSummary = {
  id: string
  createdAt: string
  expiresAt: string
  ipHash: string | null
  userAgentHash: string | null
  lastSeenAt: string | null
  revokedAt: string | null
  authMethod: string | null
  lastPasskeyReauthAt?: string | null
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
  accountStatus?: string
  deletedAt?: string | null
  lockedUntil?: string | null
  suspended?: boolean
  setupRequired?: boolean
  passwordResetRequired?: boolean
  passkeyCount?: number
  recoveryCodeCount?: number
  legacy?: boolean
}

/** A deleted account plus the player value still attached to it. */
export type AdminDeletedAccount = {
  accountId: string
  username: string
  displayName: string
  deletedAt: string | null
  /** 'legacy_migration_expired' means a sweeper took it, not the player. */
  reason: string
  passkeyCount: number
  shards: number
  seasonRating: number
  wins: number
  losses: number
}

export type AdminRecoveryGrant = {
  grantId: string
  channel: string
  issuedByAccountId: string | null
  note: string
  createdAt: string
  expiresAt: string
  status: 'active' | 'consumed' | 'revoked' | 'expired'
}

/** Full account view for the owner console. Never contains credential material. */
export type AdminAccountDetail = {
  accountId: string
  username: string
  displayName: string
  role: 'user' | 'admin' | 'owner'
  accountStatus: string
  createdAt: string
  lastLogin: string | null
  deletedAt: string | null
  lockedUntil: string | null
  suspended: boolean
  setupRequired: boolean
  passwordResetRequired: boolean
  legacyMigration: { startedAt: string | null; deadlineAt: string | null; completedAt: string | null }
  passkeys: PasskeySummary[]
  recovery: { activeCount: number; acknowledgedAt: string | null; generatedAt: string | null }
  recoveryGrants: AdminRecoveryGrant[]
  securityEvents: { eventType: string; createdAt: string; metadata: string }[]
  profile: { shards: number; seasonRating: number; wins: number; losses: number } | null
}

/**
 * A freshly issued grant code. Surfaced exactly once — it is hashed at rest and
 * cannot be read back, so the console must show it until the operator dismisses it.
 */
export type IssuedGrant = {
  username: string
  grantCode: string
  expiresAt: string
  revokedPasskeys?: boolean
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
