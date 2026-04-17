import type { InspectedCard } from '../types'
import { EFFECT_DESCRIPTIONS, EFFECT_LABELS } from '../constants'
import { cardArtPath, handleCardArtError } from '../utils'

type CardInspectModalProps = {
  card: InspectedCard | null
  onClose: () => void
}

export function CardInspectModal({ card, onClose }: CardInspectModalProps) {
  if (!card) return null
  return (
    <section className="queue-overlay card-inspect-overlay" onClick={onClose}>
      <div className="queue-modal card-inspect-modal section-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-inspect-header">
          <span className="cost-pill">{card.cost}</span>
          <div>
            <h2>
              {card.icon} {card.name}
            </h2>
            <span className="badges">
              <span className="badge">{card.rarity}</span>
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
          />
        </div>
        <div className="card-inspect-stats">
          <span>⚔️ Attack: {card.attack}</span>
          <span>❤️ Health: {card.currentHealth ?? card.health}</span>
          {card.currentHealth !== undefined && card.currentHealth !== card.health && (
            <span className="note">(Base: {card.health})</span>
          )}
        </div>
        <p className="card-text">{card.text}</p>
        {card.effect && (
          <div className="card-inspect-effect">
            <span className="effect-badge">{EFFECT_LABELS[card.effect] ?? card.effect}</span>
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
