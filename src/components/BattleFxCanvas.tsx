/**
 * BattleFxCanvas — PixiJS-powered particle overlay for the battle arena.
 *
 * Renders a transparent canvas behind the React DOM board, providing:
 *  - Ambient floating embers/dust that drift upward
 *  - Color-reactive particles that shift hue based on turn ownership
 *  - A brief burst of particles on damage events
 *
 * Lazy-loaded so PixiJS only ships when battle is active.
 * Respects `prefers-reduced-motion` — disables particles entirely.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Application, extend, useApplication, useTick } from '@pixi/react'
import { Container, Graphics, type Application as PixiApplication } from 'pixi.js'

extend({ Container, Graphics })

// ── Types ─────────────────────────────────────────────────────────

type BattleFxProps = {
  /** Current turn owner — tints the ambient palette. */
  turn: 'player' | 'enemy'
  /** Set of unit UIDs that just took damage — triggers burst FX. */
  damagedSlots: ReadonlySet<string>
  /** Whether a winner has been declared — intensifies particles. */
  hasWinner: boolean
  /** Incremented each time a card is played — triggers play burst. */
  playCount: number
  /** Container element to size against. */
  containerRef: React.RefObject<HTMLElement | null>
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  radius: number
  life: number
  maxLife: number
}

type FxSize = {
  width: number
  height: number
}

// ── Constants ─────────────────────────────────────────────────────

const AMBIENT_COUNT = 40
const BURST_COUNT = 12
const PLAY_BURST_COUNT = 8
const VICTORY_BURST_COUNT = 60
const SWEEP_COUNT = 20

const PLAYER_COLOR = 0x3b82f6  // blue-500
const ENEMY_COLOR = 0xef4444   // red-500
const WINNER_COLOR = 0xfbbf24  // amber-400
const SWEEP_PLAYER_COLOR = 0x60a5fa // blue-400
const SWEEP_ENEMY_COLOR = 0xf87171  // red-400
const MAX_PARTICLES = 200
const FALLBACK_FX_SIZE: FxSize = { width: 400, height: 600 }

// ── Helpers ───────────────────────────────────────────────────────

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readContainerSize(containerRef: React.RefObject<HTMLElement | null>): FxSize | null {
  const rect = containerRef.current?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return { width: rect.width, height: rect.height }
}

function readFxSize(app: PixiApplication, containerRef: React.RefObject<HTMLElement | null>): FxSize {
  const rendererScreen = app.renderer?.screen
  if (rendererScreen?.width > 0 && rendererScreen.height > 0) {
    return { width: rendererScreen.width, height: rendererScreen.height }
  }

  return readContainerSize(containerRef) ?? FALLBACK_FX_SIZE
}

function createParticle(w: number, h: number, kind: 'ambient' | 'burst' | 'play' | 'victory' | 'sweep' = 'ambient'): Particle {
  switch (kind) {
    case 'burst': {
      const maxLife = 30 + Math.random() * 30
      return {
        x: Math.random() * w,
        y: h * 0.5 + (Math.random() - 0.5) * h * 0.3,
        vx: (Math.random() - 0.5) * 2.5,
        vy: -(1.5 + Math.random() * 2),
        alpha: 0.6 + Math.random() * 0.3,
        radius: 1.5 + Math.random() * 2,
        life: 0,
        maxLife,
      }
    }
    case 'play': {
      const maxLife = 25 + Math.random() * 25
      return {
        x: w * 0.5 + (Math.random() - 0.5) * w * 0.4,
        y: h * 0.85 + Math.random() * h * 0.1,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -(2 + Math.random() * 2.5),
        alpha: 0.5 + Math.random() * 0.35,
        radius: 1.2 + Math.random() * 1.8,
        life: 0,
        maxLife,
      }
    }
    case 'victory': {
      const maxLife = 60 + Math.random() * 80
      return {
        x: Math.random() * w,
        y: h + Math.random() * 20,
        vx: (Math.random() - 0.5) * 3,
        vy: -(2 + Math.random() * 3),
        alpha: 0.5 + Math.random() * 0.4,
        radius: 1.5 + Math.random() * 2.5,
        life: 0,
        maxLife,
      }
    }
    case 'sweep': {
      const maxLife = 30 + Math.random() * 20
      return {
        x: -10,
        y: Math.random() * h,
        vx: 4 + Math.random() * 3,
        vy: (Math.random() - 0.5) * 0.6,
        alpha: 0.35 + Math.random() * 0.3,
        radius: 1 + Math.random() * 1.5,
        life: 0,
        maxLife,
      }
    }
    default: {
      const maxLife = 120 + Math.random() * 180
      return {
        x: Math.random() * w,
        y: h + Math.random() * 20,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(0.3 + Math.random() * 0.6),
        alpha: 0.15 + Math.random() * 0.25,
        radius: 1 + Math.random() * 1.5,
        life: 0,
        maxLife,
      }
    }
  }
}

// ── Particle tick (pure — returns a new array) ───────────────────

