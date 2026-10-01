import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * A failed settlement write used to be final: players were told "your result
 * has not been lost", but nothing ever tried again and the room expired with
 * the only copy of the result. db.js is mocked so a write can be made to fail.
 */
const settle = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  expireLegacyMigrationAccounts: () => ({ deleted: 0 }),
  getLeaderboard: () => [],
  reapAbandonedSignups: () => ({ released: 0 }),
  settleAuthoritativeMatch: settle,
}))

const { createRealtime } = await import('./realtime.js')
const { createRoom, destroyRoom, rooms } = await import('./game-room.js')

const TEST_DECK = { 'spark-imp': 2, 'tide-caller': 2, 'cave-bat': 2, 'copper-automaton': 2, 'shade-fox': 2 }

function fakeIo() {
  return {
    emit: () => {},
    to: () => ({ emit: () => {} }),
    sockets: { sockets: new Map() },
    engine: { clientsCount: 0 },
  }
}

function finishedDuel(roomId) {
  const room = createRoom(roomId, 'duel')
  room.start(
    { socketId: `${roomId}-a`, accountId: 'acct-a', name: 'A', deckConfig: TEST_DECK },
    { socketId: `${roomId}-b`, accountId: 'acct-b', name: 'B', deckConfig: TEST_DECK },
  )
  room.finalizeForfeit('enemy')
  return room
}

afterEach(() => {
  settle.mockReset()
  for (const roomId of [...rooms.keys()]) destroyRoom(roomId)
})

describe('settlement retry', () => {
  it('retries a failed settlement until it is written, then stops', () => {
    const realtime = createRealtime({ io: fakeIo(), matchIdleTimeoutMs: 15 * 60 * 1000 })
    const room = finishedDuel('room-retry')
    settle
      .mockReturnValueOnce({ ok: false, error: 'database is locked' })
      .mockReturnValueOnce({ ok: true, matchId: room.roomId, reason: 'surrender', outcomes: [] })

    expect(realtime.finalizeRoom(room, 'surrender').ok).toBe(false)
    expect(room.settlementPendingReason).toBe('surrender')
    expect(room.terminalSettlement).toBeNull()

    expect(realtime.retryPendingSettlements()).toBe(1)
    expect(settle).toHaveBeenCalledTimes(2)
    expect(settle.mock.calls[1][0]).toMatchObject({ matchId: 'room-retry', reason: 'surrender' })
    expect(room.terminalSettlement).not.toBeNull()
    expect(room.settlementPendingReason).toBeNull()

    expect(realtime.retryPendingSettlements()).toBe(0)
    expect(settle).toHaveBeenCalledTimes(2)
  })

  it('keeps retrying while the database stays down', () => {
    const realtime = createRealtime({ io: fakeIo(), matchIdleTimeoutMs: 15 * 60 * 1000 })
    const room = finishedDuel('room-down')
    settle.mockReturnValue({ ok: false, error: 'disk I/O error' })

    realtime.finalizeRoom(room, 'completed')
    expect(realtime.retryPendingSettlements()).toBe(0)
    expect(realtime.retryPendingSettlements()).toBe(0)
    expect(settle).toHaveBeenCalledTimes(3)
    expect(room.settlementPendingReason).toBe('completed')
  })
})
