import type { InspectedCard } from '../types'
import { EFFECT_DESCRIPTIONS } from '../constants'
import { cardArtPath, handleCardArtError } from '../utils'
import { EffectBadge, RarityBadge, StatIcon } from './AssetBadge'

type CardInspectModalProps = {
  card: InspectedCard | null
  onClose: () => void
}

export function CardInspectModal({ card, onClose }: CardInspectModalProps) {
  if (!card) return null
  return (
    <section
      className="queue-overlay card-inspect-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-inspect-name"
      onClick={onClose}
    >
      <div className="queue-modal card-inspect-modal section-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-inspect-header">
          <span className="cost-pill">{card.cost}</span>
          <div>
            <h2 id="card-inspect-name">
              {card.icon} {card.name}
            </h2>
            <span className="badges">
              <RarityBadge rarity={card.rarity} />
              <span className="badge">{card.tribe}</span>
            </span>
          </div>
        </div>
        <div className="card-art-shell large">
          <img
            className="card-illustration"
            src={cardArtPath(card.id)}
            alt={card.name}
            onError={handleCardArtError}
            draggable={false}
          />
        </div>
        <div className="card-inspect-stats">
          <span><StatIcon kind="attack" /> Attack: {card.attack}</span>
          <span><StatIcon kind="health" /> Health: {card.currentHealth ?? card.health}</span>
          {card.currentHealth !== undefined && card.currentHealth !== card.health && (
            <span className="note">(Base: {card.health})</span>
          )}
        </div>
        <p className="card-text">{card.text}</p>
        {card.effect && (
          <div className="card-inspect-effect">
            <EffectBadge effect={card.effect} />
            <p className="note">{EFFECT_DESCRIPTIONS[card.effect] ?? ''}</p>
          </div>
        )}
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  )
}
