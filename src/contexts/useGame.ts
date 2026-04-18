import { useApp } from '../useApp'
import type { AppContextValue } from '../AppContext'

/**
 * Battle state, game actions, AI animation, deck config (shared with profile).
 *
 * See REFACTOR_PLAN.md Phase 1A — `src/contexts/GameContext.tsx`.
 */
export type GameContextValue = Pick<
  AppContextValue,
  | 'game'
  | 'selectedAttacker'
  | 'enemyTurnActive'
  | 'enemyTurnLabel'
  | 'preferredMode'
  | 'setPreferredMode'
  | 'aiDifficultySetting'
  | 'resolvedAIDifficulty'
  | 'battleKind'
  | 'battleSessionActive'
  | 'serverBattleActive'
  | 'opponentDisconnected'
  | 'disconnectGraceMs'
  | 'battleIntroVisible'
  | 'rewardOverlayVisible'
  | 'setRewardOverlayVisible'
  | 'damagedSlots'
  | 'inspectedCard'
  | 'setInspectedCard'
  | 'deckConfig'
  | 'setDeckConfig'
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
  return useApp()
}
