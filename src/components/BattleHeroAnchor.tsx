import type { ReactNode } from 'react'
import { UI_ASSETS } from '../constants'
import { InterfaceGlyph } from './AssetBadge'

type HeroMana = {
  mana: number
  maxMana: number
}

type HeroPiles = {
  hand: number
  deck: number
}

type BattleHeroAnchorProps = {
  side: 'player' | 'enemy'
  name: string
  health: number
  /** Show "You" / "Enemy". Only when the other seat is a role, not a person. */
  showSideLabel: boolean
  fx: 'damaged' | 'healed' | null
  lowHealth?: boolean
  /** The local player's mana. The enemy plaque does not show it. */
  mana?: HeroMana
  /** Cards in hand and in the deck — what an opponent can still do. */
  piles?: HeroPiles
  /**
   * Makes the whole plaque the strike target while an attacker is selected,
   * as in every card game where you swing at the hero's portrait.
   */
  onStrike?: () => void
  /** Floating damage and heal numbers over the health medallion. */
  healthPops?: ReactNode
}

const MAX_MANA_CRYSTALS = 10

/**
 * One of the mirrored hero plaques that bracket the board.
 *
 * A crest medallion, the name in the display face, then what the player
 * reads at a glance: piles on the enemy plaque, mana crystals with a large
 * count on the player's, and the blood medallion for health on both. Each
 * keeps its spoken label. Momentum lives on the Burst medallion in the action
 * dock, the one place it is spent.
 */
export function BattleHeroAnchor({
  side,
  name,
  health,
  showSideLabel,
  fx,
  lowHealth = false,
  mana,
  piles,
  onStrike,
  healthPops,
}: BattleHeroAnchorProps) {
  const className = [
    'battle-hero-anchor',
    side,
    fx === 'damaged' ? 'is-damaged' : '',
    fx === 'healed' ? 'is-healed' : '',
    lowHealth ? 'is-low-hp' : '',
    onStrike ? 'is-strike-target' : '',
  ].filter(Boolean).join(' ')

  const body = (
    <>
      <span className="battle-hero-crest" aria-hidden="true">
        <InterfaceGlyph name={side === 'player' ? 'crestPlayer' : 'crestEnemy'} />
      </span>
      {showSideLabel && <span className="battle-hero-side">{side === 'player' ? 'You' : 'Enemy'}</span>}
      <strong className="battle-hero-name">{name}</strong>
      {piles && (
        <span className="battle-hero-piles">
          <span className="battle-hero-pile" aria-label={`${piles.hand} cards in hand`}>
            <InterfaceGlyph name="card" />
            <span aria-hidden="true">{piles.hand}</span>
          </span>
          <span className="battle-hero-pile is-deck" aria-label={`${piles.deck} cards in deck`}>
            <InterfaceGlyph name="questDeck" />
            <span aria-hidden="true">{piles.deck}</span>
          </span>
        </span>
      )}
      {mana && (
        <span className="battle-hero-resource mana" aria-label={`Mana ${mana.mana} of ${mana.maxMana}`}>
          <span className="mana-crystals" aria-hidden="true">
            {Array.from({ length: Math.min(MAX_MANA_CRYSTALS, mana.maxMana) }, (_, index) => (
              <span key={index} className={`mana-crystal${index < mana.mana ? ' is-filled' : ''}`} />
            ))}
          </span>
          <span className="mana-count" aria-hidden="true">
            <strong>{mana.mana}</strong>/{mana.maxMana}
          </span>
        </span>
      )}
      <span className="battle-hero-hp" aria-label={`Health ${health}`}>
        <span>{health}</span>
        {healthPops}
      </span>
      {fx === 'damaged' && (
        <img className="hero-fx-overlay hero-fx-cracks" src={UI_ASSETS.overlays.heroCracks} alt="" aria-hidden="true" />
      )}
      {fx === 'healed' && (
        <img className="hero-fx-overlay hero-fx-halo" src={UI_ASSETS.overlays.heroHalo} alt="" aria-hidden="true" />
      )}
    </>
  )

  if (onStrike) {
    return (
      <button
        type="button"
        className={className}
        data-hero-target={side}
        onClick={onStrike}
        aria-label={`Strike ${name}, ${health} health`}
      >
        {body}
      </button>
    )
  }

  return (
    <div className={className} data-hero-target={side}>
      {body}
    </div>
  )
}
