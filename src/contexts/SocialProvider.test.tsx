// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { SocialProvider, useSocialState, type SocialStateValue } from './SocialProvider'

/**
 * Characterization tests for SocialProvider — see GameProvider.test.tsx for why
 * these record current behaviour rather than desired behaviour.
 *
 * The provider owns an unconditional 1Hz `nowTick`, so these drive fake timers.
 */

function mountProvider() {
  const seen: { current: SocialStateValue | null } = { current: null }

  function Probe() {
    seen.current = useSocialState()
    return null
  }

  const utils = render(
    <SocialProvider>
      <Probe />
    </SocialProvider>,
  )
  return { ...utils, state: () => seen.current as SocialStateValue }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SocialProvider initial state', () => {
  it('starts with the social hub ready and nothing loaded', () => {
    const { state } = mountProvider()
    expect(state().socialStatus).toBe('Social hub ready.')
    expect(state().socialLoading).toBe(false)
    expect(state().friends).toEqual([])
    expect(state().onlineFriendIds.size).toBe(0)
    expect(state().clan).toBeNull()
    expect(state().trades).toEqual([])
  })

  it('starts with no challenge in either direction', () => {
    const { state } = mountProvider()
    expect(state().outgoingChallenge).toBeNull()
    expect(state().incomingChallenge).toBeNull()
    expect(state().challengeStatus).toBe('')
  })

  it('starts with empty trade and clan forms', () => {
    const { state } = mountProvider()
    expect(state().tradeForm).toEqual({ toAccountId: '', offer: [], request: [] })
    expect(state().tradePickerDraft).toEqual({ side: 'offer', cardId: '', qty: 1 })
    expect(state().clanForm).toEqual({ name: '', tag: '', inviteCode: '' })
    expect(state().tradeSubmitting).toBe(false)
    expect(state().tradeStatus).toBe('')
    expect(state().tradesTick).toBe(0)
    expect(state().friendUsernameInput).toBe('')
  })
})

describe('SocialProvider nowTick', () => {
  it('seeds from the current clock', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    expect(mountProvider().state().nowTick).toBe(Date.parse('2026-01-01T00:00:00Z'))
  })

  // Unconditional, unlike QueueProvider's countdown: it runs from mount for
  // the whole lifetime of the tree, because trade-expiry countdowns need it
  // regardless of which screen is showing.
  it('advances every second without needing any state change', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { state } = mountProvider()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(state().nowTick).toBe(Date.parse('2026-01-01T00:00:03Z'))
  })

  it('clears its interval on unmount', () => {
    const { unmount } = mountProvider()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('SocialProvider setters', () => {
  it('tracks online friends as a Set', () => {
    const { state } = mountProvider()
    act(() => {
      state().setOnlineFriendIds(new Set(['acct-1', 'acct-2']))
    })
    expect([...state().onlineFriendIds].sort()).toEqual(['acct-1', 'acct-2'])
  })

  it('supports functional updates against the previous trade form', () => {
    const { state } = mountProvider()
    act(() => {
      state().setTradeForm((form) => ({ ...form, toAccountId: 'acct-9' }))
    })
    expect(state().tradeForm).toEqual({ toAccountId: 'acct-9', offer: [], request: [] })
  })
})

describe('useSocialState outside a provider', () => {
  it('throws a named error rather than returning null', () => {
    function Orphan() {
      useSocialState()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(/useSocialState must be used inside <SocialProvider>/)
  })
})
