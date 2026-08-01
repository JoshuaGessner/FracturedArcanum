// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { PlayerProvider, usePlayerState, type PlayerStateValue } from './PlayerProvider'
import type { ServerProfile } from '../types'

/**
 * PlayerProvider holds the server-authoritative record and derives eighteen
 * values from it. Those derivations used to be eighteen loose `const`s in
 * AppShell, and the screen tests asserted against a hand-written mock of the
 * results rather than the record — which is how the old fixture came to claim
 * `lastDailyClaim: ''` and `canClaimDailyReward: false` at the same time, a
 * combination the real derivation cannot produce.
 *
 * So these tests check two things the mock could not: that every value has a
 * sane default before the first fetch, and that each one actually follows the
 * record.
 */

function buildProfile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    accountId: 'acct-1',
    username: 'josh',
    displayName: 'Josh',
    role: 'user',
    shards: 180,
    seasonRating: 1210,
    wins: 3,
    losses: 2,
    streak: 1,
    deckConfig: {},
    ownedThemes: ['royal'],
    selectedTheme: 'royal',
    ownedCardBorders: ['default'],
    selectedCardBorder: 'default',
    lastDaily: '',
    totalEarned: 0,
    ...overrides,
  }
}

function mountProvider(seed?: ServerProfile | null) {
  const seen: { current: PlayerStateValue | null } = { current: null }

  function Probe() {
    seen.current = usePlayerState()
    return null
  }

  const utils = render(
    <PlayerProvider seed={seed}>
      <Probe />
    </PlayerProvider>,
  )
  return { ...utils, state: () => seen.current as PlayerStateValue }
}

afterEach(() => {
  cleanup()
})

describe('PlayerProvider before the first fetch', () => {
  /**
   * The window between mount and the profile response is real — the shell
   * renders during it. A missing `??` here reaches the UI as `undefined`
   * shards or a rank bar of `NaN%`, so every default is pinned.
   */
  it('answers with a complete set of defaults while the profile is null', () => {
    const { state } = mountProvider(null)

    expect(state().serverProfile).toBeNull()
    expect(state().shards).toBe(0)
    expect(state().seasonRating).toBe(1200)
    expect(state().record).toEqual({ wins: 0, losses: 0, streak: 0 })
    expect(state().ownedThemes).toEqual(['royal'])
    expect(state().selectedTheme).toBe('royal')
    expect(state().ownedCardBorders).toEqual(['default'])
    expect(state().selectedCardBorder).toBe('default')
    expect(state().lastDailyClaim).toBe('')
    expect(state().accountRole).toBe('user')
    expect(state().isAdminRole).toBe(false)
    expect(state().isOwnerRole).toBe(false)
    expect(state().rankLabel).toBe('Silver')
    expect(state().totalGames).toBe(0)
    expect(state().winRate).toBe(0)
  })

  it('never divides by zero when computing a win rate from no games', () => {
    const { state } = mountProvider(buildProfile({ wins: 0, losses: 0 }))
    expect(state().totalGames).toBe(0)
    expect(state().winRate).toBe(0)
  })
})

describe('PlayerProvider derivations', () => {
  it('reads balances, cosmetics and record straight off the profile', () => {
    const { state } = mountProvider(buildProfile())

    expect(state().shards).toBe(180)
    expect(state().seasonRating).toBe(1210)
    expect(state().record).toEqual({ wins: 3, losses: 2, streak: 1 })
    expect(state().totalGames).toBe(5)
    expect(state().winRate).toBe(60)
  })

  it('places the rating on the rank ladder', () => {
    const { state } = mountProvider(buildProfile({ seasonRating: 1210 }))

    expect(state().rankLabel).toBe('Silver')
    expect(state().nextRankTarget).toBe(1300)
    // 60 of the 150 points between 1150 and 1300.
    expect(state().rankProgress).toBe(40)
  })

  /**
   * Ratings below the first band's floor used to produce a negative
   * `rankProgress`. Two components independently clamped it on the way to the
   * bar, which is the shape of a bug that has been papered over twice.
   */
  it('never reports negative progress for a rating under the ladder', () => {
    expect(mountProvider(buildProfile({ seasonRating: 900 })).state().rankProgress).toBe(0)
  })

  it('derives admin and owner powers from the role, with no separate flag', () => {
    const powersFor = (role: ServerProfile['role']) => {
      const { isAdminRole, isOwnerRole } = mountProvider(buildProfile({ role })).state()
      return { isAdminRole, isOwnerRole }
    }

    expect(powersFor('user')).toEqual({ isAdminRole: false, isOwnerRole: false })
    expect(powersFor('admin')).toEqual({ isAdminRole: true, isOwnerRole: false })
    expect(powersFor('owner')).toEqual({ isAdminRole: true, isOwnerRole: true })
  })

  it('offers the daily reward exactly when the record has not been stamped today', () => {
    const { state } = mountProvider(buildProfile({ lastDaily: '' }))
    expect(state().canClaimDailyReward).toBe(true)

    act(() => {
      state().setServerProfile((profile) =>
        profile ? { ...profile, lastDaily: state().todayKey } : profile,
      )
    })
    expect(state().canClaimDailyReward).toBe(false)
  })
})

describe('PlayerProvider updates', () => {
  /**
   * Every handler that spends or earns shards uses the updater form, so the
   * derivations must follow a functional update and not just a replacement.
   */
  it('recomputes derived values after a functional update', () => {
    const { state } = mountProvider(buildProfile({ shards: 180, wins: 3, losses: 2 }))
    expect(state().winRate).toBe(60)

    act(() => {
      state().setServerProfile((profile) =>
        profile ? { ...profile, shards: 55, wins: 4, seasonRating: 1350 } : profile,
      )
    })

    expect(state().shards).toBe(55)
    expect(state().totalGames).toBe(6)
    expect(state().winRate).toBe(67)
    expect(state().rankLabel).toBe('Gold')
    expect(state().nextRankTarget).toBe(1500)
  })

  it('falls back to the null-profile defaults when the record is cleared', () => {
    const { state } = mountProvider(buildProfile())
    expect(state().shards).toBe(180)

    act(() => {
      state().setServerProfile(null)
    })

    expect(state().shards).toBe(0)
    expect(state().accountRole).toBe('user')
    expect(state().isAdminRole).toBe(false)
  })
})

describe('usePlayerState outside the provider', () => {
  it('throws rather than serving silent zeros', () => {
    function Orphan() {
      usePlayerState()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(/must be used inside <PlayerProvider>/)
  })
})
