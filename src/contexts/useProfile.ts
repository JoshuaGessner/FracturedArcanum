import { useApp } from '../useApp'
import type { AppContextValue } from '../AppContext'

/**
 * Player identity, decks, collection, cosmetics, daily reward, derived rank.
 *
 * See REFACTOR_PLAN.md Phase 1A — `src/contexts/ProfileContext.tsx`.
 *
 * Note: `deckConfig` / `setDeckConfig` are deliberately also exposed here
 * (in addition to `useGame`) because the deck builder lives in the profile
 * surface but the game engine consumes the same value. When the real
 * provider lands, ProfileContext will own the state and GameContext will
 * read it.
 */
export type ProfileContextValue = Pick<
  AppContextValue,
  | 'serverProfile'
  | 'setServerProfile'
  | 'runes'
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
  | 'collection'
  | 'setCollection'
  | 'deckConfig'
  | 'setDeckConfig'
  | 'selectedDeckSize'
  | 'deckReady'
  | 'savedDecks'
  | 'activeDeckId'
  | 'builderFilter'
  | 'setBuilderFilter'
  | 'pendingBreakdown'
  | 'setPendingBreakdown'
  | 'handleCreateDeck'
  | 'handleRenameDeck'
  | 'handleDeleteDeck'
  | 'handleSelectDeck'
  | 'handleBreakdownCard'
  | 'handleDeckCount'
  | 'packOffers'
  | 'openedPackCards'
  | 'packOpening'
  | 'handleOpenPack'
  | 'handlePurchaseBorder'
  | 'handleSelectBorder'
  | 'handleEquipTheme'
  | 'handleClaimDailyReward'
>

export function useProfile(): ProfileContextValue {
  return useApp()
}
