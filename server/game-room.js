import {
  createGame,
  createDuelGame,
  generateEnemyTurnSteps,
  playCard,
  attack,
  castMomentumBurst,
  passTurn,
  redactGameState,
  otherSide,
  surrenderGame,
  BOARD_SIZE,
} from './game.js'

const TERMINAL_ROOM_RETENTION_MS = 30 * 60 * 1000
const MAX_ROOMS = 200
const MAX_PROCESSED_ACTIONS = 256
const RECONNECT_GRACE_MS = 60 * 1000 // 60 seconds to reconnect

/** @type {Map<string, GameRoom>} */
const rooms = new Map()

/** @type {Map<string, string>} socketId → roomId */
const socketToRoom = new Map()

/** @type {Map<number, string>} accountId → roomId */
const accountToRoom = new Map()

function deleteMappingIfOwned(map, key, roomId) {
  if (key !== null && key !== undefined && map.get(key) === roomId) {
    map.delete(key)
  }
}

class GameRoom {
  /**
   * @param {string} roomId
   * @param {'duel'|'unranked'|'ai'} [mode]
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
    this.lastActivityAt = this.createdAt
    this.revision = 0
    /** @type {Map<string, { revision: number }>} */
    this.processedActions = new Map()
    this.pendingAiTurnBase = null
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
    this.lastActivityAt = Date.now()
    this.pendingAiTurnBase = null
    socketToRoom.set(player1.socketId, this.roomId)
    socketToRoom.set(player2.socketId, this.roomId)
    accountToRoom.set(player1.accountId, this.roomId)
    accountToRoom.set(player2.accountId, this.roomId)
  }

  /**
   * Start a server-authoritative single-player AI match.
   * @param {{ socketId: string, accountId: number, name: string, deckConfig: Record<string, number> }} player
   * @param {{ enemyName?: string, difficulty?: 'novice'|'adept'|'veteran'|'legend' }} [options]
   */
  startAi(player, options = {}) {
    const allowedDifficulties = new Set(['novice', 'adept', 'veteran', 'legend'])
    const difficulty = allowedDifficulties.has(options.difficulty) ? options.difficulty : 'adept'
    const enemyName = typeof options.enemyName === 'string' && options.enemyName.trim()
      ? options.enemyName.trim().slice(0, 40)
      : undefined

    this.mode = 'ai'
    this.sockets = { player: player.socketId, enemy: null }
    this.accounts = { player: player.accountId, enemy: null }
    this.state = createGame('ai', player.deckConfig, enemyName, difficulty)
    this.state = {
      ...this.state,
      player: { ...this.state.player, name: player.name },
    }
    this.names = { player: player.name, enemy: this.state.enemy.name }
    this.revision = 0
    this.processedActions.clear()
    this.pendingAiTurnBase = null
    this.disconnectedAt = { player: null, enemy: null }
    this.lastActivityAt = Date.now()
    socketToRoom.set(player.socketId, this.roomId)
    accountToRoom.set(player.accountId, this.roomId)
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
    this.lastActivityAt = Date.now()
    // Remove old socket mapping but keep account mapping
    deleteMappingIfOwned(socketToRoom, socketId, this.roomId)
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
      deleteMappingIfOwned(socketToRoom, this.sockets[side], this.roomId)
    }
    this.sockets[side] = newSocketId
    this.disconnectedAt[side] = null
    if (this.forfeitTimers[side]) {
      clearTimeout(this.forfeitTimers[side])
      this.forfeitTimers[side] = null
    }
    socketToRoom.set(newSocketId, this.roomId)
    this.lastActivityAt = Date.now()
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
   * @param {object} actionOrEnvelope legacy action, or { action, actionId, expectedRevision, matchId }
   * @returns {{ ok: boolean, error?: string, revision: number, duplicate: boolean }}
   */
  handleAction(socketId, actionOrEnvelope) {
    const fail = (error) => ({ ok: false, error, revision: this.revision, duplicate: false })
    if (!this.state) return fail('Game not started.')

    const side = this.getSideForSocket(socketId)
    if (!side) return fail('Not in this room.')
    if (!actionOrEnvelope || typeof actionOrEnvelope !== 'object' || Array.isArray(actionOrEnvelope)) {
      return fail('Invalid action.')
    }

    const hasEnvelope = actionOrEnvelope.action
      && typeof actionOrEnvelope.action === 'object'
      && !Array.isArray(actionOrEnvelope.action)
    const action = hasEnvelope ? actionOrEnvelope.action : actionOrEnvelope
    const matchId = hasEnvelope ? actionOrEnvelope.matchId : action.matchId
    const expectedRevision = hasEnvelope ? actionOrEnvelope.expectedRevision : action.expectedRevision
    const rawActionId = hasEnvelope ? actionOrEnvelope.actionId : action.actionId

    if (matchId !== undefined && matchId !== this.roomId) {
      return fail('Action does not belong to this match.')
    }

    let actionKey = null
    if (rawActionId !== undefined) {
      if (typeof rawActionId !== 'string' || rawActionId.length < 1 || rawActionId.length > 128) {
        return fail('Invalid action id.')
      }
      actionKey = `${side}:${rawActionId}`
      const processed = this.processedActions.get(actionKey)
      if (processed) {
        return { ok: true, revision: processed.revision, duplicate: true }
      }
    }

    if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
      return fail('Invalid expected revision.')
    }
    if (expectedRevision !== undefined && expectedRevision !== this.revision) {
      return fail('Stale action revision.')
    }
    if (this.state.winner) return fail('Game is over.')

    const type = String(action.type ?? '')
    if (type !== 'surrender' && this.state.turn !== side) return fail('Not your turn.')

    let newState = this.state

    switch (type) {
      case 'playCard': {
        const actor = this.state[side]
        const cardInstanceId = action.cardInstanceId
        let handIndex = Number(action.handIndex)
        if (cardInstanceId !== undefined) {
          if (typeof cardInstanceId !== 'string' || cardInstanceId.length < 1 || cardInstanceId.length > 160) {
            return fail('Invalid card instance id.')
          }
          const stableIndex = actor.hand.findIndex((candidate) => candidate.instanceId === cardInstanceId)
          if (stableIndex < 0) return fail('Card is no longer in hand.')
          if (action.handIndex !== undefined && handIndex !== stableIndex) {
            return fail('Card is no longer at the expected hand index.')
          }
          handIndex = stableIndex
        }
        if (!Number.isInteger(handIndex) || handIndex < 0) {
          return fail('Invalid hand index.')
        }
        const card = actor.hand[handIndex]
        if (!card) return fail('No card at that index.')
        if (card.cost > actor.mana) return fail('Not enough mana.')
        if (actor.board.every((slot) => slot !== null)) {
          return fail('Board is full.')
        }
        const laneIndex = action.laneIndex === undefined ? undefined : Number(action.laneIndex)
        if (laneIndex !== undefined && (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex >= BOARD_SIZE)) {
          return fail('Invalid lane index.')
        }
        if (laneIndex !== undefined && actor.board[laneIndex] !== null) {
          return fail('Lane is occupied.')
        }
        newState = playCard(this.state, side, handIndex, laneIndex)
        break
      }
      case 'attack': {
        const attackerIndex = Number(action.attackerIndex)
        if (!Number.isInteger(attackerIndex) || attackerIndex < 0 || attackerIndex >= BOARD_SIZE) {
          return fail('Invalid attacker index.')
        }
        const attacker = this.state[side].board[attackerIndex]
        if (!attacker) return fail('No unit at that index.')
        if (attacker.exhausted) return fail('Unit is exhausted.')

        const target = action.target
        if (target !== 'hero' && (!Number.isInteger(target) || target < 0 || target >= BOARD_SIZE)) {
          return fail('Invalid target.')
        }
        newState = attack(this.state, side, attackerIndex, target)
        break
      }
      case 'burst': {
        const actor = this.state[side]
        if (actor.momentum < 3) return fail('Not enough momentum.')
        newState = castMomentumBurst(this.state, side)
        break
      }
      case 'endTurn': {
        if (this.mode === 'ai' && side === 'player') {
          // generateEnemyTurnSteps owns begin-turn effects and the transition
          // back to the player. Keep the pre-transition base so the AI cannot
          // draw or gain mana twice when advanceAiTurn runs.
          this.pendingAiTurnBase = this.state
          newState = { ...this.state, turn: otherSide(this.state.turn) }
        } else {
          newState = passTurn(this.state)
        }
        break
      }
      case 'surrender': {
        newState = surrenderGame(this.state, side)
        break
      }
      default:
        return fail('Unknown action type.')
    }

    if (newState === this.state) {
      return fail('Action had no effect.')
    }

    this.state = newState
    this.revision += 1
    this.lastActivityAt = Date.now()
    if (actionKey) {
      this.processedActions.set(actionKey, { revision: this.revision })
      if (this.processedActions.size > MAX_PROCESSED_ACTIONS) {
        const oldestKey = this.processedActions.keys().next().value
        if (oldestKey !== undefined) this.processedActions.delete(oldestKey)
      }
    }
    return { ok: true, revision: this.revision, duplicate: false }
  }

  /**
   * Advance one complete server-authoritative AI turn.
   * @returns {{ ok: boolean, error?: string, revision: number, state?: object }}
   */
  advanceAiTurn() {
    const fail = (error) => ({ ok: false, error, revision: this.revision })
    if (this.mode !== 'ai') return fail('Room is not an AI match.')
    if (!this.state) return fail('Game not started.')
    if (this.state.winner) return fail('Game is over.')
    if (this.state.turn !== 'enemy') return fail('AI turn is not active.')

    const base = this.pendingAiTurnBase ?? { ...this.state, turn: 'player' }
    const steps = generateEnemyTurnSteps(base)
    const finalState = steps.at(-1)?.state
    if (!finalState || finalState === base) return fail('AI turn had no effect.')

    this.state = finalState
    this.pendingAiTurnBase = null
    this.revision += 1
    this.lastActivityAt = Date.now()
    return { ok: true, revision: this.revision, state: this.state }
  }

  /**
   * Install an authoritative forfeit result. Safe to call more than once.
   * @param {'player' | 'enemy'} losingSide
   * @returns {{ ok: boolean, error?: string, revision: number, duplicate: boolean, winner?: string }}
   */
  finalizeForfeit(losingSide) {
    const fail = (error) => ({ ok: false, error, revision: this.revision, duplicate: false })
    if (!this.state) return fail('Game not started.')
    if (losingSide !== 'player' && losingSide !== 'enemy') return fail('Invalid forfeiting side.')
    if (this.state.winner) {
      return { ok: true, revision: this.revision, duplicate: true, winner: this.state.winner }
    }

    const nextState = surrenderGame(this.state, losingSide)
    if (nextState === this.state || !nextState.winner) return fail('Could not finalize forfeit.')

    this.state = nextState
    this.pendingAiTurnBase = null
    this.revision += 1
    this.lastActivityAt = Date.now()
    this.cleanup()
    return { ok: true, revision: this.revision, duplicate: false, winner: this.state.winner }
  }

  /** Install a no-contest draw before a controlled shutdown or idle timeout. */
  finalizeAbort(message = 'The match ended as a no-contest during server maintenance.') {
    const fail = (error) => ({ ok: false, error, revision: this.revision, duplicate: false })
    if (!this.state) return fail('Game not started.')
    if (this.state.winner) {
      return { ok: true, revision: this.revision, duplicate: true, winner: this.state.winner }
    }
    this.state = {
      ...this.state,
      winner: 'draw',
      log: [...this.state.log, message],
    }
    this.revision += 1
    this.lastActivityAt = Date.now()
    this.cleanup()
    return { ok: true, revision: this.revision, duplicate: false, winner: 'draw' }
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
      matchId: this.roomId,
      revision: this.revision,
      yourSide: side,
      serverMode: this.mode,
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
      matchId: this.roomId,
      revision: this.revision,
      yourSide: side,
      serverMode: this.mode,
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

  isExpired(now = Date.now()) {
    if (!this.state) return now - this.createdAt > TERMINAL_ROOM_RETENTION_MS
    if (!this.state.winner) return false
    return now - this.lastActivityAt > TERMINAL_ROOM_RETENTION_MS
  }

  cleanup() {
    if (this.forfeitTimers.player) clearTimeout(this.forfeitTimers.player)
    if (this.forfeitTimers.enemy) clearTimeout(this.forfeitTimers.enemy)
    this.forfeitTimers.player = null
    this.forfeitTimers.enemy = null
    this.processedActions.clear()
    this.pendingAiTurnBase = null
  }
}

/**
 * @param {string} roomId
 * @param {'duel'|'unranked'|'ai'} [mode]
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
    deleteMappingIfOwned(socketToRoom, room.sockets.player, roomId)
    deleteMappingIfOwned(socketToRoom, room.sockets.enemy, roomId)
    deleteMappingIfOwned(accountToRoom, room.accounts.player, roomId)
    deleteMappingIfOwned(accountToRoom, room.accounts.enemy, roomId)
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
