/**
 * Phase 3X — First-launch onboarding tour.
 *
 * Walks a brand-new player through the Hearthstone-style scene model with
 * a 5-step spotlight tour. Each step measures a target element via
 * `getBoundingClientRect()` and renders a radial-gradient veil that cuts
 * a bright window over it, with a parchment caption card adjacent (or
 * stacked below on small viewports). Targets that aren't currently
 * mounted gracefully fall back to a centered caption with no spotlight.
 *
 * Persistence + show/hide is owned by AppShell. This component is
 * presentational and respects `prefers-reduced-motion` and `soundEnabled`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { feedback } from '../feedback'
import { playSound } from '../audio'

export type OnboardingTourProps = {
  visible: boolean
  soundEnabled: boolean
  hapticsEnabled: boolean
  onComplete: () => void
  onSkip: () => void
}

type TourStep = {
  id: string
  selector: string
  title: string
  body: string
}

/**
 * Ordered tour steps. Each step targets a DOM selector that may or may
 * not be mounted at the moment the step opens — missing targets render
 * a centered caption with no spotlight.
 */
const STEPS: TourStep[] = [
  {
    id: 'home-tiles',
    selector: '[data-tour-id="home-tiles"]',
    title: 'Welcome to the Arcanum',
    body: 'These tiles are your way into every scene — Play, Collection, Social, Shop, and Settings. Tap one any time to switch.',
  },
  {
    id: 'collection',
    selector: '[data-nav="collection"]',
    title: 'Forge your deck',
    body: 'Collection is where you build and edit decks. You start with a sealed starter deck — open packs in the Shop to grow it.',
  },
  {
    id: 'queue',
    selector: '[data-tour-id="queue-button"]',
    title: 'Battle live or solo',
    body: 'On the Play scene, “Enter Arena” drops you into an instant AI duel. “Play Online (Ranked)” queues you for a live opponent.',
  },
  {
    id: 'battle-hand',
    selector: '[data-tour-id="battle-hand"]',
    title: 'Your hand of cards',
    body: 'During a battle, your cards live here. Tap to cast onto an open lane, hold to inspect, or drag to a lane on touch.',
  },
  {
    id: 'settings',
    selector: '[data-nav="settings"]',
    title: 'Tune the experience',
    body: 'Settings hosts sound, ambient loops, accessibility, and the “Replay tour” button. You can revisit this walkthrough whenever you like.',
  },
]

const SPOTLIGHT_RADIUS_PADDING = 24
const SPOTLIGHT_FALLBACK_RADIUS = 140

type Rect = { top: number; left: number; width: number; height: number }

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function measureTarget(selector: string): Rect | null {
  if (typeof document === 'undefined') return null
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

function buildSpotlightStyle(rect: Rect | null): React.CSSProperties {
  if (!rect) {
    return {
      // No spotlight — fall back to a flat dim veil. The caption renders
      // centered in the viewport via a separate class.
      background: 'rgba(6, 7, 14, 0.78)',
    }
  }
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const radius = Math.max(rect.width, rect.height) / 2 + SPOTLIGHT_RADIUS_PADDING
  const inner = Math.max(40, radius)
  const outer = inner + SPOTLIGHT_FALLBACK_RADIUS
  return {
    background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(6, 7, 14, 0) 0px, rgba(6, 7, 14, 0) ${inner}px, rgba(6, 7, 14, 0.86) ${outer}px)`,
  }
}

function buildCaptionPosition(rect: Rect | null): {
  style: React.CSSProperties
  centered: boolean
} {
  if (typeof window === 'undefined' || !rect) {
    return { style: {}, centered: true }
  }
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const captionWidth = Math.min(320, viewportWidth - 24)
  const captionGap = 16
  const isNarrow = viewportWidth < 600

  if (isNarrow) {
    // On narrow viewports always stack below the spotlight (or above if
    // the spotlight is already in the lower half of the screen).
    const placeAbove = rect.top + rect.height / 2 > viewportHeight / 2
    const top = placeAbove
      ? Math.max(16, rect.top - captionGap - 220)
      : Math.min(viewportHeight - 220 - 16, rect.top + rect.height + captionGap)
    return {
      style: {
        top: `${top}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        width: `${captionWidth}px`,
      },
      centered: false,
    }
  }

  // Wider viewports: place caption to the right or left of the spotlight,
  // whichever has more room.
  const spaceRight = viewportWidth - (rect.left + rect.width)
  const placeRight = spaceRight >= captionWidth + captionGap + 16
  const left = placeRight
    ? rect.left + rect.width + captionGap
    : Math.max(16, rect.left - captionGap - captionWidth)
  const top = Math.min(
    viewportHeight - 220 - 16,
    Math.max(16, rect.top + rect.height / 2 - 110),
  )
  return {
    style: {
      top: `${top}px`,
      left: `${left}px`,
      width: `${captionWidth}px`,
    },
    centered: false,
  }
}

