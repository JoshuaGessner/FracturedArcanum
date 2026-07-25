import { afterEach, describe, expect, it } from 'vitest'
import {
  createRoom,
  destroyRoom,
  getRoomByAccount,
  getRoomBySocket,
  handleDisconnect,
  rooms,
} from './game-room.js'

afterEach(() => {
  for (const roomId of [...rooms.keys()]) destroyRoom(roomId)
})

const TEST_DECK = { 'spark-imp': 2, 'tide-caller': 2, 'cave-bat': 2, 'copper-automaton': 2, 'shade-fox': 2 }

function startTestRoom(roomId = 'test-room-1', playerSocket = 'socket-player', enemySocket = 'socket-enemy') {
  const room = createRoom(roomId, 'duel')
  room.start(
    { socketId: playerSocket, accountId: 101, name: 'Player One', deckConfig: TEST_DECK },
    { socketId: enemySocket, accountId: 202, name: 'Player Two', deckConfig: TEST_DECK },
  )
  return room
}

function startAiTestRoom(roomId = 'test-ai-room', difficulty = 'adept') {
  const room = createRoom(roomId, 'ai')
  room.startAi(
    { socketId: 'socket-player', accountId: 101, name: 'Solo Player', deckConfig: TEST_DECK },
    { enemyName: 'Server Nemesis', difficulty },
  )
  return room
}

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

  it('plays cards into requested empty lanes and rejects occupied lanes', () => {
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
    room.state.player.mana = 10
    room.state.player.board = [null, null, null]
    room.state.player.hand = [
      { ...room.state.player.hand[0], id: 'spark-imp', name: 'Crawling Spark', cost: 1 },
      { ...room.state.player.hand[1], id: 'tide-caller', name: 'Tide Caller', cost: 1 },
    ]

    expect(room.handleAction('socket-player', { type: 'playCard', handIndex: 0, laneIndex: 2 })).toMatchObject({ ok: true, revision: 1, duplicate: false })
    expect(room.state.player.board[2]?.id).toBe('spark-imp')
    expect(room.handleAction('socket-player', { type: 'playCard', handIndex: 0, laneIndex: 2 })).toMatchObject({ ok: false, error: 'Lane is occupied.', revision: 1 })
  })
})

describe('game room lifecycle hardening', () => {
  it('does not let old-room cleanup erase mappings reassigned to a newer room', () => {
    const oldRoom = startTestRoom('test-room-1')
    const newRoom = startTestRoom('test-room-2')

    expect(getRoomBySocket('socket-player')).toBe(newRoom)
    expect(getRoomByAccount(101)).toBe(newRoom)

    destroyRoom(oldRoom.roomId)
    destroyRoom(oldRoom.roomId)

    expect(getRoomBySocket('socket-player')).toBe(newRoom)
    expect(getRoomBySocket('socket-enemy')).toBe(newRoom)
    expect(getRoomByAccount(101)).toBe(newRoom)
    expect(getRoomByAccount(202)).toBe(newRoom)
  })

  it('deduplicates accepted action envelopes and rejects stale revisions', () => {
    const room = startTestRoom()
    room.state.player.mana = 10
    room.state.player.board = [null, null, null]
    const firstCardId = room.state.player.hand[0].instanceId

    expect(room.handleAction('socket-player', {
      matchId: 'different-match',
      actionId: 'wrong-match',
      expectedRevision: 0,
      action: { type: 'endTurn' },
    })).toEqual({ ok: false, error: 'Action does not belong to this match.', revision: 0, duplicate: false })

    const envelope = {
      matchId: room.roomId,
      actionId: 'play-card-once',
      expectedRevision: 0,
      action: { type: 'playCard', handIndex: 0, cardInstanceId: firstCardId, laneIndex: 0 },
    }
    const first = room.handleAction('socket-player', envelope)
    const boardAfterFirst = room.state.player.board
    const duplicate = room.handleAction('socket-player', envelope)

    expect(first).toEqual({ ok: true, revision: 1, duplicate: false })
    expect(duplicate).toEqual({ ok: true, revision: 1, duplicate: true })
    expect(room.state.player.board).toBe(boardAfterFirst)
    expect(room.revision).toBe(1)

    expect(room.handleAction('socket-player', {
      matchId: room.roomId,
      actionId: 'stale-end-turn',
      expectedRevision: 0,
      action: { type: 'endTurn' },
    })).toEqual({ ok: false, error: 'Stale action revision.', revision: 1, duplicate: false })
    expect(room.revision).toBe(1)
  })

  it('uses a supplied card instance id to reject a shifted stale hand action', () => {
    const room = startTestRoom()
    room.state.player.mana = 10
    const secondCardId = room.state.player.hand[1].instanceId

    expect(room.handleAction('socket-player', {
      type: 'playCard',
      handIndex: 0,
      cardInstanceId: secondCardId,
    })).toMatchObject({
      ok: false,
      error: 'Card is no longer at the expected hand index.',
      revision: 0,
    })
    expect(room.revision).toBe(0)
  })

  it('installs an idempotent terminal winner when a side forfeits', () => {
    const room = startTestRoom()

    expect(room.finalizeForfeit('enemy')).toEqual({
      ok: true,
      revision: 1,
      duplicate: false,
      winner: 'player',
    })
    expect(room.state.winner).toBe('player')
    expect(room.finalizeForfeit('enemy')).toEqual({
      ok: true,
      revision: 1,
      duplicate: true,
      winner: 'player',
    })
  })

  it('installs an idempotent no-contest without changing either player into a winner', () => {
    const room = startTestRoom()

    expect(room.finalizeAbort('Match closed after inactivity.')).toEqual({
      ok: true,
      revision: 1,
      duplicate: false,
      winner: 'draw',
    })
    expect(room.state.winner).toBe('draw')
    expect(room.state.log.at(-1)).toBe('Match closed after inactivity.')
    expect(room.finalizeAbort()).toMatchObject({ ok: true, revision: 1, duplicate: true, winner: 'draw' })
  })

  it('never expires an active match solely because it is old', () => {
    const room = startTestRoom()
    const farFuture = room.createdAt + 24 * 60 * 60 * 1000

    expect(room.isExpired(farFuture)).toBe(false)
    room.finalizeForfeit('enemy')
    expect(room.isExpired(room.lastActivityAt + 31 * 60 * 1000)).toBe(true)
  })
})

