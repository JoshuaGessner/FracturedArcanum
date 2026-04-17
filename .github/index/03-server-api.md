# Server Index — `server/server.js` (2,321 lines)

## Imports & Configuration (Lines 1–68)

| Constant | Line | Value |
|----------|------|-------|
| `DIST_DIR` | 61 | Frontend build directory |
| `DATA_DIR` | 62 | Server data directory |
| `ADMIN_STORE_PATH` | 63 | Admin analytics JSON |
| `SERVER_CONFIG_PATH` | 64 | Server config JSON |
| `CLIENT_ORIGINS` | 65 | CORS whitelist from env |
| `DEFAULT_PORT` | 67 | 43173 |

## Server Config & Setup (Lines 72–120)

| Function | Line | Purpose |
|----------|------|---------|
| `ensureDataDir()` | 72 | Create data dir if missing |
| `loadServerConfig()` | 77 | Load config JSON |
| `saveServerConfig(config)` | 88 | Persist config |

## Express & Socket.IO Initialization (Lines 122–150)

| Item | Line | Purpose |
|------|------|---------|
| `app` | 125 | Express app with Helmet |
| `httpServer` | 128 | HTTP server |
| `io` | 129 | Socket.IO server (CORS + pings) |
| Socket auth middleware | 139 | Validates session token on handshake |

## Presence Tracking (Lines 156–186)

| Function | Line | Purpose |
|----------|------|---------|
| `trackPresence(accountId, socketId)` | 156 | Register socket |
| `untrackPresence(accountId, socketId)` | 165 | Remove socket |
| `isOnline(accountId)` | 173 | Check if online |
| `emitToAccount(accountId, event, payload)` | 177 | Broadcast to all sockets |

## Friend Challenges (Lines 191–226)

| Item | Line | Purpose |
|------|------|---------|
| `CHALLENGE_TTL_MS` | 191 | 60-second expiration |
| `pendingChallenges` Map | 204 | In-memory storage |
| `findChallengeForAccount()` | 206 | Find pending challenge |
| `reapChallenges()` | 216 | Auto-expire every 10s |

## Admin Analytics Store (Lines 228–287)

| Function | Line | Purpose |
|----------|------|---------|
| `createDefaultAdminStore()` | 228 | Default analytics schema |
| `loadAdminStore()` | 247 | Load/create store |
| `saveAdminStore()` | 277 | Persist to disk |
| `debouncedSaveAdminStore()` | 282 | 2s debounce |

## Matchmaking (Lines 289–431)

| Function | Line | Purpose |
|----------|------|---------|
| `getAllowedMatchDelta(queuedAt)` | 289 | Rating delta by wait time |
| `getLiveArenaSnapshot()` | 294 | Current queue/connection stats |
| `emitWaitingQueueState()` | 302 | Broadcast queue position |
| `emitLiveArenaState(target)` | 327 | Broadcast arena state |
| `removeWaitingPlayer()` | 335 | Remove from queue |
| `getMatchmakingRating(value)` | 339 | Validate/clamp rating (800–2200) |
| `findBestWaitingPlayer()` | 348 | Find best opponent |
| `startRankedMatch()` | 374 | Create ranked match |
| `sweepWaitingPlayers()` | 406 | Match players every 3s |

## Analytics (Lines 433–569)

| Function | Line | Purpose |
|----------|------|---------|
| `anonymizeVisitorId()` | 433 | SHA256 hash visitor |
| `pushActivity()` | 437 | Log activity entry |
| `pruneDailyTraffic()` | 448 | Keep 30 days |
| `ensureVisitor()` | 465 | Track/update visitor |
| `trackAnalyticsEvent()` | 493 | Track events |
| `getComplaintCounts()` | 533 | Count complaints |
| `buildAdminOverview()` | 540 | Dashboard data |

## Role-Based Middleware (Lines 571–608)

| Middleware | Line | Purpose |
|------------|------|---------|
| `requireRoleMiddleware(minRole)` | 571 | Role-checking factory |
| `requireAdminRole` | 591 | Admin+ middleware |
| `requireOwnerRole` | 592 | Owner-only middleware |
| `requireOwnerRecoveryKey()` | 594 | ADMIN_KEY validation |
| `timingSafeEqualBuffers()` | 605 | Constant-time comparison |

## Express Middleware Stack (Lines 610–665)

- Helmet CSP (610), Compression (627), Rate Limit 120/min (629), CORS (635), JSON 100KB (639)
- `requireAuth()` middleware (641), `clientIp()` (658), `clientUserAgent()` (663)

## API Routes

### Authentication (Lines 668–728)
| Route | Method | Line | Rate Limit |
|-------|--------|------|------------|
| `/api/auth/signup` | POST | 668 | 5/15m IP, 3/15m device |
| `/api/auth/login` | POST | 703 | 10/15m IP |
| `/api/auth/logout` | POST | 722 | — |

### Setup (Lines 732–783)
| Route | Method | Line | Rate Limit |
|-------|--------|------|------------|
| `/api/setup/status` | GET | 732 | — |
| `/api/setup` | POST | 736 | 5/15m |

