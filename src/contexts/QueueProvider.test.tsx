// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { QueueProvider, useQueueState, type QueueStateValue } from './QueueProvider'

/**
 * Characterization tests for QueueProvider — see GameProvider.test.tsx for why
 * these record current behaviour rather than desired behaviour.
 *
 * The provider owns a 1Hz countdown, so these drive fake timers rather than
 * waiting in real time.
 */

function mountProvider() {
  const seen: { current: QueueStateValue | null } = { current: null }

  function Probe() {
    seen.current = useQueueState()
    return null
  }

  const utils = render(
    <QueueProvider>
      <Probe />
    </QueueProvider>,
  )
  return { ...utils, state: () => seen.current as QueueStateValue }
}

/** Advance the fake clock inside act() so React flushes the resulting state. */
function tickSeconds(seconds: number) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('QueueProvider initial state', () => {
  it('starts idle with a zeroed countdown and no opponent', () => {
    const { state } = mountProvider()
    expect(state().queueState).toBe('idle')
    expect(state().queueSeconds).toBe(0)
    expect(state().queuedOpponent).toBeNull()
    expect(state().leaderboardEntries).toEqual([])
  })

  it('starts with an empty presence snapshot', () => {
    expect(mountProvider().state().queuePresence).toEqual({
      queueSize: 0,
      connectedPlayers: 0,
      rankedAvailable: false,
      updatedAt: '',
    })
  })

  it('starts with the default search estimate', () => {
    expect(mountProvider().state().queueSearchStatus).toEqual({
      position: 1,
      queueSize: 0,
      connectedPlayers: 0,
      waitSeconds: 0,
      estimatedWaitSeconds: 10,
      ratingWindow: 150,
    })
  })
})

describe('QueueProvider liveQueueLabel', () => {
  it('reads "Waiting for challengers" until ranked play is available', () => {
    expect(mountProvider().state().liveQueueLabel).toBe('Waiting for challengers')
  })

  it('switches to "Live opponents ready" when ranked is available', () => {
    const { state } = mountProvider()
    act(() => {
      state().setQueuePresence((presence) => ({ ...presence, rankedAvailable: true }))
    })
    expect(state().liveQueueLabel).toBe('Live opponents ready')
  })
})

describe('QueueProvider countdown', () => {
  it('does not advance while idle', () => {
    const { state } = mountProvider()
    tickSeconds(5)
    expect(state().queueSeconds).toBe(0)
  })

  it('advances once per second while searching', () => {
    const { state } = mountProvider()
    act(() => {
      state().setQueueState('searching')
    })
    tickSeconds(3)
    expect(state().queueSeconds).toBe(3)
  })

  // Leaving 'searching' stops the timer but deliberately does NOT reset the
  // counter — resetting is the caller's job. Recorded so a split cannot
  // silently start zeroing it.
  it('stops advancing when the queue leaves searching, retaining the elapsed count', () => {
    const { state } = mountProvider()
    act(() => {
      state().setQueueState('searching')
    })
    tickSeconds(4)
    act(() => {
      state().setQueueState('idle')
    })
    tickSeconds(10)
    expect(state().queueSeconds).toBe(4)
  })

  it('resumes counting from the retained value when searching again', () => {
    const { state } = mountProvider()
    act(() => {
      state().setQueueState('searching')
    })
    tickSeconds(2)
    act(() => {
      state().setQueueState('idle')
    })
    act(() => {
      state().setQueueState('searching')
    })
    tickSeconds(2)
    expect(state().queueSeconds).toBe(4)
  })

  it('clears its interval on unmount', () => {
    const { state, unmount } = mountProvider()
    act(() => {
      state().setQueueState('searching')
    })
    tickSeconds(1)
    expect(state().queueSeconds).toBe(1)
    unmount()
    // If the interval leaked, advancing here would call setState on an
    // unmounted tree; the assertion is that nothing further is recorded.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('useQueueState outside a provider', () => {
  it('throws a named error rather than returning null', () => {
    function Orphan() {
      useQueueState()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(/useQueueState must be used inside <QueueProvider>/)
  })
})
