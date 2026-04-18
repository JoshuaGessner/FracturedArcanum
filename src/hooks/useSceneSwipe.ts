/**
 * Phase 3Y — useSceneSwipe hook.
 *
 * Encapsulates the touch-driven horizontal swipe gesture that nav-commits
 * between adjacent primary scenes. AppShell mounts this hook once on the
 * `.scene-stage` shell and routes commits back through the existing
 * curtain transition (which already supplies the paired sound), so this
 * hook never plays audio itself.
 *
 * Responsibilities owned here:
 *   - Track a single active touch point (cancel on multi-touch).
 *   - Skip entirely when battle is on-screen, the gesture is disabled,
 *     or the touch starts inside an opt-out ancestor.
 *   - Never preventDefault during move — vertical scroll always wins.
 *   - On touchend, evaluate thresholds via `shouldCommitSwipe` and call
 *     `onCommit('prev' | 'next')`.
 */
import { useCallback, useMemo, useRef } from 'react'
import type { TouchEvent as ReactTouchEvent } from 'react'
import {
  findOptOutAncestor,
  shouldCommitSwipe,
} from '../utils/sceneSwipe'

export type SceneSwipeBind = {
  onTouchStart: (event: ReactTouchEvent<HTMLElement>) => void
  onTouchMove: (event: ReactTouchEvent<HTMLElement>) => void
  onTouchEnd: (event: ReactTouchEvent<HTMLElement>) => void
  onTouchCancel: (event: ReactTouchEvent<HTMLElement>) => void
}

export type UseSceneSwipeOptions = {
  isBattleScreen: boolean
  enabled: boolean
  onCommit: (direction: 'prev' | 'next') => void
}

type ActiveTouch = {
  identifier: number
  startX: number
  startY: number
  startedAt: number
  lastX: number
  lastY: number
}

export function useSceneSwipe(options: UseSceneSwipeOptions): SceneSwipeBind {
  const { isBattleScreen, enabled, onCommit } = options
  const activeRef = useRef<ActiveTouch | null>(null)

  const reset = useCallback(() => {
    activeRef.current = null
  }, [])

  const isInert = !enabled || isBattleScreen

  const handleTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    if (isInert) {
      activeRef.current = null
      return
    }
    // Multi-touch (pinch / 2-finger scroll) — abandon any tracked swipe.
    if (event.touches.length > 1) {
      activeRef.current = null
      return
    }
    const touch = event.touches[0]
    if (!touch) return
    if (findOptOutAncestor(touch.target)) {
      activeRef.current = null
      return
    }
    activeRef.current = {
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      startedAt: typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(),
      lastX: touch.clientX,
      lastY: touch.clientY,
    }
  }, [isInert])

  const handleTouchMove = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const active = activeRef.current
    if (!active) return
    if (event.touches.length > 1) {
      activeRef.current = null
      return
    }
    let matched: { clientX: number; clientY: number; identifier: number } | null = null
    for (let i = 0; i < event.touches.length; i += 1) {
      const candidate = event.touches[i]
      if (candidate.identifier === active.identifier) {
        matched = candidate
        break
      }
    }
    if (!matched) return
    active.lastX = matched.clientX
    active.lastY = matched.clientY
    // Intentionally do NOT preventDefault — vertical scroll must remain
    // snappy. Commit decisions wait for touchend.
  }, [])

  const handleTouchEnd = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const active = activeRef.current
    activeRef.current = null
    if (!active) return
    if (isInert) return

    let endX = active.lastX
    let endY = active.lastY
    for (let i = 0; i < event.changedTouches.length; i += 1) {
      const candidate = event.changedTouches[i]
      if (candidate.identifier === active.identifier) {
        endX = candidate.clientX
        endY = candidate.clientY
        break
      }
    }

    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0
    const decision = shouldCommitSwipe({
      deltaX: endX - active.startX,
      deltaY: endY - active.startY,
      durationMs: Math.max(1, now - active.startedAt),
      viewportWidth,
    })
    if (decision) onCommit(decision)
  }, [isInert, onCommit])

  const handleTouchCancel = useCallback(() => {
    reset()
  }, [reset])

  return useMemo<SceneSwipeBind>(() => ({
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchCancel,
  }), [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel])
}