### Profile (Lines 785–829)
| Route | Method | Line | Purpose |
|-------|--------|------|---------|
| `/api/me` | GET | 808 | Get profile |
| `/api/me/deck` | POST | 817 | Save deck (legacy) |

### Multi-Deck (Lines 833–891)
| Route | Method | Line | Purpose |
|-------|--------|------|---------|
| `/api/me/decks` | GET | 833 | List decks |
| `/api/me/decks` | POST | 838 | Create deck |
| `/api/me/decks/:deckId` | PATCH | 848 | Update deck |
| `/api/me/decks/:deckId/rename` | POST | 864 | Rename deck |
| `/api/me/decks/:deckId` | DELETE | 875 | Delete deck |
| `/api/me/decks/:deckId/select` | POST | 884 | Set active deck |

### Economy & Shop (Lines 895–1041)
| Route | Method | Line | Purpose |
|-------|--------|------|---------|
| `/api/cards/breakdown` | POST | 895 | Cards → Runes |
| `/api/shop/borders` | GET | 911 | Border catalog |
| `/api/shop/border` | POST | 915 | Purchase border |
| `/api/me/border` | POST | 925 | Select border |
| `/api/me/theme` | POST | 935 | Select theme |
| `/api/shop/theme` | POST | 945 | Purchase theme |
| `/api/me/daily` | POST | 955 | Daily reward |
| `/api/match/complete` | POST | 965 | Submit match result |
| `/api/me/matches` | GET | 1003 | Match history |
| `/api/leaderboard` | GET | 1008 | Top 25 |
| `/api/shop/packs` | GET | 1015 | Pack catalog |
| `/api/shop/pack` | POST | 1024 | Open pack |
| `/api/me/collection` | GET | 1038 | Owned cards |

### Social (Lines 1043–1116)
| Route | Method | Line | Purpose |
|-------|--------|------|---------|
| `/api/social` | GET | 1043 | Friends + clan |
| `/api/social/friends` | POST | 1047 | Add friend |
| `/api/social/friends/:id` | DELETE | 1062 | Remove friend |
| `/api/social/clan/create` | POST | 1076 | Create clan |
| `/api/social/clan/join` | POST | 1090 | Join clan |
| `/api/social/clan/leave` | POST | 1104 | Leave clan |

### Trading (Lines 1120–1176)
| Route | Method | Line | Purpose |
|-------|--------|------|---------|
| `/api/trades` | GET | 1120 | List trades |
| `/api/trades/propose` | POST | 1124 | Propose trade |
| `/api/trades/:id/accept` | POST | 1141 | Accept trade |
| `/api/trades/:id/reject` | POST | 1156 | Reject trade |
| `/api/trades/:id/cancel` | POST | 1167 | Cancel trade |

### Health & Analytics (Lines 1178–1261)
| Route | Method | Line | Purpose |
|-------|--------|------|---------|
| `/api/health` | GET | 1178 | Health check |
| `/api/profile` | GET | 1191 | Server settings |
| `/api/privacy` | GET | 1195 | Privacy info |
| `/api/analytics/track` | POST | 1209 | Track event |
| `/api/complaints` | POST | 1216 | Submit complaint |

### Admin (Lines 1263–1442)
| Route | Method | Line | Auth |
|-------|--------|------|------|
| `/api/admin/overview` | GET | 1263 | admin+ |
| `/api/admin/settings` | POST | 1270 | admin+ |
| `/api/admin/complaints/:id` | POST | 1287 | admin+ |
| `/api/admin/users` | GET | 1322 | admin+ |
| `/api/admin/users/:id/role` | POST | 1333 | owner |
| `/api/admin/owner/transfer` | POST | 1355 | owner |
| `/api/admin/audit` | GET | 1399 | admin+ |
| `/api/admin/owner/recover` | POST | 1408 | ADMIN_KEY |

## Static File Serving (Lines 1444–1475)
- dist/ with cache headers, SPA fallback to index.html

## Socket.IO Handlers (Lines 1479–1918)

| Handler | Line | Rate Limit | Purpose |
|---------|------|------------|---------|
| `checkSocketRate()` | 1479 | — | Per-connection rate limiting |
| `connection` | 1499 | — | Hello + presence + auto-rejoin |
| `game:rejoin` | 1556 | — | Manual rejoin |
| `queue:join` | 1579 | 10/min | Join ranked queue |
| `queue:leave` | 1625 | — | Leave queue |
| `challenge:send` | 1631 | 10/min | Friend challenge |
| `challenge:accept` | 1684 | 10/min | Accept challenge |
| `challenge:decline` | 1752 | 20/min | Decline challenge |
| `challenge:cancel` | 1763 | 20/min | Cancel challenge |
| `room:emote` | 1773 | 20/min | Emote broadcast |
| `game:action` | 1785 | 120/min | Execute game action |
| `disconnect` | 1842 | — | Cleanup + forfeit timer |

## Graceful Shutdown (Lines 1922–1944)
- Flush admin store, close sockets/HTTP, 10s timeout
