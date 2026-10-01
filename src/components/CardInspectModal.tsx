import { useEffect, useRef } from 'react'
import type { InspectedCard } from '../types'
import { EFFECT_DESCRIPTIONS } from '../constants'
import { RARITY_COLORS } from '../game'
import { EffectBadge, RarityBadge, TribeSigil } from './AssetBadge'
import { CardFace } from './CardFace'

type CardInspectModalProps = {
  card: InspectedCard | null
  onClose: () => void
}

export function CardInspectModal({ card, onClose }: CardInspectModalProps) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!card) return
    dialogRef.current?.focus()
  }, [card])

  if (!card) return null
  return (
    <section
      ref={dialogRef}
      className="queue-overlay card-inspect-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-inspect-name"
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="queue-modal card-inspect-modal section-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-inspect-scroll">
          {/* The card itself carries rarity and the bought frame: the inspect
              view is the largest shot of a card in the game, and the frame is
              what a player paid to see on it. */}
          <div
            className={`card-inspect-face rarity-${card.rarity} border-${card.cardBorder ?? 'default'}`}
            style={{ '--rarity-color': RARITY_COLORS[card.rarity as keyof typeof RARITY_COLORS] ?? RARITY_COLORS.common } as React.CSSProperties}
          >
            <span className="card-frame" aria-hidden="true" />
            <CardFace card={card} variant="inspect" currentHealth={card.currentHealth} lazy={false} />
          </div>
          <div className="card-inspect-info">
            <h2 id="card-inspect-name">{card.name}</h2>
            <span className="card-inspect-lineage">
              <RarityBadge rarity={card.rarity} />
              <span className="card-inspect-tribe"><TribeSigil tribe={card.tribe} />{card.tribe}</span>
            </span>
            {card.currentHealth !== undefined && card.currentHealth !== card.health && (
              <p className="note">Wounded: {card.currentHealth} of {card.health} health remains.</p>
            )}
            <p className="card-text">{card.text}</p>
            {card.effect && (
              <div className="card-inspect-effect">
                <EffectBadge effect={card.effect} />
                <p className="note">{EFFECT_DESCRIPTIONS[card.effect] ?? ''}</p>
              </div>
            )}
            <button className="secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
