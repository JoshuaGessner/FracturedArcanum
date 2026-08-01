/**
 * Live server state: presence, friend challenges, the matchmaking queue, and
 * the periodic reapers.
 *
 * A factory rather than a module of loose functions. This owns three pieces of
 * mutable state — the waiting-player queue, the presence map, and pending
 * challenges — and mutable state that a refactor leaves stranded is exactly how
 * the database split came to open an empty file and how ADMIN_KEY nearly froze
 * at its pre-setup value. Inside a closure it has one owner, and callers hold
 * behaviour instead of a snapshot.
 *
 * Needs only the Socket.IO server and the idle timeout; everything else it owns.
 */
import { randomUUID } from 'node:crypto'
import { expireLegacyMigrationAccounts, getLeaderboard, reapAbandonedSignups, settleAuthoritativeMatch } from './db.js'
import { createRoom, destroyRoom, getRoomByAccount, rooms } from './game-room.js'
import { trackAnalyticsEvent } from './admin-store.js'

export function createRealtime({ io, matchIdleTimeoutMs }) {
  const MATCH_IDLE_TIMEOUT_MS = matchIdleTimeoutMs

  let waitingPlayers = []

  // ─── Presence tracking ──────────────────────────────────────────────────────
  // accountId → Set<socketId>. Used for friend online indicators and to deliver
  // direct challenge events. A single account may have multiple concurrent
  // sockets (e.g. tabs, mobile + web); they share presence.

  /** @type {Map<string, Set<string>>} */
  const presence = new Map()

  function trackPresence(accountId, socketId) {
    if (!accountId) return
    let set = presence.get(accountId)
    if (!set) {
      set = new Set()
      presence.set(accountId, set)
    }
    set.add(socketId)
  }

  function untrackPresence(accountId, socketId) {
    if (!accountId) return
    const set = presence.get(accountId)
    if (!set) return
    set.delete(socketId)
    if (set.size === 0) presence.delete(accountId)
  }

  function isOnline(accountId) {
    return presence.has(accountId)
  }

  function emitToAccount(accountId, event, payload) {
    const sockets = presence.get(accountId)
    if (!sockets) return 0
    let sent = 0
    for (const socketId of sockets) {
      const s = io.sockets.sockets.get(socketId)
      if (s) {
        s.emit(event, payload)
        sent += 1
      }
    }
    return sent
  }

  /**
   * Force every live socket for an account to disconnect. Revoking sessions in
   * the DB only stops the next HTTP request — an already-open socket keeps
   * working — so suspension and credential resets must also cut the socket.
   */
  function disconnectAccountSockets(accountId, reason) {
    const sockets = presence.get(accountId)
    if (!sockets) return 0
    let closed = 0
    for (const socketId of [...sockets]) {
      const socket = io.sockets.sockets.get(socketId)
      if (!socket) continue
      socket.emit('server:session_revoked', { reason })
      socket.disconnect(true)
      closed += 1
    }
    return closed
  }

  // ─── Friend challenges (unranked duels) ─────────────────────────────────────
  // In-memory state machine: pending → accepted → active → completed/declined/
  // expired. Challenges live for 60s; an interval reaper cleans stale ones.

  const CHALLENGE_TTL_MS = 60 * 1000

  /**
   * @typedef {Object} Challenge
   * @property {string} id
   * @property {string} fromAccountId
   * @property {string} toAccountId
   * @property {string} fromName
   * @property {string} toName
   * @property {Record<string, number>} fromDeck
   * @property {number} createdAt
   * @property {'pending'|'accepted'|'declined'|'expired'|'cancelled'} status
   */

  /** @type {Map<string, Challenge>} */
  const pendingChallenges = new Map()

  function findChallengeForAccount(accountId, direction) {
    for (const c of pendingChallenges.values()) {
      if (c.status !== 'pending') continue
      if (direction === 'from' && c.fromAccountId === accountId) return c
      if (direction === 'to' && c.toAccountId === accountId) return c
    }
    return null
  }

  function reapChallenges() {
    const now = Date.now()
    for (const [id, c] of pendingChallenges) {
      if (c.status !== 'pending') {
        // Drop terminal entries after 2× TTL so we don't leak memory.
        if (now - c.createdAt > CHALLENGE_TTL_MS * 2) pendingChallenges.delete(id)
        continue
      }
      if (now - c.createdAt > CHALLENGE_TTL_MS) {
        c.status = 'expired'
        emitToAccount(c.fromAccountId, 'challenge:expired', { challengeId: c.id, reason: 'timeout' })
        emitToAccount(c.toAccountId, 'challenge:expired', { challengeId: c.id, reason: 'timeout' })
      }
    }
  }
  setInterval(reapChallenges, 10 * 1000).unref?.()

  // Legacy expiry deletes real player accounts and stays off unless an operator
  // sets LEGACY_MIGRATION_EXPIRY=1; db.js enforces the same flag as a backstop.
  function runLegacyMigrationExpiration() {
    try {
      const result = expireLegacyMigrationAccounts({ metadata: { source: 'server_interval' } })
      if (result.deleted > 0) {
        console.warn(`Legacy migration expiry soft-deleted ${result.deleted} account(s).`)
      }
    } catch (error) {
      console.warn('Legacy migration expiration failed:', error)
    }
  }
  setInterval(runLegacyMigrationExpiration, 60 * 60 * 1000).unref?.()

  // Frees usernames held by passkey signups that never finished their ceremony.
  function runAbandonedSignupReaper() {
    try {
      const result = reapAbandonedSignups({ metadata: { source: 'server_interval' } })
      if (result.released > 0) {
        console.log(`Released ${result.released} abandoned signup username(s).`)
      }
    } catch (error) {
      console.warn('Abandoned signup reaper failed:', error)
    }
  }
  runAbandonedSignupReaper()
  setInterval(runAbandonedSignupReaper, 5 * 60 * 1000).unref?.()

  function getAllowedMatchDelta(queuedAt) {
    const waitSeconds = Math.max(0, Math.floor((Date.now() - queuedAt) / 1000))
    return Math.min(800, 150 + waitSeconds * 35)
  }

  function getLiveArenaSnapshot() {
    return {
      queueSize: waitingPlayers.length,
      connectedPlayers: io.engine.clientsCount,
      rankedAvailable: io.engine.clientsCount >= 2 || waitingPlayers.length >= 2,
      updatedAt: new Date().toISOString(),
    }
  }

  function emitWaitingQueueState() {
    waitingPlayers = waitingPlayers
      .filter((entry) => io.sockets.sockets.get(entry.id)?.connected)
      .sort((left, right) => left.queuedAt - right.queuedAt)

    waitingPlayers.forEach((entry, index) => {
      const socket = io.sockets.sockets.get(entry.id)
      if (!socket) {
        return
      }

      const waitSeconds = Math.max(0, Math.floor((Date.now() - entry.queuedAt) / 1000))
      socket.emit('queue:searching', {
        ok: true,
        position: index + 1,
        queueSize: waitingPlayers.length,
        connectedPlayers: io.engine.clientsCount,
        waitSeconds,
        estimatedWaitSeconds: Math.max(10, index * 12 + 10),
        ratingWindow: getAllowedMatchDelta(entry.queuedAt),
      })
    })
  }

  function emitLiveArenaState(target = io) {
    target.emit('queue:status', getLiveArenaSnapshot())
    target.emit('leaderboard:update', { entries: getLeaderboard() })
    if (target === io) {
      emitWaitingQueueState()
    }
  }

  /**
   * Add a player to the matchmaking queue.
   *
   * Exposed so the socket handler never touches `waitingPlayers` directly — the
   * whole point of the closure is that the queue has one owner. Callers that
   * mutate an array they were handed are how a "single source of truth" quietly
   * stops being one.
   */
  function enqueueWaitingPlayer(entry) {
    waitingPlayers.push(entry)
    return waitingPlayers.length
  }

  function removeWaitingPlayer(socketId, accountId = '') {
    waitingPlayers = waitingPlayers.filter((entry) => entry.id !== socketId && (!accountId || entry.accountId !== accountId))
  }

  function getRuntimeRankLabel(rating) {
    if (rating >= 1500) return 'Diamond'
    if (rating >= 1300) return 'Gold'
    if (rating >= 1150) return 'Silver'
    return 'Bronze'
  }

  function roomParticipants(room) {
    const winner = room.state?.winner
    return ['player', 'enemy']
      .filter((side) => room.accounts[side])
      .map((side) => ({
        accountId: room.accounts[side],
        name: room.names[side],
        opponentAccountId: side === 'player' ? room.accounts.enemy : room.accounts.player,
        opponentName: room.names[side === 'player' ? 'enemy' : 'player'],
        result: winner === 'draw' ? 'draw' : winner === side ? 'win' : 'loss',
      }))
  }

  function emitTerminalSettlement(room, settlement) {
    for (const participant of roomParticipants(room)) {
      const outcome = settlement.outcomes.find((entry) => entry.accountId === participant.accountId)
      const view = room.getViewForAccount(participant.accountId)
      if (!outcome || !view) continue
      emitToAccount(participant.accountId, 'game:over', {
        ...view,
        roomId: room.roomId,
        matchId: room.roomId,
        result: outcome.result,
        reason: settlement.reason,
        settlement: outcome,
      })
    }
  }

  function broadcastRoomState(room) {
    for (const side of ['player', 'enemy']) {
      const socketId = room.sockets[side]
      if (!socketId) continue
      const target = io.sockets.sockets.get(socketId)
      const view = room.getViewForSocket(socketId)
      if (target && view) target.emit('game:state', view)
    }
  }

  function finalizeRoom(room, reason = 'completed') {
    if (!room?.state?.winner) return { ok: false, error: 'Match is not terminal.' }
    if (room.terminalSettlement) return room.terminalSettlement

    const settlement = settleAuthoritativeMatch({
      matchId: room.roomId,
      mode: room.mode,
      reason,
      turns: room.state.turnNumber,
      participants: roomParticipants(room),
      metadata: room.mode === 'ai' ? { aiDifficulty: room.state.aiDifficulty } : {},
    })
    if (!settlement.ok) {
      for (const accountId of Object.values(room.accounts).filter(Boolean)) {
        emitToAccount(accountId, 'game:error', {
          matchId: room.roomId,
          revision: room.revision,
          error: 'The match ended, but settlement is pending. Your result has not been lost.',
        })
      }
      return settlement
    }

    room.terminalSettlement = settlement
    emitTerminalSettlement(room, settlement)
    trackAnalyticsEvent({
      type: 'match_complete',
      route: 'battle',
      meta: { winner: room.state.winner, mode: room.mode, reason, matchId: room.roomId },
    })
    emitLiveArenaState()
    setTimeout(() => destroyRoom(room.roomId), 10_000).unref?.()
    return settlement
  }

  // A connected but abandoned room must not occupy the in-memory room cap
  // forever. Idle matches close as no-contests, so this never deducts currency,
  // rating, or inventory from either participant.
  setInterval(() => {
    const now = Date.now()
    for (const room of rooms.values()) {
      if (!room.state || room.state.winner || now - room.lastActivityAt < MATCH_IDLE_TIMEOUT_MS) continue
      const aborted = room.finalizeAbort('Match closed after 15 minutes without activity.')
      if (aborted.ok) finalizeRoom(room, 'timeout')
    }
  }, 60_000).unref?.()

  function findBestWaitingPlayer(socketId, rating, queuedAt = Date.now()) {
    if (!waitingPlayers.length) {
      return null
    }

    const currentAllowedDelta = getAllowedMatchDelta(queuedAt)
    let bestIndex = -1
    let bestDelta = Number.POSITIVE_INFINITY

    waitingPlayers.forEach((entry, index) => {
      if (entry.id === socketId) {
        return
      }

      const allowedDelta = Math.max(currentAllowedDelta, getAllowedMatchDelta(entry.queuedAt))
      const delta = Math.abs(entry.rating - rating)

      if (delta <= allowedDelta && delta < bestDelta) {
        bestIndex = index
        bestDelta = delta
      }
    })

    if (bestIndex === -1) {
      return null
    }

    const [matched] = waitingPlayers.splice(bestIndex, 1)
    return matched ?? null
  }

  function startRankedMatch(playerEntry, matchedPlayer) {
    const playerSocket = io.sockets.sockets.get(playerEntry.id)
    const otherSocket = io.sockets.sockets.get(matchedPlayer.id)

    if (!playerSocket?.connected || !otherSocket?.connected || playerEntry.accountId === matchedPlayer.accountId) {
      return false
    }

    const existingPlayerRoom = getRoomByAccount(playerEntry.accountId)
    const existingOtherRoom = getRoomByAccount(matchedPlayer.accountId)
    if (existingPlayerRoom?.state && !existingPlayerRoom.state.winner) return false
    if (existingOtherRoom?.state && !existingOtherRoom.state.winner) return false
    if (existingPlayerRoom?.state?.winner) destroyRoom(existingPlayerRoom.roomId)
    if (existingOtherRoom?.state?.winner && existingOtherRoom.roomId !== existingPlayerRoom?.roomId) {
      destroyRoom(existingOtherRoom.roomId)
    }

    const roomId = `room-${randomUUID().slice(0, 8)}`
    let room = null

    try {
      room = createRoom(roomId)

      removeWaitingPlayer(playerEntry.id, playerEntry.accountId)
      removeWaitingPlayer(matchedPlayer.id, matchedPlayer.accountId)

      playerSocket.join(roomId)
      otherSocket.join(roomId)

      // cardBorder was whitelisted when the player joined the queue.
      room.start(
        {
          socketId: playerEntry.id,
          accountId: playerEntry.accountId,
          name: playerEntry.profile.name,
          deckConfig: playerEntry.deckConfig,
          cardBorder: playerEntry.cardBorder,
        },
        {
          socketId: matchedPlayer.id,
          accountId: matchedPlayer.accountId,
          name: matchedPlayer.profile.name,
          deckConfig: matchedPlayer.deckConfig,
          cardBorder: matchedPlayer.cardBorder,
        },
      )

      const playerView = room.getViewForSocket(playerEntry.id)
      const enemyView = room.getViewForSocket(matchedPlayer.id)

      playerSocket.emit('queue:matched', { roomId, opponent: matchedPlayer.profile })
      otherSocket.emit('queue:matched', { roomId, opponent: playerEntry.profile })

      playerSocket.emit('game:start', playerView)
      otherSocket.emit('game:start', enemyView)
      return true
    } catch {
      if (room) destroyRoom(roomId)
      playerSocket.leave(roomId)
      otherSocket.leave(roomId)
      playerSocket.emit('queue:error', { error: 'Could not create the live match. Please queue again.' })
      otherSocket.emit('queue:error', { error: 'Could not create the live match. Please queue again.' })
      return false
    }
  }

  function sweepWaitingPlayers() {
    if (waitingPlayers.length < 2) {
      emitWaitingQueueState()
      return
    }

    const orderedPlayers = [...waitingPlayers].sort((left, right) => left.queuedAt - right.queuedAt)
    let matchedAny = false

    orderedPlayers.forEach((entry) => {
      const stillQueued = waitingPlayers.some((candidate) => candidate.id === entry.id)
      if (!stillQueued) {
        return
      }

      const matchedPlayer = findBestWaitingPlayer(entry.id, entry.rating, entry.queuedAt)
      if (!matchedPlayer || matchedPlayer.id === entry.id) {
        return
      }

      removeWaitingPlayer(entry.id, entry.accountId)

      if (!startRankedMatch(entry, matchedPlayer)) return

      matchedAny = true
    })

    if (matchedAny) {
      emitLiveArenaState()
      return
    }

    emitWaitingQueueState()
  }

  // .unref() so a timer alone never holds the process open. The HTTP server
  // keeps it alive in production; without this the module cannot be imported
  // by a test without hanging it. Matches the three reaper timers above.
  setInterval(() => {
    sweepWaitingPlayers()
  }, 3000).unref?.()


  return {
    trackPresence,
    untrackPresence,
    isOnline,
    emitToAccount,
    disconnectAccountSockets,
    findChallengeForAccount,
    reapChallenges,
    pendingChallenges,
    CHALLENGE_TTL_MS,
    runLegacyMigrationExpiration,
    runAbandonedSignupReaper,
    getAllowedMatchDelta,
    getLiveArenaSnapshot,
    emitWaitingQueueState,
    emitLiveArenaState,
    enqueueWaitingPlayer,
    removeWaitingPlayer,
    getRuntimeRankLabel,
    roomParticipants,
    emitTerminalSettlement,
    broadcastRoomState,
    finalizeRoom,
    findBestWaitingPlayer,
    startRankedMatch,
    sweepWaitingPlayers,
  }
}
