import type { ReactNode } from 'react'
import { EFFECT_LABELS } from '../constants'
import { cardArtPath, handleCardArtError } from '../utils'
import { EffectBadge, RarityBadge, TribeSigil } from './AssetBadge'

export type CardFaceData = {
  id: string
  name: string
  cost: number
  attack: number
  health: number
  rarity: string
  tribe: string
  effect?: string | null
  /** Rules text. Printed on the plate only by the inspect variant. */
  text?: string
}

export type CardFaceVariant = 'hand' | 'board' | 'collection' | 'inspect' | 'reveal'

type CardFaceProps = {
  card: CardFaceData
  variant: CardFaceVariant
  /** Board units: health after damage, shown against the printed value. */
  currentHealth?: number
  /** A short line under the name — "Duplicate", "Owned 2". */
  caption?: ReactNode
  /** Lazy-load the art. Off for the one card a player is looking at. */
  lazy?: boolean
  /**
   * The printed stats, for a unit whose attack or health an effect changed.
   * Above base reads green, damaged health reads red — the genre's colours.
   */
  base?: { attack: number; health: number }
}

/**
 * The one card face: hand, board, collection, inspect and pack reveals all
 * draw this, so a card reads identically wherever it appears.
 *
 * Layout grammar, from the battle-readability rules in REFACTOR_PLAN.md: cost
 * top-left, keyword seal top-right, art as the centre, attack and health at
 * the bottom corners, rarity gem between them. The stats sit on generated
 * emblems (mana crystal, crossed swords, blood drop) that differ in silhouette,
 * so they read without colour.
 *
 * It fills its host absolutely and sizes everything in container units, so
 * the host keeps owning layout — the hand rail's height arithmetic, the
 * collection grid, the ceremony fan — and the face scales to whatever box it
 * is given. The host keeps its own `.card-frame` as a direct child, because
 * the cosmetic frame rules select `> .card-frame`.
 */
export function CardFace({ card, variant, currentHealth, caption, lazy = true, base }: CardFaceProps) {
  const health = currentHealth ?? card.health
  const damaged = currentHealth !== undefined && currentHealth < card.health
  const attackBuffed = base !== undefined && card.attack > base.attack
  const healthBuffed = !damaged && base !== undefined && health > base.health
  // Two sibling layers around the host's own `.card-frame` (z-index 4): art
  // and plate below it, gems and the rarity hairline above it. Each layer is a
  // size container, and a container is its own stacking context, so a single
  // layer could not put the gems over a cosmetic finish — and the frame
  // contract in cards.css says a finish must never tint them.
  return (
    <>
      <span className={`cf cf-${variant} cf-rarity-${card.rarity}`}>
        <span className="cf-art" aria-hidden="true">
          <img
            className="card-illustration"
            src={cardArtPath(card.id)}
            alt=""
            loading={lazy ? 'lazy' : 'eager'}
            onError={handleCardArtError}
            draggable={false}
          />
        </span>
        <span className="cf-plate">
          <TribeSigil tribe={card.tribe} className="cf-tribe" />
          <span className="cf-name">
            <span className="cf-name-text">{card.name}</span>
          </span>
          {/* The keyword, so a fanned hand or a collection page says what a
              card does without opening it. Hidden by container query when the
              face is too small to letter it legibly. */}
          {card.effect && variant !== 'inspect' && variant !== 'board' && (
            <span className="cf-keyword">{EFFECT_LABELS[card.effect] ?? card.effect}</span>
          )}
          {variant === 'inspect' && card.text && <span className="cf-rules">{card.text}</span>}
          {caption && <span className="cf-caption">{caption}</span>}
        </span>
      </span>
      <span className={`cf-gems cf-${variant} cf-rarity-${card.rarity}`}>
        <span className="cf-cost" aria-label={`Costs ${card.cost} mana`}><span>{card.cost}</span></span>
        {card.effect && <EffectBadge effect={card.effect} compact iconOnly className="cf-seal" />}
        <span className={`cf-stat cf-attack${attackBuffed ? ' is-buffed' : ''}`} aria-label={`${card.attack} attack`}>
          <span>{card.attack}</span>
        </span>
        <RarityBadge rarity={card.rarity} iconOnly className="cf-rarity" />
        <span className={`cf-stat cf-health${damaged ? ' is-damaged' : ''}${healthBuffed ? ' is-buffed' : ''}`} aria-label={`${health} health`}>
          <span>{health}</span>
        </span>
      </span>
    </>
  )
}
