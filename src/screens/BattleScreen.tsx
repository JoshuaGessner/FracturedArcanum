import {
  RARITY_COLORS,
} from '../game'
import { cardArtPath, getHandFanTilt, handleCardArtError } from '../utils'
import { EffectBadge, RankBadge, StatIcon } from '../components/AssetBadge'
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
  const battleModeLabel = isRankedBattle ? 'Ranked duel' : battleKind === 'local' ? 'Pass and play' : 'AI skirmish'
  const battleStatusLabel = game.winner
    ? game.winner === 'player'
      ? 'Arena secured'
      : game.winner === 'enemy'
        ? 'Rival advantage'
        : 'Dead heat'
    : isMyTurn
      ? 'Your command phase'
      : 'Enemy pressure'
  const resultTone = game.winner === 'player' ? 'result-victory' : game.winner === 'enemy' ? 'result-defeat' : 'result-draw'

  return (
    <>
      {enemyTurnActive && (
        <div className={`enemy-turn-banner screen-panel ${isBattle ? 'active' : 'hidden'}`}>
          <div className="enemy-turn-banner-inner">
            <span className="enemy-turn-crest" aria-hidden="true" />
            <div className="enemy-turn-copy">
              <strong>Enemy is thinking</strong>
              <span className="enemy-turn-label">{enemyTurnLabel}</span>
            </div>
            <span className="thinking-dots" aria-hidden="true" />
          </div>
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

      <section className={`battle-topbar section-card battle-command-dais screen-panel ${isBattle ? 'active' : 'hidden'}`}>
        <div className="battle-hud-main">
          <div className="battle-heroes-compact">
            <div className="hero-compact enemy">
              <strong>{game.enemy.name}</strong>
              <span className="hero-health"><StatIcon kind="health" /> {game.enemy.health}</span>
            </div>
            <div className="battle-turn-label">
              <span className="eyebrow">Turn {game.turnNumber}</span>
            </div>
            <div className="hero-compact player">
              <strong>{game.player.name}</strong>
              <span className="hero-health"><StatIcon kind="health" /> {game.player.health}</span>
            </div>
          </div>

          <div className="battle-objective">
            <div className="battle-medal">
              <RankBadge rank={rankLabel} />
            </div>
            <div>
              <p className="eyebrow">Arena state</p>
              <strong>{battleModeLabel}</strong>
              <p className="note">
                {battleStatusLabel} • {isMyTurn ? 'Play a unit or strike while the lane is open.' : 'Hold the line while the rival resolves their turn.'}
              </p>
            </div>
          </div>
        </div>

        <div className="badges battle-status-strip">
          <span className="badge">Rating {seasonRating}</span>
          <span className="badge">Win Rate {winRate}%</span>
          <span className="badge">{selectedAttacker === null ? 'Select a unit' : 'Attacker primed'}</span>
          <span className="badge">{isRankedBattle ? 'Ladder live' : battleKind === 'local' ? 'Local duel' : 'Practice arena'}</span>
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
                    <span className="stats battle-stats-inline">
                      <span><StatIcon kind="attack" />{unit.attack}</span>
                      <span><StatIcon kind="health" />{unit.currentHealth}</span>
                    </span>
                  </div>
                  {unit.effect && <EffectBadge effect={unit.effect} compact />}
                </button>
              )
            })}
          </div>
        </article>

        <div className="rune-divider battlefield-divider" aria-hidden="true" />

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
                    <span className="stats battle-stats-inline">
                      <span><StatIcon kind="attack" />{unit.attack}</span>
                      <span><StatIcon kind="health" />{unit.currentHealth}</span>
                    </span>
                  </div>
                  {unit.effect && <EffectBadge effect={unit.effect} compact />}
                </button>
              )
            })}
          </div>
        </article>
      </section>

      {game.winner && (
        <section className={`summary-card section-card battle-result-card ${resultTone} screen-panel ${isBattle ? 'active' : 'hidden'}`}>
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
            <div className="badges battle-status-strip">
              <span className="badge badge-with-art"><RankBadge rank={rankLabel} /></span>
              <span className="badge">Rating {seasonRating}</span>
              <span className="badge">Win Rate {winRate}%</span>
              <span className="badge">{battleModeLabel}</span>
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
        <article className="section-card hand-fan-stage">
          <div className="section-head">
            <div>
              <h2>{activePlayer.name} Hand</h2>
              <p className="note">Tap a card to cast it or long-press to inspect its art and effect details.</p>
            </div>
            <span className="badge">Mana {activePlayer.mana}</span>
          </div>

          <div className="hand-grid hand-fan-grid">
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

              const fanTilt = getHandFanTilt(index, activePlayer.hand.length)

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
                  style={{ '--rarity-color': RARITY_COLORS[card.rarity], '--fan-tilt': `${fanTilt}deg`, '--fan-order': index + 1 } as React.CSSProperties}
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
                    {card.effect && <EffectBadge effect={card.effect} />}
                  </div>
                  <div className="card-stats">
                    <span><StatIcon kind="attack" /> {card.attack}</span>
                    <span><StatIcon kind="health" /> {card.health}</span>
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
