import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  RARITY_COLORS,
  type CardInstance,
} from '../game'
import { cardArtPath, getHandFanTilt, handleCardArtError, pulseFeedback } from '../utils'
import { UI_ASSETS } from '../constants'
import { playSound, startLoopingSound } from '../audio'
import { EffectBadge, StatIcon } from '../components/AssetBadge'
import { SummaryPopup } from '../components/SummaryPopup'
import { useAppShell, useGame, useProfile } from '../contexts'
import type { InspectedCard } from '../types'

function toInspectPayload(card: CardInstance): InspectedCard {
  return { name: card.name, icon: card.icon, id: card.id, cost: card.cost, attack: card.attack, health: card.health, rarity: card.rarity, tribe: card.tribe, text: card.text, effect: card.effect ?? null }
}

const BattleFxCanvas = lazy(() =>
  import('../components/BattleFxCanvas').then((m) => ({ default: m.BattleFxCanvas })),
)

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
  const {
    activeScreen,
    openScreen,
    backendOnline,
    soundEnabled,
    hapticsEnabled,
    cinemaSequence,
    battleSummaryVisible,
    dismissBattleSummary,
  } = useAppShell()
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
  const resultTone = game.winner === 'player' ? 'victory' : game.winner === 'enemy' ? 'defeat' : 'draw'
  const showBattleSummary = Boolean(game.winner) && !enemyTurnActive
    && ((battleSummaryVisible ?? false) || (game.winner !== 'player' && !cinemaSequence))
  const battleSummaryTitle = game.winner === 'player'
    ? 'Victory secured'
    : game.winner === 'enemy'
      ? 'Defeat recorded'
      : 'Battle drawn'
  const battleSummaryNote = game.winner === 'player'
    ? 'Rewards are tallied and the arena is ready when you are.'
    : game.winner === 'enemy'
      ? 'Regroup, adjust your line, and jump straight back into the arena.'
      : 'A close duel. Refine the list and queue again.'
  const battleSummaryBadge = isRankedBattle
    ? (game.winner === 'player' ? '+25 Rating' : game.winner === 'enemy' ? '-15 Rating' : 'Even Match')
    : battleKind === 'local'
      ? 'Casual Duel'
      : game.winner === 'player'
        ? '+30 Shards'
        : 'Practice Match'
  const battleCenterLabel = selectedAttacker === null
    ? (isMyTurn ? 'Deploy or strike' : 'Hold formation')
    : defenderHasGuard
      ? 'Guard blocks the hero'
      : 'Choose target'

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
  // Incremented on each successful card play to drive PixiJS play-burst FX.
  const [fxPlayCount, setFxPlayCount] = useState(0)

  const triggerSlam = useCallback((laneIndex: number) => {
    if (slamTimerRef.current) {
      window.clearTimeout(slamTimerRef.current)
    }
    setSlamLane(laneIndex)
    setFxPlayCount((c) => c + 1)
    slamTimerRef.current = window.setTimeout(() => {
      setSlamLane(null)
      slamTimerRef.current = null
    }, SLAM_DURATION_MS)
  }, [])

  useEffect(() => () => {
    if (slamTimerRef.current) window.clearTimeout(slamTimerRef.current)
  }, [])

  // ─── Turn-change pulse ─────────────────────────────────────────────
  const [turnPulse, setTurnPulse] = useState<'player' | 'enemy' | null>(null)
  const prevTurnRef = useRef(game.turn)
  useEffect(() => {
    if (game.turn !== prevTurnRef.current && !game.winner) {
      setTurnPulse(game.turn === 'player' ? 'player' : 'enemy')
      if (!enemyTurnActive) {
        playSound('turnChange', soundEnabled)
      }
      const id = window.setTimeout(() => setTurnPulse(null), 650)
      prevTurnRef.current = game.turn
      return () => window.clearTimeout(id)
    }
    prevTurnRef.current = game.turn
  }, [game.turn, game.winner, soundEnabled, enemyTurnActive])

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
        pulseFeedback(18, hapticsEnabled)
      } else {
        playSound('heroHeal', soundEnabled)
        pulseFeedback(10, hapticsEnabled)
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
  }, [game.player.health, game.enemy.health, soundEnabled, hapticsEnabled])

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

  // ─── Reset transient FX state on new match (Play Again) ────────────
  const matchIdRef = useRef(`${game.enemy.name}-${game.turnNumber}`)
  useEffect(() => {
    const matchId = `${game.enemy.name}-${game.turnNumber}`
    if (game.turnNumber <= 1 && !game.winner && matchId !== matchIdRef.current) {
      setSlamLane(null)
      setTurnPulse(null)
      setArrow(null)
      setPlayerHeroFx(null)
      setEnemyHeroFx(null)
      setDrag(null)
      dragRef.current = null
      prevTurnRef.current = game.turn
      prevHeroRef.current = { player: game.player.health, enemy: game.enemy.health }
      if (slamTimerRef.current) { window.clearTimeout(slamTimerRef.current); slamTimerRef.current = null }
      if (playerFxTimerRef.current) { window.clearTimeout(playerFxTimerRef.current); playerFxTimerRef.current = null }
      if (enemyFxTimerRef.current) { window.clearTimeout(enemyFxTimerRef.current); enemyFxTimerRef.current = null }
    }
    matchIdRef.current = matchId
  }, [game.enemy.name, game.turnNumber, game.winner, game.turn, game.player.health, game.enemy.health])

  // ─── Drag-to-play handlers ──────────────────────────────────────────
  const findDropLane = useCallback((clientX: number, clientY: number): number | null => {
    if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null
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
    dragRef.current = null
    setDrag(null)
  }, [])

  const handleHandPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>, index: number, canPlay: boolean) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const nextDrag = {
      handIndex: index,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      active: false,
      canPlay,
    }
    dragRef.current = nextDrag
    setDrag(nextDrag)
    dragHandledRef.current = false
  }, [])

  const handleHandPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.originX
    const dy = event.clientY - current.originY
    const distance = Math.hypot(dx, dy)
    const verticalIntent = Math.abs(dy) > Math.abs(dx) && dy < 0

    if (current.canPlay && verticalIntent && distance >= DRAG_ACTIVATE_PX) {
      event.preventDefault()
    }

    if (!current.active && distance >= DRAG_ACTIVATE_PX) {
      playSound('cardLift', soundEnabled)
      pulseFeedback(8, hapticsEnabled)
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        /* setPointerCapture not supported / already captured */
      }
      const nextDrag = { ...current, pointerX: event.clientX, pointerY: event.clientY, active: true }
      dragRef.current = nextDrag
      setDrag(nextDrag)
    } else if (current.active) {
      event.preventDefault()
      const nextDrag = { ...current, pointerX: event.clientX, pointerY: event.clientY }
      dragRef.current = nextDrag
      setDrag(nextDrag)
    }
  }, [soundEnabled, hapticsEnabled])

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
    const longPress = (getLongPressProps(card) ?? {}) as Partial<{
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
      onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void
      onContextMenu: (e: React.MouseEvent<HTMLElement>) => void
    }>
    return {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        longPress.onPointerDown?.(event)
        handleHandPointerDown(event, index, canPlay)
      },
      onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
        longPress.onPointerMove?.(event)
        handleHandPointerMove(event)
      },
      onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
        longPress.onPointerUp?.(event)
        handleHandPointerUp(event, index)
      },
      onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => {
        longPress.onPointerLeave?.(event)
      },
      onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
        longPress.onPointerCancel?.(event)
        handleHandPointerCancel(event)
      },
      onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => {
        longPress.onContextMenu?.(event)
      },
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

      <section className={`battlefield screen-panel ${isBattle ? 'active' : 'hidden'} ${game.winner ? 'has-winner' : ''}`}>
        <article className={`section-card battlefield-stage battle-arena-frame ${turnPulse ? `turn-pulse-${turnPulse}` : ''}`} ref={battlefieldRef}>
          <Suspense fallback={null}>
            <BattleFxCanvas
              turn={game.turn}
              damagedSlots={damagedSlots}
              hasWinner={Boolean(game.winner)}
              playCount={fxPlayCount}
              containerRef={battlefieldRef}
            />
          </Suspense>
          {enemyTurnActive && (
            <div className="battle-overlay-stack">
              <div className="enemy-turn-banner enemy-turn-banner-floating" role="status" aria-live="polite" aria-atomic="true">
                <div className="enemy-turn-banner-inner">
                  <span className="enemy-turn-crest" aria-hidden="true" />
                  <div className="enemy-turn-copy">
                    <strong>Enemy is thinking</strong>
                    <span className="enemy-turn-label">{enemyTurnLabel}</span>
                  </div>
                  <span className="thinking-dots" aria-hidden="true" />
                </div>
              </div>
            </div>
          )}

          {/* ─── Enemy Hero Anchor ──────────────────────────────── */}
          <div
            className={[
              'battle-hero-anchor',
              'enemy',
              enemyHeroFx === 'damaged' ? 'is-damaged' : '',
              enemyHeroFx === 'healed' ? 'is-healed' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="battle-hero-side">Enemy</span>
            <strong className="battle-hero-name">{game.enemy.name}</strong>
            <span className="battle-hero-hp"><StatIcon kind="health" /> {game.enemy.health}</span>
            {enemyHeroFx === 'damaged' && (
              <img className="hero-fx-overlay hero-fx-cracks" src={UI_ASSETS.overlays.heroCracks} alt="" aria-hidden="true" />
            )}
            {enemyHeroFx === 'healed' && (
              <img className="hero-fx-overlay hero-fx-halo" src={UI_ASSETS.overlays.heroHalo} alt="" aria-hidden="true" />
            )}
          </div>

          <div className="battle-board-stack">
            <div className="battlefield-side enemy-side">
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
                    <img className="unit-portrait" src={cardArtPath(unit.id)} alt={`${unit.name} artwork`} loading="lazy" onError={handleCardArtError} draggable={false} />
                    <div className="slot-head">
                      <strong>
                        {unit.icon} {unit.name}
                      </strong>
                      <span className="stats battle-stats-inline">
                        <span><StatIcon kind="attack" />{unit.attack}</span>
                        <span><StatIcon kind="health" />{unit.currentHealth}</span>
                      </span>
                    </div>
                    {unit.effect && <EffectBadge effect={unit.effect} compact iconOnly className="battle-slot-effect" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="battle-centerline">
            <span className="battle-center-turn">T{game.turnNumber}</span>
            <strong className="battle-center-note">{battleCenterLabel}</strong>
            <span className={`battle-center-phase ${isMyTurn ? 'is-player-turn' : 'is-enemy-turn'}`}>{isMyTurn ? 'Your turn' : 'Enemy turn'}</span>
          </div>

          <div className="battlefield-side player-side">
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
                    <img className="unit-portrait" src={cardArtPath(unit.id)} alt={`${unit.name} artwork`} loading="lazy" onError={handleCardArtError} draggable={false} />
                    <div className="slot-head">
                      <strong>
                        {unit.icon} {unit.name}
                      </strong>
                      <span className="stats battle-stats-inline">
                        <span><StatIcon kind="attack" />{unit.attack}</span>
                        <span><StatIcon kind="health" />{unit.currentHealth}</span>
                      </span>
                    </div>
                    {unit.effect && <EffectBadge effect={unit.effect} compact iconOnly className="battle-slot-effect" />}
                  </button>
                )
              })}
            </div>
          </div>

          </div>

          {/* ─── Player Hero Anchor ─────────────────────────────── */}
          <div
            className={[
              'battle-hero-anchor',
              'player',
              playerHeroFx === 'damaged' ? 'is-damaged' : '',
              playerHeroFx === 'healed' ? 'is-healed' : '',
              playerLowHp ? 'is-low-hp' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="battle-hero-side">You</span>
            <strong className="battle-hero-name">{game.player.name}</strong>
            <span className="battle-hero-hp"><StatIcon kind="health" /> {game.player.health}</span>
            <span className="battle-hero-resource" aria-label={`Mana ${activePlayer.mana} of ${activePlayer.maxMana}`}>
              <StatIcon kind="mana" /> {activePlayer.mana}/{activePlayer.maxMana}
            </span>
            <span className="battle-hero-resource momentum" aria-label={`Momentum ${activePlayer.momentum} of 10`}>
              M {activePlayer.momentum}/10
            </span>
            {playerHeroFx === 'damaged' && (
              <img className="hero-fx-overlay hero-fx-cracks" src={UI_ASSETS.overlays.heroCracks} alt="" aria-hidden="true" />
            )}
            {playerHeroFx === 'healed' && (
              <img className="hero-fx-overlay hero-fx-halo" src={UI_ASSETS.overlays.heroHalo} alt="" aria-hidden="true" />
            )}
          </div>

          {/* ─── Action Dock ────────────────────────────────────── */}
          <div className={`battle-action-dock ${selectedAttacker !== null ? 'battle-action-dock-attack' : ''}`}>
            <button
              className="primary"
              onClick={handleBurst}
              disabled={activePlayer.momentum < 3 || Boolean(game.winner) || !isMyTurn}
            >
              Burst
            </button>
            <button className="secondary" onClick={handleEndTurn} disabled={Boolean(game.winner) || !isMyTurn}>
              {!isMyTurn ? (
                <><span className="spinner spinner-inline" aria-hidden="true" />Waiting<span className="thinking-dots" /></>
              ) : (
                'End Turn'
              )}
            </button>
            {selectedAttacker !== null && !defenderHasGuard && (
              <button
                className="ghost"
                onClick={() => handleAttackTarget('hero')}
                disabled={Boolean(game.winner)}
              >
                Strike Hero
              </button>
            )}
            <button className="ghost" onClick={handleLeaveBattle}>
              Leave
            </button>
          </div>

          <div className="battle-hand-rail" data-tour-id="battle-hand">
            <div className={`hand-grid hand-fan-grid ${dragActive ? 'is-drag-active' : ''}`} data-scene-swipe-opt-out aria-label="Battle hand">
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
                const inspectCard = toInspectPayload(card)
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
                      if (canPlay) {
                        handlePlayCard(index)
                      } else {
                        playSound('error', soundEnabled)
                        pulseFeedback(6, hapticsEnabled)
                      }
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
                      {card.effect && <EffectBadge effect={card.effect} compact iconOnly className="battle-hand-effect" />}
                    </div>
                    <div className="card-art-shell thumb">
                      <img className="card-illustration" src={cardArtPath(card.id)} alt={`${card.name} artwork`} loading="lazy" onError={handleCardArtError} draggable={false} />
                    </div>
                    <div>
                      <strong className="card-name">{card.name}</strong>
                    </div>
                    <div className="card-stats">
                      <span><StatIcon kind="attack" /> {card.attack}</span>
                      <span><StatIcon kind="health" /> {card.health}</span>
                    </div>
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

      <SummaryPopup
        visible={showBattleSummary}
        ariaLabel="Battle summary"
        eyebrow="Battle summary"
        title={battleSummaryTitle}
        note={battleSummaryNote}
        tone={resultTone}
        statusBadge={battleSummaryBadge}
        highlights={[
          rankLabel,
          `Rating ${seasonRating}`,
          `Win Rate ${winRate}%`,
          battleModeLabel,
        ]}
        actions={[
          {
            label: 'Play Again',
            variant: 'primary',
            onClick: () => {
              dismissBattleSummary?.()
              startMatch(game.mode)
            },
          },
          {
            label: 'Leave to Lobby',
            variant: 'ghost',
            onClick: () => {
              dismissBattleSummary?.()
              setPreferredMode('ai')
              openScreen('home')
            },
          },
        ]}
      />

    </>
  )
}
