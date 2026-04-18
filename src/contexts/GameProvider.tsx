import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import {
  createGame,
  DEFAULT_DECK_CONFIG,
  type AIDifficulty,
  type DeckConfig,
  type GameMode,
  type GameState,
} from '../game'
import type { BattleKind, InspectedCard } from '../types'
import { STORAGE_KEYS } from '../constants'
import { makeLobbyCode, readStoredValue } from '../utils'

/**
 * Phase 1C — real GameContext.
 *
 * Owns the active battle/game state and presentation flags that AppShell
 * handlers and effects read from and write to. Lives ABOVE `AppShell` in
 * the React tree so screens can read game state via `useGame()` without
 * going through the AppContext mega-bag.
 *
 * Refs (`enemyTurnTimers`, `prevBoardRef`, `battleStartedRef`,
 * `battleIntroTimerRef`, `longPressTimerRef`, `longPressTriggeredRef`,
 * `resolvedMatchKeyRef`) intentionally remain in `AppShell` because they
 * are tightly coupled to the handler/effect closures that own them, and
 * useRef identity is already stable across renders.
 *
 * Handlers (`startMatch`, `handlePlayCard`, `handleSelectAttacker`,
 * `handleAttackTarget`, `handleBurst`, `handleEndTurn`, `handleResume-/
 * Abandon-/LeaveBattle`, `handleModeChange`, `handleAIDifficultyChange`,
 * `handleQuickBattle`) stay in `AppShell` because they need cross-cutting
 * deps (socketClientRef, authToken, serverProfile, askConfirm,
 * setToastMessage, deckConfig from ProfileProvider, sendAnalytics,
 * playSound). AppShell consumes the setters exposed by `useGameState()`
 * to drive engine transitions and socket-driven payloads.
 */

export type AIDifficultySetting = 'auto' | AIDifficulty

export type GameStateValue = {
  preferredMode: GameMode
  setPreferredMode: Dispatch<SetStateAction<GameMode>>
  aiDifficultySetting: AIDifficultySetting
  setAiDifficultySetting: Dispatch<SetStateAction<AIDifficultySetting>>
  setLobbyCode: Dispatch<SetStateAction<string>>
  game: GameState
  setGame: Dispatch<SetStateAction<GameState>>
  selectedAttacker: number | null
  setSelectedAttacker: Dispatch<SetStateAction<number | null>>
  battleKind: BattleKind
  setBattleKind: Dispatch<SetStateAction<BattleKind>>
  battleSessionActive: boolean
  setBattleSessionActive: Dispatch<SetStateAction<boolean>>
  serverBattleActive: boolean
  setServerBattleActive: Dispatch<SetStateAction<boolean>>
  enemyTurnActive: boolean
  setEnemyTurnActive: Dispatch<SetStateAction<boolean>>
  enemyTurnLabel: string
  setEnemyTurnLabel: Dispatch<SetStateAction<string>>
  opponentDisconnected: boolean
  setOpponentDisconnected: Dispatch<SetStateAction<boolean>>
  disconnectGraceMs: number
  setDisconnectGraceMs: Dispatch<SetStateAction<number>>
  battleIntroVisible: boolean
  setBattleIntroVisible: Dispatch<SetStateAction<boolean>>
  damagedSlots: Set<string>
  setDamagedSlots: Dispatch<SetStateAction<Set<string>>>
  inspectedCard: InspectedCard | null
  setInspectedCard: Dispatch<SetStateAction<InspectedCard | null>>
}

const GameContext = createContext<GameStateValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const savedMode = readStoredValue<GameMode>(STORAGE_KEYS.mode, 'ai')
  const savedAIDifficulty = readStoredValue<AIDifficultySetting>(STORAGE_KEYS.aiDifficulty, 'auto')
  const savedDeckConfig = readStoredValue<DeckConfig>(STORAGE_KEYS.deck, DEFAULT_DECK_CONFIG)
  const initialAIDifficulty: AIDifficulty = savedAIDifficulty === 'auto' ? 'adept' : savedAIDifficulty

  const [preferredMode, setPreferredMode] = useState<GameMode>(savedMode)
  const [aiDifficultySetting, setAiDifficultySetting] = useState<AIDifficultySetting>(savedAIDifficulty)
  const [, setLobbyCode] = useState<string>(() => makeLobbyCode())
  const [game, setGame] = useState<GameState>(() =>
    createGame(savedMode, savedDeckConfig, undefined, savedMode === 'ai' ? initialAIDifficulty : 'legend'),
  )
  const [selectedAttacker, setSelectedAttacker] = useState<number | null>(null)
  const [battleKind, setBattleKind] = useState<BattleKind>(savedMode === 'duel' ? 'local' : 'ai')
  const [battleSessionActive, setBattleSessionActive] = useState(false)
  const [serverBattleActive, setServerBattleActive] = useState(false)
  const [enemyTurnActive, setEnemyTurnActive] = useState(false)
  const [enemyTurnLabel, setEnemyTurnLabel] = useState('')
  const [opponentDisconnected, setOpponentDisconnected] = useState(false)
  const [disconnectGraceMs, setDisconnectGraceMs] = useState(0)
  const [battleIntroVisible, setBattleIntroVisible] = useState(false)
  const [damagedSlots, setDamagedSlots] = useState<Set<string>>(() => new Set())
  const [inspectedCard, setInspectedCard] = useState<InspectedCard | null>(null)

  const value = useMemo<GameStateValue>(
    () => ({
      preferredMode,
      setPreferredMode,
      aiDifficultySetting,
      setAiDifficultySetting,
      setLobbyCode,
      game,
      setGame,
      selectedAttacker,
      setSelectedAttacker,
      battleKind,
      setBattleKind,
      battleSessionActive,
      setBattleSessionActive,
      serverBattleActive,
      setServerBattleActive,
      enemyTurnActive,
      setEnemyTurnActive,
      enemyTurnLabel,
      setEnemyTurnLabel,
      opponentDisconnected,
      setOpponentDisconnected,
      disconnectGraceMs,
      setDisconnectGraceMs,
      battleIntroVisible,
      setBattleIntroVisible,
      damagedSlots,
      setDamagedSlots,
      inspectedCard,
      setInspectedCard,
    }),
    [
      preferredMode,
      aiDifficultySetting,
      game,
      selectedAttacker,
      battleKind,
      battleSessionActive,
      serverBattleActive,
      enemyTurnActive,
      enemyTurnLabel,
      opponentDisconnected,
      disconnectGraceMs,
      battleIntroVisible,
      damagedSlots,
      inspectedCard,
    ],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

/**
 * Internal hook used by `AppShell` to read state AND setters. Screens should
 * use `useGame()` from `src/contexts/useGame.ts` instead, which exposes the
 * readonly slice plus the action handlers from AppShell.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useGameState(): GameStateValue {
  const ctx = useContext(GameContext)
  if (!ctx) {
    throw new Error('useGameState must be used inside <GameProvider>')
  }
  return ctx
}
