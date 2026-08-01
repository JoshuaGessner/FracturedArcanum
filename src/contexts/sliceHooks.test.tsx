// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppShellContext, type AppShellContextValue } from '../AppShellContext'
import { GameProvider } from './GameProvider'
import { PlayerProvider } from './PlayerProvider'
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
      <PlayerProvider>
        <ProfileProvider>
          <GameProvider>
            <SocialProvider>
              <QueueProvider>{children}</QueueProvider>
            </SocialProvider>
          </GameProvider>
        </ProfileProvider>
      </PlayerProvider>
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
   * Decks come from ProfileProvider, and only from there.
   *
   * This used to be routed twice: AppShell read `savedDecks` off
   * `useProfileState()`, republished it on AppShellContext, and `useProfile`
   * then overwrote the provider's own value with the shell's copy. Both held
   * the same data, so nothing was visibly wrong — it was redundant plumbing
   * rather than two sources of truth — but it meant a reader could not tell
   * which path was authoritative. The shell no longer carries them at all.
   */
  it('reads savedDecks and activeDeckId from the provider, not the shell', () => {
    const slice = readSlice(useProfile) as unknown as Record<string, unknown>
    // The marker shell would hand back a function for any key it owned.
    expect(typeof slice.savedDecks).not.toBe('function')
    expect(slice.savedDecks).toEqual([])
    expect(slice.activeDeckId).toBeNull()
  })

  /**
   * The player record and its derivations come from PlayerProvider now, not
   * from the shell. Same check as the decks above: the marker shell answers
   * every key with a function, so a real number here proves the value did not
   * arrive by way of AppShellContext.
   */
  it('reads the player record and its derivations from PlayerProvider', () => {
    const slice = readSlice(useProfile)

    expect(slice.serverProfile).toBeNull()
    expect(slice.shards).toBe(0)
    expect(slice.seasonRating).toBe(1200)
    expect(slice.rankLabel).toBe('Silver')
    expect(slice.record).toEqual({ wins: 0, losses: 0, streak: 0 })
    expect(slice.isOwnerRole).toBe(false)
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
