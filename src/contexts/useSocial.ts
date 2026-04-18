import { useSocialState, type SocialStateValue } from './SocialProvider'
import { useAppShellContext, type AppShellContextValue } from '../AppShellContext'

/**
 * Friends, clan, trades, challenges, presence.
 *
 * Composes `useSocialState()` (real provider) + handlers from AppShellContext.
 */
export type SocialContextValue = SocialStateValue &
  Pick<
    AppShellContextValue,
    | 'handleAddFriend'
    | 'handleRemoveFriend'
    | 'handleChallengeFriend'
    | 'handleAcceptChallenge'
    | 'handleDeclineChallenge'
    | 'handleCancelOutgoingChallenge'
    | 'handleCreateClan'
    | 'handleJoinClan'
    | 'handleLeaveClan'
    | 'handleProposeTrade'
    | 'handleTradeAction'
    | 'addTradeChip'
    | 'removeTradeChip'
    | 'formatCountdown'
  >

export function useSocial(): SocialContextValue {
  const social = useSocialState()
  const shell = useAppShellContext()
  return {
    ...social,
    handleAddFriend: shell.handleAddFriend,
    handleRemoveFriend: shell.handleRemoveFriend,
    handleChallengeFriend: shell.handleChallengeFriend,
    handleAcceptChallenge: shell.handleAcceptChallenge,
    handleDeclineChallenge: shell.handleDeclineChallenge,
    handleCancelOutgoingChallenge: shell.handleCancelOutgoingChallenge,
    handleCreateClan: shell.handleCreateClan,
    handleJoinClan: shell.handleJoinClan,
    handleLeaveClan: shell.handleLeaveClan,
    handleProposeTrade: shell.handleProposeTrade,
    handleTradeAction: shell.handleTradeAction,
    addTradeChip: shell.addTradeChip,
    removeTradeChip: shell.removeTradeChip,
    formatCountdown: shell.formatCountdown,
  }
}
