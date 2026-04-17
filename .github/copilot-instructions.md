# Fractured Arcanum — Copilot Instructions

> **Read this file first at the start of every session.** It governs all code generation, editing, and review within this project.

---

## 1 — Code Index Reference

A detailed code index lives in `.github/index/`. **Consult it before writing or modifying any code** to locate the correct file, line range, and function signatures.

| Index File | Covers |
|------------|--------|
| `00-overview.md` | Tech stack, file map, build commands |
| `01-game-engine.md` | `src/game.ts` — types, cards, combat, AI, effects |
| `02-client-ui.md` | `src/App.tsx` — state, handlers, screens, sockets |
| `03-server-api.md` | `server/server.js` — routes, middleware, socket handlers |
| `04-database.md` | `server/db.js` — tables, queries, economy, social |
| `05-game-room.md` | `server/game-room.js` — room lifecycle, action validation |
| `06-styles.md` | `src/App.css` — section map, animations, breakpoints |
| `07-supporting-files.md` | audio, tests, configs, deployment |

**Workflow:** Index file → locate section → read actual source lines → implement change. Never guess at function signatures, state variables, or line numbers — verify from the index, then confirm in source.

---

## 2 — Mandatory Coding Standards

### Zero Tolerance Rules
1. **No placeholders.** Never emit `// TODO`, `/* implement later */`, `...`, placeholder text, or stub functions. Every line of code must be complete, functional, and production-ready.
2. **No fallback shortcuts.** Do not return hardcoded mock data, skip error paths, or leave conditional branches empty. Implement the real logic.
3. **No partial implementations.** If a feature touches multiple files (engine + server + client), implement all parts in the same pass. Do not leave any file in a broken intermediate state.
4. **Test every change.** After any code modification, run `npm test` and `npm run lint`. Fix all failures before considering the task complete. If new behavior is added, add corresponding test cases in the appropriate test file.
5. **Build verification.** After modifying `src/game.ts`, always run `npm run build:engine` to recompile `server/game.js`. After any change, run `npm run build` to verify the full build succeeds.

### TypeScript
- Strict mode enabled. No `any` types unless interfacing with untyped libraries.
- Prefer `type` over `interface` for consistency with existing codebase.
- Use explicit return types on exported functions.
- Avoid enums; use union string literal types (e.g., `type BattleSide = 'player' | 'enemy'`).
- All new types go in `src/game.ts` if game-related, `src/types.ts` if UI-only.

