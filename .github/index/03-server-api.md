# Server Index — `server/server.js`

## Imports & Configuration (Lines 1–68)

| Constant | Line | Value |
|------|------|
| `DIST_DIR` | Frontend build directory |
| `DATA_DIR` | Server data directory |
| `ADMIN_STORE_PATH` | Admin analytics JSON |
| `SERVER_CONFIG_PATH` | Server config JSON |
| `CLIENT_ORIGINS` | CORS whitelist from env |
| `DEFAULT_PORT` | 43173 |

## Server Config & Setup (Lines 72–120)

| Function | Line | Purpose |
|------|------|
| `ensureDataDir()` | Create data dir if missing |
| `loadServerConfig()` | Load config JSON |
| `saveServerConfig(config)` | Persist config |

## Express & Socket.IO Initialization (Lines 122–150)

| Item | Line | Purpose |
|------|------|
| `app` | Express app with Helmet |
| `httpServer` | HTTP server |
| `io` | Socket.IO server (CORS + pings) |
| Socket auth middleware | Validates session token on handshake |

## Presence Tracking (Lines 156–186)

| Function | Line | Purpose |
|------|------|
| `trackPresence(accountId, socketId)` | Register socket |
| `untrackPresence(accountId, socketId)` | Remove socket |
| `isOnline(accountId)` | Check if online |
| `emitToAccount(accountId, event, payload)` | Broadcast to all sockets |

## Friend Challenges (Lines 191–226)

| Item | Line | Purpose |
|------|------|
| `CHALLENGE_TTL_MS` | 60-second expiration |
| `pendingChallenges` Map | In-memory storage |
| `findChallengeForAccount()` | Find pending challenge |
| `reapChallenges()` | Auto-expire every 10s |

## Admin Analytics Store (Lines 228–287)

| Function | Line | Purpose |
|------|------|
| `createDefaultAdminStore()` | Default analytics schema |
| `loadAdminStore()` | Load/create store |
| `saveAdminStore()` | Persist to disk |
| `debouncedSaveAdminStore()` | 2s debounce |

## Matchmaking (Lines 289–431)

| Function | Line | Purpose |
|------|------|
| `getAllowedMatchDelta(queuedAt)` | Rating delta by wait time |
| `getLiveArenaSnapshot()` | Current queue/connection stats |
| `emitWaitingQueueState()` | Broadcast queue position |
| `emitLiveArenaState(target)` | Broadcast arena state |
| `removeWaitingPlayer()` | Remove from queue |
| `getMatchmakingRating(value)` | Validate/clamp rating (800–2200) |
| `findBestWaitingPlayer()` | Find best opponent |
| `startRankedMatch()` | Create ranked match |
| `sweepWaitingPlayers()` | Match players every 3s |

## Analytics (Lines 433–569)

| Function | Line | Purpose |
|------|------|
| `anonymizeVisitorId()` | SHA256 hash visitor |
| `pushActivity()` | Log activity entry |
| `pruneDailyTraffic()` | Keep 30 days |
| `ensureVisitor()` | Track/update visitor |
| `trackAnalyticsEvent()` | Track events |
| `getComplaintCounts()` | Count complaints |
| `buildAdminOverview()` | Dashboard data |

## Role-Based Middleware (Lines 571–608)

| Middleware | Line | Purpose |
|------|------|
| `requireRoleMiddleware(minRole)` | Role-checking factory |
| `requireAdminRole` | Admin+ middleware |
| `requireOwnerRole` | Owner-only middleware |
| `requireOwnerRecoveryKey()` | ADMIN_KEY validation |
| `timingSafeEqualBuffers()` | Constant-time comparison |

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
| `/api/cards/breakdown` | POST | 895 | Cards → Shards |
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
| `checkSocketRate()` | — | Per-connection rate limiting |
| `connection` | — | Hello + presence + auto-rejoin |
| `game:rejoin` | — | Manual rejoin |
| `queue:join` | 10/min | Join ranked queue |
| `queue:leave` | — | Leave queue |
| `challenge:send` | 10/min | Friend challenge |
| `challenge:accept` | 10/min | Accept challenge |
| `challenge:decline` | 20/min | Decline challenge |
| `challenge:cancel` | 20/min | Cancel challenge |
| `game:action` | 120/min | Execute game action |
| `disconnect` | — | Cleanup + forfeit timer |

## Graceful Shutdown (Lines 1922–1944)
- Flush admin store, close sockets/HTTP, 10s timeout
