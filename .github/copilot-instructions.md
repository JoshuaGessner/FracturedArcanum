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
| `08-assets.md` | generated SVG asset pipeline (Phase 3A) |

**Workflow:** Index file → locate section → read actual source lines → implement change. Never guess at function signatures, state variables, or line numbers — verify from the index, then confirm in source.

---

## 2 — Mandatory Coding Standards

### Zero Tolerance Rules
1. **No placeholders.** Never emit `// TODO`, `/* implement later */`, `...`, placeholder text, or stub functions. Every line of code must be complete, functional, and production-ready.
2. **No fallback shortcuts.** Do not return hardcoded mock data, skip error paths, or leave conditional branches empty. Implement the real logic.
3. **No partial implementations.** If a feature touches multiple files (engine + server + client), implement all parts in the same pass. Do not leave any file in a broken intermediate state.
4. **Test every change.** After any code modification, run `npm test` and `npm run lint`. Fix all failures before considering the task complete. If new behavior is added, add corresponding test cases in the appropriate test file.
5. **Build verification.** After modifying `src/game.ts`, always run `npm run build:engine` to recompile `server/game.js`. After any change, run `npm run build` to verify the full build succeeds.
6. **No monolithic growth.** Do not keep piling unrelated logic into already-large files, giant handlers, or multi-purpose components. Extract helpers, components, hooks, providers, or server modules in the same pass.
7. **Refactor before extending crowded files.** When touching hotspots like `src/App.tsx`, `server/server.js`, `server/db.js`, or `src/App.css`, look for the correct seam to split responsibilities instead of adding another long branch, effect, or inline block.

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
- App-level state, effects, and handlers live in the `AppShell` component inside `src/App.tsx` (the outer `App` is just a thin wrapper). Screens (`src/screens/*`) consume that state via the typed slice hooks in `src/contexts/` (`useGame`, `useProfile`, `useSocial`, `useQueue`, `useAppShell`). Shared components (`src/components/*`) remain prop-driven. Do not introduce app state inside screens or components.
- Do not let screens or AppShell become god components. If JSX regions, handlers, or derived state begin to sprawl, extract subcomponents, typed hooks, or pure helpers before adding more feature code.
- New shared UI primitives go in `src/components/`. New full screens go in `src/screens/` (and must be wired into AppShell's screen-panel switch and read state via the appropriate slice hooks from `src/contexts/`).
- When adding new shared AppShell state in App.tsx, add the corresponding key to `AppShellContextValue` in `src/AppShellContext.ts` and include it in the `appCtx` object literal in App.tsx. Prefer the dedicated Game/Profile/Social/Queue providers when the state belongs to one domain.
- Pure helpers belong in `src/utils.ts`. Static UI data (themes, presets, labels) belongs in `src/constants.ts`.

### Modularity & Maintainability
- Favor small, focused units with a single responsibility. New logic should usually land in the smallest appropriate module, not the biggest existing file.
- Keep functions narrow and intention-revealing. If one function is handling validation, transformation, orchestration, rendering decisions, and side effects, split it.
- Prefer composition over giant conditionals: lookup maps, config objects, helper functions, and small subcomponents are preferred to sprawling `if`/`switch` trees.
- If a change introduces a new concern, create or extend the proper file in `src/components/`, `src/screens/`, `src/contexts/`, `src/utils.ts`, `src/constants.ts`, or a focused server helper instead of inflating a catch-all module.
- Repeated UI must be extracted into shared prop-driven components; repeated business rules must be extracted into pure helpers.
- Refactors should reduce nesting, branch count, and mental overhead while preserving behavior.

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
- Keep route registration, validation, orchestration, and persistence separated. Extract focused helpers/services instead of growing massive inline handlers.
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
- Visual art ships from `public/generated/ui/` and `public/generated/cards/` as original generated SVG assets.
- No browser-default control styling in production UI — buttons, panels, and dividers use the project chrome.
- No emoji-driven production UI; use generated icons and labels instead.
- Buttons should use the generated button frames, panels should use `panel-frame.svg`, and section dividers should use `divider-rune.svg` where appropriate.
- Use semantic HTML elements where possible.
- New styles go in `App.css` in the appropriate section (see `06-styles.md`).
- Support `prefers-reduced-motion` for all new animations.

### Asset & Audio Rules
- All new visual assets go through `scripts/generate-brand-assets.mjs` and are registered in `public/generated/asset-manifest.json`.
- All generated assets must remain original, commercial-safe SVG output.
- Repeated visual surfaces should resolve through the semantic registry in `src/constants.ts` and shared primitives such as `src/components/AssetBadge.tsx`.
- All new sounds must remain synthesized in `src/audio.ts` via Web Audio API — do not add downloaded sound files.
- Interactive feedback should continue pairing sound cues with haptic feedback when the surrounding flow already supports it.

---

## 3 — Architecture

### File Roles

| File | Lines | Role | Edit Rules |
|------|-------|------|------------|
| `src/game.ts` | 1,410 | Game engine — single source of truth for all mechanics | Pure functions only. After edit: `npm run build:engine` |
| `src/App.tsx` | 2,800+ | `App` (provider tree: `<QueueProvider><ProfileProvider><SocialProvider><GameProvider><AppShell/></GameProvider></SocialProvider></ProfileProvider></QueueProvider>`) + `AppShell` (effects, handlers, refs, builds `AppShellContextValue`, provides via `<AppShellContext.Provider>`) | All AppShell-owned refs/handlers live in AppShell. Queue/Profile/Social/Game state live in their respective providers. Screens read all slices via hooks from `src/contexts/`. |
| `src/contexts/*.ts(x)` | 16–190 each | Real provider modules + typed slice hooks: `useGame`, `useProfile`, `useSocial`, `useQueue`, `useAppShell` + `GameProvider` + `ProfileProvider` + `SocialProvider` + `QueueProvider` | Screens import slice hooks. AppShell uses internal `useGameState()` / `useProfileState()` / `useSocialState()` / `useQueueState()` from providers for setters. |
| `src/AppShellContext.ts` | 200+ | Slim `AppShellContextValue` + `createContext` for auth/nav/toasts/admin and cross-provider handlers | Update when adding shared AppShell-only state |
| `src/types.ts` | 252 | UI-only TypeScript types | Add new UI types here |
| `src/constants.ts` | 284 | Static UI constants, theme offers, labels, and semantic asset registry | No functions — data only |
| `src/utils.ts` | 246 | Pure helper functions for asset lookup, transitions, completion, severity, and fan layout | No React, no app state |
| `src/screens/*.tsx` | 97–600 each | Presentational screens (Home, Play, Collection, Battle, Social, Shop, Settings) | Propless — read state via slice hooks from `src/contexts/` |
| `src/components/*.tsx` | 18–89 each | Shared UI primitives (modals, nav, overlays, asset badges) | Prop-driven only |
| `src/App.css` | 3,819 | All styles and motion systems | Add to correct section per `06-styles.md` |
| `src/audio.ts` | 160 | Sound synthesis | 17 sound types via Web Audio API |
| `server/server.js` | 2,321 | Express API + Socket.IO + matchmaking | Rate-limit all new endpoints |
| `server/db.js` | 1,993 | SQLite data layer | Parameterized queries only |
| `server/game-room.js` | 348 | Game room manager | Server-authoritative validation |
| `server/game.js` | — | Auto-generated | **NEVER edit directly** |

### Anti-Monolith Guardrails
- Before adding code to `src/App.tsx`, `server/server.js`, `server/db.js`, or `src/App.css`, first ask whether the work belongs in a smaller domain file.
- New client behavior should usually be split between provider state, AppShell orchestration, and presentational screens/components instead of being stacked into one place.
- New server behavior should prefer dedicated validation helpers, payload shapers, and database functions over long socket or route callbacks.
- If a diff adds another long conditional ladder, oversized JSX block, or multi-step handler that is hard to scan in one screenful, stop and extract.

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
