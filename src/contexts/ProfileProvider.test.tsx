// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { ProfileProvider, useProfileState, type ProfileStateValue } from './ProfileProvider'
import { STORAGE_KEYS } from '../constants'
import { DEFAULT_DECK_CONFIG } from '../game'

/**
 * Characterization tests for ProfileProvider — see GameProvider.test.tsx for
 * why these record current behaviour rather than desired behaviour.
 */

function mountProvider() {
  const seen: { current: ProfileStateValue | null } = { current: null }

  function Probe() {
    seen.current = useProfileState()
    return null
  }

  const utils = render(
    <ProfileProvider>
      <Probe />
    </ProfileProvider>,
  )
  return { ...utils, state: () => seen.current as ProfileStateValue }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('ProfileProvider initial state', () => {
  it('uses the default deck config when nothing is stored', () => {
    expect(mountProvider().state().deckConfig).toEqual(DEFAULT_DECK_CONFIG)
  })

  it('restores a stored deck config verbatim', () => {
    const stored = { 'spark-imp': 3, 'shade-fox': 1 }
    window.localStorage.setItem(STORAGE_KEYS.deck, JSON.stringify(stored))
    expect(mountProvider().state().deckConfig).toEqual(stored)
  })

  it('falls back to the default deck when stored JSON is malformed', () => {
    window.localStorage.setItem(STORAGE_KEYS.deck, 'not json at all')
    expect(mountProvider().state().deckConfig).toEqual(DEFAULT_DECK_CONFIG)
  })

  it('starts the builder filter unfiltered', () => {
    expect(mountProvider().state().builderFilter).toEqual({
      ownedOnly: false,
      search: '',
      rarity: 'all',
    })
  })

  it('starts every collection and shop slice empty', () => {
    const { state } = mountProvider()
    expect(state().savedDecks).toEqual([])
    expect(state().activeDeckId).toBeNull()
    expect(state().pendingBreakdown).toBeNull()
    expect(state().collection).toEqual({})
    expect(state().packOffers).toEqual([])
    expect(state().openedPackCards).toEqual([])
    expect(state().packOpening).toBeNull()
    expect(state().prevCollectionSnapshot).toBeNull()
    expect(state().questOverview).toBeNull()
  })

  // Deck config is read once into useState's initializer, so a later write to
  // localStorage does NOT propagate. AppShell is responsible for calling
  // setDeckConfig. Recording it because a split could easily change it.
  it('does not re-read storage after mount', () => {
    const { state } = mountProvider()
    window.localStorage.setItem(STORAGE_KEYS.deck, JSON.stringify({ 'spark-imp': 9 }))
    act(() => {
      state().setPackOpening('force-a-rerender')
    })
    expect(state().deckConfig).toEqual(DEFAULT_DECK_CONFIG)
  })
})

describe('ProfileProvider setters', () => {
  it('replaces the collection wholesale', () => {
    const { state } = mountProvider()
    act(() => {
      state().setCollection({ 'spark-imp': 4 })
    })
    expect(state().collection).toEqual({ 'spark-imp': 4 })
  })

  it('supports functional updates against the previous deck config', () => {
    const { state } = mountProvider()
    act(() => {
      state().setDeckConfig((config) => ({ ...config, 'spark-imp': 3 }))
    })
    expect(state().deckConfig['spark-imp']).toBe(3)
  })

  it('tracks a pending breakdown as card id plus quantity', () => {
    const { state } = mountProvider()
    act(() => {
      state().setPendingBreakdown({ cardId: 'shade-fox', qty: 2 })
    })
    expect(state().pendingBreakdown).toEqual({ cardId: 'shade-fox', qty: 2 })
  })
})

describe('useProfileState outside a provider', () => {
  it('throws a named error rather than returning null', () => {
    function Orphan() {
      useProfileState()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(/useProfileState must be used inside <ProfileProvider>/)
  })
})
