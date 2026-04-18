/**
 * Phase 3Y — Scene swipe pure helpers.
 *
 * Touch-driven horizontal swipe between adjacent primary scenes. These
 * helpers are pure so the gesture thresholds, neighbor resolution, and
 * opt-out detection can be exercised in isolation.
 *
 * The hook that consumes these lives in `src/hooks/useSceneSwipe.ts`;
 * AppShell wires the hook up and routes commits through the existing
 * `transitionToScreen` so the curtain class + paired sound resolved by
 * `getScreenTransitionSound` fire automatically.
 */
import type { AppScreen } from '../types'

/**
 * DOM attribute placed on a child container that contains its own
 * horizontal gesture (e.g. the battle hand fan). The hook walks up from
 * the touchstart target and bails if it finds this attribute, so the
 * inner rail keeps full control of the swipe.
 */
export const SCENE_SWIPE_OPT_OUT_ATTR = 'data-scene-swipe-opt-out'

/**
 * Canonical primary-scene order — mirrors `NAV_ITEMS` in
 * `src/components/NavBar.tsx`. The bottom nav and the swipe gesture
 * MUST share this order. Battle is intentionally excluded — it opts out
 * of the swipe layer entirely.
 */
export const NAV_ORDER: AppScreen[] = ['home', 'play', 'collection', 'social', 'shop', 'settings']

/** Distance threshold expressed as a fraction of viewport width. */
const DISTANCE_THRESHOLD_RATIO = 0.25

/** Velocity threshold in px/ms (only honoured above the floor distance). */
const VELOCITY_THRESHOLD_PX_PER_MS = 0.4

/** Minimum absolute distance for a velocity-driven commit. */
const VELOCITY_MIN_DISTANCE_PX = 60

export type SwipeMetrics = {
  deltaX: number
  deltaY: number
  durationMs: number
  viewportWidth: number
}

/**
 * Resolve the neighbor screen of `activeScreen` in `navOrder`. Returns
 * `null` at either end of the rail and when `activeScreen` is not in
 * the list (e.g. battle, which is intentionally excluded from navOrder).
 */
export function getNeighborScreen(
  activeScreen: AppScreen,
  direction: -1 | 1,
  navOrder: AppScreen[],
): AppScreen | null {
  const index = navOrder.indexOf(activeScreen)
  if (index === -1) return null
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= navOrder.length) return null
  return navOrder[nextIndex]
}

/**
 * Decide whether a touch gesture should commit a scene change.
 *
 * Returns:
 *   `'prev'` — swipe right (deltaX > 0) → previous scene
 *   `'next'` — swipe left  (deltaX < 0) → next scene
 *   `null`   — gesture below thresholds or vertically dominant
 */
export function shouldCommitSwipe(metrics: SwipeMetrics): 'prev' | 'next' | null {
  const { deltaX, deltaY, durationMs, viewportWidth } = metrics
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)

  // Vertical scroll wins — never steal a vertical drag.
  if (absY > absX) return null

  const distanceThreshold = Math.max(1, viewportWidth * DISTANCE_THRESHOLD_RATIO)
  const passedDistance = absX > distanceThreshold

  let passedVelocity = false
  if (durationMs > 0 && absX >= VELOCITY_MIN_DISTANCE_PX) {
    passedVelocity = absX / durationMs > VELOCITY_THRESHOLD_PX_PER_MS
  }

  if (!passedDistance && !passedVelocity) return null

  return deltaX > 0 ? 'prev' : 'next'
}

/**
 * Walk up from `target` looking for either an explicit opt-out attribute
 * or a real horizontal scroller (overflow-x: auto/scroll AND
 * `scrollWidth > clientWidth`). Returns `true` if any ancestor opts out.
 */
export function findOptOutAncestor(target: EventTarget | null): boolean {
  if (!target || typeof window === 'undefined') return false
  const startNode = target as Node | null
  if (!startNode || startNode.nodeType === undefined) return false

  let node: HTMLElement | null = (startNode.nodeType === 1
    ? (startNode as HTMLElement)
    : (startNode.parentElement as HTMLElement | null))

  while (node) {
    if (node.hasAttribute && node.hasAttribute(SCENE_SWIPE_OPT_OUT_ATTR)) {
      return true
    }
    if (typeof window.getComputedStyle === 'function') {
      const style = window.getComputedStyle(node)
      const overflowX = style.overflowX
      if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth) {
        return true
      }
    }
    node = node.parentElement
  }
  return false
}
