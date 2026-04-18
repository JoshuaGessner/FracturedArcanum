import {
  CARD_LIBRARY,
  MAX_COPIES,
  MAX_LEGENDARY_COPIES,
  MIN_DECK_SIZE,
  RARITY_COLORS,
  getDeckSize,
} from '../game'
import { DECK_MAX_TOTAL_DISPLAY, DECK_PRESETS, EFFECT_LABELS } from '../constants'
import { cardArtPath, handleCardArtError } from '../utils'
import { useApp } from '../useApp'

export function CollectionScreen() {
  const {
    activeScreen,
    loggedIn,
    deckReady,
    selectedDeckSize,
    savedDecks,
    activeDeckId,
    handleCreateDeck,
    handleSelectDeck,
    handleRenameDeck,
    handleDeleteDeck,
    builderFilter,
    setBuilderFilter,
    deckConfig,
    collection,
    selectedCardBorder,
    handleDeckCount,
    startMatch,
    handleStartQueue,
    queueState,
    openScreen,
    handleQuickBattle,
  } = useApp()

  return (
    <section className={`meta-grid deck-focus collection-screen screen-panel ${activeScreen === 'collection' ? 'active' : 'hidden'}`}>
      <article className="section-card">
        <div className="section-head">
          <div>
            <h2>Deck Builder</h2>
            <p className="note">Choose 10–16 cards, with up to 3 copies of each. Saved decks sync to your account.</p>
          </div>
          <span className={`deck-status ${deckReady ? 'ready' : 'warning'}`}>
            {deckReady ? `Deck ready · ${selectedDeckSize}` : `Add more cards · ${selectedDeckSize}/${MIN_DECK_SIZE}`}
          </span>
        </div>

        {loggedIn && (
          <div className="deck-roster" aria-label="Saved decks">
            <div className="deck-roster-head">
              <strong>Your decks ({savedDecks.length})</strong>
              <button
                className="ghost mini"
                onClick={handleCreateDeck}
                title="Create a new empty deck"
              >
                + New Deck
              </button>
            </div>
            <ul className="deck-roster-list">
              {savedDecks.map((deck) => {
                const size = getDeckSize(deck.deckConfig)
                const isActive = deck.id === activeDeckId
                return (
                  <li className={`deck-roster-item ${isActive ? 'active' : ''}`} key={deck.id}>
                    <button
                      className="deck-roster-select"
                      onClick={() => handleSelectDeck(deck)}
                      aria-pressed={isActive}
                      title={isActive ? 'Active deck' : 'Switch to this deck'}
                    >
                      <span className="deck-roster-name">
                        {isActive && <span className="deck-roster-active-dot" aria-hidden="true">●</span>}
                        {deck.name}
                      </span>
                      <span className={`deck-roster-size ${size >= MIN_DECK_SIZE ? 'ready' : 'warning'}`}>
                        {size}/{DECK_MAX_TOTAL_DISPLAY}
                      </span>
                    </button>
                    <div className="deck-roster-actions">
                      <button className="ghost mini icon-only" onClick={() => handleRenameDeck(deck)} aria-label={`Rename ${deck.name}`} title="Rename">
                        ✏️
                      </button>
                      <button
                        className="ghost mini icon-only"
                        onClick={() => handleDeleteDeck(deck)}
                        disabled={savedDecks.length <= 1}
                        aria-label={`Delete ${deck.name}`}
                        title={savedDecks.length <= 1 ? 'You need at least one deck' : 'Delete'}
                      >
                        🗑️
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="builder-toolbar">
          <label className="builder-toggle">
            <input
              type="checkbox"
              checked={builderFilter.ownedOnly}
              onChange={(event) => setBuilderFilter((prev) => ({ ...prev, ownedOnly: event.target.checked }))}
            />
            <span>Owned cards only</span>
          </label>
          <input
            className="builder-search"
            type="search"
            inputMode="search"
            placeholder="Search cards…"
            value={builderFilter.search}
            onChange={(event) => setBuilderFilter((prev) => ({ ...prev, search: event.target.value }))}
            aria-label="Search cards"
          />
          <div className="builder-rarity-chips" role="radiogroup" aria-label="Filter by rarity">
            {(['all', 'common', 'rare', 'epic', 'legendary'] as const).map((rarity) => (
              <button
                key={rarity}
                className={`chip ${builderFilter.rarity === rarity ? 'chip-active' : ''}`}
                onClick={() => setBuilderFilter((prev) => ({ ...prev, rarity }))}
                role="radio"
                aria-checked={builderFilter.rarity === rarity}
              >
                {rarity === 'all' ? 'All' : rarity.charAt(0).toUpperCase() + rarity.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {selectedDeckSize > 0 && (
          <div className="deck-stats" aria-label="Deck statistics">
            <span>Cards: <strong>{selectedDeckSize}</strong></span>
            {(() => {
              const breakdown: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 }
              Object.entries(deckConfig).forEach(([cardId, count]) => {
                const card = CARD_LIBRARY.find((c) => c.id === cardId)
                if (card && count) breakdown[card.rarity] += count
              })
              const curve: Record<number, number> = {}
              Object.entries(deckConfig).forEach(([cardId, count]) => {
                const card = CARD_LIBRARY.find((c) => c.id === cardId)
                if (card && count) {
                  const bucket = Math.min(7, card.cost)
                  curve[bucket] = (curve[bucket] ?? 0) + count
                }
              })
              const maxCurve = Math.max(1, ...Object.values(curve))
              return (
                <>
                  <span>● {breakdown.common}</span>
                  <span style={{ color: RARITY_COLORS.rare }}>◈ {breakdown.rare}</span>
                  <span style={{ color: RARITY_COLORS.epic }}>◆ {breakdown.epic}</span>
                  <span style={{ color: RARITY_COLORS.legendary }}>★ {breakdown.legendary}</span>
                  <span className="mana-curve" aria-label="Mana curve">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((cost) => (
                      <span key={cost} className="mana-curve-col" title={`${cost === 7 ? '7+' : cost} mana: ${curve[cost] ?? 0}`}>
                        <span
                          className="mana-curve-bar"
                          style={{ height: `${Math.round(((curve[cost] ?? 0) / maxCurve) * 100)}%` }}
                        />
                        <span className="mana-curve-label">{cost === 7 ? '7+' : cost}</span>
                      </span>
                    ))}
                  </span>
                </>
              )
            })()}
          </div>
        )}

        <div className="builder-grid">
          {CARD_LIBRARY.filter((card) => {
            if (builderFilter.rarity !== 'all' && card.rarity !== builderFilter.rarity) return false
            if (builderFilter.search) {
              const q = builderFilter.search.toLowerCase()
              if (!card.name.toLowerCase().includes(q) && !card.text.toLowerCase().includes(q)) return false
            }
            if (builderFilter.ownedOnly && loggedIn) {
              const owned = collection[card.id] ?? 0
              if (owned === 0) return false
            }
            return true
          }).map((card) => {
            const maxCopies = card.rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES
            const ownedCount = loggedIn ? (collection[card.id] ?? 0) : maxCopies
            const count = deckConfig[card.id] ?? 0
            const addDisabled = count >= Math.min(maxCopies, ownedCount)
            return (
            <div
              className={`builder-card rarity-${card.rarity} border-${selectedCardBorder} ${ownedCount === 0 ? 'locked' : ''}`}
              key={card.id}
              style={{ '--rarity-color': RARITY_COLORS[card.rarity] } as React.CSSProperties}
            >
              <div>
                <div className="card-art-shell">
                  <img
                    className="card-illustration"
                    src={cardArtPath(card.id)}
                    alt={`${card.name} illustration`}
                    loading="lazy"
                    onError={handleCardArtError}
                  />
                </div>
                <div className="slot-head">
                  <strong>
                    {card.icon} {card.name}
                  </strong>
                  <span className="stats">{card.cost} 💧</span>
                </div>
                <div className="card-meta-row">
                  <span className="rarity-gem" style={{ color: RARITY_COLORS[card.rarity] }}>{card.rarity === 'legendary' ? '★' : card.rarity === 'epic' ? '◆' : card.rarity === 'rare' ? '◈' : '●'} {card.rarity}</span>
                  <span className="tribe-badge">{card.tribe}</span>
                  <span className="tribe-badge">Owned {ownedCount}</span>
                </div>
                <div className="card-stats">
                  <span>⚔️ {card.attack}</span>
                  <span>❤️ {card.health}</span>
                </div>
                {card.effect && <span className="effect-badge small">{EFFECT_LABELS[card.effect] ?? card.effect}</span>}
                <p className="card-text clamped">{card.text}</p>
              </div>

              <div className="stepper">
                <button className="ghost mini" onClick={() => handleDeckCount(card.id, -1)}>
                  −
                </button>
                <span className="count-chip">{count}</span>
                <button className="ghost mini" onClick={() => handleDeckCount(card.id, 1)} disabled={addDisabled}>
                  +
                </button>
              </div>
            </div>
            )
          })}
        </div>

        <div className="controls">
          <button className="primary" onClick={() => startMatch()} disabled={!deckReady}>
            Play With This Deck
          </button>
          <button className="secondary" onClick={handleStartQueue} disabled={!deckReady || queueState !== 'idle'}>
            Play Online
          </button>
          <button className="ghost" onClick={() => openScreen('home')}>
            Back to Home
          </button>
        </div>

        <div className="deck-quick-battle">
          <div className="section-head compact">
            <div>
              <h3>Quick Battle Templates</h3>
              <p className="note">
                Try a curated full deck against the AI. Templates do not require ownership and are not saved
                to your collection — perfect for sampling new strategies.
              </p>
            </div>
          </div>
          <div className="controls preset-row">
            {DECK_PRESETS.map((preset) => (
              <button
                className="ghost"
                key={preset.name}
                onClick={() => handleQuickBattle(preset.name, preset.config)}
                title={`Instantly battle the AI using a curated ${preset.name} deck`}
              >
                ⚔ {preset.name}
              </button>
            ))}
          </div>
        </div>
      </article>
    </section>
  )
}
