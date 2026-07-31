// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { GameProvider, useGameState, type GameStateValue } from './GameProvider'
import { STORAGE_KEYS } from '../constants'
import type { ServerMatchLifecycle } from '../types'

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
  const cases: Array<[ServerMatchLifecycle['phase'], boolean]> = [
    ['idle', false],
    ['queued', false],
    ['active', true],
    ['reconnecting', true],
    ['leaving', true],
    ['complete', false],
  ]

  for (const [phase, expected] of cases) {
    it(`is ${expected} while the match phase is "${phase}"`, () => {
      const { state } = mountProvider()
      act(() => {
        state().setServerMatch((current) => ({ ...current, phase }))
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
    act(() => {
      state().setInspectedCard({ card: state().game.player.hand[0], source: 'hand' })
    })
    expect(state().inspectedCard?.source).toBe('hand')
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
