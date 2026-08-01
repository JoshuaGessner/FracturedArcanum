# Fractured Arcanum — Agent Instructions

> **Canonical agent guidance for this repository.** `.github/copilot-instructions.md`
> points here; edit this file, not that one, so the rules stay in one place.

---

## 1 — Orientation

Read the code index in `.github/index/` before writing or modifying code, to
locate the right file and function. For visual, UX, or battle-presentation work,
read `.github/REFACTOR_PLAN.md` first so changes stay aligned with the
scene-first direction.

| Index File | Covers |
|------------|--------|
| `00-overview.md` | Tech stack, file map, build commands |
| `01-game-engine.md` | `src/game.ts` — types, cards, combat, AI, effects |
| `02-client-ui.md` | `src/App.tsx` — state, handlers, screens, sockets |
| `03-server-api.md` | `server/server.js` — routes, middleware, socket handlers |
| `04-database.md` | `server/db/` — tables, queries, economy, social |
| `05-game-room.md` | `server/game-room.js` — room lifecycle, action validation |
| `06-styles.md` | `src/App.css` — section map, animations, breakpoints |
| `07-supporting-files.md` | audio, tests, configs, deployment |
| `08-assets.md` | generated SVG asset pipeline |

**The index is a map, not an authority on detail.** It lags the code. Use it to
find the right file, then read the source to confirm signatures and behaviour.
Never quote a line number or signature from the index without checking it.

### Game design documentation

Consult `docs/` before adding, modifying, or balancing game content — cards,
effects, keywords, tribes, economy values, collectibles, or cosmetic pricing.

| Design Document | Covers |
|-----------------|--------|
| `docs/GAME_DESIGN_BIBLE.md` | Vision, mechanics, card taxonomy, tribes, keywords, collectible registry, procedure for adding content |
| `docs/CARD_BALANCE_FRAMEWORK.md` | Stat formula, keyword tax table, rarity power curves, mana curve targets, balance audit checklist, seasonal schedule |
| `docs/ECONOMY_BALANCE.md` | Earning rates, pack value math, progression timeline, tuning levers, health metrics |
| `docs/CARD_CATALOG.md` | Card-by-card reference with stats, balance deltas, distributions, flagged outliers |
| `docs/monetization-plan.md` | Paid offerings, cosmetic pricing, fairness covenant |
| `docs/ACCOUNT_OPERATIONS.md` | Account lifecycle, support operations |
| `docs/deployment-permissions.md` | Deploy and server-update permissions |
| `docs/release-checklist.md` | Pre-release verification |
| `docs/layout-qa.md` | The four layout-QA tools, their invariants, and the traps they encode |

**Game content workflow:** Design Bible → Balance Framework → implement in
`src/game.ts` → update Card Catalog → verify economy impact → test → build.
Every new card must pass the balance audit checklist before merging.

---

## 2 — Mandatory coding standards

### Zero-tolerance rules
1. **No placeholders.** Never emit `// TODO`, `/* implement later */`, `...`, or
   stub functions. Every line must be complete and production-ready.
2. **No fallback shortcuts.** No hardcoded mock data, no skipped error paths, no
   empty conditional branches.
3. **No partial implementations.** If a feature touches engine + server + client,
   implement all parts in the same pass.
4. **Test every change.** Run `npm test` and `npm run lint`. Fix all failures.
   Add test cases for new behaviour.
5. **Build verification.** After modifying `src/game.ts`, run
   `npm run build:engine` to regenerate `server/game.js`. After any change,
   `npm run build` must succeed.
6. **No monolithic growth.** Do not pile unrelated logic into already-large
   files. Extract helpers, components, hooks, providers, or server modules in
   the same pass.
7. **Refactor before extending crowded files.** `src/App.tsx` and
   `server/server.js` are the remaining hotspots — find the seam instead of
   adding another long branch. `src/App.css` (24 modules under `src/styles/`)
   and `server/db.js` (nine modules under `server/db/`) are already split;
   extend those in the module that owns the surface.

### TypeScript
- Strict mode. No `any` unless interfacing with untyped libraries.
- Prefer `type` over `interface`.
- Explicit return types on exported functions.
- No enums; use union string literals (`type BattleSide = 'player' | 'enemy'`).
- Game types go in `src/game.ts`; UI-only types in `src/types.ts`.