/**
 * Live measurement hook — re-measures the current step's target on
 * mount, on `resize`, and on `scroll`. Returns `null` when the target
 * cannot be found.
 */
function useTargetRect(selector: string): Rect | null {
  const [rect, setRect] = useState<Rect | null>(() => measureTarget(selector))

  useEffect(() => {
    const update = () => setRect(measureTarget(selector))
    update()

    // Re-measure on the next animation frame too — covers the case where
    // the spotlight target is mounted by an active screen transition.
    const raf = window.requestAnimationFrame(update)

    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [selector])

  return rect
}

function OnboardingTourInner({
  soundEnabled,
  hapticsEnabled,
  onComplete,
  onSkip,
}: {
  soundEnabled: boolean
  hapticsEnabled: boolean
  onComplete: () => void
  onSkip: () => void
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => detectReducedMotion())
  const finishedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const currentStep = STEPS[stepIndex]
  const rect = useTargetRect(currentStep?.selector ?? '')

  const veilStyle = useMemo(() => buildSpotlightStyle(rect), [rect])
  const captionLayout = useMemo(() => buildCaptionPosition(rect), [rect])

  const isLastStep = stepIndex >= STEPS.length - 1

  const handleNext = useCallback(() => {
    if (finishedRef.current) return
    if (isLastStep) {
      finishedRef.current = true
      feedback('confirm', soundEnabled, hapticsEnabled)
      playSound('questComplete', soundEnabled)
      onComplete()
      return
    }
    feedback('nav', soundEnabled, hapticsEnabled)
    setStepIndex((idx) => Math.min(STEPS.length - 1, idx + 1))
  }, [isLastStep, onComplete, soundEnabled, hapticsEnabled])

  const handleSkip = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    feedback('cancel', soundEnabled, hapticsEnabled)
    onSkip()
  }, [onSkip, soundEnabled, hapticsEnabled])

  if (!currentStep) return null

  const veilClassName = `onboarding-tour-veil${reducedMotion ? ' reduced-motion' : ''}${rect ? '' : ' centered'}`
  const captionClassName = `onboarding-tour-caption section-card${captionLayout.centered ? ' centered' : ''}${reducedMotion ? ' reduced-motion' : ''}`

  return (
    <section
      className={`onboarding-tour${reducedMotion ? ' reduced-motion' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Onboarding tour, step ${stepIndex + 1} of ${STEPS.length}`}
      data-testid="onboarding-tour"
    >
      <div
        className={veilClassName}
        style={veilStyle}
        aria-hidden="true"
        data-testid="onboarding-tour-veil"
      />
      <article className={captionClassName} style={captionLayout.style}>
        <p className="eyebrow">Step {stepIndex + 1} of {STEPS.length}</p>
        <h2 className="onboarding-tour-title">{currentStep.title}</h2>
        <p className="note onboarding-tour-body">{currentStep.body}</p>
        <div className="onboarding-tour-progress" aria-hidden="true">
          {STEPS.map((step, idx) => (
            <span
              key={step.id}
              className={`onboarding-tour-pip${idx <= stepIndex ? ' active' : ''}`}
            />
          ))}
        </div>
        <div className="controls onboarding-tour-controls">
          <button
            type="button"
            className="ghost onboarding-tour-skip"
            onClick={handleSkip}
            data-testid="onboarding-tour-skip"
          >
            Skip Tour
          </button>
          <button
            type="button"
            className="primary onboarding-tour-next"
            onClick={handleNext}
            data-testid="onboarding-tour-next"
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </article>
    </section>
  )
}

export function OnboardingTour({ visible, soundEnabled, hapticsEnabled, onComplete, onSkip }: OnboardingTourProps) {
  if (!visible) return null
  return (
    <OnboardingTourInner
      soundEnabled={soundEnabled}
      hapticsEnabled={hapticsEnabled}
      onComplete={onComplete}
      onSkip={onSkip}
    />
  )
}