### React
- Functional components only. Use hooks for all state management.
- Avoid `useEffect` for derived state — compute inline.
- Prefix event handlers with `handle` (e.g., `handlePlayCard`, `handleEndTurn`).
- Keep sound effects and haptic feedback in handler functions, not in effects.
- App-level state, effects, and handlers live in `src/App.tsx`. Screens (`src/screens/*`) consume that state via `useApp()` (the `AppContext.Provider` wraps the entire UI tree). Shared components (`src/components/*`) remain prop-driven. Do not introduce app state inside screens or components.
- New shared UI primitives go in `src/components/`. New full screens go in `src/screens/` (and must be wired into App.tsx's screen-panel switch and read state via `useApp()`).
- When adding new app-wide state in App.tsx, also add the corresponding key to `AppContextValue` in `src/AppContext.ts` and include it in the `appCtx` object literal in App.tsx.
- Pure helpers belong in `src/utils.ts`. Static UI data (themes, presets, labels) belongs in `src/constants.ts`.

### Game Engine Rules
- All game functions must be pure: `(state, ...args) => newState`.
- Never mutate state. Always return new objects/arrays.
- Card effects are resolved in `playCard()` via the card's `effect` field and `CARD_PARAMS`.
- Board size is fixed at 3 lanes (`BOARD_SIZE = 3`).
- `passTurn()` handles end-of-turn + beginning of next turn (mana increment, draw, unit readiness).
- When modifying game logic, always edit `src/game.ts` then rebuild with `npm run build:engine`.

### Server Rules
- Validate all inputs at the boundary (API routes and socket handlers).
- Never trust client-reported game results for duel mode — the server resolves match outcomes.
- Rate-limit all socket events and API endpoints.
- Use parameterized queries for all database operations (SQLite).
- Session tokens are cryptographic random hex strings; passwords use scrypt.
- New API routes require rate limiting and `requireAuth()` middleware (or stricter).

### Security
- Helmet CSP headers on all responses.
- CORS restricted to configured origins.
- Rate limiting on all endpoints (120 requests/min default, stricter for auth).
- No secrets in client code or git history.
- Server validates every game action: turn ownership, mana cost, board state, card existence.
- Timing-safe comparison for passwords and keys.

### CSS & Style
- Mobile-first responsive design. Test at 375px width minimum.
- CSS custom properties for theming (`:root` variables in `App.css`).
- Card art served from `public/generated/cards/` as WebP images.
- Use semantic HTML elements where possible.
- New styles go in `App.css` in the appropriate section (see `06-styles.md`).
- Support `prefers-reduced-motion` for all new animations.

---

## 3 — Architecture

### File Roles

| File | Lines | Role | Edit Rules |
|------|-------|------|------------|
| `src/game.ts` | 1,410 | Game engine — single source of truth for all mechanics | Pure functions only. After edit: `npm run build:engine` |
| `src/App.tsx` | 2,896 | Root React component — all state, effects, handlers, builds AppContextValue and provides via `<AppContext.Provider>` | Owns app state. Screens read it via `useApp()`. |
| `src/AppContext.ts` | 275 | `AppContextValue` type + `createContext` | Update when adding shared state |
| `src/useApp.ts` | 10 | `useApp()` hook | |
| `src/types.ts` | 252 | UI-only TypeScript types | Add new UI types here |
| `src/constants.ts` | 182 | Static UI constants (themes, presets, labels) | No functions — data only |
| `src/utils.ts` | 134 | Pure helper functions | No React, no app state |
| `src/screens/*.tsx` | 282–554 each | Presentational screens (Home, Deck, Battle, Vault, Ops) | Propless — read state via `useApp()` |
| `src/components/*.tsx` | 18–66 each | Shared UI primitives (modals, nav, overlays) | Prop-driven only |
| `src/App.css` | 2,662 | All styles | Add to correct section per `06-styles.md` |
| `src/audio.ts` | 91 | Sound synthesis | 7 sound types via Web Audio API |
| `server/server.js` | 2,321 | Express API + Socket.IO + matchmaking | Rate-limit all new endpoints |
| `server/db.js` | 1,993 | SQLite data layer | Parameterized queries only |
| `server/game-room.js` | 348 | Game room manager | Server-authoritative validation |
| `server/game.js` | — | Auto-generated | **NEVER edit directly** |

### Multiplayer Protocol
- **AI mode:** Client runs game engine locally. `generateEnemyTurnSteps()` produces animated AI turns.
- **Duel mode:** Server-authoritative. Client emits `game:action` → server validates via `game-room.js` → server broadcasts `game:state` with redacted state.
- `redactGameState(state, forSide)` remaps perspective: `player` = your data, `enemy` = opponent data, `turn === 'player'` = your turn. UI code works identically for both modes.
- Socket.IO auth middleware validates session token on handshake.

---

## 4 — Key Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (frontend only) |
| `npm run server` | Build engine + start Express/Socket.IO server |
| `npm run dev:full` | Build engine + server + Vite concurrently |
| `npm run build:engine` | Compile `src/game.ts` → `server/game.js` |
| `npm run build` | Full production build (engine + TS check + Vite) |
| `npm run lint` | ESLint check |
| `npm test` | Run Vitest test suite |
| `npm run release:check` | Test + lint + build (pre-deploy validation) |

---

## 5 — Conventions

- Card IDs: kebab-case (`spark-imp`, `drakarion-the-eternal`)
- Socket events: colon namespaces (`game:action`, `queue:join`, `server:hello`)
- Database tables: snake_case (`player_profiles`, `match_log`)
- Game constants: defined in `src/game.ts`, imported where needed
- Keep the design original — no copyrighted assets, names, or mechanics

---

## 6 — Pre-Commit Checklist

Before declaring any task complete, verify all of the following:

- [ ] Code compiles: `npm run build` passes
- [ ] Tests pass: `npm test` passes
- [ ] Lint clean: `npm run lint` passes
- [ ] No placeholders, TODOs, stubs, or incomplete branches
- [ ] If `src/game.ts` was modified: `npm run build:engine` was run
- [ ] If new server routes were added: rate limiting and auth middleware are present
- [ ] If new UI was added: works at 375px mobile width
- [ ] If new animations were added: respects `prefers-reduced-motion`
