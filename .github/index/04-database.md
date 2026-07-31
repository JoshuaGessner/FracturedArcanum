# Database Index — `server/db/`

> `server/db.js` is a re-export barrel. The implementation lives in nine domain
> modules under `server/db/`, and the graph is acyclic:
>
> ```
> connection  -> (none)                      schema, migrations, lazy prepare()
> crypto      -> connection
> matches     -> connection
> profiles    -> connection
> accounts    -> connection crypto profiles
> economy     -> connection profiles
> admin       -> accounts connection profiles
> social      -> accounts connection economy profiles
> account-export -> all of the above
> ```
>
> Add a query to the module that owns the table. The section map below still
> describes what lives where; each section now corresponds to a module.

## Setup & Schema (Lines 1–135)

### Database Tables (11 tables)

| Table | Line | Columns |
|------|------|
| `accounts` | id, username, password_hash, display_name, created_at, last_login, device_fp, created_ip_hash, created_ua_hash, flags, role |
| `sessions` | token, account_id (FK), created_at, expires_at, ip_hash |
| `player_profiles` | account_id (PK FK), shards, season_rating, wins, losses, streak, deck_config, owned_themes, selected_theme, last_daily, total_earned, updated_at, owned_cards, owned_card_borders, selected_card_border |
| `match_log` | id, account_id (FK), opponent, mode, result, turns, shards_earned, rating_delta, played_at |
| `social_friends` | account_id (FK), friend_account_id (FK), created_at |
| `clans` | id, name, tag, invite_code, owner_account_id (FK), created_at |
| `clan_members` | clan_id (FK), account_id (PK FK), role, joined_at |
| `rate_limits` | key, count, window_start |
| `player_decks` | id, account_id (FK), name, deck_config, is_active, created_at, updated_at |
| `admin_audit` | id, actor_account_id (FK), target_account_id (FK), action, metadata, ip_hash, created_at |
| `trades` | id, from_account_id, to_account_id, status, offer, request, created_at, updated_at, expires_at |

### Indexes (Lines 103–116)
- Sessions by account/expires, match_log by account, social_friends, clans, rate_limits, device_fp, IPs, player_decks (partial unique on active), audit by date/actor/target, trades by from/to

## Password Hashing (Lines 137–161)

| Constant | Value |
|----------|-------|
| `SCRYPT_KEYLEN` | 64 bytes |
| `SCRYPT_COST` | N=16384, r=8, p=1, maxmem=64MB |

| Function | Line | Purpose |
|------|------|
| `hashPassword(plain)` | Scrypt hash with random salt |
| `verifyPassword(plain, stored)` | Timing-safe verification |
| `hashFingerprint(fp)` | SHA256 (32 chars) |
| `hashUserAgent(ua)` | SHA256 (24 chars) |
| `hashIp(ip)` | SHA256 (24 chars) |

## Rate Limiting (Lines 164–186)

| Constant | Value |
|----------|-------|
| `RATE_WINDOW_MS` | 15 minutes |

| Function | Line | Purpose |
|------|------|
| `checkRateLimit(key, maxAttempts)` | Check and increment |

## Account Management (Lines 189–346)

### Anti-Sybil Constants
| Constant | Value | Line |
|------|------|
| `USERNAME_RE` | `/^[a-zA-Z0-9_]{3,20}$/` | 189 |
| `DISPLAY_RE` | `/^.{1,24}$/` | 190 |
| `PASSWORD_MIN` | 191 |
| `MAX_ACCOUNTS_PER_DEVICE` | 192 |
| `MAX_ACCOUNTS_PER_IP` | 193 |
| `MAX_ACCOUNTS_PER_IP_PER_DAY` | 194 |
| `MAX_ACCOUNTS_PER_IP_AND_AGENT_PER_WEEK` | 195 |

### Functions
| Function | Line | Purpose |
|------|------|
| `buildAccountFlags(counts)` | Flag string from sybil checks |
| `createAccount(username, password, displayName, fp, ip, ua)` | Create with anti-sybil validation |
| `authenticateAccount(username, password)` | Login auth |

## Session Management (Lines 319–352)

| Constant | Value |
|----------|-------|
| `SESSION_TTL_MS` | 7 days |

| Function | Line | Purpose |
|------|------|
| `createSession(accountId, ip)` | Create token |
| `validateSession(token)` | Validate non-expired |
| `destroySession(token)` | Delete session |
| Auto-cleanup | Every hour |

## Deck Management (Lines 364–618)

### Constants
| Constant | Value | Line |
|------|------|
| `DECK_MIN_TOTAL` | 364 |
| `DECK_MAX_TOTAL` | 365 |
| `DECK_MAX_COPIES` | 366 |
| `DECK_MAX_PER_ACCOUNT` | 367 |

