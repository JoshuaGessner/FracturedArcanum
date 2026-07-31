# Game Room Index — `server/game-room.js`

## Constants (Lines 12–14)

| Constant | Value | Purpose |
|------|------|
| `MAX_ROOM_AGE_MS` | 30 minutes | Auto-expire stale rooms |
| `MAX_ROOMS` | Concurrent room cap |
| `RECONNECT_GRACE_MS` | 60 seconds | Disconnect grace period |

## In-Memory Maps (Lines 17–23)

| Map | Key → Value | Purpose |
|------|------|
| `rooms` | roomId → GameRoom | Active game rooms |
| `socketToRoom` | socketId → roomId | Socket lookup |
| `accountToRoom` | accountId → roomId | Account lookup |

## GameRoom Class (Lines 26–245)

### Constructor (Line 26)
`GameRoom(roomId, mode)` — mode: `'duel'` or `'unranked'`

### Methods

| Method | Line | Purpose |
|------|------|
| `start(player1, player2)` | Initialize game, update maps |
| `getSideForSocket(socketId)` | Get player/enemy/null for socket |
| `getSideForAccount(accountId)` | Get side by account ID |
| `getAccountForSocket(socketId)` | Get accountId for socket |
| `markDisconnected(socketId)` | Mark side disconnected |
| `reconnect(accountId, newSocketId)` | Reconnect with new socket |
| `isDisconnected(side)` | Check if side is offline |
| `handleAction(socketId, action)` | Validate & execute game action |
| `getViewForSocket(socketId)` | Redacted state for socket plus `serverMode` (`duel` or `unranked`) |
| `getViewForAccount(accountId)` | Redacted state for account plus `serverMode` (`duel` or `unranked`) |
| `getWinnerResult()` | Get match result |
| `isExpired()` | Check 30-min expiry |
| `cleanup()` | Clear forfeit timers |

### `handleAction()` Action Types (Line 142)

| Action Type | Validation | Game Function |
|------|------|
| `playCard` | Turn ownership, hand bounds, optional empty lane target | `playCard(state, side, handIndex, laneIndex?)` |
| `attack` | Turn ownership, attacker bounds | `attack(state, side, attacker, target)` |
| `burst` | Turn ownership | `castMomentumBurst(state, side)` |
| `endTurn` | Turn ownership | `passTurn(state)` |
| `surrender` | Side exists | `surrenderGame(state, side)` |

## Room Management Functions (Lines 251–329)

| Function | Line | Purpose |
|------|------|
| `createRoom(roomId, mode)` | Create room (prunes expired if full) |
| `getRoom(roomId)` | Fetch room by ID |
| `getRoomBySocket(socketId)` | Get room for socket |
| `getRoomByAccount(accountId)` | Get room for account |
| `destroyRoom(roomId)` | Cleanup and remove |
| `handleDisconnect(socketId)` | Mark disconnected, return room |
| `pruneExpiredRooms()` | Remove rooms > 30 min |

Auto-prune runs every 5 minutes (line 329).

## Exports

`createRoom`, `getRoom`, `getRoomBySocket`, `getRoomByAccount`, `handleDisconnect`, `destroyRoom`, `RECONNECT_GRACE_MS`, `rooms`, `socketToRoom`, `accountToRoom`
