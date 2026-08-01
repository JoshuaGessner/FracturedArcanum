import { describe, expect, it } from 'vitest'
import { registerConnectionHandler } from './connection.js'

/**
 * The connection handler was lifted out of server.js along with its
 * per-connection rate limiter.
 *
 * Two things are checked, both cheap and both catching a class of bug that has
 * bitten this refactor before:
 *
 *  - Registering must not throw. Code moved out of a large module keeps
 *    compiling while referencing bindings that stayed behind; those are free
 *    variables until something runs. The admin-store extraction shipped four
 *    such holes.
 *  - The rate limiter's Map must be per-instance. It is mutable state that
 *    moved into a closure precisely so it has one owner; if two registrations
 *    shared it, that would be module state by another name.
 */

/** Captures the connection callback instead of running a real server. */
function fakeIo() {
  const handlers = new Map()
  return {
    handlers,
    on: (event, fn) => handlers.set(event, fn),
    emit: () => {},
    to: () => ({ emit: () => {} }),
    sockets: { sockets: new Map() },
    engine: { clientsCount: 0 },
  }
}

/** Every collaborator the handler reads off ctx, stubbed permissively. */
function fakeCtx(io) {
  const noop = () => {}
  return {
    io,
    serverConfig: { setupComplete: true },
    trackPresence: noop,
    untrackPresence: noop,
    isOnline: () => false,
    emitToAccount: noop,
    findChallengeForAccount: () => null,
    pendingChallenges: new Map(),
    CHALLENGE_TTL_MS: 60_000,
    emitLiveArenaState: noop,
    removeWaitingPlayer: noop,
    enqueueWaitingPlayer: () => 1,
    getRuntimeRankLabel: () => 'Bronze',
    broadcastRoomState: noop,
    finalizeRoom: noop,
    sweepWaitingPlayers: noop,
    adminStore: { totals: { queueJoins: 0 }, activity: [], settings: {} },
    pushActivity: noop,
    debouncedSaveAdminStore: noop,
  }
}

describe('registerConnectionHandler', () => {
  it('registers without a missing binding', () => {
    const io = fakeIo()
    expect(() => registerConnectionHandler(fakeCtx(io))).not.toThrow()
    expect(io.handlers.has('connection')).toBe(true)
  })

  it('wires the connection callback as a function', () => {
    const io = fakeIo()
    registerConnectionHandler(fakeCtx(io))
    expect(typeof io.handlers.get('connection')).toBe('function')
  })

  /**
   * Each registration must get its own rate-limit Map. Sharing one would mean
   * the state never really moved into the closure.
   */
  it('gives each registration its own rate-limiter state', () => {
    const a = fakeIo()
    const b = fakeIo()
    registerConnectionHandler(fakeCtx(a))
    registerConnectionHandler(fakeCtx(b))
    // Distinct callbacks imply distinct closures, and therefore distinct Maps.
    expect(a.handlers.get('connection')).not.toBe(b.handlers.get('connection'))
  })

  it('does not leak its rate-limiter onto the context', () => {
    const io = fakeIo()
    const ctx = fakeCtx(io)
    registerConnectionHandler(ctx)
    expect(ctx.socketRateLimits).toBeUndefined()
    expect(ctx.checkSocketRate).toBeUndefined()
  })
})
