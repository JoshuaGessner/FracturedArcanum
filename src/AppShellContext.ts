import { createContext, useContext, type FormEvent } from 'react'
import type { GameMode, AIDifficulty, DeckConfig, GameState } from './game'
import type { RewardBeat } from './components/RewardCinemaSequence'
import type {
  AdminAuditEntry,
  AdminOverview,
  AdminSettings,
  AdminUser,
  AppScreen,
  AuthScreen,
  CardBorder,
  ComplaintFormState,
  ConfirmOptions,
  ConfirmRequest,
  CosmeticTheme,
  InspectedCard,
  InstallPromptEvent,
  ServerProfile,
  SavedDeck,
  ToastEntry,
  ToastSeverity,
} from './types'

/**
 * Phase 1H — slim AppShellContext.
 *
 * After Phase 1C–1F extracted state into real providers (Game, Profile,
 * Social, Queue), the only things still owned by `AppShell` are:
 *
 *   - Auth + setup forms
 *   - Derived profile values (rank label, win rate, daily-claim flags…)
 *   - Cross-cutting handlers that span multiple providers
 *   - Navigation, toast, confirm dialog, PWA, sound, analytics
 *   - Admin / complaint surfaces
 *   - Derived game presentation (active player, turn predicates, etc.)
 *
 * Everything else lives in its dedicated provider. Slice hooks
 * (`useGame`, `useProfile`, `useSocial`, `useQueue`) compose the relevant
 * provider hook with this context.
 */
export type AppShellContextValue = {
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

  // ─── Derived profile (owned by AppShell, sourced from serverProfile) ──
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

  // ─── Deck/collection handlers + derived (state in ProfileProvider) ────
  selectedDeckSize: number
  deckReady: boolean
  savedDecks: SavedDeck[]
  activeDeckId: string | null
  handleCreateDeck: () => void
  handleRenameDeck: (deck: SavedDeck) => void
  handleDeleteDeck: (deck: SavedDeck) => void
  handleSelectDeck: (deck: SavedDeck) => void
  handleBreakdownCard: (cardId: string, qty: number) => void
  handleDeckCount: (cardId: string, delta: number) => void

  // ─── Cosmetics / shop handlers (state in ProfileProvider) ─────────────
  handleOpenPack: (packType: string) => Promise<void>
  handlePurchaseBorder: (borderId: CardBorder, cost: number) => void
  handleSelectBorder: (borderId: CardBorder) => void
  handleEquipTheme: (themeId: CosmeticTheme, cost: number) => void
  handleClaimDailyReward: () => void

  // ─── Navigation / UI shell ────────────────────────────────────────────
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
  consumeLongPressAction: () => boolean
  getLongPressProps: (card: InspectedCard) => Record<string, unknown>
  // ─── Phase 3W — Reward cinematics ─────────────────────────────────────
  cinemaSequence: RewardBeat[] | null
  presentRewardCinema: (beats: RewardBeat[]) => void
  dismissRewardCinema: () => void
  lastPackRefund: number
  setLastPackRefund: React.Dispatch<React.SetStateAction<number>>
  installPromptEvent: InstallPromptEvent | null
  handleInstallApp: () => Promise<void>
  swUpdateAvailable: boolean
  handleAcceptUpdate: () => void
  handleDismissUpdate: () => void
  soundEnabled: boolean
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>
  ambientEnabled: boolean
  setAmbientEnabled: React.Dispatch<React.SetStateAction<boolean>>
  analyticsConsent: boolean
  setAnalyticsConsent: React.Dispatch<React.SetStateAction<boolean>>
  visitorId: string

  // ─── Live service info ────────────────────────────────────────────────
  backendOnline: boolean
  dailyQuest: string
  featuredMode: string

  // ─── Queue handlers (state in QueueProvider) ──────────────────────────
  handleStartQueue: () => void
  handleCancelQueue: () => void
  handleAcceptQueue: () => void

  // ─── Battle handlers + derived (state in GameProvider) ────────────────
  isRankedBattle: boolean
  isLocalPassBattle: boolean
  hasBattleInProgress: boolean
  gameInProgress: boolean
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

  // ─── Social handlers (state in SocialProvider) ────────────────────────
  handleAddFriend: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleRemoveFriend: (friendAccountId: string, displayName: string) => Promise<void>
  handleChallengeFriend: (friend: import('./types').SocialFriend) => void
  handleAcceptChallenge: () => void
  handleDeclineChallenge: () => void
  handleCancelOutgoingChallenge: () => void
  handleCreateClan: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleJoinClan: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleLeaveClan: () => Promise<void>

  // ─── Trading handlers (state in SocialProvider) ───────────────────────
  handleProposeTrade: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleTradeAction: (tradeId: string, action: 'accept' | 'reject' | 'cancel') => Promise<void>
  addTradeChip: () => void
  removeTradeChip: (side: 'offer' | 'request', cardId: string) => void
  formatCountdown: (targetMs: number) => string

  // ─── Settings / admin / complaints ────────────────────────────────────
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

export const AppShellContext = createContext<AppShellContextValue | null>(null)

/** Read the current AppShell context. Throws if used outside the provider. */
export function useAppShellContext(): AppShellContextValue {
  const ctx = useContext(AppShellContext)
  if (!ctx) {
    throw new Error('useAppShellContext must be used within <AppShellContext.Provider>')
  }
  return ctx
}
