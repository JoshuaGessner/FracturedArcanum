import { useEffect, useRef, useState } from 'react'
import {
  CARD_LIBRARY,
  MAX_COPIES,
  MAX_LEGENDARY_COPIES,
  MIN_DECK_SIZE,
  RARITY_COLORS,
  getDeckSize,
} from '../game'
import { DECK_MAX_TOTAL_DISPLAY, DECK_PRESETS } from '../constants'
import { cardArtPath, getCompletionPercent, getRarityCompletion, handleCardArtError } from '../utils'
import { EffectBadge, RarityBadge, StatIcon } from '../components/AssetBadge'
import { SceneHeaderPanel, type SceneHeaderTile } from '../components/SceneHeaderPanel'
import { useAppShell, useGame, useProfile, useQueue } from '../contexts'
import { feedback } from '../feedback'

export function CollectionScreen() {
  const { activeScreen, loggedIn, setToastMessage, soundEnabled, hapticsEnabled, consumeLongPressAction, getLongPressProps } = useAppShell()
  const {
    deckReady, selectedDeckSize, savedDecks, activeDeckId,
    handleCreateDeck, handleSelectDeck, handleRenameDeck, handleDeleteDeck,
    builderFilter, setBuilderFilter, deckConfig, collection, selectedCardBorder,
    handleDeckCount,
  } = useProfile()
  const { startMatch, handleQuickBattle } = useGame()
  const { handleStartQueue, queueState } = useQueue()
  const ownedUniqueCards = CARD_LIBRARY.filter((card) => (collection[card.id] ?? 0) > 0).length
  const collectionCompletion = getCompletionPercent(ownedUniqueCards, CARD_LIBRARY.length)
  const collectionCircumference = 2 * Math.PI * 20
  const collectionOffset = collectionCircumference * (1 - collectionCompletion / 100)
  const rarityStats = getRarityCompletion(collection, CARD_LIBRARY)
  const activeDeckName = savedDecks.find((deck) => deck.id === activeDeckId)?.name ?? 'Choose a deck'
  const forgeStatusLabel = deckReady ? 'Forge stocked' : 'Needs tuning'
  const archiveTiles: SceneHeaderTile[] = [
    {
      kicker: 'Collection Completion',
      value: `${ownedUniqueCards}/${CARD_LIBRARY.length}`,
      note: 'Unique cards logged to the archive',
    },
    {
      kicker: 'Deck Ready',
      value: forgeStatusLabel,
      note: `${selectedDeckSize} cards prepared for battle`,
      accent: deckReady,
    },
    {
      kicker: 'Saved Decks',
      value: `${savedDecks.length}`,
      note: `Active build · ${activeDeckName}`,
    },
  ]
  const previousCompletionRef = useRef<Record<string, boolean> | null>(null)
  const [celebratingRarity, setCelebratingRarity] = useState<string | null>(null)

  useEffect(() => {
    const completionState = Object.fromEntries(
      Object.entries(rarityStats).map(([rarity, stats]) => [rarity, stats.total > 0 && stats.owned >= stats.total]),
    )

    if (!previousCompletionRef.current) {
      previousCompletionRef.current = completionState
      return
    }

    const newlyCompleted = Object.entries(completionState).find(
      ([rarity, complete]) => complete && !previousCompletionRef.current?.[rarity],
    )

    previousCompletionRef.current = completionState

    if (!newlyCompleted) {
      return
    }

    const [rarity] = newlyCompleted
    const startTimerId = window.setTimeout(() => {
      setCelebratingRarity(rarity)
      feedback('claim', soundEnabled, hapticsEnabled)
      setToastMessage(`${rarity.charAt(0).toUpperCase() + rarity.slice(1)} collection set complete!`)
    }, 0)
    const clearTimerId = window.setTimeout(() => {
      setCelebratingRarity((current) => (current === rarity ? null : current))
    }, 1600)
    return () => {
      window.clearTimeout(startTimerId)
      window.clearTimeout(clearTimerId)
    }
  }, [hapticsEnabled, rarityStats, setToastMessage, soundEnabled])

  return (
    <section className={`meta-grid deck-focus collection-screen screen-panel ${activeScreen === 'collection' ? 'active' : 'hidden'}`}>
      <article className="section-card">
        <SceneHeaderPanel
          className="collection-scene-header"
          visual={(
            <div className="collection-progress-ring" aria-label={`Collection completion ${collectionCompletion}%`}>
              <svg className="collection-progress-svg" viewBox="0 0 100 100" role="presentation" aria-hidden="true">
                <circle className="collection-progress-track" cx="50" cy="50" r="20" />
                <circle
                  className="collection-progress-value"
                  cx="50"
                  cy="50"
                  r="20"
                  style={{ strokeDasharray: collectionCircumference, strokeDashoffset: collectionOffset }}
                />
              </svg>
              <div className="collection-progress-core">
                <strong>{collectionCompletion}%</strong>
              </div>
            </div>
          )}
          title="Archive Forge"
          note="Tune your library, refine the curve, and field the next lineup."
          badges={(
            <>
              <span className="badge">{ownedUniqueCards}/{CARD_LIBRARY.length} owned</span>
              <span className={`deck-status ${deckReady ? 'ready' : 'warning'}`}>
                {deckReady ? `Ready · ${selectedDeckSize}` : `${selectedDeckSize}/${MIN_DECK_SIZE}`}
              </span>
            </>
          )}
          tiles={archiveTiles}
        >
          <div className="collection-rarity-chips">
            {(['common', 'rare', 'epic', 'legendary'] as const).map((r) => {
              const s = rarityStats[r]
              if (!s) return null
              return (
                <span
                  key={r}
                  className={`rarity-chip rarity-${r} ${s.owned >= s.total ? 'rarity-complete' : ''} ${celebratingRarity === r ? 'rarity-celebrate' : ''}`}
                >
                  <RarityBadge rarity={r} /> {s.owned}/{s.total}
                </span>
              )
            })}
          </div>
        </SceneHeaderPanel>

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
                        <img className="action-icon" src="/generated/ui/icon-edit.svg" alt="" aria-hidden="true" />
                      </button>
                      <button
                        className="ghost mini icon-only"
                        onClick={() => handleDeleteDeck(deck)}
                        disabled={savedDecks.length <= 1}
                        aria-label={`Delete ${deck.name}`}
                        title={savedDecks.length <= 1 ? 'You need at least one deck' : 'Delete'}
                      >
                        <img className="action-icon" src="/generated/ui/icon-delete.svg" alt="" aria-hidden="true" />
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
                {rarity === 'all' ? <span>All</span> : <RarityBadge rarity={rarity} />}
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
                  <span className="deck-rarity-summary"><RarityBadge rarity="common" /> <strong>{breakdown.common}</strong></span>
                  <span className="deck-rarity-summary"><RarityBadge rarity="rare" /> <strong>{breakdown.rare}</strong></span>
                  <span className="deck-rarity-summary"><RarityBadge rarity="epic" /> <strong>{breakdown.epic}</strong></span>
                  <span className="deck-rarity-summary"><RarityBadge rarity="legendary" /> <strong>{breakdown.legendary}</strong></span>
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
            const inspectCard = { name: card.name, icon: card.icon, id: card.id, cost: card.cost, attack: card.attack, health: card.health, rarity: card.rarity, tribe: card.tribe, text: card.text, effect: card.effect ?? null }
            return (
            <div
              className={`builder-card rarity-${card.rarity} border-${selectedCardBorder} ${ownedCount === 0 ? 'locked' : ''}`}
              key={card.id}
              style={{ '--rarity-color': RARITY_COLORS[card.rarity] } as React.CSSProperties}
            >
              <button
                type="button"
                className="builder-card-preview"
                onClick={() => {
                  if (consumeLongPressAction()) return
                }}
                {...getLongPressProps(inspectCard)}
                title="Hold to inspect the full card"
              >
                <div className="card-art-shell">
                  <img
                    className="card-illustration"
                    src={cardArtPath(card.id)}
                    alt={`${card.name} illustration`}
                    loading="lazy"
                    onError={handleCardArtError}
                    draggable={false}
                  />
                </div>
                <div className="slot-head">
                  <strong>{card.name}</strong>
                  <span className="stats"><StatIcon kind="mana" className="inline-stat" /> {card.cost}</span>
                </div>
                <div className="card-meta-row">
                  <RarityBadge rarity={card.rarity} />
                  <span className="tribe-badge">{card.tribe}</span>
                  <span className="tribe-badge">Owned {ownedCount}</span>
                </div>
                <div className="card-stats">
                  <span><StatIcon kind="attack" /> {card.attack}</span>
                  <span><StatIcon kind="health" /> {card.health}</span>
                </div>
                <div className="builder-card-footnote">
                  {card.effect && <EffectBadge effect={card.effect} compact />}
                  <span className="mini-text">Hold to inspect</span>
                </div>
              </button>

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

        <div className="collection-action-row">
          <button className="primary" onClick={() => startMatch()} disabled={!deckReady}>
            Play Deck
          </button>
          <button className="secondary" onClick={handleStartQueue} disabled={!deckReady || queueState !== 'idle'}>
            Play Online
          </button>
        </div>

        <div className="collection-quick-strip">
          <strong>Templates</strong>
          {DECK_PRESETS.map((preset) => (
            <button
              className="ghost mini"
              key={preset.name}
              onClick={() => handleQuickBattle(preset.name, preset.config)}
              title={`Battle AI with a curated ${preset.name} deck`}
            >
              <img className="action-icon" src="/generated/ui/icon-attack.svg" alt="" aria-hidden="true" /> {preset.name}
            </button>
          ))}
        </div>
      </article>
    </section>
  )
}
