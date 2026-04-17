# Supporting Files Index

## Audio — `src/audio.ts` (91 lines)

### Exports
- `type SoundName = 'tap' | 'summon' | 'attack' | 'burst' | 'match' | 'win' | 'lose'`
- `function playSound(name: SoundName, enabled: boolean)` — Synthesized sound via Web Audio API

### Sound Definitions
| Sound | Frequency | Type | Use |
|-------|-----------|------|-----|
| tap | 520 Hz triangle | 0.08s | Button clicks |
| summon | 330+440 Hz | Layered | Card play |
| attack | 190+140 Hz square | Aggressive | Combat |
| burst | 320+640 Hz sawtooth | High-energy | Momentum Burst |
| match | 392+523 Hz triangle | Musical | Queue match found |
| win | 523/659/784 Hz ascending | Fanfare | Victory |
| lose | 294/220 Hz descending | Defeat | Loss |

## Entry Point — `src/main.tsx` (55 lines)
- React 19 StrictMode render to `#root`
- Service worker registration with update detection
- Custom event `'sw-update-available'` for update banner

## Base Styles — `src/index.css` (33 lines)
- Root font family, line-height, background gradient
- Font rendering optimization
- Tap highlight removal, touch callout disable

## Test Suites

### `src/game.test.ts` (205 lines, 16 tests)
| Block | Tests |
|-------|-------|
| Core rules | Valid match creation, momentum burst, card play, surrender, AI difficulty, AI match creation |
| Card effects (data-driven) | Storm Titan blast+draw, Storm Shaman blast, Bone Collector drain, Shadow Assassin charge+lifesteal, Glacial Colossus guard, Phoenix deathrattle, Ghost Knight deathrattle, Arcane Golem rally+draw, Velara heal+empower |

### `server/db.test.js` (407 lines, 27 tests)
| Block | Tests |
|-------|-------|
| Admin roles | Default role, initial owner, promote/demote, reject non-owner, reject alter-owner, unknown target, transfer ownership, list accounts, role comparison |
| Single-owner constraint | Prevents duplicate owners via index |
| Friend gating | Reciprocal friendship, self/empty rejection |
| Match results | Unranked vs duel mode rating |
| Card trading | Non-friends rejection, self-trade, insufficient copies, atomic swap, concurrent accepts, cancel flow, malformed items, max-copy enforcement |
| Multi-deck CRUD | Legacy migration, full CRUD, ownership validation |
| Card breakdown | Excess copy refund, deck protection |
| Card borders | Purchase + select flow, unknown/unowned rejection |

## Build Configuration

### `vite.config.ts` (17 lines)
- React plugin, dev proxy for `/api` and `/socket.io` to Express backend

### `tsconfig.engine.json` (15 lines)
- ES2022 target, NodeNext modules, output to `server/`, strict: false, only includes `src/game.ts`

### `eslint.config.js` (18 lines)
- Flat config, TypeScript + React Hooks + React Refresh recommended rules

### `package.json` — Key Dependencies
| Package | Version | Role |
|---------|---------|------|
| react | 19.2.4 | UI framework |
| express | 5.2.1 | HTTP server |
| socket.io | 4.8.3 | Real-time transport |
| better-sqlite3 | 12.9.0 | Database |
| helmet | 8.1.0 | Security headers |
| express-rate-limit | 8.3.2 | Rate limiting |
| typescript | 6.0.2 | Type checking |
| vite | 8.x | Build tool |
| vitest | latest | Test runner |

## Deployment

### `Dockerfile` (29 lines)
- 2-stage build: Node 20 Alpine
- Build: install deps → generate assets → build
- Runtime: prod deps only → dist + server + public
- Health check: `/api/health`

### `docker-compose.yml` (24 lines)
- Single service, port 43173
- Persistent volume for `/app/data`
- 512MB memory, 1 CPU limit, auto-restart

### `render.yaml`
- Render.com deployment config

## Data Files

### `data/server-config.json`
- `adminKey` — Recovery key (hex string)
- `setupComplete` — Boolean
- `adminAccountId` — Owner account ID

### `data/arena-admin-store.json`
- `settings` — MOTD, quest, featured mode, maintenance
- `totals` — Aggregate analytics
- `visitors` — Anonymous user tracking
- `complaints` — Support tickets
- `activity` — Event log
- `dailyTraffic` — Views by date
- `deviceBuckets` — Mobile/desktop/tablet counts
