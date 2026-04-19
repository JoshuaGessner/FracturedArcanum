import type { GameState } from '../game'
import { RankBadge } from './AssetBadge'

type BattleIntroOverlayProps = {
  visible: boolean
  game: GameState
  playerRank: string
}

export function BattleIntroOverlay({ visible, game, playerRank }: BattleIntroOverlayProps) {
  if (!visible || game.winner) return null
  const rivalRank = game.mode === 'ai' ? 'Silver' : playerRank
  return (
    <section className="queue-overlay intro-overlay" aria-label={`Battle starting against ${game.enemy.name}`}>
      <div className="queue-modal intro-modal section-card">
        <p className="eyebrow">Arena Clash</p>
        <div className="intro-versus-grid">
          <div className="intro-side intro-side-card">
            <span className="eyebrow">Challenger</span>
            <strong>{game.player.name}</strong>
            <RankBadge rank={playerRank} className="rank-badge-inline" />
          </div>
          <img className="intro-vs-art" src="/generated/ui/overlay-vs.svg" alt="Versus" />
          <div className="intro-side intro-side-card">
            <span className="eyebrow">Rival</span>
            <strong>{game.enemy.name}</strong>
            <RankBadge rank={rivalRank} className="rank-badge-inline" />
          </div>
        </div>
        <p className="note intro-callout">
          {game.mode === 'ai' ? 'The arena gates open and the rune circle flares to life.' : 'Pass the device and prepare for the duel.'}
        </p>
      </div>
    </section>
  )
}
