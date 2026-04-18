import { useApp } from '../useApp'
import type { AppContextValue } from '../AppContext'

/**
 * Friends, clan, trades, challenges, presence.
 *
 * See REFACTOR_PLAN.md Phase 1A — `src/contexts/SocialContext.tsx`.
 */
export type SocialContextValue = Pick<
  AppContextValue,
  | 'friends'
  | 'onlineFriendIds'
  | 'outgoingChallenge'
  | 'incomingChallenge'
  | 'challengeStatus'
  | 'socialLoading'
  | 'socialStatus'
  | 'friendUsernameInput'
  | 'setFriendUsernameInput'
  | 'clan'
  | 'clanForm'
  | 'setClanForm'
  | 'handleAddFriend'
  | 'handleRemoveFriend'
  | 'handleChallengeFriend'
  | 'handleAcceptChallenge'
  | 'handleDeclineChallenge'
  | 'handleCancelOutgoingChallenge'
  | 'handleCreateClan'
  | 'handleJoinClan'
  | 'handleLeaveClan'
  | 'trades'
  | 'tradeStatus'
  | 'tradeForm'
  | 'setTradeForm'
  | 'tradePickerDraft'
  | 'setTradePickerDraft'
  | 'tradeSubmitting'
  | 'handleProposeTrade'
  | 'handleTradeAction'
  | 'addTradeChip'
  | 'removeTradeChip'
  | 'formatCountdown'
>

export function useSocial(): SocialContextValue {
  return useApp()
}
