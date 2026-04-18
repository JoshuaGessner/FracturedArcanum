import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type {
  LeaderboardEntry,
  OpponentProfile,
  QueuePresence,
  QueueSearchStatus,
  QueueState,
} from '../types'

/**
 * Phase 1F — real QueueContext.
 *
 * Owns matchmaking state (queue status, opponent, search progress, leaderboard
 * cache) plus the 1Hz countdown timer. Lives ABOVE `AppShell` in the React
 * tree so screens can read queue state via `useQueue()` without going through
 * the AppContext mega-bag.
 *
 * Handlers (`handleStartQueue`, `handleCancelQueue`, etc.) stay in `AppShell`
 * because they need cross-cutting AppShell-owned deps (socketRef, toast,
 * deckConfig, navigation, analytics). AppShell consumes the setters exposed
 * by `useQueueState()` to drive socket-driven state changes.
 */

export type QueueStateValue = {
  queueState: QueueState
  setQueueState: Dispatch<SetStateAction<QueueState>>
  queueSeconds: number
  setQueueSeconds: Dispatch<SetStateAction<number>>
  queuedOpponent: OpponentProfile | null
  setQueuedOpponent: Dispatch<SetStateAction<OpponentProfile | null>>
  queuePresence: QueuePresence
  setQueuePresence: Dispatch<SetStateAction<QueuePresence>>
  queueSearchStatus: QueueSearchStatus
  setQueueSearchStatus: Dispatch<SetStateAction<QueueSearchStatus>>
  leaderboardEntries: LeaderboardEntry[]
  setLeaderboardEntries: Dispatch<SetStateAction<LeaderboardEntry[]>>
  liveQueueLabel: string
}

const QueueContext = createContext<QueueStateValue | null>(null)

const INITIAL_PRESENCE: QueuePresence = {
  queueSize: 0,
  connectedPlayers: 0,
  rankedAvailable: false,
  updatedAt: '',
}

const INITIAL_SEARCH: QueueSearchStatus = {
  position: 1,
  queueSize: 0,
  connectedPlayers: 0,
  waitSeconds: 0,
  estimatedWaitSeconds: 10,
  ratingWindow: 150,
}

export function QueueProvider({ children }: { children: ReactNode }) {
  const [queueState, setQueueState] = useState<QueueState>('idle')
  const [queueSeconds, setQueueSeconds] = useState(0)
  const [queuedOpponent, setQueuedOpponent] = useState<OpponentProfile | null>(null)
  const [queuePresence, setQueuePresence] = useState<QueuePresence>(INITIAL_PRESENCE)
  const [queueSearchStatus, setQueueSearchStatus] = useState<QueueSearchStatus>(INITIAL_SEARCH)
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([])

  // 1Hz countdown while searching. Self-contained — no external deps beyond
  // queueState — so it lives in the provider rather than AppShell.
  useEffect(() => {
    if (queueState !== 'searching') {
      return undefined
    }
    const tick = window.setInterval(() => {
      setQueueSeconds((seconds) => seconds + 1)
    }, 1000)
    return () => {
      window.clearInterval(tick)
    }
  }, [queueState])

  const liveQueueLabel = queuePresence.rankedAvailable
    ? 'Live opponents ready'
    : 'Waiting for challengers'

  const value = useMemo<QueueStateValue>(
    () => ({
      queueState,
      setQueueState,
      queueSeconds,
      setQueueSeconds,
      queuedOpponent,
      setQueuedOpponent,
      queuePresence,
      setQueuePresence,
      queueSearchStatus,
      setQueueSearchStatus,
      leaderboardEntries,
      setLeaderboardEntries,
      liveQueueLabel,
    }),
    [
      queueState,
      queueSeconds,
      queuedOpponent,
      queuePresence,
      queueSearchStatus,
      leaderboardEntries,
      liveQueueLabel,
    ],
  )

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>
}

/**
 * Internal hook used by `AppShell` to read state AND setters. Screens should
 * use `useQueue()` from `src/contexts/useQueue.ts` instead, which exposes
 * only the readonly slice plus the action handlers from AppShell.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useQueueState(): QueueStateValue {
  const ctx = useContext(QueueContext)
  if (!ctx) {
    throw new Error('useQueueState must be used inside <QueueProvider>')
  }
  return ctx
}
