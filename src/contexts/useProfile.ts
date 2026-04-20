import { useProfileState, type ProfileStateValue } from './ProfileProvider'
import { useAppShellContext, type AppShellContextValue } from '../AppShellContext'

/**
 * Player identity, decks, collection, cosmetics, daily reward, derived rank.
 *
 * Composes `useProfileState()` (real provider) + derived/handlers from
 * AppShellContext.
 */
export type ProfileContextValue = ProfileStateValue &
  Pick<
    AppShellContextValue,
    | 'serverProfile'
    | 'setServerProfile'
    | 'shards'
    | 'seasonRating'
    | 'record'
    | 'ownedThemes'
    | 'selectedTheme'
    | 'ownedCardBorders'
    | 'selectedCardBorder'
    | 'lastDailyClaim'
    | 'accountRole'
    | 'isAdminRole'
    | 'isOwnerRole'
    | 'rankLabel'
    | 'totalGames'
    | 'winRate'
    | 'rankProgress'
    | 'nextRankTarget'
    | 'nextRewardLabel'
    | 'todayKey'
    | 'canClaimDailyReward'
    | 'totalOwnedCards'
    | 'selectedDeckSize'
    | 'deckReady'
    | 'savedDecks'
    | 'activeDeckId'
    | 'handleCreateDeck'
    | 'handleRenameDeck'
    | 'handleDeleteDeck'
    | 'handleSelectDeck'
    | 'handleBreakdownCard'
    | 'handleDeckCount'
    | 'handleOpenPack'
    | 'handlePurchaseBorder'
    | 'handleSelectBorder'
    | 'handleEquipTheme'
    | 'handleClaimDailyReward'
  >

export function useProfile(): ProfileContextValue {
  const profile = useProfileState()
  const shell = useAppShellContext()
  return {
    ...profile,
    serverProfile: shell.serverProfile,
    setServerProfile: shell.setServerProfile,
    shards: shell.shards,
    seasonRating: shell.seasonRating,
    record: shell.record,
    ownedThemes: shell.ownedThemes,
    selectedTheme: shell.selectedTheme,
    ownedCardBorders: shell.ownedCardBorders,
    selectedCardBorder: shell.selectedCardBorder,
    lastDailyClaim: shell.lastDailyClaim,
    accountRole: shell.accountRole,
    isAdminRole: shell.isAdminRole,
    isOwnerRole: shell.isOwnerRole,
    rankLabel: shell.rankLabel,
    totalGames: shell.totalGames,
    winRate: shell.winRate,
    rankProgress: shell.rankProgress,
    nextRankTarget: shell.nextRankTarget,
    nextRewardLabel: shell.nextRewardLabel,
    todayKey: shell.todayKey,
    canClaimDailyReward: shell.canClaimDailyReward,
    totalOwnedCards: shell.totalOwnedCards,
    selectedDeckSize: shell.selectedDeckSize,
    deckReady: shell.deckReady,
    savedDecks: shell.savedDecks,
    activeDeckId: shell.activeDeckId,
    handleCreateDeck: shell.handleCreateDeck,
    handleRenameDeck: shell.handleRenameDeck,
    handleDeleteDeck: shell.handleDeleteDeck,
    handleSelectDeck: shell.handleSelectDeck,
    handleBreakdownCard: shell.handleBreakdownCard,
    handleDeckCount: shell.handleDeckCount,
    handleOpenPack: shell.handleOpenPack,
    handlePurchaseBorder: shell.handlePurchaseBorder,
    handleSelectBorder: shell.handleSelectBorder,
    handleEquipTheme: shell.handleEquipTheme,
    handleClaimDailyReward: shell.handleClaimDailyReward,
  }
}
