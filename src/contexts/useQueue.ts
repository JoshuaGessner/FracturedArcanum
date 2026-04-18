import { useQueueState, type QueueStateValue } from './QueueProvider'
import { useAppShellContext, type AppShellContextValue } from '../AppShellContext'

/**
 * Matchmaking queue, leaderboard, live presence.
 *
 * Composes `useQueueState()` (real provider) + queue handlers from
 * AppShellContext.
 */
export type QueueContextValue = QueueStateValue &
  Pick<AppShellContextValue, 'handleStartQueue' | 'handleCancelQueue' | 'handleAcceptQueue'>

export function useQueue(): QueueContextValue {
  const queue = useQueueState()
  const shell = useAppShellContext()
  return {
    ...queue,
    handleStartQueue: shell.handleStartQueue,
    handleCancelQueue: shell.handleCancelQueue,
    handleAcceptQueue: shell.handleAcceptQueue,
  }
}