### Functions
| Function | Line | Purpose |
|------|------|
| `validateDeckConfig(config)` | Validate size, copies, format |
| `validateOwnership(profile, config)` | Check card ownership |
| `buildStarterCollection()` | Generate starter cards |
| `listDecks(accountId)` | Get all decks |
| `getActiveDeck(accountId)` | Get current deck |
| `createDeck(accountId, name, config)` | Create deck |
| `updateDeck(accountId, deckId, updates)` | Update deck |
| `renameDeck(accountId, deckId, name)` | Rename deck |
| `deleteDeck(accountId, deckId)` | Delete deck |
| `selectActiveDeck(accountId, deckId)` | Set active |
| `saveDeck(accountId, config)` | Legacy single-deck save |

## Economy (Lines 635–716)

### Constants
| Constant | Value | Line |
|------|------|
| `WIN_SHARDS` | 636 |
| `LOSS_SHARDS` | 637 |
| `DAILY_SHARDS` | 638 |
| `WIN_RATING` | +25 | 639 |
| `LOSS_RATING` | -15 | 640 |
| `RATING_FLOOR` | 641 |

### Functions
| Function | Line | Purpose |
|------|------|
| `claimDailyReward(accountId)` | 50 shards daily |
| `purchaseTheme(accountId, themeId)` | Buy theme |
| `resolveMatchResult(...)` | Award shards/rating |

## Card Borders (Lines 724–778)

| Function | Line | Purpose |
|------|------|
| `listCardBorders()` | Get catalog |
| `purchaseCardBorder(accountId, borderId)` | Buy border |
| `selectCardBorder(accountId, borderId)` | Equip border |

Border catalog: default (0), bronze (90), frost (180), solar (280), void (420)

## Card Breakdown (Lines 782–839)

| Constant | Value |
|----------|-------|
| Rarity values | common: 5, rare: 10, epic: 25, legendary: 100 |

| Function | Line | Purpose |
|------|------|
| `breakdownCard(accountId, cardId, qty)` | Convert excess copies → shards |

## Card Pack System (Lines 1411–1514)

| Constant | Line | Value |
|------|------|
| `PACK_DEFS` | basic (50), premium (150), legendary (400) |
| `RARITY_WEIGHTS` | legendary 2%, epic 8%, rare 20%, common 70% |

| Function | Line | Purpose |
|------|------|
| `rollRandomRarity()` | Generate rarity by weight |
| `getCollection(accountId)` | Get owned cards |
| `openPack(accountId, packType)` | Open pack with duplicate protection |

## Match History & Leaderboard (Lines 1148–1169)

| Function | Line | Purpose |
|------|------|
| `getRecentMatches(accountId)` | Last 20 matches |
| `getLeaderboard()` | Top 25 by rating |

## Social System (Lines 1172–1405)

### Friends
| Function | Line | Purpose |
|------|------|
| `isFriendOf(a, b)` | Check mutual friendship |
| `getSocialOverview(accountId)` | Friends + clan data |
| `addFriend(accountId, username)` | Add friend (bidirectional) |
| `removeFriend(accountId, friendId)` | Remove friend |

### Clans
| Function | Line | Purpose |
|------|------|
| `createClan(accountId, name, tag)` | Create with owner role |
| `joinClanByInvite(accountId, code)` | Join by invite code |
| `leaveClan(accountId)` | Leave (auto-promote if owner) |

## Admin & Roles (Lines 1520–1769)

### Role Hierarchy
`user (0) < admin (1) < owner (2)`

| Function | Line | Purpose |
|------|------|
| `getAccountRole(accountId)` | Get role |
| `hasRoleAtLeast(role, minRole)` | Check hierarchy |
| `findOwnerAccountId()` | Get owner |
| `setAccountRole(actor, target, role)` | Promote/demote |
| `transferOwnership(current, target)` | Transfer owner |
| `assignInitialOwner(target)` | Bootstrap owner |
| `listAccounts({search, limit, offset})` | Search accounts |
| `recordAudit(...)` | Log audit entry |
| `listAudit({limit})` | Get audit log |

## Trading System (Lines 1783–1985)

| Constant | Value |
|----------|-------|
| `TRADE_TTL_DAYS` |
| `MAX_TRADE_ITEMS_PER_SIDE` |

| Function | Line | Purpose |
|------|------|
| `proposeTrade(from, to, offer, request)` | Propose (friends only) |
| `listTradesForAccount(accountId)` | Get trades |
| `acceptTrade(accepter, tradeId)` | Atomic card swap |
| `cancelTrade(accountId, tradeId, reason)` | Cancel/reject |
