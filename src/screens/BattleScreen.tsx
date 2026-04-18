import {
  RARITY_COLORS,
} from '../game'
import { EFFECT_LABELS } from '../constants'
import { cardArtPath, handleCardArtError } from '../utils'
import { useAppShell, useGame, useProfile } from '../contexts'

export function BattleScreen() {
  const { activeScreen, openScreen, backendOnline } = useAppShell()
  const {
    game, activePlayer, isMyTurn, isRankedBattle, battleKind,
    enemyTurnActive, enemyTurnLabel, opponentDisconnected, disconnectGraceMs,
    handleBurst, handleEndTurn, handleLeaveBattle,
    handleAttackTarget, handleSelectAttacker, selectedAttacker,
    defenderHasGuard, damagedSlots,
    consumeLongPressAction, getLongPressProps,
    handlePlayCard, activeBoardHasOpenLane,
    startMatch, setPreferredMode,
  } = useGame()
  const { selectedCardBorder, rankLabel, seasonRating, winRate } = useProfile()

  const isBattle = activeScreen === 'battle'

  return (
    <>
      {enemyTurnActive && (
        <div className={`enemy-turn-banner screen-panel ${isBattle ? 'active' : 'hidden'}`}>
          <span className="enemy-turn-label">{enemyTurnLabel}</span>
        </div>
      )}

      {isBattle && !backendOnline && isRankedBattle && (
        <div className="connection-banner reconnecting">
          <span>Connection lost — reconnecting...</span>
        </div>
      )}

      {isBattle && opponentDisconnected && isRankedBattle && (
        <div className="connection-banner opponent-disconnected">
          <span>Opponent disconnected — waiting for reconnect ({Math.round(disconnectGraceMs / 1000)}s window)...</span>
        </div>
      )}

      <section className={`battle-topbar section-card screen-panel ${isBattle ? 'active' : 'hidden'}`}>
        <div className="battle-heroes-compact">
          <div className="hero-compact enemy">
            <strong>{game.enemy.name}</strong>
            <span className="hero-health">❤️ {game.enemy.health}</span>
          </div>
          <div className="battle-turn-label">
            <span className="eyebrow">Turn {game.turnNumber}</span>
          </div>
          <div className="hero-compact player">
            <strong>{game.player.name}</strong>
            <span className="hero-health">❤️ {game.player.health}</span>
          </div>
        </div>

        <div className="battle-resource-row">
          <div className="pip-row">
            {Array.from({ length: Math.max(activePlayer.maxMana, 1) }).map((_, index) => (
              <span
                key={`mana-${index}`}
                className={index < activePlayer.mana ? 'pip filled' : 'pip'}
              />
            ))}
            <span className="hero-label">Mana</span>
          </div>
          <div className="pip-row">
            {Array.from({ length: 10 }).map((_, index) => (
              <span
                key={`momentum-${index}`}
                className={index < activePlayer.momentum ? 'pip momentum filled' : 'pip momentum'}
              />
            ))}
            <span className="hero-label">Momentum</span>
          </div>
        </div>

        <div className="controls">
          <button
            className="primary"
            onClick={handleBurst}
            disabled={activePlayer.momentum < 3 || Boolean(game.winner) || !isMyTurn}
          >
            Burst
          </button>
          <button className="secondary" onClick={handleEndTurn} disabled={Boolean(game.winner) || !isMyTurn}>
            {!isMyTurn ? (
              <><span className="spinner spinner-inline" aria-hidden="true" />Opponent thinking<span className="thinking-dots" /></>
            ) : (
              'End Turn'
            )}
          </button>
          <button className="ghost" onClick={handleLeaveBattle}>
            Leave
          </button>
        </div>
      </section>

      <section className={`battlefield screen-panel ${isBattle ? 'active' : 'hidden'}`}>
        <article className="section-card">
          <div className="section-head">
            <h2>{game.enemy.name} Frontline</h2>
            <button
              className="ghost"
              onClick={() => handleAttackTarget('hero')}
              disabled={selectedAttacker === null || defenderHasGuard || Boolean(game.winner)}
            >
              Strike Hero
            </button>
          </div>

          <div className="board-grid">
            {game.enemy.board.map((unit, index) => {
              if (!unit) {
                return (
                  <div className="slot empty" key={`enemy-empty-${index}`}>
                    Empty lane
                  </div>
                )
              }

              const isSelectable = false
              const isSelected = false

              return (
                <button
                  className={[
                    'slot',
                    `rarity-${unit.rarity}`,
                    unit.effect === 'guard' ? 'guard' : '',
                    unit.exhausted ? 'exhausted' : '',
                    isSelected ? 'selected' : '',
                    damagedSlots.has(unit.uid) ? 'damage-flash' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={unit.uid}
                  style={{ '--rarity-color': RARITY_COLORS[unit.rarity] } as React.CSSProperties}
                  onClick={() => {
                    if (consumeLongPressAction()) return
                    if (isSelectable) handleSelectAttacker(index)
                    else handleAttackTarget(index)
                  }}
                  {...getLongPressProps({ name: unit.name, icon: unit.icon, id: unit.id, cost: unit.cost, attack: unit.attack, health: unit.health, currentHealth: unit.currentHealth, rarity: unit.rarity, tribe: unit.tribe, text: unit.text, effect: unit.effect ?? null })}
                  aria-disabled={Boolean(game.winner) || (isSelectable ? unit.exhausted : selectedAttacker === null)}
                  title="Long press to inspect"
                >
                  <img className="unit-portrait" src={cardArtPath(unit.id)} alt={`${unit.name} artwork`} loading="lazy" onError={handleCardArtError} />
                  <div className="slot-head">
                    <strong>
                      {unit.icon} {unit.name}
                    </strong>
                    <span className="stats">
                      ⚔️{unit.attack} ❤️{unit.currentHealth}
                    </span>
                  </div>
                  {unit.effect && <span className="effect-badge small">{EFFECT_LABELS[unit.effect] ?? unit.effect}</span>}
                </button>
              )
            })}
          </div>
        </article>

        <article className="section-card">
          <div className="section-head">
            <h2>{game.player.name} Frontline</h2>
            <p className="note">Ready units can attack once each turn.</p>
          </div>

          <div className="board-grid">
            {game.player.board.map((unit, index) => {
              if (!unit) {
                return (
                  <div className="slot empty" key={`player-empty-${index}`}>
                    Open lane
                  </div>
                )
              }

              const isSelectable = game.turn === 'player'
              const isSelected = isSelectable && selectedAttacker === index

              return (
                <button
                  className={[
                    'slot',
                    `rarity-${unit.rarity}`,
                    unit.effect === 'guard' ? 'guard' : '',
                    unit.exhausted ? 'exhausted' : '',
                    isSelected ? 'selected' : '',
                    damagedSlots.has(unit.uid) ? 'damage-flash' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={unit.uid}
                  style={{ '--rarity-color': RARITY_COLORS[unit.rarity] } as React.CSSProperties}
                  onClick={() => {
                    if (consumeLongPressAction()) return
                    if (isSelectable) handleSelectAttacker(index)
                    else handleAttackTarget(index)
                  }}
                  {...getLongPressProps({ name: unit.name, icon: unit.icon, id: unit.id, cost: unit.cost, attack: unit.attack, health: unit.health, currentHealth: unit.currentHealth, rarity: unit.rarity, tribe: unit.tribe, text: unit.text, effect: unit.effect ?? null })}
                  aria-disabled={Boolean(game.winner) || (isSelectable ? unit.exhausted : selectedAttacker === null)}
                  title="Long press to inspect"
                >
                  <img className="unit-portrait" src={cardArtPath(unit.id)} alt={`${unit.name} artwork`} loading="lazy" onError={handleCardArtError} />
                  <div className="slot-head">
                    <strong>
                      {unit.icon} {unit.name}
                    </strong>
                    <span className="stats">
                      ⚔️{unit.attack} ❤️{unit.currentHealth}
                    </span>
                  </div>
                  {unit.effect && <span className="effect-badge small">{EFFECT_LABELS[unit.effect] ?? unit.effect}</span>}
                </button>
              )
            })}
          </div>
        </article>
      </section>

      {game.winner && (
        <section className={`summary-card section-card screen-panel ${isBattle ? 'active' : 'hidden'}`}>
          <div className="section-head">
            <div>
              <h2>{game.winner === 'player' ? 'Victory Screen' : game.winner === 'enemy' ? 'Defeat Screen' : 'Draw Screen'}</h2>
              <p className="note">
                {game.winner === 'player'
                  ? 'Rewards tallied and the crowd is roaring for a rematch.'
                  : game.winner === 'enemy'
                    ? 'Review your deck, regroup, and jump straight back into the arena.'
                    : 'A close match. Adjust your list and queue again.'}
              </p>
            </div>
            <span className={`deck-status ${game.winner === 'player' ? 'ready' : 'warning'}`}>
              {isRankedBattle ? (game.winner === 'player' ? '+25 Rating' : game.winner === 'enemy' ? '-15 Rating' : 'Even Match') : battleKind === 'local' ? 'Casual Duel' : game.winner === 'player' ? '+30 Shards' : 'Practice Match'}
            </span>
          </div>

          <div className="summary-grid">
            <div className="badges">
              <span className="badge">Rank {rankLabel}</span>
              <span className="badge">Rating {seasonRating}</span>
              <span className="badge">Win Rate {winRate}%</span>
            </div>
            <div className="controls">
              <button className="primary" onClick={() => startMatch(game.mode)}>
                Play Again
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setPreferredMode('ai')
                  openScreen('home')
                }}
              >
                Back to Lobby
              </button>
            </div>
          </div>
        </section>
      )}

      <section className={`hand-section screen-panel ${isBattle ? 'active' : 'hidden'}`}>
        <article className="section-card">
          <div className="section-head">
            <h2>{activePlayer.name} Hand</h2>
            <span className="badge">Mana {activePlayer.mana}</span>
          </div>

          <div className="hand-grid">
            {activePlayer.hand.map((card, index) => {
              const canPlay = !game.winner && activeBoardHasOpenLane && card.cost <= activePlayer.mana
              const needMana = card.cost - activePlayer.mana
              const needLane = !activeBoardHasOpenLane
              const overlayLabel = !canPlay
                ? game.winner
                  ? 'Battle over'
                  : needLane
                    ? 'Board is full'
                    : needMana > 0
                      ? `Need ${needMana} more mana`
                      : 'Cannot play'
                : ''

              return (
                <button
                  className={['hand-card', `rarity-${card.rarity}`, `border-${selectedCardBorder}`, canPlay ? '' : 'unplayable'].filter(Boolean).join(' ')}
                  key={card.instanceId}
                  data-need={overlayLabel}
                  onClick={() => {
                    if (consumeLongPressAction()) return
                    if (canPlay) handlePlayCard(index)
                  }}
                  {...getLongPressProps({ name: card.name, icon: card.icon, id: card.id, cost: card.cost, attack: card.attack, health: card.health, rarity: card.rarity, tribe: card.tribe, text: card.text, effect: card.effect ?? null })}
                  aria-disabled={!canPlay}
                  title={canPlay ? 'Tap to play or long press to inspect' : `${overlayLabel}. Long press to inspect.`}
                  style={{ '--rarity-color': RARITY_COLORS[card.rarity] } as React.CSSProperties}
                >
                  <div className="card-top">
                    <span className="cost-pill">{card.cost}</span>
                    <span className="hero-label">{card.icon}</span>
                  </div>
                  <div className="card-art-shell thumb">
                    <img className="card-illustration" src={cardArtPath(card.id)} alt={`${card.name} artwork`} loading="lazy" onError={handleCardArtError} />
                  </div>
                  <div>
                    <strong className="card-name">{card.name}</strong>
                    {card.effect && <span className="effect-badge">{EFFECT_LABELS[card.effect] ?? card.effect}</span>}
                  </div>
                  <div className="card-stats">
                    <span>⚔️ {card.attack}</span>
                    <span>❤️ {card.health}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </article>
      </section>
    </>
  )
}