### React
- Functional components and hooks only.
- Avoid `useEffect` for derived state — compute inline.
- Prefix event handlers with `handle`.
- Sound and haptic feedback belong in handlers, not effects.
- App-level state, effects, and handlers live in `AppShell` inside `src/App.tsx`
  (the outer `App` is a thin provider wrapper). Screens consume state via the
  typed slice hooks in `src/contexts/` (`useGame`, `useProfile`, `useSocial`,
  `useQueue`, `useAppShell`). Shared components stay prop-driven. Do not
  introduce app state inside screens or components.
- New shared UI primitives go in `src/components/`; new full screens in
  `src/screens/`, wired into AppShell's screen-panel switch.
- When adding shared AppShell state, add the key to `AppShellContextValue` in
  `src/AppShellContext.ts` and to the `appCtx` literal in App.tsx. Prefer the
  Game/Profile/Social/Queue providers when the state belongs to one domain.
- Pure helpers go in `src/utils.ts`. Static UI data in `src/constants.ts`.

### Modularity
- Small, focused units with a single responsibility.
- Split functions that mix validation, transformation, orchestration, rendering
  decisions, and side effects.
- Prefer lookup maps, config objects, and subcomponents over sprawling
  `if`/`switch` trees.
- Repeated UI becomes a shared prop-driven component; repeated business rules
  become pure helpers.

### Game engine
- All game functions are pure: `(state, ...args) => newState`. Never mutate.
- Card effects resolve in `playCard()` via the card's `effect` field and
  `CARD_PARAMS`.
- Board size is fixed at 3 lanes (`BOARD_SIZE = 3`).
- `passTurn()` handles end-of-turn plus start-of-next-turn (mana, draw,
  readiness).
- Edit `src/game.ts`, then rebuild with `npm run build:engine`.
- New cards must pass the balance audit checklist in
  `docs/CARD_BALANCE_FRAMEWORK.md`.
- Economy constant changes require recalculating progression timelines in
  `docs/ECONOMY_BALANCE.md`. Matches are ~5 minutes — estimate in
  matches/sessions, not hours/days.

### Server
- Validate all inputs at the boundary (API routes and socket handlers).
- Never trust client-reported results for duel mode — the server resolves
  outcomes.
- Rate-limit all socket events and API endpoints.
- Parameterized queries only (SQLite).
- Session tokens are cryptographic random hex; passwords use scrypt.
- New API routes require rate limiting and `requireAuth()` or stricter.
- Keep route registration, validation, orchestration, and persistence separate.

### Security
- Helmet CSP on all responses; CORS restricted to configured origins.
- Rate limiting everywhere (120 req/min default, stricter for auth).
- No secrets in client code or git history.
- Server validates every game action: turn ownership, mana cost, board state,
  card existence.
- Timing-safe comparison for passwords and keys.

### CSS and style
- Mobile-first. Test at 375px width minimum.
- CSS custom properties for theming (`:root` in `App.css`). Prefer the design
  tokens (`--space-*`, `--radius-*`, `--font-*`) over magic numbers.
- Visual art ships from `public/generated/ui/` and `public/generated/cards/` as
  original generated SVG.
- No browser-default control styling; no emoji-driven production UI.
- Support `prefers-reduced-motion` for all new animations.
- **Section nav strips** (Shop, Social, Settings, future screens): buttons use
  `border-radius: var(--radius-sm)` (never a pill), the dark gradient
  background, `font-weight: 800`, `text-transform: uppercase`. Active state uses
  the amber/blue gradient with `color: #fff7d6`. Selectors live in the shared
  block covering `.settings-nav-strip button`, `.social-nav-strip button`,
  `.shop-nav-strip button`, `.settings-admin-nav button`.
- Dense screens use a hub-plus-subview pattern, not one long vertical stack.
  Frequent actions stay on the first view; admin, clan, leaderboard, vault, and
  breakdown tools live one tap deeper with clear Back navigation.
- No browser `prompt`/`confirm` in production UX — reuse the in-app modal.
- Battle layouts must keep HUD, board, and hand separated at phone sizes.
- **One reachable scroll owner per non-battle screen.** Avoid inner
  `max-height` + `overflow` scroll traps unless the element is a deliberate
  contained rail or list.
- Scene-first hierarchy is mandatory: one dominant focal plane per screen; in
  battle that is the board.
- Temporary battle notices float above the arena and never push layout down.
- Cards in hand and on the board expose effect seals without inspect-first play.
- Recap, reward, and conclusion states reuse the shared summary-popup pattern.

