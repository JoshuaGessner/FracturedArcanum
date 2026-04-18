import { useApp } from '../useApp'
import type { AppContextValue } from '../AppContext'

/**
 * Matchmaking queue, leaderboard, live presence.
 *
 * See REFACTOR_PLAN.md Phase 1A — `src/contexts/QueueContext.tsx`.
 */
export type QueueContextValue = Pick<
  AppContextValue,
  | 'queueState'
  | 'queueSeconds'
  | 'queuedOpponent'
  | 'queuePresence'
  | 'queueSearchStatus'
  | 'liveQueueLabel'
  | 'leaderboardEntries'
  | 'handleStartQueue'
  | 'handleCancelQueue'
  | 'handleAcceptQueue'
>

export function useQueue(): QueueContextValue {
  return useApp()
}
