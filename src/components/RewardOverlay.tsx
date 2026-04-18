import type { GameMode, GameState } from '../game'
import type { BattleKind } from '../types'
import { getStreakTier } from '../utils'
import { RankBadge } from './AssetBadge'

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

  const streakTier = getStreakTier(streak)

  return (
    <section className="queue-overlay reward-overlay" aria-live="polite">
      <div className={`queue-modal reward-modal section-card reward-streak-${streakTier}`}>
        <img className="reward-banner-art" src="/generated/ui/overlay-victory.svg" alt="Victory banner" />
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
          <span className={`badge streak-badge streak-${streakTier}`}>Win Streak {streak}</span>
          <RankBadge rank={rankLabel} />
        </div>
        <p className="note season-framing">
          Season of Whispers • {isRankedBattle ? 'ladder momentum is building' : 'vault progress remains active'}
        </p>
        <p className="note">
          {isRankedBattle
            ? 'Your crew celebrates another climb up the live ladder.'
            : battleKind === 'local'
              ? 'Great pass-and-play win. Queue online when you want leaderboard progress.'
              : 'Your crew celebrates a strong practice match.'}
        </p>
        <div className="reward-summary-grid">
          <div className="reward-summary-tile">
            <span className="mini-text">Ladder standing</span>
            <strong>{rankLabel}</strong>
          </div>
          <div className="reward-summary-tile">
            <span className="mini-text">Streak heat</span>
            <strong>{streakTier === 'inferno' ? 'Inferno' : streakTier === 'ember' ? 'Burning' : 'Steady'}</strong>
          </div>
          <div className="reward-summary-tile">
            <span className="mini-text">Claim reward</span>
            <strong>{isRankedBattle ? 'Rating + chest' : 'Chest secured'}</strong>
          </div>
        </div>
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
