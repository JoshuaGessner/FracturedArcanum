/**
 * Phase 3W — Unified Reward Cinema Overlay
 *
 * One overlay primitive that plays a sequence of cinematic "beats" so every
 * reward moment in the game (battle victory, daily claim, pack summary,
 * rank-up) shares the same vocabulary: icon entrance, count-up values,
 * banner unfurl, optional ember shower, and an explicit `Continue` CTA.
 *
 * Beat schema and pure builders live in `./RewardCinemaSequence`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UI_ASSETS } from '../constants'
import { feedback } from '../feedback'
import { playSound } from '../audio'
import type { RewardBeat } from './RewardCinemaSequence'

export type RewardCinemaOverlayProps = {
  sequence: RewardBeat[] | null
  soundEnabled: boolean
  hapticsEnabled: boolean
  onClose: () => void
}

const FULL_BEAT_DURATIONS: Record<RewardBeat['kind'], number> = {
  banner: 1100,
  count: 1300,
  shower: 1400,
  card: 900,
}

const COUNT_UP_DURATION = 700

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Animated counter that eases to `value` over ~700ms (or jumps if reduced).
 * Caller is expected to mount one instance per beat (via `key`) so the
 * component's initial state seeds correctly.
 */
function CountUp({ value, reducedMotion }: { value: number; reducedMotion: boolean }) {
  const [display, setDisplay] = useState<number>(reducedMotion ? value : 0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (reducedMotion) return undefined
    startRef.current = null

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const progress = Math.min(1, elapsed / COUNT_UP_DURATION)
      setDisplay(Math.round(easeOutCubic(progress) * value))
      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(tick)
      }
    }

    rafRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [value, reducedMotion])

  return <span className="reward-cinema-count">{display.toLocaleString()}</span>
}

/**
 * Inner overlay body — receives a non-empty sequence. Parent component
 * keys this on `sequenceKey` so a brand-new sequence remounts and resets
 * `beatIndex` to 0 without a setState-in-effect ping-pong.
 */
function RewardCinemaInner({
  beats,
  soundEnabled,
  hapticsEnabled,
  onClose,
}: {
  beats: RewardBeat[]
  soundEnabled: boolean
  hapticsEnabled: boolean
  onClose: () => void
}) {
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => detectReducedMotion())
  const [beatIndex, setBeatIndex] = useState(0)

  // Keep reduced-motion preference in sync with the OS setting.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const currentBeat = beats[beatIndex]
  const isLastBeat = beatIndex >= beats.length - 1

  // Play this beat's sound once it lands. Honours the global sound toggle.
  useEffect(() => {
    if (!currentBeat?.sound) return
    playSound(currentBeat.sound, soundEnabled)
  }, [currentBeat, soundEnabled])

  // Auto-advance through beats. The final beat persists until Continue.
  useEffect(() => {
    if (!currentBeat || isLastBeat) return undefined
    const duration = reducedMotion ? 280 : FULL_BEAT_DURATIONS[currentBeat.kind]
    const id = window.setTimeout(() => setBeatIndex((idx) => idx + 1), duration)
    return () => window.clearTimeout(id)
  }, [currentBeat, isLastBeat, reducedMotion])

  const handleContinue = useCallback(() => {
    feedback('claim', soundEnabled, hapticsEnabled)
    onClose()
  }, [onClose, soundEnabled, hapticsEnabled])

  const showShower = useMemo(
    () => !reducedMotion && currentBeat?.kind === 'shower',
    [currentBeat, reducedMotion],
  )

  if (!currentBeat) return null

  return (
    <section
      className={`reward-cinema-overlay${reducedMotion ? ' reduced-motion' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Reward cinematic"
      data-scene-swipe-opt-out="true"
    >
      <div className="reward-cinema-card section-card">
        <p className="eyebrow">Reward</p>

        <div
          key={currentBeat.id}
          className={`reward-cinema-stage reward-cinema-stage-${currentBeat.kind}`}
          data-testid="reward-cinema-stage"
        >
          {currentBeat.kind === 'banner' && (
            <img
              className="reward-cinema-banner"
              src={currentBeat.iconAsset ?? UI_ASSETS.overlays.victory}
              alt=""
              aria-hidden="true"
            />
          )}

          {(currentBeat.kind === 'shower' || currentBeat.kind === 'card') && currentBeat.iconAsset && (
            <img
              className="reward-cinema-icon"
              src={currentBeat.iconAsset}
              alt=""
              aria-hidden="true"
            />
          )}

          {currentBeat.kind === 'count' && (
            <div className="reward-cinema-count-block">
              {currentBeat.iconAsset && (
                <img className="reward-cinema-count-icon" src={currentBeat.iconAsset} alt="" aria-hidden="true" />
              )}
              <CountUp
                key={`${currentBeat.id}-${currentBeat.value ?? 0}`}
                value={currentBeat.value ?? 0}
                reducedMotion={reducedMotion}
              />
              {currentBeat.valueLabel && (
                <span className="reward-cinema-count-label">{currentBeat.valueLabel}</span>
              )}
            </div>
          )}

          {showShower && (
            <span className="reward-cinema-shower" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, idx) => (
                <img
                  key={idx}
                  src={UI_ASSETS.particles.ember}
                  alt=""
                  className={`reward-cinema-ember reward-cinema-ember-${idx}`}
                />
              ))}
            </span>
          )}
        </div>

        <h2 className="reward-cinema-label">{currentBeat.label}</h2>
        {currentBeat.caption && <p className="note reward-cinema-caption">{currentBeat.caption}</p>}

        <div className="reward-cinema-progress" aria-hidden="true">
          {beats.map((beat, idx) => (
            <span
              key={beat.id}
              className={`reward-cinema-pip${idx <= beatIndex ? ' active' : ''}`}
            />
          ))}
        </div>

        <div className="controls reward-cinema-controls">
          <button
            type="button"
            className="primary reward-cinema-continue"
            onClick={handleContinue}
            disabled={!isLastBeat}
            data-testid="reward-cinema-continue"
          >
            Continue
          </button>
        </div>
      </div>
    </section>
  )
}

export function RewardCinemaOverlay({ sequence, soundEnabled, hapticsEnabled, onClose }: RewardCinemaOverlayProps) {
  if (!sequence || sequence.length === 0) return null
  const sequenceKey = sequence.map((beat) => beat.id).join('|')
  return (
    <RewardCinemaInner
      key={sequenceKey}
      beats={sequence}
      soundEnabled={soundEnabled}
      hapticsEnabled={hapticsEnabled}
      onClose={onClose}
    />
  )
}
