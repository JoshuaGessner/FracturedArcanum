import type { GameMode, GameState } from '../game'
import type { BattleKind } from '../types'

type RewardOverlayProps = {
  visible: boolean
  winner: GameState['winner']
  isRankedBattle: boolean
  battleKind: BattleKind
  rankLabel: string
  streak: number
  mode: GameMode
  onClaim: () => void
  onQueueAgain: (mode: GameMode) => void
}

export function RewardOverlay({
  visible,
  winner,
  isRankedBattle,
  battleKind,
  rankLabel,
  streak,
  mode,
  onClaim,
  onQueueAgain,
}: RewardOverlayProps) {
  if (!visible || winner !== 'player') return null
  return (
    <section className="queue-overlay reward-overlay" aria-live="polite">
      <div className="queue-modal reward-modal section-card">
        <img className="reward-art" src="/generated/ui/reward-chest.svg" alt="Reward chest" />
        <p className="eyebrow">Victory Rewards</p>
        <h2>
          {isRankedBattle
            ? 'Ranked Victory Secured'
            : battleKind === 'local'
              ? 'Casual Duel Won'
              : 'Season Chest Unlocked'}
        </h2>
        <div className="badges">
          <span className="badge">
            {isRankedBattle ? '+25 Rating' : battleKind === 'local' ? 'Casual Match' : '+30 Shards'}
          </span>
          <span className="badge">+30 Shards</span>
          <span className="badge">Win Streak {streak}</span>
          <span className="badge">League {rankLabel}</span>
        </div>
        <p className="note">
          {isRankedBattle
            ? 'Your crew celebrates another climb up the live ladder.'
            : battleKind === 'local'
              ? 'Great pass-and-play win. Queue online when you want leaderboard progress.'
              : 'Your crew celebrates a strong practice match.'}
        </p>
        <div className="controls">
          <button className="primary" onClick={onClaim}>
            Claim Rewards
          </button>
          <button className="ghost" onClick={() => onQueueAgain(mode)}>
            Queue Again
          </button>
        </div>
      </div>
    </section>
  )
}
