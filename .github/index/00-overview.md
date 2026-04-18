# Fractured Arcanum — Project Overview

## Tech Stack
- **Frontend:** React 19 + TypeScript 6 + Vite 8 single-page app
- **Backend:** Express 5 + Socket.IO 4 + better-sqlite3
- **Engine:** Pure functional game engine shared between client and server
- **Database:** SQLite with WAL mode and migration-safe startup
- **Deployment:** Docker and Render-ready Node 20 pipeline

## Current verified state
- provider-based architecture is fully in place
- 7 screens are live and context-driven
- local SVG asset pipeline is active and verified
- latest validation is green: tests, lint, build, and asset generation

## File Map

### Client core

| File | Lines | Role |
|------|-------|------|
| `src/App.tsx` | 2,905 | `App` provider tree + `AppShell` effects, handlers, screen wiring, and shared shell state |
| `src/AppShellContext.ts` | 222 | Slim shell context contract for auth, nav, toasts, admin, and cross-provider handlers |
| `src/contexts/*.ts(x)` | 16–190 each | Real provider modules and typed slice hooks for game, profile, social, queue, and shell access |
| `src/game.ts` | 1,410 | Single source of truth for cards, combat, AI, and pure game rules |
| `src/constants.ts` | 284 | Static UI data, theme offers, semantic asset registry, and labels |
| `src/utils.ts` | 246 | Pure helpers for auth, formatting, asset lookup, transitions, completion, and presentation tiers |
| `src/audio.ts` | 160 | Synthesized sound effects for UI, battle, and reward moments |
| `src/App.css` | 3,819 | Full visual system: backgrounds, chrome, transitions, battle styling, gamification, and responsive overrides |

### Screens

| File | Lines | Role |
|------|-------|------|
| `src/screens/HomeScreen.tsx` | 97 | Main menu, nav tiles, quest status, reward urgency, resume battle |
| `src/screens/PlayScreen.tsx` | 164 | Mode cards, queue portal, opponent found state, AI difficulty |
| `src/screens/CollectionScreen.tsx` | 308 | Deck forge, rarity filters, collection completion, breakdown entry |
| `src/screens/SocialScreen.tsx` | 428 | Guild command profile, leaderboard, friends, clan, trades |
| `src/screens/ShopScreen.tsx` | 302 | Reward vault, themes, borders, packs, reveal stage, breakdown |
| `src/screens/SettingsScreen.tsx` | 600 | Scribe-desk preferences, complaint desk, admin console |
| `src/screens/BattleScreen.tsx` | 376 | Arena HUD, enemy turn banner, frontline, summary, and hand-fan layout |

### Shared components

| File | Lines | Role |
|------|-------|------|
| `src/components/AssetBadge.tsx` | 66 | Shared rank, rarity, effect, stat, and pack visual primitives |
| `src/components/BattleIntroOverlay.tsx` | 34 | Cinematic VS splash before battle start |
| `src/components/RewardOverlay.tsx` | 89 | Post-match reward and streak summary overlay |
| `src/components/NavBar.tsx` | 32 | Bottom 6-tab nav using art-backed status styling |
| `src/components/TopBar.tsx` | 48 | Header shell with branding and device controls |
| `src/components/CardInspectModal.tsx` | 56 | Long-press card detail view |
| `src/components/ConfirmModal.tsx` | 61 | Shared confirmation modal |
| `src/components/ToastStack.tsx` | 18 | Toast queue renderer |

### Server and data

| File | Role |
|------|------|
| `server/server.js` | Express API, Socket.IO events, matchmaking, auth, admin endpoints |
| `server/db.js` | SQLite persistence, economy, social, complaints, admin data |
| `server/game-room.js` | Server-authoritative duel lifecycle and validation |
| `server/game.js` | Auto-generated engine output — never edit directly |
| `data/server-config.json` | Setup and owner configuration |
| `data/arena-admin-store.json` | Analytics, activity, complaints, MOTD, and ops state |

## Asset pipeline

| Location | Purpose |
|---------|---------|
| `scripts/generate-brand-assets.mjs` | Generates all shipped SVG brand, UI, and card art |
| `public/generated/ui` | 72 UI assets: backgrounds, tiles, ranks, packs, gems, chrome, overlays, particles |
| `public/generated/cards` | 90 generated card illustrations |
| `public/generated/asset-manifest.json` | 168-entry manifest for generated assets |

## Build and verification commands

| Command | Purpose |
|---------|---------|
| `npm run assets:generate` | Regenerate all SVG brand, UI, and card assets |
| `npm run build:engine` | Compile the shared engine into `server/game.js` |
| `npm test` | Run the Vitest suite |
| `npm run lint` | Run ESLint |
| `npm run build` | Full production build |
| `npm run release:check` | Combined pre-deploy validation |
| `npm run dev:full` | Local full-stack development flow |

## Architecture notes

- **Provider composition:** `QueueProvider` → `ProfileProvider` → `SocialProvider` → `GameProvider` → `AppShell`
- **Screens consume typed hooks:** `useGame`, `useProfile`, `useSocial`, `useQueue`, and `useAppShell`
- **All gameplay logic remains pure:** the UI never duplicates combat resolution logic
- **Battle and reward presentation are art-backed:** generated SVG chrome and shared badge components keep the visual direction replaceable later
- **Duel mode stays server-authoritative:** the server validates every duel action and broadcasts redacted state
