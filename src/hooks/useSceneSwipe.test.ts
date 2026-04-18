// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  findOptOutAncestor,
  getNeighborScreen,
  shouldCommitSwipe,
  SCENE_SWIPE_OPT_OUT_ATTR,
} from '../utils/sceneSwipe'
import type { AppScreen } from '../types'

const NAV_ORDER: AppScreen[] = ['home', 'play', 'collection', 'social', 'shop', 'settings']

describe('getNeighborScreen', () => {
  it('returns the next screen in the rail', () => {
    expect(getNeighborScreen('home', 1, NAV_ORDER)).toBe('play')
    expect(getNeighborScreen('collection', 1, NAV_ORDER)).toBe('social')
  })

  it('returns the previous screen in the rail', () => {
    expect(getNeighborScreen('settings', -1, NAV_ORDER)).toBe('shop')
    expect(getNeighborScreen('play', -1, NAV_ORDER)).toBe('home')
  })

  it('clamps at both ends', () => {
    expect(getNeighborScreen('home', -1, NAV_ORDER)).toBeNull()
    expect(getNeighborScreen('settings', 1, NAV_ORDER)).toBeNull()
  })

  it('returns null when battle is the active screen (excluded from navOrder)', () => {
    expect(getNeighborScreen('battle', 1, NAV_ORDER)).toBeNull()
    expect(getNeighborScreen('battle', -1, NAV_ORDER)).toBeNull()
  })
})

describe('shouldCommitSwipe', () => {
  const viewportWidth = 400 // 25% threshold = 100px

  it('returns null when the gesture is below distance and velocity thresholds', () => {
    expect(
      shouldCommitSwipe({ deltaX: 40, deltaY: 5, durationMs: 300, viewportWidth }),
    ).toBeNull()
  })

  it('commits when distance exceeds 25% of viewport width', () => {
    // Drag right (positive deltaX) → previous scene.
    expect(
      shouldCommitSwipe({ deltaX: 140, deltaY: 10, durationMs: 800, viewportWidth }),
    ).toBe('prev')
    // Drag left (negative deltaX) → next scene.
    expect(
      shouldCommitSwipe({ deltaX: -140, deltaY: 10, durationMs: 800, viewportWidth }),
    ).toBe('next')
  })

  it('commits when velocity exceeds 0.4 px/ms AND minimum 60px distance is met', () => {
    // 80px drag-right in 100ms = 0.8 px/ms — fast and above min distance.
    expect(
      shouldCommitSwipe({ deltaX: 80, deltaY: 5, durationMs: 100, viewportWidth }),
    ).toBe('prev')
    expect(
      shouldCommitSwipe({ deltaX: -80, deltaY: 5, durationMs: 100, viewportWidth }),
    ).toBe('next')
  })

  it('does NOT commit on a fast tap below the 60px minimum distance', () => {
    // 40px in 20ms = 2.0 px/ms (well above velocity threshold) but below
    // the 60px floor — must not commit.
    expect(
      shouldCommitSwipe({ deltaX: 40, deltaY: 0, durationMs: 20, viewportWidth }),
    ).toBeNull()
  })

  it('returns null when vertical movement dominates', () => {
    expect(
      shouldCommitSwipe({ deltaX: 80, deltaY: 200, durationMs: 400, viewportWidth }),
    ).toBeNull()
  })
})

describe('findOptOutAncestor', () => {
  it('returns true when an ancestor has the opt-out attribute', () => {
    const outer = document.createElement('div')
    outer.setAttribute(SCENE_SWIPE_OPT_OUT_ATTR, '')
    const inner = document.createElement('span')
    outer.appendChild(inner)
    document.body.appendChild(outer)
    try {
      expect(findOptOutAncestor(inner)).toBe(true)
    } finally {
      document.body.removeChild(outer)
    }
  })

  it('returns false when no ancestor opts out and no horizontal scroller is present', () => {
    const outer = document.createElement('div')
    const inner = document.createElement('span')
    outer.appendChild(inner)
    document.body.appendChild(outer)
    try {
      expect(findOptOutAncestor(inner)).toBe(false)
    } finally {
      document.body.removeChild(outer)
    }
  })
})
