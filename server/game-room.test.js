import { afterEach, describe, expect, it } from 'vitest'
import {
  createRoom,
  destroyRoom,
  getRoomByAccount,
  getRoomBySocket,
  handleDisconnect,
} from './game-room.js'

afterEach(() => {
  destroyRoom('test-room-1')
  destroyRoom('test-room-2')
})

describe('game room reconnect recovery', () => {
  it('remaps the disconnected player to the new socket and clears the grace timer', () => {
    const room = createRoom('test-room-1', 'duel')
    room.start(
      {
        socketId: 'socket-player',
        accountId: 101,
        name: 'Player One',
        deckConfig: { 'spark-imp': 2, 'tide-caller': 2, 'cave-bat': 2, 'copper-automaton': 2, 'shade-fox': 2 },
      },
      {
        socketId: 'socket-enemy',
        accountId: 202,
        name: 'Player Two',
        deckConfig: { 'spark-imp': 2, 'tide-caller': 2, 'cave-bat': 2, 'copper-automaton': 2, 'shade-fox': 2 },
      },
    )

    expect(getRoomBySocket('socket-player')).toBe(room)
    expect(getRoomByAccount(101)).toBe(room)

    const disconnectedRoom = handleDisconnect('socket-player')
    expect(disconnectedRoom).toBe(room)
    expect(room.isDisconnected('player')).toBe(true)
    expect(room.sockets.player).toBeNull()

    const timer = setTimeout(() => {}, 1_000)
    room.forfeitTimers.player = timer

    const side = room.reconnect(101, 'socket-player-rejoined')

    expect(side).toBe('player')
    expect(room.isDisconnected('player')).toBe(false)
    expect(room.sockets.player).toBe('socket-player-rejoined')
    expect(room.forfeitTimers.player).toBeNull()
    expect(getRoomBySocket('socket-player-rejoined')).toBe(room)

    clearTimeout(timer)
  })

  it('rejects rejoin attempts from accounts outside the room', () => {
    const room = createRoom('test-room-2', 'duel')
    room.start(
      {
        socketId: 'socket-a',
        accountId: 11,
        name: 'Alpha',
        deckConfig: { 'spark-imp': 2, 'tide-caller': 2, 'cave-bat': 2, 'copper-automaton': 2, 'shade-fox': 2 },
      },
      {
        socketId: 'socket-b',
        accountId: 22,
        name: 'Beta',
        deckConfig: { 'spark-imp': 2, 'tide-caller': 2, 'cave-bat': 2, 'copper-automaton': 2, 'shade-fox': 2 },
      },
    )

    expect(room.reconnect(999, 'socket-c')).toBeNull()
    expect(getRoomBySocket('socket-c')).toBeUndefined()
  })
})
