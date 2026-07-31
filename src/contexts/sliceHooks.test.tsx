// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppShellContext, type AppShellContextValue } from '../AppShellContext'
import { GameProvider } from './GameProvider'
import { ProfileProvider } from './ProfileProvider'
import { QueueProvider } from './QueueProvider'
import { SocialProvider } from './SocialProvider'
import { useAppShell } from './useAppShell'
import { useGame } from './useGame'
import { useProfile } from './useProfile'
import { useQueue } from './useQueue'
import { useSocial } from './useSocial'

/**
 * Characterization tests for the slice hooks.
 *
 * Each slice is a thin composition: provider state plus a hand-picked set of
 * handlers from AppShellContext. What matters for the AppShell split is the
 * *contract* — which keys each slice is expected to surface — because that is
 * what screens consume and what a refactor could silently drop. These assert
 * the composition, not the handler behaviour.
 */

/**
 * A stand-in shell value. Every key is a marker string or a named no-op so a
 * slice picking up the wrong key is visible in the assertion.
 */
function markerShell(): AppShellContextValue {
  const handler = (name: string) => Object.assign(() => {}, { markerName: name })
  return new Proxy({} as AppShellContextValue, {
    get: (_target, prop: string) => handler(prop),
    has: () => true,
  })
}

function wrap(children: ReactNode, shell: AppShellContextValue = markerShell()) {
  return (
    <AppShellContext.Provider value={shell}>
      <ProfileProvider>
        <GameProvider>
          <SocialProvider>
            <QueueProvider>{children}</QueueProvider>
          </SocialProvider>
        </GameProvider>
      </ProfileProvider>
    </AppShellContext.Provider>
  )
}

/** Render a hook inside the full provider stack and return what it produced. */
function readSlice<T>(useSlice: () => T): T {
  const seen: { current: T | null } = { current: null }
  function Probe() {
    seen.current = useSlice()
    return null
  }
  render(wrap(<Probe />))
  return seen.current as T
}

afterEach(cleanup)

describe('useQueue', () => {
  it('exposes provider state alongside the three queue handlers', () => {
    const slice = readSlice(useQueue)
    expect(slice.queueState).toBe('idle')
    expect(slice.liveQueueLabel).toBe('Waiting for challengers')
    expect(typeof slice.handleStartQueue).toBe('function')
    expect(typeof slice.handleCancelQueue).toBe('function')
    expect(typeof slice.handleAcceptQueue).toBe('function')
  })

  it('takes its handlers from the shell, not the provider', () => {
    const slice = readSlice(useQueue) as unknown as Record<string, { markerName?: string }>
    expect(slice.handleStartQueue.markerName).toBe('handleStartQueue')
    expect(slice.handleAcceptQueue.markerName).toBe('handleAcceptQueue')
  })
})

describe('useGame', () => {
  it('merges game state, deck config from ProfileProvider, and shell handlers', () => {
    const slice = readSlice(useGame)
    // From GameProvider
    expect(slice.game.mode).toBe('ai')
    expect(slice.serverBattleActive).toBe(false)
    // Deliberately sourced from ProfileProvider, not GameProvider
    expect(slice.deckConfig).toBeTruthy()
    expect(typeof slice.setDeckConfig).toBe('function')
    // From AppShellContext
    expect(typeof slice.startMatch).toBe('function')
    expect(typeof slice.handleLeaveBattle).toBe('function')
    expect(typeof slice.handleAbandonBattle).toBe('function')
  })

  it('keeps leave and abandon as distinct handlers', () => {
    // These are two different operations — Leave pauses a server match,
    // Abandon surrenders it. A split that aliased them would be a real bug.
    const slice = readSlice(useGame) as unknown as Record<string, { markerName?: string }>
    expect(slice.handleLeaveBattle.markerName).toBe('handleLeaveBattle')
    expect(slice.handleAbandonBattle.markerName).toBe('handleAbandonBattle')
  })
})

describe('useProfile and useSocial', () => {
  it('useProfile surfaces the collection slice from the provider', () => {
    const slice = readSlice(useProfile)
    expect(slice.collection).toEqual({})
    expect(slice.deckConfig).toBeTruthy()
    expect(slice.questOverview).toBeNull()
  })

  /**
   * Quirk, recorded deliberately: `savedDecks` and `activeDeckId` exist in BOTH
   * ProfileProvider and AppShellContext. `useProfile` spreads the provider
   * first and then overwrites both with the shell's copies, so screens read the
   * shell's version and the provider's is dead state for them.
   *
   * That is two sources of truth for the same data. It is not fixed here —
   * changing it is a behaviour change that belongs in its own commit — but it
   * is pinned so the AppShell split cannot flip which one wins by accident.
   */
  it('lets the shell shadow savedDecks and activeDeckId over the provider', () => {
    const slice = readSlice(useProfile) as unknown as Record<string, { markerName?: string }>
    expect(slice.savedDecks.markerName).toBe('savedDecks')
    expect(slice.activeDeckId.markerName).toBe('activeDeckId')
  })

  it('useSocial surfaces the social slice', () => {
    const slice = readSlice(useSocial)
    expect(slice.friends).toEqual([])
    expect(slice.socialStatus).toBe('Social hub ready.')
  })
})

describe('useAppShell', () => {
  it('returns the shell context unchanged', () => {
    const shell = markerShell()
    const seen: { current: AppShellContextValue | null } = { current: null }
    function Probe() {
      seen.current = useAppShell()
      return null
    }
    render(wrap(<Probe />, shell))
    expect(seen.current).toBe(shell)
  })

  it('throws outside the shell provider', () => {
    function Orphan() {
      useAppShell()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(
      /useAppShellContext must be used within <AppShellContext.Provider>/,
    )
  })
})
