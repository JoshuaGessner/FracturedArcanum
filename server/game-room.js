import {
  createDuelGame,
  playCard,
  attack,
  castMomentumBurst,
  passTurn,
  redactGameState,
  otherSide,
  surrenderGame,
  BOARD_SIZE,
} from './game.js'

const MAX_ROOM_AGE_MS = 30 * 60 * 1000 // 30 minutes
const MAX_ROOMS = 200
const RECONNECT_GRACE_MS = 60 * 1000 // 60 seconds to reconnect

/** @type {Map<string, GameRoom>} */
const rooms = new Map()

/** @type {Map<string, string>} socketId → roomId */
const socketToRoom = new Map()

/** @type {Map<number, string>} accountId → roomId */
const accountToRoom = new Map()

class GameRoom {
  /**
   * @param {string} roomId
   * @param {'duel'|'unranked'} [mode]
   */
  constructor(roomId, mode = 'duel') {
    this.roomId = roomId
    this.mode = mode
    /** @type {{ player: string | null, enemy: string | null }} */
    this.sockets = { player: null, enemy: null }
    /** @type {{ player: number | null, enemy: number | null }} */
    this.accounts = { player: null, enemy: null }
    /** @type {{ player: string, enemy: string }} */
    this.names = { player: '', enemy: '' }
    this.state = null
    this.createdAt = Date.now()
    /** @type {{ player: number | null, enemy: number | null }} disconnectedAt timestamps */
    this.disconnectedAt = { player: null, enemy: null }
    /** @type {{ player: ReturnType<typeof setTimeout> | null, enemy: ReturnType<typeof setTimeout> | null }} */
    this.forfeitTimers = { player: null, enemy: null }
  }

  /**
   * @param {{ socketId: string, accountId: number, name: string, deckConfig: Record<string, number> }} player1
   * @param {{ socketId: string, accountId: number, name: string, deckConfig: Record<string, number> }} player2
   */
  start(player1, player2) {
    this.sockets = { player: player1.socketId, enemy: player2.socketId }
    this.accounts = { player: player1.accountId, enemy: player2.accountId }
    this.names = { player: player1.name, enemy: player2.name }
    this.state = createDuelGame(
      player1.name,
      player1.deckConfig,
      player2.name,
      player2.deckConfig,
    )
    socketToRoom.set(player1.socketId, this.roomId)
    socketToRoom.set(player2.socketId, this.roomId)
    accountToRoom.set(player1.accountId, this.roomId)
    accountToRoom.set(player2.accountId, this.roomId)
  }

  /**
   * @param {string} socketId
   * @returns {'player' | 'enemy' | null}
   */
  getSideForSocket(socketId) {
    if (this.sockets.player === socketId) return 'player'
    if (this.sockets.enemy === socketId) return 'enemy'
    return null
  }

  /**
   * @param {number} accountId
   * @returns {'player' | 'enemy' | null}
   */
  getSideForAccount(accountId) {
    if (this.accounts.player === accountId) return 'player'
    if (this.accounts.enemy === accountId) return 'enemy'
    return null
  }

  /**
   * @param {string} socketId
   * @returns {number | null}
   */
  getAccountForSocket(socketId) {
    const side = this.getSideForSocket(socketId)
    return side ? this.accounts[side] : null
  }

  /**
   * Mark a side as disconnected (does not forfeit immediately).
   * @param {string} socketId
   * @returns {'player' | 'enemy' | null} the side that disconnected
   */
  markDisconnected(socketId) {
    const side = this.getSideForSocket(socketId)
    if (!side) return null
    this.disconnectedAt[side] = Date.now()
    // Remove old socket mapping but keep account mapping
    socketToRoom.delete(socketId)
    this.sockets[side] = null
    return side
  }

  /**
   * Reconnect a player with a new socket.
   * @param {number} accountId
   * @param {string} newSocketId
   * @returns {'player' | 'enemy' | null} the side that reconnected
   */
  reconnect(accountId, newSocketId) {
    const side = this.getSideForAccount(accountId)
    if (!side) return null
    // Clear old socket mapping if it still exists
    if (this.sockets[side]) {
      socketToRoom.delete(this.sockets[side])
    }
    this.sockets[side] = newSocketId
    this.disconnectedAt[side] = null
    if (this.forfeitTimers[side]) {
      clearTimeout(this.forfeitTimers[side])
      this.forfeitTimers[side] = null
    }
    socketToRoom.set(newSocketId, this.roomId)
    return side
  }

  /**
   * Check if a side is currently disconnected.
   * @param {'player' | 'enemy'} side
   * @returns {boolean}
   */
  isDisconnected(side) {
    return this.disconnectedAt[side] !== null
  }

