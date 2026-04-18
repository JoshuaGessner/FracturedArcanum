import { useGameState, type GameStateValue } from './GameProvider'
import { useProfileState, type ProfileStateValue } from './ProfileProvider'
import { useAppShellContext, type AppShellContextValue } from '../AppShellContext'

/**
 * Battle state, game actions, AI animation, deck config (shared with profile).
 *
 * Composes `useGameState()` (real provider) + `deckConfig`/`setDeckConfig`
 * from `useProfileState()` + battle handlers/derived from AppShellContext.
 */
export type GameContextValue = GameStateValue &
  Pick<ProfileStateValue, 'deckConfig' | 'setDeckConfig'> &
  Pick<
    AppShellContextValue,
    | 'resolvedAIDifficulty'
    | 'isRankedBattle'
    | 'isLocalPassBattle'
    | 'hasBattleInProgress'
    | 'gameInProgress'
    | 'activePlayer'
    | 'defendingPlayer'
    | 'isMyTurn'
    | 'defenderHasGuard'
    | 'activeBoardHasOpenLane'
    | 'startMatch'
    | 'handleQuickBattle'
    | 'handleResumeBattle'
    | 'handleAbandonBattle'
    | 'handleLeaveBattle'
    | 'handleModeChange'
    | 'handleAIDifficultyChange'
    | 'handlePlayCard'
    | 'handleSelectAttacker'
    | 'handleAttackTarget'
    | 'handleBurst'
    | 'handleEndTurn'
    | 'consumeLongPressAction'
    | 'getLongPressProps'
  >

export function useGame(): GameContextValue {
  const game = useGameState()
  const { deckConfig, setDeckConfig } = useProfileState()
  const shell = useAppShellContext()
  return {
    ...game,
    deckConfig,
    setDeckConfig,
    resolvedAIDifficulty: shell.resolvedAIDifficulty,
    isRankedBattle: shell.isRankedBattle,
    isLocalPassBattle: shell.isLocalPassBattle,
    hasBattleInProgress: shell.hasBattleInProgress,
    gameInProgress: shell.gameInProgress,
    activePlayer: shell.activePlayer,
    defendingPlayer: shell.defendingPlayer,
    isMyTurn: shell.isMyTurn,
    defenderHasGuard: shell.defenderHasGuard,
    activeBoardHasOpenLane: shell.activeBoardHasOpenLane,
    startMatch: shell.startMatch,
    handleQuickBattle: shell.handleQuickBattle,
    handleResumeBattle: shell.handleResumeBattle,
    handleAbandonBattle: shell.handleAbandonBattle,
    handleLeaveBattle: shell.handleLeaveBattle,
    handleModeChange: shell.handleModeChange,
    handleAIDifficultyChange: shell.handleAIDifficultyChange,
    handlePlayCard: shell.handlePlayCard,
    handleSelectAttacker: shell.handleSelectAttacker,
    handleAttackTarget: shell.handleAttackTarget,
    handleBurst: shell.handleBurst,
    handleEndTurn: shell.handleEndTurn,
    consumeLongPressAction: shell.consumeLongPressAction,
    getLongPressProps: shell.getLongPressProps,
  }
}
