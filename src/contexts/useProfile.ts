import { useProfileState, type ProfileStateValue } from './ProfileProvider'
import { usePlayerState, type PlayerStateValue } from './PlayerProvider'
import { useAppShellContext, type AppShellContextValue } from '../AppShellContext'

/**
 * Player identity, decks, collection, cosmetics, daily reward, derived rank.
 *
 * Three sources, each contributing what it owns:
 *
 *   - `useProfileState()` — client-side deck, collection and shop state.
 *   - `usePlayerState()` — the server-authoritative record and everything
 *     derived from it. Spread wholesale rather than listed field by field:
 *     all of it belongs to this slice, so naming each one would only create a
 *     second place to edit when a field is added.
 *   - `useAppShellContext()` — the handlers, which need deps from several
 *     providers at once and so still live in AppShell.
 */
export type ProfileContextValue = ProfileStateValue &
  PlayerStateValue &
  Pick<
    AppShellContextValue,
    | 'nextRewardLabel'
    | 'totalOwnedCards'
    | 'selectedDeckSize'
    | 'deckReady'
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
    | 'handleClaimQuestReward'
    | 'handleClaimQuestRewards'
  >

export function useProfile(): ProfileContextValue {
  const profile = useProfileState()
  const player = usePlayerState()
  const shell = useAppShellContext()
  return {
    ...profile,
    ...player,
    nextRewardLabel: shell.nextRewardLabel,
    totalOwnedCards: shell.totalOwnedCards,
    selectedDeckSize: shell.selectedDeckSize,
    deckReady: shell.deckReady,
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
    handleClaimQuestReward: shell.handleClaimQuestReward,
    handleClaimQuestRewards: shell.handleClaimQuestRewards,
  }
}
