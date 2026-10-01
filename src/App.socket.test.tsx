// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createGame } from './game'
import type { ServerProfile } from './types'

/**
 * AppShell binds its socket handlers once per session — the effect only re-runs
 * when the auth token changes. Anything those handlers read that can change
 * afterwards has to come through a ref. These tests drive the real shell with a
 * fake socket to pin that down.
 */

const socketMock = vi.hoisted(() => {
  const handlers = new Map<string, (payload?: unknown) => void>()
  return {
    handlers,
    socket: {
      connected: true,
      on: (event: string, fn: (payload?: unknown) => void) => { handlers.set(event, fn) },
      emit: () => {},
      disconnect: () => {},
    },
  }
})
vi.mock('socket.io-client', () => ({ io: () => socketMock.socket }))

const playSound = vi.hoisted(() => vi.fn())
vi.mock('./audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./audio')>()),
  playSound,
}))

// Pixi does not load under jsdom; entering battle lazy-loads it.
vi.mock('./components/BattleFxCanvas', () => ({ BattleFxCanvas: () => null }))

import App from './App'

const PROFILE: ServerProfile = {
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
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })
}

async function mountSignedIn(): Promise<void> {
  window.localStorage.setItem('fractured-arcanum.auth-token', JSON.stringify('token-1'))
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/me')) return json({ ok: true, profile: PROFILE })
    if (url.endsWith('/api/setup/status')) return json({ ok: true, setupComplete: true })
    return json({ ok: true })
  }))
  render(<App />)
  await settle()
  await settle()
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  socketMock.handlers.clear()
  playSound.mockReset()
})

describe('AppShell socket handlers', () => {
  it('respect a sound mute made after the socket connected', async () => {
    await mountSignedIn()
    expect(socketMock.handlers.has('game:start')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Settings and account' }))
    await settle()
    const audioSwitch = screen.getByRole('switch', { name: 'Arena Audio' })
    expect(audioSwitch.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(audioSwitch)
    await settle()
    expect(screen.getByRole('switch', { name: 'Arena Audio' }).getAttribute('aria-checked')).toBe('false')

    playSound.mockClear()
    await act(async () => {
      socketMock.handlers.get('game:start')?.({
        matchId: 'room-sound',
        revision: 0,
        yourSide: 'player',
        serverMode: 'ai',
        state: createGame('ai', {}),
      })
    })
    await settle()

    const chimes = playSound.mock.calls.filter(([name]) => name === 'summon')
    expect(chimes.length).toBeGreaterThan(0)
    expect(chimes.every(([, enabled]) => enabled === false)).toBe(true)
  })
})
