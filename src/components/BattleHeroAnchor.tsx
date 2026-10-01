import { UI_ASSETS } from '../constants'
import { InterfaceGlyph } from './AssetBadge'

type HeroResources = {
  momentum: number
  mana: number
  maxMana: number
}

type BattleHeroAnchorProps = {
  side: 'player' | 'enemy'
  name: string
  health: number
  /** Show "You" / "Enemy". Only when the other seat is a role, not a person. */
  showSideLabel: boolean
  fx: 'damaged' | 'healed' | null
  lowHealth?: boolean
  /** The local player's mana and momentum. The enemy plaque carries neither. */
  resources?: HeroResources
}

const MAX_MANA_CRYSTALS = 10

/**
 * One of the mirrored hero plaques that bracket the board.
 *
 * A crest medallion, the name in the display face, then the player's
 * resources in the order the HUD has always used — Momentum, Mana, Health —
 * as things rather than text: an orb that fills toward Burst, a row of
 * crystals, a blood medallion. Each keeps its spoken label.
 */
export function BattleHeroAnchor({ side, name, health, showSideLabel, fx, lowHealth = false, resources }: BattleHeroAnchorProps) {
  const className = [
    'battle-hero-anchor',
    side,
    fx === 'damaged' ? 'is-damaged' : '',
    fx === 'healed' ? 'is-healed' : '',
    lowHealth ? 'is-low-hp' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={className}>
      <span className="battle-hero-crest" aria-hidden="true">
        <InterfaceGlyph name={side === 'player' ? 'crestPlayer' : 'crestEnemy'} />
      </span>
      {showSideLabel && <span className="battle-hero-side">{side === 'player' ? 'You' : 'Enemy'}</span>}
      <strong className="battle-hero-name">{name}</strong>
      {resources && (
        <span
          className="battle-hero-resource momentum"
          aria-label={`Momentum ${resources.momentum} of 10`}
          style={{ '--momentum-fill': `${Math.min(10, resources.momentum) * 10}%` } as React.CSSProperties}
        >
          <span className="momentum-orb" aria-hidden="true">{resources.momentum}</span>
        </span>
      )}
      {resources && (
        <span className="battle-hero-resource mana" aria-label={`Mana ${resources.mana} of ${resources.maxMana}`}>
          <span className="mana-crystals" aria-hidden="true">
            {Array.from({ length: Math.min(MAX_MANA_CRYSTALS, resources.maxMana) }, (_, index) => (
              <span key={index} className={`mana-crystal${index < resources.mana ? ' is-filled' : ''}`} />
            ))}
          </span>
          <span className="mana-count" aria-hidden="true">{resources.mana}/{resources.maxMana}</span>
        </span>
      )}
      <span className="battle-hero-hp" aria-label={`Health ${health}`}>
        <span>{health}</span>
      </span>
      {fx === 'damaged' && (
        <img className="hero-fx-overlay hero-fx-cracks" src={UI_ASSETS.overlays.heroCracks} alt="" aria-hidden="true" />
      )}
      {fx === 'healed' && (
        <img className="hero-fx-overlay hero-fx-halo" src={UI_ASSETS.overlays.heroHalo} alt="" aria-hidden="true" />
      )}
    </div>
  )
}