#### Layout traps this codebase has actually hit
Read these before touching layout CSS — each cost real debugging time:
- **`justify-self` does nothing on a flex item.** The scene-fill rule overrides
  `.home-screen`'s grid with `display: flex`, so a child using
  `justify-self: center` pins left instead. Use `margin-inline: auto`, which
  works under flex, grid, and block alike.
- **`--app-h`, not `100vh`/`100dvh`/`100svh`.** `src/hooks/useViewportMetrics.ts`
  publishes the real visible height from `visualViewport`. The CSS units are
  each wrong in a different way on mobile.
- **`position: fixed` inside the shell.** `.app-shell` is itself fixed; overlays
  are portalled to `<body>` (see `BattleLaunchSheet`), not nested in the shell.
- **Safari reports `safe-area-inset-bottom: 0`** whenever the toolbar is hidden,
  which is exactly when the nav bar needs the padding. Use
  `max(var(--safe-bottom), …)`.
- **`flex: 1 1 auto` with `min-height: 0` silently crushes content.** The pair
  reads as "fill surplus height", but the `1` shrink factor plus a zeroed
  min-height also lets the item shrink *below its own content* on a short
  screen. Whatever is inside with `overflow: hidden` then eats the difference
  with no scrollbar and no ellipsis, and — worse — the screen panel's
  `overflow-y: auto` never sees content taller than its box, so nothing
  scrolls and the clipped content is unreachable.

  This produced every layout failure in the device matrix at once: the home
  hub crushed its quest board to 93px around 342px of content, hiding the
  "Open Rewards Ledger" button entirely; the shop hub's panel grid was squeezed
  to 31px around 224px, clipping a line of text from every panel.

  Use **`flex: 1 0 auto` with `min-height: auto`** to fill surplus without ever
  shrinking below content. Only use the shrinking form when the element is a
  deliberate contained rail that owns its own scroller — as
  `.home-view-quests` does with `.quest-ledger-panel` inside it.

### Assets and audio
- New visual assets go through `scripts/generate-brand-assets.mjs` and are
  registered in `public/generated/asset-manifest.json`.
- All generated assets stay original and commercial-safe SVG.
- Repeated visual surfaces resolve through the semantic registry in
  `src/constants.ts` and shared primitives like `src/components/AssetBadge.tsx`.
- New sounds stay synthesized in `src/audio.ts` via Web Audio — no audio files.
- Pair sound cues with haptics where the surrounding flow already does.

---

## 3 — Architecture

### Client

| Path | Role | Edit rules |
|------|------|-----------|
| `src/game.ts` | Game engine — single source of truth for mechanics | Pure functions only. After edit: `npm run build:engine` |
| `src/App.tsx` | `App` (provider tree) + `AppShell` (effects, handlers, refs, builds `AppShellContextValue`) | AppShell-owned refs/handlers live here; domain state lives in providers |
| `src/contexts/` | Providers + typed slice hooks: `useGame`, `useProfile`, `useSocial`, `useQueue`, `useAppShell`, plus `AccountProvider` for identity | Screens import slice hooks; AppShell and the domain hooks use the internal `use*State()` hooks |
| `src/AppShellContext.ts` | `AppShellContextValue` + context for auth/nav/toasts/admin | Update when adding shared AppShell-only state |
| `src/screens/` | Presentational screens: Home, Collection, Battle, Social, Shop, Settings | Propless — read state via slice hooks |
| `src/components/` | Shared UI primitives (modals, nav, overlays, badges, ceremonies) | Prop-driven only |
| `src/hooks/` | `useViewportMetrics`, `useSceneSwipe` (reusable behaviour) plus AppShell domain hooks: `useAccountActions`, `useAdminConsole`, `useSocialActions` | Domain hooks own their own state or read a provider directly — do not pass setters in |
| `src/utils/` | `layoutScaling`, `sceneSwipe` — pure, unit-tested helpers | No React |
| `src/types.ts` | UI-only types | |
| `src/constants.ts` | Static UI constants, theme offers, labels, semantic asset registry | Data only, no functions |
| `src/utils.ts` | Pure helpers (asset lookup, transitions, completion, severity, fan layout) | No React, no app state |
| `src/App.css` | Ordered index of `src/styles/*.css` — imports only | **Import order is load-bearing**; add a module where its cascade requires |
| `src/styles/` | 24 stylesheet modules, each a contiguous slice of the original single file | Edit the module that owns the surface; never reorder the index |
| `src/audio.ts` | Web Audio synthesis | |
| `src/ambient.ts` | Ambient scene audio/visual bed | |
| `src/feedback.ts` | Sound + haptic pairing | |
| `src/quests.ts` | Client-side quest presentation helpers | |
| `src/pwa.ts` | Service worker / install lifecycle | |

