import { cardArtPath, handleCardArtError } from '../utils'
import { InterfaceGlyph } from './AssetBadge'

type ShowcaseCard = {
  id: string
  name: string
  rarity: string
}

type HomeDeckShowcaseProps = {
  deckName: string
  deckSize: number
  deckGoal: number
  ready: boolean
  cards: ShowcaseCard[]
  /** More than one saved deck: show the arrows that cycle through them. */
  canCycle: boolean
  onPrevious: () => void
  onNext: () => void
  onOpen: () => void
}

/**
 * The deck you are about to play, beside the button that plays it.
 *
 * Marvel Snap moved its deck carousel onto the main screen so players stop
 * opening the collection just to check or switch decks before a match. This
 * is the same idea at Home's scale: a fan of the deck's headline cards, its
 * name and readiness, and arrows to step through saved decks.
 */
export function HomeDeckShowcase({
  deckName,
  deckSize,
  deckGoal,
  ready,
  cards,
  canCycle,
  onPrevious,
  onNext,
  onOpen,
}: HomeDeckShowcaseProps) {
  return (
    <div className="home-deck-showcase">
      {canCycle && (
        <button type="button" className="ghost home-deck-step" onClick={onPrevious} aria-label="Previous deck">
          <InterfaceGlyph name="back" />
        </button>
      )}
      <button type="button" className="home-deck-open" onClick={onOpen} aria-label={`${deckName}, ${deckSize} of ${deckGoal} cards. Open in the collection.`}>
        <span className="home-deck-fan" aria-hidden="true">
          {cards.length > 0
            ? cards.map((card, index) => (
                <span className={`home-deck-fan-card rarity-${card.rarity}`} style={{ '--fan-i': index - (cards.length - 1) / 2 } as React.CSSProperties} key={card.id}>
                  <img src={cardArtPath(card.id)} alt="" loading="lazy" onError={handleCardArtError} />
                </span>
              ))
            : <span className="home-deck-fan-card is-empty" />}
        </span>
        <span className="home-deck-copy">
          <strong>{deckName}</strong>
          <span className={ready ? 'is-ready' : 'is-short'}>
            {deckSize} cards · {ready ? 'Ready' : `${Math.max(0, deckGoal - deckSize)} short`}
          </span>
        </span>
      </button>
      {canCycle && (
        <button type="button" className="ghost home-deck-step" onClick={onNext} aria-label="Next deck">
          <InterfaceGlyph name="forward" />
        </button>
      )}
    </div>
  )
}
