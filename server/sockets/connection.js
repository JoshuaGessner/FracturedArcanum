/**
 * The Socket.IO connection handler: everything a connected player can do over
 * the socket, plus the per-connection rate limiter.
 *
 * A factory rather than loose functions. This owns `socketRateLimits` and the
 * interval that prunes it, and mutable state stranded by a refactor is exactly
 * how the database split came to open an empty file. Inside the closure it has
 * one owner.
 *
 * Extractable only because realtime.js already took presence, challenges and
 * the matchmaking queue: this block reached for 20 module identifiers before
 * that landed, and two afterwards. Everything else arrives through `ctx`.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { Server } from 'socket.io'
import { acknowledgeMatchSettlement, getLatestUnacknowledgedSettlement, getMatchSettlementForAccount, getProfile, getSocialOverview, isFriendOf, sanitizeCardBorder, validateDeckForMatch } from '../db.js'
import { RECONNECT_GRACE_MS, createRoom, destroyRoom, getRoom, getRoomByAccount, getRoomBySocket, handleDisconnect } from '../game-room.js'
import { adminStore, debouncedSaveAdminStore, pushActivity } from '../admin-store.js'

/**
 * The one place a player's battle-facing name is decided.
 *
 * Four handlers used to spell this out inline, and because each wrote its own
 * tail the same broken lookup failed four different ways: three happened to
 * land on the socket's own session name, while the challenge target — the only
 * lookup for an account that is *not* this socket, and so the only one with no
 * session to fall back on — bottomed out at the literal string "Friend" and
 * shipped that into the duel, the match log, and both players' HUDs.
 *
 * `socketData` is therefore optional by design: pass it only when the account
 * being named owns this socket. The profile lookup is authoritative either way.
 */
function resolvePlayerName(profile, socketData = null) {
  return (
    profile?.display_name
    || socketData?.displayName
    || socketData?.username
    || 'Rune Captain'
  )
}

export function registerConnectionHandler(ctx) {
  const {
    io,
    serverConfig,
    trackPresence,
    untrackPresence,
    isOnline,
    emitToAccount,
    findChallengeForAccount,
    pendingChallenges,
    CHALLENGE_TTL_MS,
    emitLiveArenaState,
    removeWaitingPlayer,
    enqueueWaitingPlayer,
    getRuntimeRankLabel,
    broadcastRoomState,
    finalizeRoom,
    sweepWaitingPlayers,
    adminStore,
    pushActivity,
    debouncedSaveAdminStore,
  } = ctx

// ─── Socket.IO rate limiting per connection ─────────────────────────────────

const socketRateLimits = new Map()

function checkSocketRate(socketId, event, maxPerMinute = 30) {
  const key = `${socketId}:${event}`
  const now = Date.now()
  let entry = socketRateLimits.get(key)
  if (!entry || now - entry.start > 60000) {
    entry = { start: now, count: 0 }
    socketRateLimits.set(key, entry)
  }
  entry.count++
  return entry.count <= maxPerMinute
}

// Clean up old socket rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of socketRateLimits) {
    if (now - entry.start > 120000) socketRateLimits.delete(key)
  }
}, 5 * 60 * 1000)

