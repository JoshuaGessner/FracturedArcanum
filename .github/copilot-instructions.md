# Fractured Arcanum — Copilot Instructions

## Project Overview

Fractured Arcanum is a mobile-first fantasy card battler built as a single-page web application. Players build decks from a 70-card library, then battle AI opponents or other players online in lane-based combat.

- **Frontend:** React 19 + TypeScript 6 + Vite 8 (SPA, one monolith component in `App.tsx`)
- **Backend:** Express 5 + Socket.IO 4 + better-sqlite3 (server-authoritative multiplayer)
- **Engine:** Pure functional game engine in `src/game.ts`, compiled to `server/game.js` via `tsconfig.engine.json`

## Architecture

### Game Engine (`src/game.ts`)
- Single source of truth for all game mechanics: card effects, combat, turn logic, win conditions.
- Pure functions only — no side effects, no I/O. Every function takes state in and returns new state.
- Shared between client (imported directly) and server (compiled to JS via `npm run build:engine`).
- When modifying game logic, always edit `src/game.ts` then rebuild with `npm run build:engine`.

### Server (`server/`)
- `server.js` — Express HTTP API + Socket.IO real-time server. Handles auth, profiles, matchmaking, and game actions.
- `game-room.js` — Server-authoritative game room manager. Validates every player action before executing via game.ts functions. Sends redacted state (opponent hand hidden) to each player.
- `db.js` — SQLite data layer (accounts, sessions, profiles, match history). Uses scrypt for password hashing.
- `game.js` — Auto-generated from `src/game.ts`. Do not edit directly; it is in `.gitignore`.

### Client (`src/`)
- `App.tsx` — Monolith React component containing all UI state, screens, and game lifecycle.
- `game.ts` — Game engine (shared with server).
- `audio.ts` — Sound effect playback.
- `App.css` — All styles.

### Multiplayer Protocol
- **AI mode:** Client runs game engine locally. `generateEnemyTurnSteps()` produces animated AI turns.
- **Duel mode:** Server-authoritative. Client emits `game:action` with action payload → server validates and executes → server broadcasts `game:state` with redacted state to both players.
- `redactGameState(state, forSide)` remaps perspective: `game.player` = your data, `game.enemy` = opponent data, `game.turn === 'player'` = your turn. This means the UI code works identically for both modes.
- Socket.IO auth middleware validates session token on handshake (`socket.handshake.auth.token`).

## Coding Standards

### TypeScript
- Strict mode enabled. No `any` types unless interfacing with untyped libraries.
- Prefer `type` over `interface` for consistency with existing codebase.
- Use explicit return types on exported functions.
- Avoid enums; use union string literal types (e.g., `type BattleSide = 'player' | 'enemy'`).

### React
- Functional components only. Use hooks for all state management.
- Avoid `useEffect` for derived state — compute inline.
- Prefix event handlers with `handle` (e.g., `handlePlayCard`, `handleEndTurn`).
- Keep sound effects and haptic feedback in handler functions, not in effects.

### Game Engine Rules
- All game functions must be pure: `(state, ...args) => newState`.
- Never mutate state. Always return new objects/arrays.
- Card effects are resolved in `playCard()` via the card's `effect` field.
- Board size is fixed at 3 lanes (`BOARD_SIZE = 3`).
- The `passTurn()` function handles end-of-turn + beginning of the next turn (mana increment, draw, unit readiness).

### Server Rules
- Validate all inputs at the boundary (API routes and socket handlers).
- Never trust client-reported game results for duel mode — the server resolves match outcomes.
- Rate-limit all socket events and API endpoints.
- Use parameterized queries for all database operations (SQLite).
- Session tokens are cryptographic random hex strings; passwords use scrypt.

### Security
- Helmet CSP headers on all responses.
- CORS restricted to configured origins.
- Rate limiting on all endpoints (120 requests/min default, stricter for auth).
- No secrets in client code or git history.
- Server validates every game action: turn ownership, mana cost, board state, card existence.

### Style
- Mobile-first responsive design. Test at 375px width minimum.
- CSS custom properties for theming (`--rarity-color`, etc.).
- Card art served from `public/generated/cards/` as WebP images.
- Use semantic HTML elements where possible.

## Key Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server (frontend only) |
| `npm run server` | Build engine + start Express/Socket.IO server |
| `npm run dev:full` | Build engine + run server + Vite concurrently |
| `npm run build:engine` | Compile `src/game.ts` → `server/game.js` |
| `npm run build` | Full production build (engine + TypeScript check + Vite) |
| `npm run lint` | ESLint check |
| `npm test` | Run Vitest test suite |
| `npm run release:check` | Test + lint + build (pre-deploy validation) |

## File Conventions
- Keep the design original — avoid copyrighted assets, names, or mechanics.
- Card IDs use kebab-case (`spark-imp`, `drakarion-the-eternal`).
- Socket events use colon-separated namespaces (`game:action`, `queue:join`, `server:hello`).
- Database tables use snake_case (`player_profiles`, `match_log`).
- All game constants are defined in `src/game.ts` and imported where needed.