describe('server-authoritative AI rooms', () => {
  it('starts an AI game with only the player mapped and a redacted player view', () => {
    const room = startAiTestRoom()
    const view = room.getViewForSocket('socket-player')

    expect(room.mode).toBe('ai')
    expect(room.state.mode).toBe('ai')
    expect(room.state.aiDifficulty).toBe('adept')
    expect(room.state.player.name).toBe('Solo Player')
    expect(room.state.enemy.name).toBe('Server Nemesis')
    expect(room.sockets.enemy).toBeNull()
    expect(room.accounts.enemy).toBeNull()
    expect(getRoomBySocket('socket-player')).toBe(room)
    expect(getRoomByAccount(101)).toBe(room)
    expect(view).toMatchObject({ matchId: room.roomId, revision: 0, yourSide: 'player', serverMode: 'ai' })
    expect(view.state.enemy.hand).toEqual([])
    expect(view.state.enemy.handCount).toBeGreaterThan(0)
  })

  it('revisions the player end-turn action and advances the authoritative AI turn once', () => {
    const room = startAiTestRoom()

    expect(room.handleAction('socket-player', {
      matchId: room.roomId,
      actionId: 'end-player-turn',
      expectedRevision: 0,
      action: { type: 'endTurn' },
    })).toEqual({ ok: true, revision: 1, duplicate: false })
    expect(room.state.turn).toBe('enemy')

    const advanced = room.advanceAiTurn()

    expect(advanced.ok).toBe(true)
    expect(advanced.revision).toBe(2)
    expect(advanced.state).toBe(room.state)
    expect(room.state.turn === 'player' || Boolean(room.state.winner)).toBe(true)
    expect(room.advanceAiTurn()).toMatchObject({ ok: false, revision: 2 })
  })

  it('preserves a terminal AI victory in the authoritative room state', () => {
    const room = startAiTestRoom('test-ai-terminal', 'legend')
    const source = room.state.enemy.hand[0]
    room.state.player.health = 1
    room.state.player.board = [null, null, null]
    room.state.enemy.board = [
      { ...source, uid: 'terminal-ai-attacker', currentHealth: source.health, attack: 99, exhausted: false },
      null,
      null,
    ]

    expect(room.handleAction('socket-player', { type: 'endTurn' })).toMatchObject({ ok: true, revision: 1 })
    const advanced = room.advanceAiTurn()

    expect(advanced).toMatchObject({ ok: true, revision: 2 })
    expect(room.state.winner).toBe('enemy')
    expect(room.getViewForAccount(101)?.state.winner).toBe('enemy')
  })
})
