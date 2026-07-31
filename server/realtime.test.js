import { describe, expect, it } from 'vitest'
import { createRealtime } from './realtime.js'

/**
 * Presence, challenges and matchmaking were lifted out of server.js as a
 * factory so their mutable state — the waiting queue, the presence map,
 * pending challenges — has exactly one owner.
 *
 * The checks here are deliberately shallow but broad. Code moved out of a large
 * module keeps compiling while referencing bindings that stayed behind; those
 * are free variables until something calls them. The admin-store extraction
 * shipped four such holes, so every export gets called.
 */

/** Minimal Socket.IO stand-in: enough shape for the emit paths. */
function fakeIo() {
  const emitted = []
  const target = { emit: (event, payload) => emitted.push({ event, payload }) }
  return {
    emitted,
    emit: (event, payload) => emitted.push({ event, payload }),
    to: () => target,
    sockets: { sockets: new Map() },
    engine: { clientsCount: 0 },
  }
}

function build() {
  return createRealtime({ io: fakeIo(), matchIdleTimeoutMs: 15 * 60 * 1000 })
}

describe('createRealtime', () => {
  it('every exported function runs without a missing binding', () => {
    const realtime = build()
    const args = {
      trackPresence: ['acct-a', 'socket-1'],
      untrackPresence: ['acct-a', 'socket-1'],
      isOnline: ['acct-a'],
      emitToAccount: ['acct-a', 'test:event', {}],
      disconnectAccountSockets: ['acct-a', 'testing'],
      findChallengeForAccount: ['acct-a', 'outgoing'],
      getAllowedMatchDelta: [Date.now()],
      getRuntimeRankLabel: [1200],
      enqueueWaitingPlayer: [
        { id: 'socket-1', accountId: 'acct-a', queuedAt: Date.now(), profile: {}, deckConfig: {} },
      ],
      removeWaitingPlayer: ['socket-1', 'acct-a'],
      findBestWaitingPlayer: ['socket-2', 1200, Date.now()],
      roomParticipants: [{
        state: { winner: 'player' },
        accounts: { player: 'acct-a', enemy: 'acct-b' },
        names: { player: 'A', enemy: 'B' },
      }],
    }
    // These need a real room object; covered by the game-room suite instead.
    const needsRoom = new Set([
      'startRankedMatch', 'finalizeRoom', 'emitTerminalSettlement', 'broadcastRoomState',
    ])

    const failures = []
    for (const [name, value] of Object.entries(realtime)) {
      if (typeof value !== 'function' || needsRoom.has(name)) continue
      try {
        value(...(args[name] ?? []))
      } catch (error) {
        failures.push(`${name}: ${error.message}`)
      }
    }
    expect(failures, `exports threw: ${failures.join(' | ')}`).toEqual([])
  })

  /**
   * The queue is only reachable through the returned functions. If a caller
   * could still push onto the array directly, the single owner would be a
   * fiction — which is why `enqueueWaitingPlayer` exists at all.
   */
  it('owns the matchmaking queue behind enqueue and remove', () => {
    const realtime = build()
    expect(realtime.getLiveArenaSnapshot().queueSize).toBe(0)

    realtime.enqueueWaitingPlayer({
      id: 'socket-9', accountId: 'acct-z', queuedAt: Date.now(), profile: {}, deckConfig: {},
    })
    expect(realtime.getLiveArenaSnapshot().queueSize).toBe(1)

    realtime.removeWaitingPlayer('socket-9', 'acct-z')
    expect(realtime.getLiveArenaSnapshot().queueSize).toBe(0)
  })

  it('does not expose the queue array itself', () => {
    const realtime = build()
    expect(realtime.waitingPlayers).toBeUndefined()
  })

  it('gives each instance its own state', () => {
    // Two factories must not share a queue — that would be module state by
    // another name.
    const a = build()
    const b = build()
    a.enqueueWaitingPlayer({
      id: 's1', accountId: 'acct-a', queuedAt: Date.now(), profile: {}, deckConfig: {},
    })
    expect(a.getLiveArenaSnapshot().queueSize).toBe(1)
    expect(b.getLiveArenaSnapshot().queueSize).toBe(0)
  })

  it('tracks presence per account', () => {
    const realtime = build()
    expect(realtime.isOnline('acct-a')).toBe(false)
    realtime.trackPresence('acct-a', 'socket-1')
    expect(realtime.isOnline('acct-a')).toBe(true)
    realtime.untrackPresence('acct-a', 'socket-1')
    expect(realtime.isOnline('acct-a')).toBe(false)
  })
})