io.on('connection', (socket) => {
  socket.emit('server:hello', {
    message: adminStore.settings.maintenanceMode
      ? 'Arena maintenance is active. You can still test local matches.'
      : 'Live arena service connected.',
    seasonName: serverConfig.seasonName ?? 'Season of Whispers',
    seasonEnd: serverConfig.seasonEnd ?? null,
  })
  emitLiveArenaState(socket)

  // ─── Presence tracking: announce this account's online friends ────────
  trackPresence(socket.data.accountId, socket.id)
  try {
    const social = getSocialOverview(socket.data.accountId)
    const online = (social.friends ?? [])
      .filter((friend) => isOnline(friend.accountId))
      .map((friend) => friend.accountId)
    socket.emit('presence:snapshot', { onlineFriendIds: online })

    // Notify any friend already online that we came online.
    for (const friend of social.friends ?? []) {
      if (isOnline(friend.accountId)) {
        emitToAccount(friend.accountId, 'presence:update', {
          accountId: socket.data.accountId,
          online: true,
        })
      }
    }
  } catch {
    /* non-fatal */
  }

  const emitPersistedSettlement = (settlement) => {
    if (!settlement?.outcome) return false
    socket.emit('game:over', {
      matchId: settlement.matchId,
      roomId: settlement.matchId,
      result: settlement.outcome.result,
      reason: settlement.reason,
      serverMode: settlement.mode,
      settlement: settlement.outcome,
    })
    return true
  }

  // ─── Auto-rejoin: return a definitive active, terminal, or none state ────
  const existingRoom = getRoomByAccount(socket.data.accountId)
  if (existingRoom && existingRoom.state && !existingRoom.state.winner) {
    const accountSide = existingRoom.getSideForAccount(socket.data.accountId)
    const controllerSocketId = accountSide ? existingRoom.sockets[accountSide] : null
    const controllerConnected = controllerSocketId && io.sockets.sockets.get(controllerSocketId)?.connected
    if (controllerConnected && controllerSocketId !== socket.id) {
      socket.emit('game:controller_active', {
        matchId: existingRoom.roomId,
        error: 'This match is active in another tab or device.',
      })
    } else {
      const side = existingRoom.reconnect(socket.data.accountId, socket.id)
      if (side) {
        socket.join(existingRoom.roomId)
        const view = existingRoom.getViewForSocket(socket.id)
        const opponentSide = side === 'player' ? 'enemy' : 'player'
        const opponentDisconnected = existingRoom.mode === 'ai' ? false : existingRoom.isDisconnected(opponentSide)
        socket.emit('game:rejoin', {
          ...view,
          roomId: existingRoom.roomId,
          opponentDisconnected,
        })
        const opponentSocketId = existingRoom.sockets[opponentSide]
        if (opponentSocketId) io.sockets.sockets.get(opponentSocketId)?.emit('game:opponent_reconnected')
      }
    }
  } else if (existingRoom?.state?.winner) {
    const settlement = existingRoom.terminalSettlement
      ?? getMatchSettlementForAccount(existingRoom.roomId, socket.data.accountId)
    emitPersistedSettlement(settlement)
  } else {
    emitPersistedSettlement(getLatestUnacknowledgedSettlement(socket.data.accountId))
  }

  // ─── Manual rejoin request ───────────────────────────────────────────
  socket.on('game:rejoin', () => {
    if (!checkSocketRate(socket.id, 'game:rejoin', 20)) return

    const room = getRoomByAccount(socket.data.accountId)
    if (!room || !room.state) {
      const terminal = getLatestUnacknowledgedSettlement(socket.data.accountId)
      if (!emitPersistedSettlement(terminal)) {
        socket.emit('game:rejoin_failed', { error: 'No active game to rejoin.' })
      }
      return
    }
    if (room.state.winner) {
      emitPersistedSettlement(room.terminalSettlement ?? getMatchSettlementForAccount(room.roomId, socket.data.accountId))
      return
    }

    const accountSide = room.getSideForAccount(socket.data.accountId)
    const controllerSocketId = accountSide ? room.sockets[accountSide] : null
    if (controllerSocketId && controllerSocketId !== socket.id && io.sockets.sockets.get(controllerSocketId)?.connected) {
      socket.emit('game:rejoin_failed', { error: 'This match is active in another tab or device.' })
      return
    }

    if (!accountSide) {
      socket.emit('game:rejoin_failed', { error: 'No active game to rejoin.' })
      return
    }

    const currentSide = room.getSideForSocket(socket.id)
    if (currentSide && !room.isDisconnected(currentSide)) {
      socket.join(room.roomId)
      const view = room.getViewForSocket(socket.id)
      const opponentSide = currentSide === 'player' ? 'enemy' : 'player'
      const opponentDisconnected = room.mode === 'ai' ? false : room.isDisconnected(opponentSide)
      socket.emit('game:rejoin', {
        ...view,
        roomId: room.roomId,
        opponentDisconnected,
      })
      return
    }

    const side = room.reconnect(socket.data.accountId, socket.id)
    if (!side) {
      socket.emit('game:rejoin_failed', { error: 'Could not rejoin game.' })
      return
    }

    socket.join(room.roomId)
    const view = room.getViewForSocket(socket.id)
    const opponentSide = side === 'player' ? 'enemy' : 'player'
    const opponentDisconnected = room.mode === 'ai' ? false : room.isDisconnected(opponentSide)
    socket.emit('game:rejoin', {
      ...view,
      roomId: room.roomId,
      opponentDisconnected,
    })

    const opponentSocketId = room.sockets[opponentSide]
    if (opponentSocketId && opponentSocketId !== socket.id) {
      const opponentSocket = io.sockets.sockets.get(opponentSocketId)
      opponentSocket?.emit('game:opponent_reconnected')
    }
  })

  socket.on('game:settlement_ack', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'game:settlement_ack', 30)) return
    acknowledgeMatchSettlement(payload?.matchId, socket.data.accountId)
  })

  socket.on('game:ai_start', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'game:ai_start', 10)) return
    const accountId = socket.data.accountId
    const activeRoom = getRoomByAccount(accountId)
    if (activeRoom?.state && !activeRoom.state.winner) {
      socket.emit('game:error', { error: 'Finish or abandon the active live match first.' })
      return
    }
    if (activeRoom?.state?.winner) destroyRoom(activeRoom.roomId)

    const candidateDeck = payload?.deckConfig && typeof payload.deckConfig === 'object'
      ? payload.deckConfig
      : undefined
    const validatedDeck = validateDeckForMatch(accountId, candidateDeck)
    if (!validatedDeck.ok) {
      socket.emit('game:error', { error: validatedDeck.error ?? 'No valid deck is available.' })
      return
    }
    const profile = getProfile(accountId)
    if (!profile) {
      socket.emit('game:error', { error: 'Profile not found.' })
      return
    }

    const difficulty = ['novice', 'adept', 'veteran', 'legend'].includes(String(payload?.difficulty))
      ? String(payload.difficulty)
      : 'adept'
    const enemyName = String(payload?.enemyName ?? 'Arena Bot').slice(0, 40)
    const roomId = `room-${randomUUID().slice(0, 8)}`
    let room = null
    try {
      room = createRoom(roomId, 'ai')
      socket.join(roomId)
      removeWaitingPlayer(socket.id, accountId)
      room.startAi({
        socketId: socket.id,
        accountId,
        name: resolvePlayerName(profile, socket.data),
        deckConfig: validatedDeck.deckConfig,
        cardBorder: sanitizeCardBorder(profile.selected_card_border),
      }, { enemyName, difficulty })
      socket.emit('game:start', room.getViewForSocket(socket.id))
      emitLiveArenaState()
    } catch (error) {
      if (room) destroyRoom(roomId)
      socket.leave(roomId)
      socket.emit('game:error', { error: 'Could not start the AI skirmish.' })
      console.warn('game:ai_start failed', error?.message ?? error)
    }
  })

  socket.on('queue:join', () => {
    if (!checkSocketRate(socket.id, 'queue:join', 10)) return

    const activeRoom = getRoomByAccount(socket.data.accountId)
    if (activeRoom && activeRoom.state && !activeRoom.state.winner) {
      socket.emit('queue:error', { error: 'You already have an active live match.' })
      return
    }
    if (activeRoom?.state?.winner) destroyRoom(activeRoom.roomId)

    const accountProfile = getProfile(socket.data.accountId)
    const validatedDeck = validateDeckForMatch(socket.data.accountId)
    if (!accountProfile || !validatedDeck.ok) {
      socket.emit('queue:error', { error: validatedDeck.error ?? 'No valid deck available. Build a deck first.' })
      return
    }
    const name = resolvePlayerName(accountProfile, socket.data)
    const rating = Number(accountProfile.season_rating ?? 1200)
    const rank = `${getRuntimeRankLabel(rating)} Division`

    const profile = {
      name,
      rank,
      style: 'Custom Deck',
      ping: Math.floor(Math.random() * 40) + 12,
      isBot: false,
    }

    removeWaitingPlayer(socket.id, socket.data.accountId)
    enqueueWaitingPlayer({
      id: socket.id,
      accountId: socket.data.accountId,
      rating,
      queuedAt: Date.now(),
      profile,
      deckConfig: validatedDeck.deckConfig,
      cardBorder: sanitizeCardBorder(accountProfile.selected_card_border),
    })

    adminStore.totals.queueJoins += 1
    pushActivity('queue_join', { accountId: socket.data.accountId, rank, rating })
    debouncedSaveAdminStore()

    emitLiveArenaState()
    sweepWaitingPlayers()
  })

  socket.on('queue:leave', () => {
    removeWaitingPlayer(socket.id, socket.data.accountId)
    emitLiveArenaState()
  })

  // ─── Friend challenges (unranked duels) ─────────────────────────────────

  socket.on('challenge:send', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'challenge:send', 10)) return
    const fromAccountId = socket.data.accountId
    if (!fromAccountId) {
      socket.emit('challenge:error', { error: 'Sign in to challenge friends.' })
      return
    }
    const toAccountId = String(payload?.targetAccountId ?? '')
    if (!toAccountId || toAccountId === fromAccountId) {
      socket.emit('challenge:error', { error: 'Invalid challenge target.' })
      return
    }

    // Friends-only for v1.
    if (!isFriendOf(fromAccountId, toAccountId)) {
      socket.emit('challenge:error', { error: 'You can only challenge accounts on your friends list.' })
      return
    }

    // Must be online.
    if (!isOnline(toAccountId)) {
      socket.emit('challenge:error', { error: 'That friend is offline.' })
      return
    }

    // Only one outgoing challenge at a time per account.
    if (findChallengeForAccount(fromAccountId, 'from')) {
      socket.emit('challenge:error', { error: 'You already have a pending challenge.' })
      return
    }

    // Validate the challenger's deck (server-side safety net).
    const deckCheck = validateDeckForMatch(fromAccountId)
    if (!deckCheck.ok) {
      socket.emit('challenge:error', { error: deckCheck.error ?? 'Invalid deck.' })
      return
    }

    const fromProfile = getProfile(fromAccountId)
    const toProfile = getProfile(toAccountId)
    if (!fromProfile || !toProfile) {
      socket.emit('challenge:error', { error: 'Account profile not found.' })
      return
    }

    const challenge = {
      id: `chal-${randomBytes(8).toString('hex')}`,
      fromAccountId,
      toAccountId,
      fromName: resolvePlayerName(fromProfile, socket.data),
      // No `socket.data` here on purpose: this socket belongs to the challenger,
      // so the target's session name is not ours to borrow.
      toName: resolvePlayerName(toProfile),
      fromDeck: deckCheck.deckConfig,
      createdAt: Date.now(),
      status: 'pending',
    }
    pendingChallenges.set(challenge.id, challenge)

    socket.emit('challenge:sent', {
      challengeId: challenge.id,
      toAccountId,
      toName: challenge.toName,
      expiresAt: challenge.createdAt + CHALLENGE_TTL_MS,
    })
    emitToAccount(toAccountId, 'challenge:incoming', {
      challengeId: challenge.id,
      fromAccountId,
      fromName: challenge.fromName,
      expiresAt: challenge.createdAt + CHALLENGE_TTL_MS,
    })
  })

  socket.on('challenge:accept', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'challenge:accept', 10)) return
    const accountId = socket.data.accountId
    const challengeId = String(payload?.challengeId ?? '')
    const challenge = pendingChallenges.get(challengeId)
    if (!challenge || challenge.status !== 'pending' || challenge.toAccountId !== accountId) {
      socket.emit('challenge:error', { error: 'Challenge not found or already closed.' })
      return
    }
    if (Date.now() - challenge.createdAt > CHALLENGE_TTL_MS) {
      challenge.status = 'expired'
      emitToAccount(challenge.fromAccountId, 'challenge:expired', { challengeId: challenge.id })
      socket.emit('challenge:expired', { challengeId: challenge.id })
      return
    }
    const deckCheck = validateDeckForMatch(accountId)
    if (!deckCheck.ok) {
      socket.emit('challenge:error', { error: deckCheck.error ?? 'Invalid deck.' })
      return
    }

    // Make sure the challenger is still connected with at least one socket.
    const challengerSocketIds = presence.get(challenge.fromAccountId)
    if (!challengerSocketIds || challengerSocketIds.size === 0) {
      challenge.status = 'cancelled'
      socket.emit('challenge:error', { error: 'Challenger disconnected.' })
      return
    }
    // Pick the first still-connected socket as the "room owner" for the
    // challenger's side. If there are multiple tabs, all of them will be
    // notified via emitToAccount below so every tab's UI stays in sync.
    let challengerSocket = null
    for (const socketId of challengerSocketIds) {
      const candidate = io.sockets.sockets.get(socketId)
      if (candidate?.connected) {
        challengerSocket = candidate
        break
      }
    }
    if (!challengerSocket) {
      challenge.status = 'cancelled'
      socket.emit('challenge:error', { error: 'Challenger disconnected.' })
      return
    }

    // Make sure neither player is currently in a ranked game.
    const challengerActive = getRoomByAccount(challenge.fromAccountId)
    const accepterActive = getRoomByAccount(accountId)
    if ((challengerActive && !challengerActive.state?.winner) || (accepterActive && !accepterActive.state?.winner)) {
      socket.emit('challenge:error', { error: 'One of the players is in a live match.' })
      return
    }
    if (challengerActive?.state?.winner) destroyRoom(challengerActive.roomId)
    if (accepterActive?.state?.winner && accepterActive.roomId !== challengerActive?.roomId) {
      destroyRoom(accepterActive.roomId)
    }

    challenge.status = 'accepted'
    removeWaitingPlayer(challengerSocket.id, challenge.fromAccountId)
    removeWaitingPlayer(socket.id, accountId)

    // Start an unranked duel room. Both players must be hydrated into the
    // room and emitted their starting views.
    const roomId = `room-${randomUUID().slice(0, 8)}`
    let room = null
    try {
      room = createRoom(roomId, 'unranked')
      challengerSocket.join(roomId)
      socket.join(roomId)
      // Frames are read at accept time, not at challenge time, so a player who
      // equips something new while the invite sits open goes in wearing it.
      const challengerProfile = getProfile(challenge.fromAccountId)
      const accepterProfile = getProfile(accountId)
      // A friend duel is unranked, but both players still hold a division, and
      // showing it is exactly what the ranked match card does. The literal
      // 'Friend' that used to sit here put a second, unrelated "Friend" on
      // screen right beside a name that was already reading "Friend" for its
      // own reasons — two separate bugs that looked like one.
      const divisionFor = (profile) =>
        `${getRuntimeRankLabel(Number(profile?.season_rating ?? 1200))} Division`
      room.start(
        {
          socketId: challengerSocket.id,
          accountId: challenge.fromAccountId,
          name: challenge.fromName,
          deckConfig: challenge.fromDeck,
          cardBorder: sanitizeCardBorder(challengerProfile?.selected_card_border),
        },
        {
          socketId: socket.id,
          accountId: accountId,
          name: challenge.toName,
          deckConfig: deckCheck.deckConfig,
          cardBorder: sanitizeCardBorder(accepterProfile?.selected_card_border),
        },
      )
      const challengerView = room.getViewForSocket(challengerSocket.id)
      const accepterView = room.getViewForSocket(socket.id)
      challengerSocket.emit('challenge:matched', {
        roomId,
        opponent: { name: challenge.toName, accountId: accountId, isBot: false, rank: divisionFor(accepterProfile), style: 'Friend Duel', ping: 0 },
        mode: 'unranked',
      })
      socket.emit('challenge:matched', {
        roomId,
        opponent: { name: challenge.fromName, accountId: challenge.fromAccountId, isBot: false, rank: divisionFor(challengerProfile), style: 'Friend Duel', ping: 0 },
        mode: 'unranked',
      })
      challengerSocket.emit('game:start', challengerView)
      socket.emit('game:start', accepterView)
    } catch (err) {
      if (room) destroyRoom(roomId)
      challengerSocket.leave(roomId)
      socket.leave(roomId)
      challenge.status = 'cancelled'
      socket.emit('challenge:error', { error: 'Could not create the duel room.' })
      emitToAccount(challenge.fromAccountId, 'challenge:error', { error: 'Could not create the duel room.' })
      console.warn('challenge:accept room start failed', err?.message ?? err)
    }
  })

  socket.on('challenge:decline', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'challenge:decline', 20)) return
    const challenge = pendingChallenges.get(String(payload?.challengeId ?? ''))
    if (!challenge || challenge.status !== 'pending') return
    if (challenge.toAccountId !== socket.data.accountId) return
    challenge.status = 'declined'
    emitToAccount(challenge.fromAccountId, 'challenge:declined', { challengeId: challenge.id })
    socket.emit('challenge:declined', { challengeId: challenge.id })
  })

  socket.on('challenge:cancel', (payload = {}) => {
    if (!checkSocketRate(socket.id, 'challenge:cancel', 20)) return
    const challenge = pendingChallenges.get(String(payload?.challengeId ?? ''))
    if (!challenge || challenge.status !== 'pending') return
    if (challenge.fromAccountId !== socket.data.accountId) return
    challenge.status = 'cancelled'
    emitToAccount(challenge.toAccountId, 'challenge:cancelled', { challengeId: challenge.id, reason: 'cancelled_by_sender' })
    socket.emit('challenge:cancelled', { challengeId: challenge.id, reason: 'cancelled_by_sender' })
  })

  // ─── Server-authoritative game actions ────────────────────────────────

  socket.on('game:action', (payload = {}, acknowledge = () => {}) => {
    if (!checkSocketRate(socket.id, 'game:action', 120)) {
      acknowledge({ ok: false, error: 'Too many game actions. Wait for the latest state.' })
      return
    }

    const room = getRoomBySocket(socket.id)
    if (!room) {
      socket.emit('game:error', { error: 'Not in a game room.' })
      acknowledge({ ok: false, error: 'Not in a game room.' })
      return
    }

    const action = payload?.action
    if (!action || typeof action !== 'object') {
      socket.emit('game:error', { error: 'Invalid action payload.' })
      acknowledge({ ok: false, error: 'Invalid action payload.' })
      return
    }

    const result = room.handleAction(socket.id, payload)
    if (!result.ok) {
      const view = room.getViewForSocket(socket.id)
      socket.emit('game:error', {
        error: result.error,
        matchId: room.roomId,
        revision: room.revision,
        state: view?.state,
      })
      acknowledge({ ok: false, error: result.error, revision: room.revision })
      return
    }
    acknowledge({ ok: true, duplicate: result.duplicate, revision: result.revision })
    if (result.duplicate) {
      const view = room.getViewForSocket(socket.id)
      if (view) socket.emit('game:state', view)
      return
    }

    broadcastRoomState(room)
    if (room.state?.winner) {
      finalizeRoom(room, action.type === 'surrender' ? 'surrender' : 'completed')
      return
    }

    if (room.mode === 'ai' && action.type === 'endTurn') {
      setTimeout(() => {
        const currentRoom = getRoom(room.roomId)
        if (currentRoom !== room || room.state?.winner) return
        const advanced = room.advanceAiTurn()
        if (!advanced.ok) {
          socket.emit('game:error', { matchId: room.roomId, revision: room.revision, error: advanced.error })
          return
        }
        broadcastRoomState(room)
        if (room.state?.winner) finalizeRoom(room, 'completed')
      }, 450).unref?.()
    }
  })

  socket.on('disconnect', () => {
    removeWaitingPlayer(socket.id, socket.data.accountId)
    socketRateLimits.delete(socket.id)

    // Presence: drop this socket; if it was the last one for the account,
    // notify online friends so their UI can grey out the challenge button.
    const accountId = socket.data.accountId
    if (accountId) {
      untrackPresence(accountId, socket.id)
      if (!isOnline(accountId)) {
        try {
          const social = getSocialOverview(accountId)
          for (const friend of social.friends ?? []) {
            if (isOnline(friend.accountId)) {
              emitToAccount(friend.accountId, 'presence:update', {
                accountId,
                online: false,
              })
            }
          }
        } catch { /* non-fatal */ }
      }
      if (!isOnline(accountId)) {
        // A challenge belongs to the account, not one browser tab.
        for (const challenge of pendingChallenges.values()) {
          if (challenge.status !== 'pending') continue
          if (challenge.fromAccountId === accountId || challenge.toAccountId === accountId) {
            challenge.status = 'cancelled'
            const other = challenge.fromAccountId === accountId ? challenge.toAccountId : challenge.fromAccountId
            emitToAccount(other, 'challenge:cancelled', { challengeId: challenge.id, reason: 'disconnected' })
          }
        }
      }
    }

    emitLiveArenaState()

    // Handle in-progress game disconnection with reconnect grace period
    const room = handleDisconnect(socket.id)
    if (room && room.state && !room.state.winner) {
      const disconnectedSide = room.getSideForAccount(socket.data.accountId)
      if (!disconnectedSide) return
      const remainingSide = disconnectedSide === 'player' ? 'enemy' : 'player'

      // Notify remaining player that opponent disconnected
      const remainingSocketId = room.sockets[remainingSide]
      if (remainingSocketId) {
        const remainingSocket = io.sockets.sockets.get(remainingSocketId)
        remainingSocket?.emit('game:opponent_disconnected', {
          gracePeriodMs: RECONNECT_GRACE_MS,
        })
      }

      // Start forfeit timer — if disconnected player doesn't reconnect in time, they lose
      room.forfeitTimers[disconnectedSide] = setTimeout(() => {
        // Double-check: still disconnected and game not over
        if (!room.isDisconnected(disconnectedSide) || room.state?.winner) return

        const finalized = room.finalizeForfeit(disconnectedSide)
        if (!finalized.ok) return
        broadcastRoomState(room)
        finalizeRoom(room, 'disconnect_forfeit')
      }, RECONNECT_GRACE_MS)
    }
  })
})
}