There is **no `PlayScreen`.** The Play destination was absorbed into the Home
hub as `BattleLaunchSheet`, and Settings moved into the top-bar account menu.
The bottom nav has four destinations: Home, Cards, Shop, Social.

### Server

| Path | Role | Edit rules |
|------|------|-----------|
| `server/server.js` | Bootstrap: middleware, auth middleware, first-launch setup, socket connection handler, route registration | Rate-limit all new endpoints |
| `server/realtime.js` | Presence, friend challenges, matchmaking queue, reapers. A factory — `createRealtime({ io })` | State is closure-owned; mutate the queue only through `enqueueWaitingPlayer` |
| `server/admin-store.js` | Admin store, analytics, live-service settings. Owns its own save debounce | Shutdown calls `flushAdminStore()`; never reach for the timer |
| `server/routes/*.js` | API routes by domain: account, profile, shop, trading, admin | `register*(app, ctx)`; shared helpers arrive via `ctx`, never imported back from server.js |
| `server/db.js` | Re-export barrel over `server/db/*.js` | Add queries to the domain module, not here |
| `server/db/connection.js` | Connection, schema, migrations, lazy `prepare()` | `openDatabase()` must stay re-runnable and additive |
| `server/db/*.js` | Domain modules: crypto, accounts, profiles, economy, matches, social, admin, account-export | Parameterized queries only; keep the graph acyclic |
| `server/game-room.js` | Room lifecycle, server-authoritative validation | |
| `server/passkey-service.js` | WebAuthn registration and assertion | |
| `server/quest-definitions.js` | Quest catalogue | |
| `server/quest-chains.js` | Multi-step quest progression | |
| `server/game.js` | Auto-generated from `src/game.ts` | **Never edit directly** |

> File sizes drift constantly and are deliberately not listed here. Run
> `wc -l <file>` if you need the current size. An instructions file that quotes
> stale numbers teaches agents to trust stale numbers.

### Anti-monolith guardrails
- Before adding to `src/App.tsx` or `server/server.js`, ask whether the work
  belongs in a smaller domain file. For `server/db/*` and `src/styles/*`, add to
  the module that owns the table or the surface.
- **Keep `server/db/` acyclic.** Boundaries were chosen from the reference
  graph, not taste. If a new query needs two domains, that is usually a sign it
  belongs in a third module above both — as `account-export.js` does.
- **`openDatabase()` must stay re-runnable and additive.** Startup applies the
  schema against live player data, so every CREATE stays `IF NOT EXISTS`,
  columns are added only when missing, and backfills may only fill a blank.
  `server/db-migration-safety.test.js` enforces this against a copy of the real
  database; do not weaken it.
- Statements use the lazy `prepare()` / `transaction()` helpers in
  `connection.js`, never `db.prepare` at module scope — the latter pins the
  connection and breaks reopen.
- New client behaviour splits between provider state, AppShell orchestration,
  and presentational screens.
- **Pull a cluster out of AppShell only when it needs few inputs.** Score a
  candidate by how many identifiers it would take as parameters, not by how
  many lines it would remove. `useAdminConsole` (506 lines) and
  `useSocialActions` (325 lines) each needed under 15 because they own their
  state or read a provider directly.
- **If the count is high, move the state first.** The account block measured
  **66** parameters with its state inline — `authToken` alone had 109
  references. Giving it `AccountProvider` dropped the same measurement to 26,
  and the finished `useAccountActions` takes 9. Extraction was never the hard
  part; ownership was.
- New server behaviour prefers dedicated validation helpers, payload shapers,
  and database functions over long route callbacks. A new endpoint goes in the
  `server/routes/*.js` module that owns its domain.
- **Anything reassigned at runtime is read through `ctx`, never destructured.**
  `ADMIN_KEY` is regenerated by first-launch setup; a destructured copy would
  freeze the pre-setup value in every admin route. Same rule as the database's
  live `db` binding. Sockets and setup stay in server.js because they own
  mutable state (`waitingPlayers`, `_saveTimer`, `setupComplete`) — give that
  state an owner before moving it.
