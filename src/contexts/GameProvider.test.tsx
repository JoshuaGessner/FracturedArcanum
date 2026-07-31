// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { GameProvider, useGameState, type GameStateValue } from './GameProvider'
import { STORAGE_KEYS } from '../constants'
import type { InspectedCard, ServerMatchLifecycle } from '../types'

/**
 * Characterization tests for GameProvider.
 *
 * These pin down what the provider does *today*, quirks included, so the
 * AppShell split has a safety net. They are not an opinion about what it
 * should do — where behaviour looks surprising it is called out in a comment
 * rather than "corrected", because changing it here would defeat the purpose.
 */

/** Renders the provider and hands back a live view of its context value. */
function mountProvider() {
  const seen: { current: GameStateValue | null } = { current: null }

  function Probe() {
    seen.current = useGameState()
    return null
  }

  const utils = render(
    <GameProvider>
      <Probe />
    </GameProvider>,
  )
  return { ...utils, state: () => seen.current as GameStateValue }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('GameProvider initial state', () => {
  it('defaults to ai mode with an auto difficulty when storage is empty', () => {
    const { state } = mountProvider()
    expect(state().preferredMode).toBe('ai')
    expect(state().aiDifficultySetting).toBe('auto')
    expect(state().game.mode).toBe('ai')
  })

  it('restores the stored mode and difficulty', () => {
    window.localStorage.setItem(STORAGE_KEYS.mode, JSON.stringify('duel'))
    window.localStorage.setItem(STORAGE_KEYS.aiDifficulty, JSON.stringify('legend'))
    const { state } = mountProvider()
    expect(state().preferredMode).toBe('duel')
    expect(state().aiDifficultySetting).toBe('legend')
  })

  it('falls back to defaults when stored JSON is malformed', () => {
    window.localStorage.setItem(STORAGE_KEYS.mode, '{not json')
    const { state } = mountProvider()
    expect(state().preferredMode).toBe('ai')
  })

  it('derives battleKind from the stored mode: duel means local', () => {
    window.localStorage.setItem(STORAGE_KEYS.mode, JSON.stringify('duel'))
    expect(mountProvider().state().battleKind).toBe('local')
  })

  it('derives battleKind ai for every non-duel mode', () => {
    window.localStorage.setItem(STORAGE_KEYS.mode, JSON.stringify('ai'))
    expect(mountProvider().state().battleKind).toBe('ai')
  })

  it('starts with no attacker selected, no battle session, and an idle match', () => {
    const { state } = mountProvider()
    expect(state().selectedAttacker).toBeNull()
    expect(state().battleSessionActive).toBe(false)
    expect(state().serverMatch).toEqual({
      phase: 'idle',
      matchId: null,
      revision: 0,
      kind: null,
      outcome: null,
    })
    expect(state().inspectedCard).toBeNull()
    expect(state().damagedSlots.size).toBe(0)
    expect(state().battleIntroVisible).toBe(false)
    expect(state().enemyTurnActive).toBe(false)
    expect(state().opponentDisconnected).toBe(false)
    expect(state().disconnectGraceMs).toBe(0)
  })
})

describe('GameProvider serverBattleActive', () => {
  // The derivation AppShell's leave/abandon branch depends on: a "live" match
  // is not just `active`, it also covers the two transitional phases.
  //
  // ServerMatchLifecycle is a discriminated union, so each phase is built as a
  // whole valid state rather than by spreading a phase over the previous one.
  // An earlier version of this test spread `{ ...current, phase }` and asserted
  // on 'queued' and 'complete' — neither of which exists in the union. It
  // passed because the derivation is a string comparison, which is exactly the
  // kind of false confidence a characterization test must not give.
  const IDLE: ServerMatchLifecycle = {
    phase: 'idle', matchId: null, revision: 0, kind: null, outcome: null,
  }
  const live = (phase: 'active' | 'reconnecting' | 'leaving'): ServerMatchLifecycle => ({
    phase, matchId: 'match-1', revision: 3, kind: 'ranked', outcome: null,
  })
  const TERMINAL: ServerMatchLifecycle = {
    phase: 'terminal',
    matchId: 'match-1',
    revision: 4,
    kind: 'ranked',
    outcome: {
      matchId: 'match-1',
      kind: 'ranked',
      result: 'win',
      reason: 'completed',
      shardsEarned: 10,
      ratingDelta: 12,
      shards: 200,
      seasonRating: 1222,
      wins: 4,
      losses: 2,
      streak: 2,
    },
  }

  const cases: Array<[string, ServerMatchLifecycle, boolean]> = [
    ['idle', IDLE, false],
    ['active', live('active'), true],
    ['reconnecting', live('reconnecting'), true],
    ['leaving', live('leaving'), true],
    ['terminal', TERMINAL, false],
  ]

  for (const [label, value, expected] of cases) {
    it(`is ${expected} while the match phase is "${label}"`, () => {
      const { state } = mountProvider()
      act(() => {
        state().setServerMatch(value)
      })
      expect(state().serverBattleActive).toBe(expected)
    })
  }
})

describe('GameProvider setters', () => {
  it('updates game state through setGame', () => {
    const { state } = mountProvider()
    const before = state().game
    act(() => {
      state().setGame((game) => ({ ...game, turnNumber: game.turnNumber + 5 }))
    })
    expect(state().game.turnNumber).toBe(before.turnNumber + 5)
  })

  it('tracks damaged slots as a Set identity change', () => {
    const { state } = mountProvider()
    act(() => {
      state().setDamagedSlots(new Set(['player-0', 'enemy-2']))
    })
    expect([...state().damagedSlots].sort()).toEqual(['enemy-2', 'player-0'])
  })

  it('carries the inspected card through unchanged', () => {
    const { state } = mountProvider()
    // InspectedCard is a flattened presentation shape, not a wrapper around a
    // engine card — it carries no `source`, so the modal cannot tell hand from
    // board. Recorded because it constrains what the inspect modal can show.
    const inspected: InspectedCard = {
      id: 'spark-imp',
      name: 'Spark Imp',
      icon: 'imp',
      cost: 1,
      attack: 2,
      health: 1,
      rarity: 'common',
      tribe: 'imp',
      text: 'A quick striker.',
      effect: null,
    }
    act(() => {
      state().setInspectedCard(inspected)
    })
    expect(state().inspectedCard).toEqual(inspected)
  })
})

describe('useGameState outside a provider', () => {
  it('throws a named error rather than returning null', () => {
    function Orphan() {
      useGameState()
      return null
    }
    // React logs the thrown error; the assertion is that it throws at all.
    expect(() => render(<Orphan />)).toThrow(/useGameState must be used inside <GameProvider>/)
  })
})