function tickParticles(
  particles: Particle[],
  w: number,
  h: number,
  color: number,
  sweepColor: number,
  g: Graphics,
): Particle[] {
  g.clear()
  const alive: Particle[] = []

  for (const p of particles) {
    const nx = p.x + p.vx
    const ny = p.y + p.vy
    const nvx = p.vx + (Math.random() - 0.5) * 0.04
    const nLife = p.life + 1

    const lifeRatio = nLife / p.maxLife
    const fadeAlpha = lifeRatio < 0.1
      ? lifeRatio / 0.1
      : lifeRatio > 0.7
        ? 1 - (lifeRatio - 0.7) / 0.3
        : 1

    const a = p.alpha * fadeAlpha

    // Sweep particles travel rightward and can exit the right edge
    const isSweep = p.vx > 3
    const inBounds = isSweep ? nx < w + 20 && ny > -20 : ny > -20

    if (nLife < p.maxLife && inBounds && a > 0.01) {
      g.circle(nx, ny, p.radius)
      g.fill({ color: isSweep ? sweepColor : color, alpha: a })
      alive.push({ ...p, x: nx, y: ny, vx: nvx, life: nLife })
    }
  }

  while (alive.length < AMBIENT_COUNT) {
    alive.push(createParticle(w, h))
  }

  // Safety cap — prevent unbounded growth during rapid FX triggers.
  if (alive.length > MAX_PARTICLES) {
    alive.splice(0, alive.length - MAX_PARTICLES)
  }

  return alive
}

// ── Inner scene rendered inside the PixiJS Application ────────────

function BattleFxScene({ turn, damagedSlots, hasWinner, playCount, containerRef }: BattleFxProps) {
  const { app, isInitialised } = useApplication()
  const particlesRef = useRef<Particle[]>([])
  const graphicsRef = useRef<Graphics | null>(null)
  const prevPlayCountRef = useRef<number>(playCount)
  const prevTurnRef = useRef(turn)
  const victoryBurstFiredRef = useRef(false)
  const getFxSize = useCallback(() => readFxSize(app, containerRef), [app, containerRef])

  // Seed ambient particles on mount
  useEffect(() => {
    if (!isInitialised) return
    const { width: w, height: h } = getFxSize()
    particlesRef.current = Array.from({ length: AMBIENT_COUNT }, () => {
      const p = createParticle(w, h)
      p.y = Math.random() * h  // scatter across full height initially
      p.life = Math.random() * p.maxLife
      return p
    })
  }, [getFxSize, isInitialised])

  // Burst on new damage events — triggers when damagedSlots ref changes with size > 0
  useEffect(() => {
    if (isInitialised && damagedSlots.size > 0) {
      const { width: w, height: h } = getFxSize()
      for (let i = 0; i < BURST_COUNT; i++) {
        particlesRef.current.push(createParticle(w, h, 'burst'))
      }
    }
  }, [damagedSlots, getFxSize, isInitialised])

  // Card-play burst — erupts upward from hand region
  useEffect(() => {
    if (isInitialised && playCount > prevPlayCountRef.current) {
      const { width: w, height: h } = getFxSize()
      for (let i = 0; i < PLAY_BURST_COUNT; i++) {
        particlesRef.current.push(createParticle(w, h, 'play'))
      }
    }
    prevPlayCountRef.current = playCount
  }, [getFxSize, isInitialised, playCount])

  // Turn-change sweep — horizontal particle wave
  useEffect(() => {
    if (isInitialised && turn !== prevTurnRef.current) {
      const { width: w, height: h } = getFxSize()
      for (let i = 0; i < SWEEP_COUNT; i++) {
        particlesRef.current.push(createParticle(w, h, 'sweep'))
      }
    }
    prevTurnRef.current = turn
  }, [getFxSize, isInitialised, turn])

  // Victory celebration — one-shot particle shower
  useEffect(() => {
    if (isInitialised && hasWinner && !victoryBurstFiredRef.current) {
      victoryBurstFiredRef.current = true
      const { width: w, height: h } = getFxSize()
      for (let i = 0; i < VICTORY_BURST_COUNT; i++) {
        particlesRef.current.push(createParticle(w, h, 'victory'))
      }
    }
    if (!hasWinner) victoryBurstFiredRef.current = false
  }, [getFxSize, hasWinner, isInitialised])

  const mainColor = hasWinner ? WINNER_COLOR : turn === 'player' ? PLAYER_COLOR : ENEMY_COLOR
  const sweepColor = turn === 'player' ? SWEEP_PLAYER_COLOR : SWEEP_ENEMY_COLOR

  const draw = useCallback((g: Graphics) => {
    graphicsRef.current = g
  }, [])

  useTick(() => {
    const g = graphicsRef.current
    if (!isInitialised || !g) return
    const { width: w, height: h } = getFxSize()

    particlesRef.current = tickParticles(particlesRef.current, w, h, mainColor, sweepColor, g)
  })

  return <pixiGraphics draw={draw} />
}

// ── Public component ──────────────────────────────────────────────

export function BattleFxCanvas(props: BattleFxProps) {
  const [reducedMotion, setReducedMotion] = useState(detectReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const resizeTo = useMemo(
    () => props.containerRef,
    [props.containerRef],
  )

  if (reducedMotion) return null

  return (
    <div
      className="battle-fx-canvas"
      aria-hidden="true"
    >
      <Application
        resizeTo={resizeTo}
        backgroundAlpha={0}
        preference="webgpu"
        autoStart
      >
        <BattleFxScene {...props} />
      </Application>
    </div>
  )
}