- If a diff adds another long conditional ladder, oversized JSX block, or
  multi-step handler that cannot be scanned in one screenful, stop and extract.

### Multiplayer protocol
- **AI mode:** client runs the engine locally; `generateEnemyTurnSteps()`
  produces animated AI turns.
- **Duel mode:** server-authoritative. Client emits `game:action` → server
  validates via `game-room.js` → server broadcasts redacted `game:state`.
- `redactGameState(state, forSide)` remaps perspective so UI code is identical
  in both modes.
- Socket.IO auth middleware validates the session token on handshake.
- **A match outlives the tab.** It survives reload and a new browser context.
  "Leave" on the battle screen *pauses* and returns to the lobby
  (`handleLeaveBattle`); only Home's **Abandon** button ends it
  (`handleAbandonBattle`, which surrenders to the server). Any automation that
  starts a match must abandon it, or the next run resumes into it.

---

## 4 — Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (frontend only) |
| `npm run server` | Build engine + start Express/Socket.IO |
| `npm run dev:full` | Engine + server + Vite concurrently |
| `npm run build:engine` | Compile `src/game.ts` → `server/game.js` |
| `npm run build` | Full production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest suite |
| `npm run release:check` | Test + lint + build |

### Layout QA

Four tools, in increasing cost. Pick the cheapest that answers the question.

| Command | Use when |
|---------|----------|
| `npm run qa:probe` | **The fix/verify loop.** Targeted layout invariants with CSS rule attribution. ~1s per state, filterable. |
| `npm run qa:snap` / `qa:snap:check` | **Before and after broad restyling.** Visual baselines; reports percent-changed per state and writes diff images. |
| `npm run qa:tokens` | **Design-system drift.** Static audit of literal values that have an exact token equivalent. No browser; milliseconds. |
| `npm run qa:viewport` | **Pre-release sweep.** The full device matrix with screenshots. Slow — not for iteration. |

```bash
npm run qa:probe                                       # desktop sweep
npm run qa:probe -- --vp=desktop-1440x900 --state=home # one state
npm run qa:probe -- --only=wheel --state=quests        # one check
npm run qa:probe -- --all-viewports                    # 56 states
npm run qa:snap -- --all-viewports                     # record baselines
npm run qa:snap:check                                  # diff vs baselines
npm run qa:viewport -- --vp=iphone-15-393x852          # one device
npm run qa:viewport -- --route=shop,social             # one or more routes
```

All four tools share `scripts/lib/qa-app.mjs` for server boot and sign-in.
Do not add a second copy of that flow to a new script — the last duplicate
silently kept pointing at an account that no longer exists.

`qa:probe` checks three invariant families and, on failure, names the CSS
declaration responsible plus the resolved value of any custom property it
depends on:
- **centering** — landmark centre alignment, and elements that *declare*
  centring intent but sit off-centre.
- **overlay** — overlays escaping the visible viewport, actions the player
  cannot reach, content clipped in a non-scrolling overlay.
- **wheel** — dispatches a real wheel event and asserts `scrollTop` moved.
  Distinguishes "covered by another element" from "ignores the wheel", because
  those have completely different fixes.

Shared definitions live in `scripts/lib/appStates.mjs` (viewports, states,
navigation) so both tools stay in sync. Add a new screen there once and both
pick it up. The QA account is `uxqa`; the harness never calls the login endpoint
(no password configured) and mints a session directly, so repeated runs cannot
touch `failed_login_count`.

---

## 5 — Conventions

- Card IDs: kebab-case (`spark-imp`, `drakarion-the-eternal`)
- Socket events: colon namespaces (`game:action`, `queue:join`)
- Database tables: snake_case (`player_profiles`, `match_log`)
- Game constants: defined in `src/game.ts`, imported where needed
- Keep the design original — no copyrighted assets, names, or mechanics

---

## 6 — Pre-commit checklist

- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] No placeholders, TODOs, stubs, or incomplete branches
- [ ] If `src/game.ts` changed: `npm run build:engine` was run
- [ ] If new server routes: rate limiting and auth middleware present
- [ ] If new UI: works at 375px width
- [ ] If layout CSS changed: `npm run qa:probe` passes (and
      `npm run qa:snap:check` for broad restyling)
- [ ] If new animations: respects `prefers-reduced-motion`
