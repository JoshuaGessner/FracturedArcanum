# Fractured Arcanum — Project Overview

## Tech Stack
- **Frontend:** React 19 + TypeScript 6 + Vite 8 single-page app
- **Backend:** Express 5 + Socket.IO 4 + better-sqlite3
- **Engine:** Pure functional game engine shared between client and server
- **Database:** SQLite with WAL mode and migration-safe startup
- **Deployment:** Docker and Render-ready Node 20 pipeline

## Current verified state
- 7 player-facing screens are live and context-driven
- the scene shell, reward cinema, pack ceremony, onboarding, swipe gestures, and reconnect recovery are all landed
- the active visual direction is the unified scene-first plan tracked in `.github/REFACTOR_PLAN.md`
- current battle alignment priorities include mirrored hero anchors, floating transient battle notices, visible live-card effect seals, and shared summary popup styling
- local SVG asset generation is verified with a 173-entry manifest
- the latest validation is green: 130 tests, lint, and production build

## File Map

### Client core

| File | Lines | Role |
|------|------:|------|
| `src/App.tsx` | 3,156 | Provider composition plus the `AppShell` orchestration layer, shared effects, screen routing, and live-service recovery |
| `src/AppShellContext.ts` | 244 | Slim shell contract for auth, nav, toasts, reward cinema, onboarding, and cross-provider handlers |
| `src/contexts/*.ts(x)` | 16–190 each | Real provider modules and typed slice hooks for game, profile, social, queue, and shell access |
| `src/game.ts` | 1,410 | Single source of truth for cards, combat, AI, and pure game rules |
| `src/constants.ts` | 284 | Static UI data, theme offers, semantic asset registry, and labels |
| `src/utils.ts` | 277 | Pure helpers for asset lookup, transitions, completion, streak tiers, and scene navigation |
| `src/audio.ts` | 338 | Synthesized sound effects for UI, battle, transitions, packs, and reward moments |
| `src/App.css` | 5,440 | The full visual system: scene shell, chrome, transitions, battle styling, ceremonies, and responsive overrides |

### Screens

| File | Lines | Role |
|------|------:|------|
| `src/screens/HomeScreen.tsx` | 119 | Main menu, season framing, quest urgency, streak badge, and scene navigation tiles |
| `src/screens/PlayScreen.tsx` | 140 | Mode cards, queue portal, opponent found state, and main battle CTA |
| `src/screens/CollectionScreen.tsx` | 329 | Deck forge, rarity filters, collection progress, and breakdown flow |
| `src/screens/SocialScreen.tsx` | 391 | Profile hero, leaderboard, friends, clan, and trade surfaces |
| `src/screens/ShopScreen.tsx` | 321 | Reward vault, themes, borders, pack offers, and reveal summary |
| `src/screens/SettingsScreen.tsx` | 565 | Preference toggles, complaint desk, and role-gated admin console |
| `src/screens/BattleScreen.tsx` | 780 | Slim duel ribbon, board-first arena, drag-to-play, attack telegraph, and hand fan |

### Shared components

| File | Lines | Role |
|------|------:|------|
| `src/components/AssetBadge.tsx` | 66 | Shared rank, rarity, effect, stat, and pack visual primitives |
| `src/components/BattleIntroOverlay.tsx` | 34 | Cinematic VS splash before battle start |
| `src/components/RewardCinemaOverlay.tsx` | 238 | Unified reward presentation for battle, daily, pack, and rank-up beats |
| `src/components/PackCeremonyOverlay.tsx` | 303 | Full pack-opening ceremony overlay with reveal flow |
| `src/components/OnboardingTour.tsx` | 303 | First-launch spotlight tour and replayable guidance flow |
| `src/components/NavBar.tsx` | 33 | Bottom 6-tab nav using asset-backed status styling |
| `src/components/TopBar.tsx` | 48 | Header shell with branding and device controls |
| `src/components/CardInspectModal.tsx` | 62 | Long-press card detail view |
| `src/components/ConfirmModal.tsx` | 79 | Shared confirmation modal |
| `src/components/ToastStack.tsx` | 22 | Toast queue renderer |

### Server and data

| File | Role |
|------|------|
| `server/server.js` | Express API, Socket.IO events, matchmaking, auth, social, admin endpoints, and reconnect recovery |
| `server/db.js` | SQLite persistence, economy, social, complaints, and admin data |
| `server/game-room.js` | Server-authoritative duel lifecycle, validation, and reconnect grace handling |
| `server/game.js` | Auto-generated engine output — never edit directly |
| `data/server-config.json` | Setup, owner, and season metadata |
| `data/arena-admin-store.json` | Analytics, activity, complaints, MOTD, and ops state |

## Asset pipeline

| Location | Purpose |
|---------|---------|
| `scripts/generate-brand-assets.mjs` | Generates all shipped SVG brand, UI, and card art |
| `public/generated/ui` | 77 UI assets: backgrounds, tiles, ranks, packs, gems, chrome, overlays, particles, and ceremony support art |
| `public/generated/cards` | 90 generated card illustrations |
| `public/generated/asset-manifest.json` | 173-entry manifest for generated assets |

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
- **Battle and reward presentation are asset-backed:** generated SVG chrome and shared badge components keep the visual direction replaceable later
- **Duel mode stays server-authoritative:** the server validates every duel action and broadcasts redacted state
