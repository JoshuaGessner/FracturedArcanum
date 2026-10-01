import type { GameState } from '../game'
import { UI_ASSETS } from '../constants'
import { InterfaceGlyph, RankBadge } from './AssetBadge'

type BattleIntroOverlayProps = {
  visible: boolean
  game: GameState
  playerRank: string
}

type IntroSideProps = {
  side: 'player' | 'enemy'
  role: string
  name: string
  rank: string
}

function IntroSide({ side, role, name, rank }: IntroSideProps) {
  return (
    <div className={`intro-side is-${side}`}>
      <span className="intro-crest" aria-hidden="true">
        <InterfaceGlyph name={side === 'player' ? 'crestPlayer' : 'crestEnemy'} />
      </span>
      <span className="intro-role">{role}</span>
      <strong className="intro-name">{name}</strong>
      <RankBadge rank={rank} className="rank-badge-inline intro-rank" />
    </div>
  )
}

/**
 * The versus moment before a match: two seats sweeping in from either side
 * of the screen in their own colours, the seal slamming between them. It is
 * the one beat every card game in the genre spends to say "this is a duel",
 * so it fills the screen rather than sitting in a modal box.
 */
export function BattleIntroOverlay({ visible, game, playerRank }: BattleIntroOverlayProps) {
  if (!visible || game.winner) return null
  const rivalRank = game.mode === 'ai' ? 'Silver' : playerRank
  return (
    <section className="queue-overlay intro-overlay" aria-label={`Battle starting against ${game.enemy.name}`}>
      <div className="intro-stage">
        <IntroSide side="player" role="Challenger" name={game.player.name} rank={playerRank} />
        <img className="intro-vs-art" src={UI_ASSETS.overlays.versus} alt="Versus" />
        <IntroSide side="enemy" role="Rival" name={game.enemy.name} rank={rivalRank} />
        <p className="intro-callout">
          {game.mode === 'ai' ? 'The arena gates open and the rune circle flares to life.' : 'Pass the device and prepare for the duel.'}
        </p>
      </div>
    </section>
  )
}
