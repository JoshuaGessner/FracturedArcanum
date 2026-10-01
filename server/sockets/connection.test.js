import { describe, expect, it, vi } from 'vitest'
import { registerConnectionHandler } from './connection.js'
import { createRoom, destroyRoom, getRoomByAccount } from '../game-room.js'

// The handler reads profiles and decks straight from db.js. Stubbed so a test
// can drive whole socket conversations without opening a database.
const getMatchSettlementForAccount = vi.hoisted(() => vi.fn(() => null))

vi.mock('../db.js', async () => {
  const { DEFAULT_DECK_CONFIG } = await import('../game.js')
  return {
    acknowledgeMatchSettlement: () => false,
    getLatestUnacknowledgedSettlement: () => null,
    getMatchSettlementForAccount,
    getProfile: (accountId) => ({ display_name: `Name ${accountId}`, season_rating: 1200, selected_card_border: 'default' }),
    getSocialOverview: () => ({ friends: [] }),
    isFriendOf: () => true,
    sanitizeCardBorder: () => 'default',
    validateDeckForMatch: () => ({ ok: true, deckConfig: { ...DEFAULT_DECK_CONFIG } }),
  }
})

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
    findConnectedSocket: () => null,
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

/** A socket double that records what it is sent and lets a test fire events. */
function fakeSocket(io, id, accountId) {
  const listeners = new Map()
  const socket = {
    id,
    connected: true,
    data: { accountId, username: accountId, displayName: accountId },
    sent: [],
    on: (event, fn) => listeners.set(event, fn),
    emit: (event, payload) => socket.sent.push({ event, payload }),
    join: () => {},
    leave: () => {},
    fire: (event, payload) => listeners.get(event)?.(payload, () => {}),
    received: (event) => socket.sent.filter((entry) => entry.event === event),
  }
  io.sockets.sockets.set(id, socket)
  return socket
}

describe('friend challenges', () => {
  /**
   * Regression: accepting read a `presence` map that never moved into this
   * module. socket.io runs listeners on a bare process.nextTick, so the
   * ReferenceError took the whole server down — and every live match with it.
   */
  it('accepting a challenge seats both players in a duel', () => {
    const io = fakeIo()
    const ctx = fakeCtx(io)
    const online = new Set(['acct-a', 'acct-b'])
    ctx.isOnline = (accountId) => online.has(accountId)
    ctx.findConnectedSocket = (accountId) =>
      [...io.sockets.sockets.values()].find((s) => s.data.accountId === accountId && s.connected) ?? null
    ctx.findChallengeForAccount = () => null
    registerConnectionHandler(ctx)
    const connect = io.handlers.get('connection')

    const challenger = fakeSocket(io, 'sock-a', 'acct-a')
    const accepter = fakeSocket(io, 'sock-b', 'acct-b')
    connect(challenger)
    connect(accepter)

    challenger.fire('challenge:send', { targetAccountId: 'acct-b' })
    const [sent] = challenger.received('challenge:sent')
    expect(sent?.payload.challengeId).toBeTruthy()

    expect(() => accepter.fire('challenge:accept', { challengeId: sent.payload.challengeId })).not.toThrow()
    expect(challenger.received('game:start')).toHaveLength(1)
    expect(accepter.received('game:start')).toHaveLength(1)
    expect(ctx.pendingChallenges.get(sent.payload.challengeId)?.status).toBe('accepted')

    const room = getRoomByAccount('acct-a')
    expect(room?.mode).toBe('unranked')
    if (room) destroyRoom(room.roomId)
  })

  it('cancels when the challenger has no connected socket left', () => {
    const io = fakeIo()
    const ctx = fakeCtx(io)
    ctx.isOnline = () => true
    ctx.findConnectedSocket = () => null
    registerConnectionHandler(ctx)
    const connect = io.handlers.get('connection')
    const challenger = fakeSocket(io, 'sock-c', 'acct-c')
    const accepter = fakeSocket(io, 'sock-d', 'acct-d')
    connect(challenger)
    connect(accepter)

    challenger.fire('challenge:send', { targetAccountId: 'acct-d' })
    const [sent] = challenger.received('challenge:sent')
    accepter.fire('challenge:accept', { challengeId: sent.payload.challengeId })

    expect(accepter.received('challenge:error').at(-1)?.payload.error).toBe('Challenger disconnected.')
    expect(ctx.pendingChallenges.get(sent.payload.challengeId)?.status).toBe('cancelled')
  })
})

describe('reconnecting to a finished match', () => {
  function finishedRoom(roomId) {
    const room = createRoom(roomId, 'duel')
    const deck = { 'spark-imp': 2, 'tide-caller': 2, 'cave-bat': 2, 'copper-automaton': 2, 'shade-fox': 2 }
    room.start(
      { socketId: `${roomId}-old-a`, accountId: 'acct-fin-a', name: 'A', deckConfig: deck },
      { socketId: `${roomId}-old-b`, accountId: 'acct-fin-b', name: 'B', deckConfig: deck },
    )
    room.finalizeForfeit('enemy')
    return room
  }

  /**
   * Regression: the handler passed `room.terminalSettlement` — the whole-match
   * record, with `outcomes` — where this account's record (`outcome`) belongs,
   * so a player reconnecting before the room was destroyed heard nothing.
   */
  it('sends this account its own settled result', () => {
    const room = finishedRoom('room-settled')
    room.terminalSettlement = { ok: true, matchId: room.roomId, outcomes: [{ accountId: 'acct-fin-a', result: 'win' }] }
    getMatchSettlementForAccount.mockReturnValueOnce({
      ok: true, matchId: room.roomId, mode: 'duel', reason: 'surrender', outcome: { accountId: 'acct-fin-a', result: 'win' },
    })
    const io = fakeIo()
    registerConnectionHandler(fakeCtx(io))
    const socket = fakeSocket(io, 'sock-fin-a', 'acct-fin-a')
    io.handlers.get('connection')(socket)

    const [over] = socket.received('game:over')
    expect(over?.payload).toMatchObject({ matchId: room.roomId, result: 'win', reason: 'surrender' })
    destroyRoom(room.roomId)
  })

  it('retries a pending settlement when a participant comes back', () => {
    const room = finishedRoom('room-pending')
    room.settlementPendingReason = 'surrender'
    const io = fakeIo()
    const ctx = fakeCtx(io)
    ctx.finalizeRoom = vi.fn(() => ({ ok: true }))
    registerConnectionHandler(ctx)
    io.handlers.get('connection')(fakeSocket(io, 'sock-fin-b', 'acct-fin-b'))

    expect(ctx.finalizeRoom).toHaveBeenCalledWith(room, 'surrender')
    destroyRoom(room.roomId)
  })
})