  /**
   * Validate and execute a game action.
   * @param {string} socketId
   * @param {{ type: string, handIndex?: number, attackerIndex?: number, target?: number | 'hero' }} action
   * @returns {{ ok: boolean, error?: string }}
   */
  handleAction(socketId, action) {
    if (!this.state) return { ok: false, error: 'Game not started.' }

    const side = this.getSideForSocket(socketId)
    if (!side) return { ok: false, error: 'Not in this room.' }
    if (this.state.winner) return { ok: false, error: 'Game is over.' }
    if (!action || typeof action !== 'object') return { ok: false, error: 'Invalid action.' }

    const type = String(action.type ?? '')
    if (type !== 'surrender' && this.state.turn !== side) return { ok: false, error: 'Not your turn.' }

    let newState = this.state

    switch (type) {
      case 'playCard': {
        const handIndex = Number(action.handIndex)
        if (!Number.isInteger(handIndex) || handIndex < 0) {
          return { ok: false, error: 'Invalid hand index.' }
        }
        const actor = this.state[side]
        const card = actor.hand[handIndex]
        if (!card) return { ok: false, error: 'No card at that index.' }
        if (card.cost > actor.mana) return { ok: false, error: 'Not enough mana.' }
        if (actor.board.every((slot) => slot !== null)) {
          return { ok: false, error: 'Board is full.' }
        }
        newState = playCard(this.state, side, handIndex)
        break
      }
      case 'attack': {
        const attackerIndex = Number(action.attackerIndex)
        if (!Number.isInteger(attackerIndex) || attackerIndex < 0 || attackerIndex >= BOARD_SIZE) {
          return { ok: false, error: 'Invalid attacker index.' }
        }
        const attacker = this.state[side].board[attackerIndex]
        if (!attacker) return { ok: false, error: 'No unit at that index.' }
        if (attacker.exhausted) return { ok: false, error: 'Unit is exhausted.' }

        const target = action.target
        if (target !== 'hero' && (!Number.isInteger(target) || target < 0 || target >= BOARD_SIZE)) {
          return { ok: false, error: 'Invalid target.' }
        }
        newState = attack(this.state, side, attackerIndex, target)
        break
      }
      case 'burst': {
        const actor = this.state[side]
        if (actor.momentum < 3) return { ok: false, error: 'Not enough momentum.' }
        newState = castMomentumBurst(this.state, side)
        break
      }
      case 'endTurn': {
        newState = passTurn(this.state)
        break
      }
      case 'surrender': {
        newState = surrenderGame(this.state, side)
        break
      }
      default:
        return { ok: false, error: 'Unknown action type.' }
    }

    if (newState === this.state) {
      return { ok: false, error: 'Action had no effect.' }
    }

    this.state = newState
    return { ok: true }
  }

  /**
   * Get redacted game state for a specific player.
   * @param {string} socketId
   * @returns {object | null}
   */
  getViewForSocket(socketId) {
    const side = this.getSideForSocket(socketId)
    if (!side || !this.state) return null
    return {
      yourSide: side,
      state: redactGameState(this.state, side),
    }
  }

  /**
   * Get redacted game state for a specific account (used for reconnect).
   * @param {number} accountId
   * @returns {object | null}
   */
  getViewForAccount(accountId) {
    const side = this.getSideForAccount(accountId)
    if (!side || !this.state) return null
    return {
      yourSide: side,
      state: redactGameState(this.state, side),
    }
  }

  /**
   * @returns {{ playerSide: 'player' | 'enemy', winner: string } | null}
   */
  getWinnerResult() {
    if (!this.state?.winner || this.state.winner === 'draw') {
      return this.state?.winner === 'draw' ? { winner: 'draw' } : null
    }
    return { winner: this.state.winner }
  }

  isExpired() {
    return Date.now() - this.createdAt > MAX_ROOM_AGE_MS
  }

  cleanup() {
    if (this.forfeitTimers.player) clearTimeout(this.forfeitTimers.player)
    if (this.forfeitTimers.enemy) clearTimeout(this.forfeitTimers.enemy)
  }
}

/**
 * @param {string} roomId
 * @param {'duel'|'unranked'} [mode]
 * @returns {GameRoom}
 */
export function createRoom(roomId, mode = 'duel') {
  if (rooms.size >= MAX_ROOMS) {
    pruneExpiredRooms()
    if (rooms.size >= MAX_ROOMS) {
      throw new Error('Maximum active rooms reached.')
    }
  }
  const room = new GameRoom(roomId, mode)
  rooms.set(roomId, room)
  return room
}

/**
 * @param {string} roomId
 * @returns {GameRoom | undefined}
 */
export function getRoom(roomId) {
  return rooms.get(roomId)
}

/**
 * @param {string} socketId
 * @returns {GameRoom | undefined}
 */
export function getRoomBySocket(socketId) {
  const roomId = socketToRoom.get(socketId)
  return roomId ? rooms.get(roomId) : undefined
}

/**
 * @param {number} accountId
 * @returns {GameRoom | undefined}
 */
export function getRoomByAccount(accountId) {
  const roomId = accountToRoom.get(accountId)
  return roomId ? rooms.get(roomId) : undefined
}

/**
 * @param {string} roomId
 */
export function destroyRoom(roomId) {
  const room = rooms.get(roomId)
  if (room) {
    room.cleanup()
    if (room.sockets.player) socketToRoom.delete(room.sockets.player)
    if (room.sockets.enemy) socketToRoom.delete(room.sockets.enemy)
    if (room.accounts.player) accountToRoom.delete(room.accounts.player)
    if (room.accounts.enemy) accountToRoom.delete(room.accounts.enemy)
    rooms.delete(roomId)
  }
}

/**
 * @param {string} socketId
 */
export function handleDisconnect(socketId) {
  const room = getRoomBySocket(socketId)
  if (!room) return null
  room.markDisconnected(socketId)
  return room
}

function pruneExpiredRooms() {
  for (const [roomId, room] of rooms) {
    if (room.isExpired()) {
      destroyRoom(roomId)
    }
  }
}

// Periodic cleanup every 5 minutes
setInterval(pruneExpiredRooms, 5 * 60 * 1000)

export { rooms, socketToRoom, accountToRoom, RECONNECT_GRACE_MS }
