# Game Room Index — `server/game-room.js` (348 lines)

## Constants (Lines 12–14)

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_ROOM_AGE_MS` | 30 minutes | Auto-expire stale rooms |
| `MAX_ROOMS` | 200 | Concurrent room cap |
| `RECONNECT_GRACE_MS` | 60 seconds | Disconnect grace period |

## In-Memory Maps (Lines 17–23)

| Map | Key → Value | Purpose |
|-----|-------------|---------|
| `rooms` | roomId → GameRoom | Active game rooms |
| `socketToRoom` | socketId → roomId | Socket lookup |
| `accountToRoom` | accountId → roomId | Account lookup |

## GameRoom Class (Lines 26–245)

### Constructor (Line 26)
`GameRoom(roomId, mode)` — mode: `'duel'` or `'unranked'`

### Methods

| Method | Line | Purpose |
|--------|------|---------|
| `start(player1, player2)` | 49 | Initialize game, update maps |
| `getSideForSocket(socketId)` | 68 | Get player/enemy/null for socket |
| `getSideForAccount(accountId)` | 78 | Get side by account ID |
| `getAccountForSocket(socketId)` | 88 | Get accountId for socket |
| `markDisconnected(socketId)` | 99 | Mark side disconnected |
| `reconnect(accountId, newSocketId)` | 112 | Reconnect with new socket |
| `isDisconnected(side)` | 132 | Check if side is offline |
| `handleAction(socketId, action)` | 142 | Validate & execute game action |
| `getViewForSocket(socketId)` | 206 | Redacted state for socket |
| `getViewForAccount(accountId)` | 218 | Redacted state for account |
| `getWinnerResult()` | 230 | Get match result |
| `isExpired()` | 238 | Check 30-min expiry |
| `cleanup()` | 242 | Clear forfeit timers |

### `handleAction()` Action Types (Line 142)

| Action Type | Validation | Game Function |
|-------------|-----------|---------------|
| `playCard` | Turn ownership, hand bounds | `playCard(state, side, handIndex)` |
| `attack` | Turn ownership, attacker bounds | `attack(state, side, attacker, target)` |
| `burst` | Turn ownership | `castMomentumBurst(state, side)` |
| `endTurn` | Turn ownership | `passTurn(state)` |
| `surrender` | Side exists | `surrenderGame(state, side)` |

## Room Management Functions (Lines 251–329)

| Function | Line | Purpose |
|----------|------|---------|
| `createRoom(roomId, mode)` | 251 | Create room (prunes expired if full) |
| `getRoom(roomId)` | 267 | Fetch room by ID |
| `getRoomBySocket(socketId)` | 275 | Get room for socket |
| `getRoomByAccount(accountId)` | 284 | Get room for account |
| `destroyRoom(roomId)` | 293 | Cleanup and remove |
| `handleDisconnect(socketId)` | 314 | Mark disconnected, return room |
| `pruneExpiredRooms()` | 320 | Remove rooms > 30 min |

Auto-prune runs every 5 minutes (line 329).

## Exports

`createRoom`, `getRoom`, `getRoomBySocket`, `getRoomByAccount`, `handleDisconnect`, `destroyRoom`, `RECONNECT_GRACE_MS`, `rooms`, `socketToRoom`, `accountToRoom`
