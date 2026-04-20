# Database Index — `server/db.js` (1,993 lines)

## Setup & Schema (Lines 1–135)

### Database Tables (11 tables)

| Table | Line | Columns |
|-------|------|---------|
| `accounts` | 22 | id, username, password_hash, display_name, created_at, last_login, device_fp, created_ip_hash, created_ua_hash, flags, role |
| `sessions` | 33 | token, account_id (FK), created_at, expires_at, ip_hash |
| `player_profiles` | 40 | account_id (PK FK), shards, season_rating, wins, losses, streak, deck_config, owned_themes, selected_theme, last_daily, total_earned, updated_at, owned_cards, owned_card_borders, selected_card_border |
| `match_log` | 54 | id, account_id (FK), opponent, mode, result, turns, shards_earned, rating_delta, played_at |
| `social_friends` | 64 | account_id (FK), friend_account_id (FK), created_at |
| `clans` | 72 | id, name, tag, invite_code, owner_account_id (FK), created_at |
| `clan_members` | 80 | clan_id (FK), account_id (PK FK), role, joined_at |
| `rate_limits` | 88 | key, count, window_start |
| `player_decks` | 94 | id, account_id (FK), name, deck_config, is_active, created_at, updated_at |
| `admin_audit` | 109 | id, actor_account_id (FK), target_account_id (FK), action, metadata, ip_hash, created_at |
| `trades` | 1703 | id, from_account_id, to_account_id, status, offer, request, created_at, updated_at, expires_at |

### Indexes (Lines 103–116)
- Sessions by account/expires, match_log by account, social_friends, clans, rate_limits, device_fp, IPs, player_decks (partial unique on active), audit by date/actor/target, trades by from/to

## Password Hashing (Lines 137–161)

| Constant | Value |
|----------|-------|
| `SCRYPT_KEYLEN` | 64 bytes |
| `SCRYPT_COST` | N=16384, r=8, p=1, maxmem=64MB |

| Function | Line | Purpose |
|----------|------|---------|
| `hashPassword(plain)` | 140 | Scrypt hash with random salt |
| `verifyPassword(plain, stored)` | 145 | Timing-safe verification |
| `hashFingerprint(fp)` | 153 | SHA256 (32 chars) |
| `hashUserAgent(ua)` | 158 | SHA256 (24 chars) |
| `hashIp(ip)` | 348 | SHA256 (24 chars) |

## Rate Limiting (Lines 164–186)

| Constant | Value |
|----------|-------|
| `RATE_WINDOW_MS` | 15 minutes |

| Function | Line | Purpose |
|----------|------|---------|
| `checkRateLimit(key, maxAttempts)` | 175 | Check and increment |

## Account Management (Lines 189–346)

### Anti-Sybil Constants
| Constant | Value | Line |
|----------|-------|------|
| `USERNAME_RE` | `/^[a-zA-Z0-9_]{3,20}$/` | 189 |
| `DISPLAY_RE` | `/^.{1,24}$/` | 190 |
| `PASSWORD_MIN` | 8 | 191 |
| `MAX_ACCOUNTS_PER_DEVICE` | 2 | 192 |
| `MAX_ACCOUNTS_PER_IP` | 4 | 193 |
| `MAX_ACCOUNTS_PER_IP_PER_DAY` | 2 | 194 |
| `MAX_ACCOUNTS_PER_IP_AND_AGENT_PER_WEEK` | 3 | 195 |

### Functions
| Function | Line | Purpose |
|----------|------|---------|
| `buildAccountFlags(counts)` | 241 | Flag string from sybil checks |
| `createAccount(username, password, displayName, fp, ip, ua)` | 253 | Create with anti-sybil validation |
| `authenticateAccount(username, password)` | 309 | Login auth |

## Session Management (Lines 319–352)

| Constant | Value |
|----------|-------|
| `SESSION_TTL_MS` | 7 days |

| Function | Line | Purpose |
|----------|------|---------|
| `createSession(accountId, ip)` | 336 | Create token |
| `validateSession(token)` | 343 | Validate non-expired |
| `destroySession(token)` | 348 | Delete session |
| Auto-cleanup | 352 | Every hour |

## Deck Management (Lines 364–618)

### Constants
| Constant | Value | Line |
|----------|-------|------|
| `DECK_MIN_TOTAL` | 10 | 364 |
| `DECK_MAX_TOTAL` | 16 | 365 |
| `DECK_MAX_COPIES` | 3 | 366 |
| `DECK_MAX_PER_ACCOUNT` | 12 | 367 |

