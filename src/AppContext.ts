import { createContext, type FormEvent } from 'react'
import type { GameMode, AIDifficulty, DeckConfig, GameState } from './game'
import type {
  AdminAuditEntry,
  AdminOverview,
  AdminSettings,
  AdminUser,
  AppScreen,
  AuthScreen,
  BattleKind,
  CardBorder,
  CardCollection,
  ComplaintFormState,
  ConfirmOptions,
  ConfirmRequest,
  CosmeticTheme,
  IncomingChallenge,
  InspectedCard,
  InstallPromptEvent,
  LeaderboardEntry,
  OpenedPackCard,
  OpponentProfile,
  OutgoingChallenge,
  PackOffer,
  QueuePresence,
  QueueSearchStatus,
  QueueState,
  ServerProfile,
  SavedDeck,
  SocialClan,
  SocialFriend,
  ToastEntry,
  ToastSeverity,
  Trade,
  TradeItem,
} from './types'

export type AppContextValue = {
  // ─── Auth / setup ──────────────────────────────────────────────
  authToken: string
  setAuthToken: (value: string) => void
  authScreen: AuthScreen
  setAuthScreen: (value: AuthScreen) => void
  authForm: { username: string; password: string; displayName: string }
  setAuthForm: React.Dispatch<React.SetStateAction<{ username: string; password: string; displayName: string }>>
  authError: string
  authLoading: boolean
  loggedIn: boolean
  setupRequired: boolean | null
  setupForm: { username: string; password: string; displayName: string }
  setSetupForm: React.Dispatch<React.SetStateAction<{ username: string; password: string; displayName: string }>>
  setupError: string
  setupLoading: boolean
  handleSetup: (event: FormEvent) => Promise<void>
  handleAuth: (event: FormEvent) => Promise<void>
  handleLogout: () => void

  // ─── Profile ───────────────────────────────────────────────────
  serverProfile: ServerProfile | null
  setServerProfile: React.Dispatch<React.SetStateAction<ServerProfile | null>>
  runes: number
  seasonRating: number
  record: { wins: number; losses: number; streak: number }
  ownedThemes: CosmeticTheme[]
  selectedTheme: CosmeticTheme
  ownedCardBorders: CardBorder[]
  selectedCardBorder: CardBorder
  lastDailyClaim: string
  accountRole: 'user' | 'admin' | 'owner'
  isAdminRole: boolean
  isOwnerRole: boolean
  rankLabel: string
  totalGames: number
  winRate: number
  rankProgress: number
  nextRankTarget: number
  nextRewardLabel: string
  todayKey: string
  canClaimDailyReward: boolean
  totalOwnedCards: number

  // ─── Decks / collection ────────────────────────────────────────
  collection: CardCollection
  setCollection: React.Dispatch<React.SetStateAction<CardCollection>>
  deckConfig: DeckConfig
  setDeckConfig: React.Dispatch<React.SetStateAction<DeckConfig>>
  selectedDeckSize: number
  deckReady: boolean
  savedDecks: SavedDeck[]
  activeDeckId: string | null
  builderFilter: { ownedOnly: boolean; search: string; rarity: 'all' | 'common' | 'rare' | 'epic' | 'legendary' }
  setBuilderFilter: React.Dispatch<
    React.SetStateAction<{ ownedOnly: boolean; search: string; rarity: 'all' | 'common' | 'rare' | 'epic' | 'legendary' }>
  >
  pendingBreakdown: { cardId: string; qty: number } | null
  setPendingBreakdown: (value: { cardId: string; qty: number } | null) => void
  handleCreateDeck: () => void
  handleRenameDeck: (deck: SavedDeck) => void
  handleDeleteDeck: (deck: SavedDeck) => void
  handleSelectDeck: (deck: SavedDeck) => void
  handleBreakdownCard: (cardId: string, qty: number) => void
  handleDeckCount: (cardId: string, delta: number) => void

  // ─── Cosmetics / shop ──────────────────────────────────────────
  packOffers: PackOffer[]
  openedPackCards: OpenedPackCard[]
  packOpening: string | null
  handleOpenPack: (packType: string) => Promise<void>
  handlePurchaseBorder: (borderId: CardBorder, cost: number) => void
  handleSelectBorder: (borderId: CardBorder) => void
  handleEquipTheme: (themeId: CosmeticTheme, cost: number) => void
  handleClaimDailyReward: () => void

  // ─── Navigation / UI shell ─────────────────────────────────────
  activeScreen: AppScreen

  openScreen: (screen: AppScreen) => void
  screenTitle: string
  toastMessage: string
  toastSeverity: ToastSeverity
  toastStack: ToastEntry[]
  setToastMessage: (message: string, severityOverride?: ToastSeverity) => void
  inferToastSeverity: (text: string) => ToastSeverity
  confirmRequest: ConfirmRequest | null
  confirmTextInput: string
  setConfirmTextInput: (value: string) => void
  askConfirm: (options: ConfirmOptions) => Promise<boolean>
  closeConfirm: (ok: boolean) => void
  inspectedCard: InspectedCard | null
  setInspectedCard: (card: InspectedCard | null) => void
  consumeLongPressAction: () => boolean
  getLongPressProps: (card: InspectedCard) => Record<string, unknown>
  installPromptEvent: InstallPromptEvent | null
  handleInstallApp: () => Promise<void>
  swUpdateAvailable: boolean
  handleAcceptUpdate: () => void
  handleDismissUpdate: () => void
  soundEnabled: boolean
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>
  analyticsConsent: boolean
  setAnalyticsConsent: React.Dispatch<React.SetStateAction<boolean>>
  visitorId: string

  // ─── Live service info ─────────────────────────────────────────
  backendOnline: boolean

  dailyQuest: string
  featuredMode: string

  // ─── Queue / matchmaking ───────────────────────────────────────
  queueState: QueueState
  queueSeconds: number
  queuedOpponent: OpponentProfile | null
  queuePresence: QueuePresence
  queueSearchStatus: QueueSearchStatus
  liveQueueLabel: string
  leaderboardEntries: LeaderboardEntry[]
  handleStartQueue: () => void
  handleCancelQueue: () => void
  handleAcceptQueue: () => void

  // ─── Battle / game ─────────────────────────────────────────────
  game: GameState
  battleKind: BattleKind
  isRankedBattle: boolean
  isLocalPassBattle: boolean
  battleSessionActive: boolean
  serverBattleActive: boolean
  hasBattleInProgress: boolean
  gameInProgress: boolean
  selectedAttacker: number | null
  enemyTurnActive: boolean
  enemyTurnLabel: string
  battleIntroVisible: boolean
  rewardOverlayVisible: boolean
  setRewardOverlayVisible: (value: boolean) => void
  damagedSlots: Set<string>
  opponentDisconnected: boolean
  disconnectGraceMs: number
  preferredMode: GameMode
  setPreferredMode: React.Dispatch<React.SetStateAction<GameMode>>
  aiDifficultySetting: 'auto' | AIDifficulty
  resolvedAIDifficulty: AIDifficulty
  activePlayer: GameState['player']
  defendingPlayer: GameState['player']
  isMyTurn: boolean
  defenderHasGuard: boolean
  activeBoardHasOpenLane: boolean
  startMatch: (mode?: GameMode, enemyName?: string, overrideDeckConfig?: DeckConfig) => void
  handleQuickBattle: (name: string, config: DeckConfig) => void
  handleResumeBattle: () => void
  handleAbandonBattle: () => void
  handleLeaveBattle: () => void
  handleModeChange: (mode: GameMode) => void
  handleAIDifficultyChange: (level: 'auto' | AIDifficulty) => void
  handlePlayCard: (index: number) => void
  handleSelectAttacker: (index: number) => void
  handleAttackTarget: (target: number | 'hero') => void
  handleBurst: () => void
  handleEndTurn: () => void
  handleSendEmote: (emote: string) => void

  // ─── Social ────────────────────────────────────────────────────
  friends: SocialFriend[]
  onlineFriendIds: Set<string>
  outgoingChallenge: OutgoingChallenge | null
  incomingChallenge: IncomingChallenge | null
  challengeStatus: string
  socialLoading: boolean
  socialStatus: string
  friendUsernameInput: string
  setFriendUsernameInput: (value: string) => void
  clan: SocialClan | null
  clanForm: { name: string; tag: string; inviteCode: string }
  setClanForm: React.Dispatch<React.SetStateAction<{ name: string; tag: string; inviteCode: string }>>
  handleAddFriend: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleRemoveFriend: (friendAccountId: string, displayName: string) => Promise<void>
  handleChallengeFriend: (friend: SocialFriend) => void
  handleAcceptChallenge: () => void
  handleDeclineChallenge: () => void
  handleCancelOutgoingChallenge: () => void
  handleCreateClan: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleJoinClan: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleLeaveClan: () => Promise<void>

  // ─── Trading ───────────────────────────────────────────────────
  trades: Trade[]
  tradeStatus: string
  tradeForm: { toAccountId: string; offer: TradeItem[]; request: TradeItem[] }
  setTradeForm: React.Dispatch<
    React.SetStateAction<{ toAccountId: string; offer: TradeItem[]; request: TradeItem[] }>
  >
  tradePickerDraft: { side: 'offer' | 'request'; cardId: string; qty: number }
  setTradePickerDraft: React.Dispatch<
    React.SetStateAction<{ side: 'offer' | 'request'; cardId: string; qty: number }>
  >
  tradeSubmitting: boolean
  handleProposeTrade: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleTradeAction: (tradeId: string, action: 'accept' | 'reject' | 'cancel') => Promise<void>
  addTradeChip: () => void
  removeTradeChip: (side: 'offer' | 'request', cardId: string) => void
  formatCountdown: (targetMs: number) => string

  // ─── Settings / admin / complaints ─────────────────────────────
  complaintForm: ComplaintFormState
  setComplaintForm: React.Dispatch<React.SetStateAction<ComplaintFormState>>
  complaintStatus: string
  handleSubmitComplaint: (event: FormEvent<HTMLFormElement>) => Promise<void>
  adminOverview: AdminOverview | null
  adminLoading: boolean
  adminError: string
  adminUsers: AdminUser[]
  adminUsersLoading: boolean
  adminUserSearch: string
  setAdminUserSearch: (value: string) => void
  adminAudit: AdminAuditEntry[]
  adminAuditFilter: string
  setAdminAuditFilter: (value: string) => void
  adminAuditExpandedId: string | null
  setAdminAuditExpandedId: (value: string | null) => void
  adminSettings: AdminSettings
  setAdminSettings: React.Dispatch<React.SetStateAction<AdminSettings>>
  transferForm: { targetAccountId: string; password: string }
  setTransferForm: React.Dispatch<React.SetStateAction<{ targetAccountId: string; password: string }>>
  transferStatus: string
  refreshAdminOverview: () => Promise<void>
  refreshAdminUsers: (searchTerm?: string) => Promise<void>
  refreshAdminAudit: () => Promise<void>
  handleSetUserRole: (target: AdminUser, newRole: 'admin' | 'user') => Promise<void>
  handleTransferOwnership: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleSaveAdminSettings: () => Promise<void>
  handleUpdateComplaintStatus: (id: string, status: string) => Promise<void>
}

export const AppContext = createContext<AppContextValue | null>(null)
