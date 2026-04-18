import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RARITY_COLORS,
} from '../game'
import { cardArtPath, getHandFanTilt, handleCardArtError, pulseFeedback } from '../utils'
import { UI_ASSETS } from '../constants'
import { playSound, startLoopingSound } from '../audio'
import { EffectBadge, RankBadge, StatIcon } from '../components/AssetBadge'
import { useAppShell, useGame, useProfile } from '../contexts'

type DragState = {
  handIndex: number
  pointerId: number
  originX: number
  originY: number
  pointerX: number
  pointerY: number
  active: boolean
  canPlay: boolean
}

type ArrowState = {
  fromX: number
  fromY: number
  toX: number
  toY: number
} | null

type HeroFx = 'damaged' | 'healed' | null

const PULL_UP_COMMIT_PX = 60
const DRAG_ACTIVATE_PX = 12
const SLAM_DURATION_MS = 380

export function BattleScreen() {
  const { activeScreen, openScreen, backendOnline, soundEnabled } = useAppShell()
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

  // ─── Drag-to-play state ─────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  useEffect(() => {
    dragRef.current = drag
  }, [drag])
  // Sentinel consumed by hand-card onClick to suppress tap-play after a drag commit.
  const dragHandledRef = useRef(false)
  // Lane index that was just slammed into; clears after animation completes.
  const [slamLane, setSlamLane] = useState<number | null>(null)
  const slamTimerRef = useRef<number | null>(null)

  const triggerSlam = useCallback((laneIndex: number) => {
    if (slamTimerRef.current) {
      window.clearTimeout(slamTimerRef.current)
    }
    setSlamLane(laneIndex)
    slamTimerRef.current = window.setTimeout(() => {
      setSlamLane(null)
      slamTimerRef.current = null
    }, SLAM_DURATION_MS)
  }, [])

  useEffect(() => () => {
    if (slamTimerRef.current) window.clearTimeout(slamTimerRef.current)
  }, [])

  // ─── Attack arrow telegraph ─────────────────────────────────────────
  const battlefieldRef = useRef<HTMLElement | null>(null)
  const playerSlotRefs = useRef<Array<HTMLButtonElement | null>>([])
  const enemySlotRefs = useRef<Array<HTMLDivElement | HTMLButtonElement | null>>([])
  const [arrow, setArrow] = useState<ArrowState>(null)

  const computeArrowFrom = useCallback((): { x: number; y: number } | null => {
    if (selectedAttacker === null) return null
    const slot = playerSlotRefs.current[selectedAttacker]
    const stage = battlefieldRef.current
    if (!slot || !stage) return null
    const slotRect = slot.getBoundingClientRect()
    const stageRect = stage.getBoundingClientRect()
    return {
      x: slotRect.left - stageRect.left + slotRect.width / 2,
      y: slotRect.top - stageRect.top + slotRect.height / 2,
    }
  }, [selectedAttacker])

  // Update arrow target on global pointermove while attacker is selected.
  useEffect(() => {
    if (selectedAttacker === null) {
      // Clear via cleanup of the previous effect run.
      return
    }
    const updateArrow = (clientX: number, clientY: number) => {
      const stage = battlefieldRef.current
      const from = computeArrowFrom()
      if (!stage || !from) return
      const stageRect = stage.getBoundingClientRect()
      setArrow({
        fromX: from.x,
        fromY: from.y,
        toX: clientX - stageRect.left,
        toY: clientY - stageRect.top,
      })
    }
    // Initial arrow to enemy hero (or center) so user immediately sees feedback.
    const initFrom = computeArrowFrom()
    const stage = battlefieldRef.current
    if (initFrom && stage) {
      setArrow({ fromX: initFrom.x, fromY: initFrom.y, toX: initFrom.x, toY: Math.max(initFrom.y - 80, 20) })
    }
    const onPointerMove = (event: PointerEvent) => updateArrow(event.clientX, event.clientY)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      setArrow(null)
    }
  }, [selectedAttacker, computeArrowFrom])

  // ─── Hero portrait reactions ────────────────────────────────────────
  const prevHeroRef = useRef({ player: game.player.health, enemy: game.enemy.health })
  const [playerHeroFx, setPlayerHeroFx] = useState<HeroFx>(null)
  const [enemyHeroFx, setEnemyHeroFx] = useState<HeroFx>(null)
  const playerFxTimerRef = useRef<number | null>(null)
  const enemyFxTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const prev = prevHeroRef.current
    const playerNow = game.player.health
    const enemyNow = game.enemy.health
    if (playerNow !== prev.player) {
      const fx: HeroFx = playerNow < prev.player ? 'damaged' : 'healed'
      setPlayerHeroFx(fx)
      if (fx === 'damaged') {
        playSound('heroHit', soundEnabled)
        pulseFeedback(18)
      } else {
        playSound('heroHeal', soundEnabled)
        pulseFeedback(10)
      }
      if (playerFxTimerRef.current) window.clearTimeout(playerFxTimerRef.current)
      playerFxTimerRef.current = window.setTimeout(() => setPlayerHeroFx(null), 520)
    }
    if (enemyNow !== prev.enemy) {
      const fx: HeroFx = enemyNow < prev.enemy ? 'damaged' : 'healed'
      setEnemyHeroFx(fx)
      if (fx === 'damaged') {
        playSound('heroHit', soundEnabled)
      } else {
        playSound('heroHeal', soundEnabled)
      }
      if (enemyFxTimerRef.current) window.clearTimeout(enemyFxTimerRef.current)
      enemyFxTimerRef.current = window.setTimeout(() => setEnemyHeroFx(null), 520)
    }
    prevHeroRef.current = { player: playerNow, enemy: enemyNow }
  }, [game.player.health, game.enemy.health, soundEnabled])

  useEffect(() => () => {
    if (playerFxTimerRef.current) window.clearTimeout(playerFxTimerRef.current)
    if (enemyFxTimerRef.current) window.clearTimeout(enemyFxTimerRef.current)
  }, [])

  // Low-HP heartbeat — loops while player hero is < 30% (≤ 9 HP) and battle is live.
  const playerLowHp = !game.winner && isBattle && game.player.health > 0 && game.player.health <= 9
  useEffect(() => {
    if (!playerLowHp) return
    const stop = startLoopingSound('heroLowHp', soundEnabled, 1000)
    return stop
  }, [playerLowHp, soundEnabled])

  // ─── Drag-to-play handlers ──────────────────────────────────────────
  const findDropLane = useCallback((clientX: number, clientY: number): number | null => {
    if (typeof document === 'undefined') return null
    const el = document.elementFromPoint(clientX, clientY)
    if (!el) return null
    const target = (el as HTMLElement).closest<HTMLElement>('[data-drop-lane]')
    if (!target) return null
    const idxAttr = target.getAttribute('data-drop-lane')
    if (idxAttr === null) return null
    const idx = Number(idxAttr)
    if (Number.isNaN(idx)) return null
    return idx
  }, [])

  const commitDragPlay = useCallback((index: number, clientX: number, clientY: number, canPlay: boolean): boolean => {
    if (!canPlay) return false
    const dy = (dragRef.current?.originY ?? clientY) - clientY
    let laneIndex = findDropLane(clientX, clientY)
    // Pull-up gesture: dragging > 60px above origin commits to first open lane.
    if (laneIndex === null && dy >= PULL_UP_COMMIT_PX) {
      const openLane = game.player.board.findIndex((slot) => slot === null)
      if (openLane >= 0) laneIndex = openLane
    }
    if (laneIndex === null) return false
    if (game.player.board[laneIndex] !== null) return false
    handlePlayCard(index)
    triggerSlam(laneIndex)
    return true
  }, [findDropLane, game.player.board, handlePlayCard, triggerSlam])

  const cancelDrag = useCallback(() => {
    setDrag(null)
  }, [])

  const handleHandPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>, index: number, canPlay: boolean) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    setDrag({
      handIndex: index,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      active: false,
      canPlay,
    })
    dragHandledRef.current = false
  }, [])

  const handleHandPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.originX
    const dy = event.clientY - current.originY
    const distance = Math.hypot(dx, dy)
    if (!current.active && distance >= DRAG_ACTIVATE_PX) {
      // First time we cross the threshold — lift the card.
      playSound('cardLift', soundEnabled)
      pulseFeedback(8)
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        /* setPointerCapture not supported / already captured */
      }
      setDrag({ ...current, pointerX: event.clientX, pointerY: event.clientY, active: true })
    } else if (current.active) {
      setDrag({ ...current, pointerX: event.clientX, pointerY: event.clientY })
    }
  }, [soundEnabled])

  const handleHandPointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    const current = dragRef.current
    if (!current || current.pointerId !== event.pointerId) {
      cancelDrag()
      return
    }
    if (current.active) {
      const committed = commitDragPlay(index, event.clientX, event.clientY, current.canPlay)
      dragHandledRef.current = true
      cancelDrag()
      // Suppress synthetic click that follows pointerup on touch.
      event.preventDefault()
      // If drop was a no-op, the card just snaps back via state reset.
      if (!committed) {
        // No additional sound needed — cardLift already played on activate.
      }
    } else {
      cancelDrag()
    }
  }, [cancelDrag, commitDragPlay])

  const handleHandPointerCancel = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (current && current.pointerId === event.pointerId) {
      cancelDrag()
    }
  }, [cancelDrag])

  const dragActive = Boolean(drag?.active)
  const dragHandIndex = drag?.handIndex ?? null

  // Compose pointer handlers that run BOTH the long-press inspect logic and
  // the drag-to-play logic. Long-press already cancels itself when pointer
  // moves > 6px, so the drag activation threshold (12px) keeps inspect from
  // racing the lift.
  const composeHandlers = (card: Parameters<typeof getLongPressProps>[0], index: number, canPlay: boolean) => {
    const longPress = getLongPressProps(card) as {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
      onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void
      onContextMenu: (e: React.MouseEvent<HTMLElement>) => void
    }
    return {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        longPress.onPointerDown(event)
        handleHandPointerDown(event, index, canPlay)
      },
      onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
        longPress.onPointerMove(event)
        handleHandPointerMove(event)
      },
      onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
        longPress.onPointerUp(event)
        handleHandPointerUp(event, index)
      },
      onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => {
        longPress.onPointerLeave(event)
      },
      onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
        longPress.onPointerCancel(event)
        handleHandPointerCancel(event)
      },
      onContextMenu: longPress.onContextMenu,
    }
  }

  const consumeDragHandled = (): boolean => {
    if (dragHandledRef.current) {
      dragHandledRef.current = false
      return true
    }
    return false
  }

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
            <div
              className={[
                'hero-compact',
                'enemy',
                enemyHeroFx === 'damaged' ? 'is-damaged' : '',
                enemyHeroFx === 'healed' ? 'is-healed' : '',
              ].filter(Boolean).join(' ')}
            >
              <strong>{game.enemy.name}</strong>
              <span className="hero-health"><StatIcon kind="health" /> {game.enemy.health}</span>
              {enemyHeroFx === 'damaged' && (
                <img className="hero-fx-overlay hero-fx-cracks" src={UI_ASSETS.overlays.heroCracks} alt="" aria-hidden="true" />
              )}
              {enemyHeroFx === 'healed' && (
                <img className="hero-fx-overlay hero-fx-halo" src={UI_ASSETS.overlays.heroHalo} alt="" aria-hidden="true" />
              )}
            </div>
            <div className="battle-turn-label">
              <span className="eyebrow">Turn {game.turnNumber}</span>
              <strong className="battle-turn-state">{battleStatusLabel}</strong>
            </div>
            <div
              className={[
                'hero-compact',
                'player',
                playerHeroFx === 'damaged' ? 'is-damaged' : '',
                playerHeroFx === 'healed' ? 'is-healed' : '',
                playerLowHp ? 'is-low-hp' : '',
              ].filter(Boolean).join(' ')}
            >
              <strong>{game.player.name}</strong>
              <span className="hero-health"><StatIcon kind="health" /> {game.player.health}</span>
              {playerHeroFx === 'damaged' && (
                <img className="hero-fx-overlay hero-fx-cracks" src={UI_ASSETS.overlays.heroCracks} alt="" aria-hidden="true" />
              )}
              {playerHeroFx === 'healed' && (
                <img className="hero-fx-overlay hero-fx-halo" src={UI_ASSETS.overlays.heroHalo} alt="" aria-hidden="true" />
              )}
            </div>
          </div>
        </div>

        <div className="battle-action-row">
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

          <div className="controls battle-controls">
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
        </div>
      </section>

      <section className={`battlefield screen-panel ${isBattle ? 'active' : 'hidden'}`}>
        <article className="section-card battlefield-stage" ref={battlefieldRef}>
          <div className="battlefield-side enemy-side">
            <div className="section-head battle-side-head">
              <h2>{game.enemy.name} Frontline</h2>
              <span className="badge">Enemy {game.enemy.health} HP</span>
            </div>

            <div className="board-grid board-grid-battle">
              {game.enemy.board.map((unit, index) => {
                if (!unit) {
                  return (
                    <div className="slot empty" key={`enemy-empty-${index}`} ref={(el) => { enemySlotRefs.current[index] = el }}>
                      Empty lane
                    </div>
                  )
                }

                const isSelectable = false
                const isSelected = false
                const isValidDefender = selectedAttacker !== null && !defenderHasGuard
                  ? true
                  : selectedAttacker !== null && unit.effect === 'guard'
                const isInvalidDefender = selectedAttacker !== null && !isValidDefender

                return (
                  <button
                    className={[
                      'slot',
                      `rarity-${unit.rarity}`,
                      unit.effect === 'guard' ? 'guard' : '',
                      unit.exhausted ? 'exhausted' : '',
                      isSelected ? 'selected' : '',
                      damagedSlots.has(unit.uid) ? 'damage-flash' : '',
                      isValidDefender && selectedAttacker !== null ? 'is-valid-defender' : '',
                      isInvalidDefender ? 'is-invalid-defender' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={unit.uid}
                    ref={(el) => { enemySlotRefs.current[index] = el }}
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
          </div>

          <div className="battle-centerline">
            <div className="battle-center-status">
              <span className="eyebrow">Arena clash</span>
              <strong>{battleStatusLabel}</strong>
            </div>
            <button
              className="ghost"
              onClick={() => handleAttackTarget('hero')}
              disabled={selectedAttacker === null || defenderHasGuard || Boolean(game.winner)}
            >
              Strike Hero
            </button>
          </div>

          <div className="battlefield-side player-side">
            <div className="section-head battle-side-head">
              <h2>{game.player.name} Frontline</h2>
              <span className="badge">{isMyTurn ? 'Your turn' : 'Holding'}</span>
            </div>

            <div className="board-grid board-grid-battle">
              {game.player.board.map((unit, index) => {
                if (!unit) {
                  return (
                    <div
                      className={[
                        'slot',
                        'empty',
                        dragActive ? 'drop-target-active' : '',
                        dragActive ? 'drop-target-valid' : '',
                        slamLane === index ? 'is-slamming' : '',
                      ].filter(Boolean).join(' ')}
                      key={`player-empty-${index}`}
                      data-drop-lane={index}
                      ref={(el) => { playerSlotRefs.current[index] = null; void el }}
                    >
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
                      dragActive ? 'drop-target-active' : '',
                      dragActive ? 'drop-target-invalid' : '',
                      slamLane === index ? 'is-slamming' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={unit.uid}
                    ref={(el) => { playerSlotRefs.current[index] = el }}
                    style={{ '--rarity-color': RARITY_COLORS[unit.rarity] } as React.CSSProperties}
                    onClick={() => {
                      if (consumeLongPressAction()) return
                      if (consumeDragHandled()) return
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
          </div>

          {arrow && (
            <svg
              className="attack-arrow-svg"
              role="presentation"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="attackArrowStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#fde68a" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity="0.95" />
                </linearGradient>
              </defs>
              <line
                x1={arrow.fromX}
                y1={arrow.fromY}
                x2={arrow.toX}
                y2={arrow.toY}
                stroke="url(#attackArrowStroke)"
                strokeWidth={6}
                strokeLinecap="round"
              />
              <image
                href={UI_ASSETS.overlays.attackArrow}
                x={arrow.toX - 18}
                y={arrow.toY - 18}
                width={36}
                height={36}
                style={{
                  transform: `rotate(${(Math.atan2(arrow.toY - arrow.fromY, arrow.toX - arrow.fromX) * 180) / Math.PI}deg)`,
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
              />
            </svg>
          )}
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
          <div className="section-head battle-hand-head">
            <div>
              <h2>Hand</h2>
              <p className="note battle-hand-note">Tap to cast or hold to inspect.</p>
            </div>
            <span className="badge">Mana {activePlayer.mana}/{activePlayer.maxMana}</span>
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
              const isDragging = dragActive && dragHandIndex === index
              const inspectCard = { name: card.name, icon: card.icon, id: card.id, cost: card.cost, attack: card.attack, health: card.health, rarity: card.rarity, tribe: card.tribe, text: card.text, effect: card.effect ?? null }
              const composed = composeHandlers(inspectCard, index, canPlay)
              const dragStyle: React.CSSProperties = isDragging && drag
                ? {
                    '--drag-dx': `${drag.pointerX - drag.originX}px`,
                    '--drag-dy': `${drag.pointerY - drag.originY}px`,
                  } as React.CSSProperties
                : {}

              return (
                <button
                  className={[
                    'hand-card',
                    `rarity-${card.rarity}`,
                    `border-${selectedCardBorder}`,
                    canPlay ? '' : 'unplayable',
                    isDragging ? 'is-dragging' : '',
                    dragActive && !isDragging ? 'is-drag-sibling' : '',
                  ].filter(Boolean).join(' ')}
                  key={card.instanceId}
                  data-need={overlayLabel}
                  onClick={() => {
                    if (consumeLongPressAction()) return
                    if (consumeDragHandled()) return
                    if (canPlay) handlePlayCard(index)
                  }}
                  {...composed}
                  aria-disabled={!canPlay}
                  title={canPlay ? 'Tap or drag to play, long press to inspect' : `${overlayLabel}. Long press to inspect.`}
                  style={{
                    '--rarity-color': RARITY_COLORS[card.rarity],
                    '--fan-tilt': `${fanTilt}deg`,
                    '--fan-order': index + 1,
                    ...dragStyle,
                  } as React.CSSProperties}
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
