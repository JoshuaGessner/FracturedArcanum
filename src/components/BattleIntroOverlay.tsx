import type { GameState } from '../game'

type BattleIntroOverlayProps = {
  visible: boolean
  game: GameState
}

export function BattleIntroOverlay({ visible, game }: BattleIntroOverlayProps) {
  if (!visible || game.winner) return null
  return (
    <section className="queue-overlay intro-overlay" aria-live="polite">
      <div className="queue-modal intro-modal section-card">
        <p className="eyebrow">Fractured Arcanum Battle Intro</p>
        <h2>
          {game.player.name} vs {game.enemy.name}
        </h2>
        <p className="note">
          {game.mode === 'ai' ? 'The arena gates open.' : 'Pass the device and prepare for the duel.'}
        </p>
      </div>
    </section>
  )
}