### Functions
| Function | Line | Purpose |
|----------|------|---------|
| `validateDeckConfig(config)` | 372 | Validate size, copies, format |
| `validateOwnership(profile, config)` | 401 | Check card ownership |
| `buildStarterCollection()` | 357 | Generate starter cards |
| `listDecks(accountId)` | 483 | Get all decks |
| `getActiveDeck(accountId)` | 489 | Get current deck |
| `createDeck(accountId, name, config)` | 497 | Create deck |
| `updateDeck(accountId, deckId, updates)` | 524 | Update deck |
| `renameDeck(accountId, deckId, name)` | 553 | Rename deck |
| `deleteDeck(accountId, deckId)` | 565 | Delete deck |
| `selectActiveDeck(accountId, deckId)` | 585 | Set active |
| `saveDeck(accountId, config)` | 599 | Legacy single-deck save |

## Economy (Lines 635–716)

### Constants
| Constant | Value | Line |
|----------|-------|------|
| `WIN_SHARDS` | 30 | 636 |
| `LOSS_SHARDS` | 10 | 637 |
| `DAILY_SHARDS` | 50 | 638 |
| `WIN_RATING` | +25 | 639 |
| `LOSS_RATING` | -15 | 640 |
| `RATING_FLOOR` | 1000 | 641 |

### Functions
| Function | Line | Purpose |
|----------|------|---------|
| `claimDailyReward(accountId)` | 679 | 50 shards daily |
| `purchaseTheme(accountId, themeId)` | 691 | Buy theme |
| `resolveMatchResult(...)` | 1095 | Award shards/rating |

## Card Borders (Lines 724–778)

| Function | Line | Purpose |
|----------|------|---------|
| `listCardBorders()` | 731 | Get catalog |
| `purchaseCardBorder(accountId, borderId)` | 741 | Buy border |
| `selectCardBorder(accountId, borderId)` | 766 | Equip border |

Border catalog: default (0), bronze (90), frost (180), solar (280), void (420)

## Card Breakdown (Lines 782–839)

| Constant | Value |
|----------|-------|
| Rarity values | common: 5, rare: 10, epic: 25, legendary: 100 |

| Function | Line | Purpose |
|----------|------|---------|
| `breakdownCard(accountId, cardId, qty)` | 793 | Convert excess copies → shards |

## Card Pack System (Lines 1411–1514)

| Constant | Line | Value |
|----------|------|-------|
| `PACK_DEFS` | 1420 | basic (50), premium (150), legendary (400) |
| `RARITY_WEIGHTS` | 1426 | legendary 2%, epic 8%, rare 20%, common 70% |

| Function | Line | Purpose |
|----------|------|---------|
| `rollRandomRarity()` | 1433 | Generate rarity by weight |
| `getCollection(accountId)` | 1451 | Get owned cards |
| `openPack(accountId, packType)` | 1462 | Open pack with duplicate protection |

## Match History & Leaderboard (Lines 1148–1169)

| Function | Line | Purpose |
|----------|------|---------|
| `getRecentMatches(accountId)` | 1163 | Last 20 matches |
| `getLeaderboard()` | 1167 | Top 25 by rating |

## Social System (Lines 1172–1405)

### Friends
| Function | Line | Purpose |
|----------|------|---------|
| `isFriendOf(a, b)` | 1209 | Check mutual friendship |
| `getSocialOverview(accountId)` | 1270 | Friends + clan data |
| `addFriend(accountId, username)` | 1280 | Add friend (bidirectional) |
| `removeFriend(accountId, friendId)` | 1309 | Remove friend |

### Clans
| Function | Line | Purpose |
|----------|------|---------|
| `createClan(accountId, name, tag)` | 1322 | Create with owner role |
| `joinClanByInvite(accountId, code)` | 1359 | Join by invite code |
| `leaveClan(accountId)` | 1379 | Leave (auto-promote if owner) |

## Admin & Roles (Lines 1520–1769)

### Role Hierarchy
`user (0) < admin (1) < owner (2)`

| Function | Line | Purpose |
|----------|------|---------|
| `getAccountRole(accountId)` | 1560 | Get role |
| `hasRoleAtLeast(role, minRole)` | 1566 | Check hierarchy |
| `findOwnerAccountId()` | 1570 | Get owner |
| `setAccountRole(actor, target, role)` | 1582 | Promote/demote |
| `transferOwnership(current, target)` | 1627 | Transfer owner |
| `assignInitialOwner(target)` | 1676 | Bootstrap owner |
| `listAccounts({search, limit, offset})` | 1715 | Search accounts |
| `recordAudit(...)` | 1735 | Log audit entry |
| `listAudit({limit})` | 1744 | Get audit log |

## Trading System (Lines 1783–1985)

| Constant | Value |
|----------|-------|
| `TRADE_TTL_DAYS` | 7 |
| `MAX_TRADE_ITEMS_PER_SIDE` | 6 |

| Function | Line | Purpose |
|----------|------|---------|
| `proposeTrade(from, to, offer, request)` | 1842 | Propose (friends only) |
| `listTradesForAccount(accountId)` | 1894 | Get trades |
| `acceptTrade(accepter, tradeId)` | 1903 | Atomic card swap |
| `cancelTrade(accountId, tradeId, reason)` | 1973 | Cancel/reject |
