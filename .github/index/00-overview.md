# Fractured Arcanum — Project Overview

## Tech Stack
- **Frontend:** React 19 + TypeScript 6 + Vite 8 (SPA)
- **Backend:** Express 5 + Socket.IO 4 + better-sqlite3
- **Engine:** Pure functional game engine shared between client and server
- **Database:** SQLite with WAL mode
- **Deployment:** Docker (Node 20 Alpine, 2-stage build)

## File Map (~10,554 lines src/, plus server/)

### Client (`src/`)

| File | Lines | Role |
|------|-------|------|
| `src/App.tsx` | 2,800+ | `App` (provider tree) + `AppShell` (effects, handlers, refs, slim shared context, screen wiring) |
| `src/AppShellContext.ts` | 200+ | Slim shared AppShell context for auth, nav, toasts, admin, cross-provider handlers |
| `src/contexts/*.ts(x)` | 16–190 each | Real provider modules + typed slice hooks (`useGame`, `useProfile`, `useSocial`, `useQueue`, `useAppShell`) |
| `src/game.ts` | 1,410 | Game engine — types, cards, combat, AI |
| `src/types.ts` | 252 | UI-only TypeScript types (auth, social, admin, etc.) |
| `src/constants.ts` | 182 | UI constants — themes, borders, decks, presets, labels |
| `src/utils.ts` | 134 | Pure helpers — auth fetch, art paths, format, fingerprint |
| `src/audio.ts` | 160 | Synthesized sound effects (17 types) |
| `src/main.tsx` | 55 | React root + service worker registration |
| `src/index.css` | 33 | Base CSS reset + root tokens |
| `src/App.css` | 2,785 | All styles — themes, animations, responsive, per-screen backdrops |
| `src/game.test.ts` | 205 | Game engine tests (15 cases) |

### Client — Screens (`src/screens/`)

| File | Lines | Role |
|------|-------|------|
| `src/screens/HomeScreen.tsx` | 80 | Main menu — welcome, resume banner, 5 nav tiles, daily quests |
| `src/screens/PlayScreen.tsx` | 141 | Mode select, AI difficulty, start match, queue, opponent preview |
| `src/screens/SocialScreen.tsx` | 382 | Profile, leaderboard, friends, clan, trades |
| `src/screens/CollectionScreen.tsx` | 282 | Deck builder, saved decks, filters, mana curve |
| `src/screens/BattleScreen.tsx` | 346 | Battle topbar, battlefield, hand, summary (consolidated) |
| `src/screens/ShopScreen.tsx` | 288 | Rewards, themes, borders, packs, breakdown |
| `src/screens/SettingsScreen.tsx` | 554 | Privacy, complaints, admin console, audit log |

### Client — Shared Components (`src/components/`)

| File | Lines | Role |
|------|-------|------|
| `src/components/RewardOverlay.tsx` | 66 | Post-battle reward modal |
| `src/components/ConfirmModal.tsx` | 61 | Generic confirm dialog (text input optional) |
| `src/components/CardInspectModal.tsx` | 55 | Long-press card detail view |
| `src/components/NavBar.tsx` | 49 | Bottom 6-tab nav (Home, Play, Collection, Social, Shop, Settings) |
| `src/components/TopBar.tsx` | 48 | Header (logo, title, sound, install, logout) |
| `src/components/BattleIntroOverlay.tsx` | 23 | "Battle starting" splash |
| `src/components/ToastStack.tsx` | 18 | Stacked toast notifications |

### Server (`server/`)

| File | Lines | Role |
|------|-------|------|
| `server/server.js` | 2,321 | Express API + Socket.IO + matchmaking |
| `server/db.js` | 1,993 | SQLite data layer — accounts, economy, social |
| `server/game-room.js` | 348 | Server-authoritative game room manager |
| `server/db.test.js` | 407 | Database tests (30 cases) |
| `server/game.js` | — | Auto-generated from game.ts (DO NOT EDIT) |

## Data Files

| File | Purpose |
|------|---------|
| `data/server-config.json` | Admin key, setup state |
| `data/arena-admin-store.json` | Analytics, visitors, MOTD, complaints |

## Build & Deploy

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (frontend only) |
| `npm run server` | Build engine + start Express/Socket.IO |
| `npm run dev:full` | Build engine + server + Vite concurrently |
| `npm run build:engine` | Compile `src/game.ts` → `server/game.js` |
| `npm run build` | Full production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest suite (45 tests) |
| `npm run release:check` | Test + lint + build (pre-deploy) |

## Architecture Notes

- **Screens consume typed slice hooks.** All app state and handlers live in `AppShell` inside `App.tsx`, which constructs an `AppContextValue` and provides it via `<AppContext.Provider>` wrapping the entire UI tree. Screens import the appropriate slice hook from `src/contexts/` (`useGame`, `useProfile`, `useSocial`, `useQueue`, `useAppShell`); small components remain prop-driven for clarity. The legacy `useApp()` hook remains as the implementation backing the slice hooks until Phase 1C–1F lifts each slice into a real provider.
- **Game engine is pure.** All functions in `src/game.ts` take state and return new state — no mutation, no side effects. Shared between client (TypeScript source) and server (compiled `server/game.js`).
- **5-screen architecture.** `type AppScreen = 'home' | 'deck' | 'battle' | 'vault' | 'ops'`. Screens are CSS-toggled (`screen-panel.active` vs `.hidden`) so they all stay mounted but only one is visible.
- **Multiplayer.** AI mode runs the engine in-browser. Duel mode (`battleKind = 'ranked'`) is server-authoritative — clients emit `game:action`, server validates, broadcasts redacted `game:state`.
