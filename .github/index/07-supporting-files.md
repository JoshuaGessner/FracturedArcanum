# Supporting Files Index

## Audio — `src/audio.ts`

### Exported sound set
`src/audio.ts` exposes a `SoundName` union with 17 synthesized cues:

- `tap`
- `summon`
- `attack`
- `burst`
- `match`
- `win`
- `lose`
- `navigate`
- `packOpen`
- `cardReveal`
- `legendaryReveal`
- `rankUp`
- `questComplete`
- `error`
- `challenge`
- `trade`
- `countdown`

All playback routes through `playSound(name, enabled)` and uses Web Audio API oscillators only — no downloaded sound files.

## Entry point — `src/main.tsx`
- mounts the React 19 app under `#root`
- registers the service worker
- dispatches the update-available event used by the shell banner

## Base styles — `src/index.css`
- root typography and background setup
- touch-friendly defaults
- font rendering and selection polish

## Test suites

The current validation stack covers gameplay, database, and pure UI helper regressions.

### `src/game.test.ts`
Covers:
- match creation and turn flow
- momentum burst and combat rules
- AI match generation and difficulty behavior
- card-effect regressions for major keyword interactions

### `src/utils.test.ts`
Covers:
- semantic asset lookup helpers
- screen transition class mapping
- collection completion math
- complaint severity tone mapping
- streak tier rules
- hand-fan tilt calculations

### `server/db.test.js`
Covers:
- owner/admin role safety
- friendship and trade validation
- match result handling
- deck CRUD and breakdown protection
- card border and cosmetic ownership
- legacy startup and migration regressions

### `server/no-emoji.test.js`
Fails if a pictographic character appears in any card or in shipped source
under `src/` or `server/` (tests excluded). The game draws its own glyphs.

### `server/ui-assets.test.js`
Fails if any path registered in `UI_ASSETS` is missing from `public/`, or any
keyword in `EFFECT_LABELS` or the card library lacks a seal.

### `server/sqlite-snapshot.test.js`
Covers the updater's database snapshot: a live WAL database copies into one
self-contained, integrity-checked file, and a missing database exits non-zero.

### `server/db-migration-safety.test.js`
Runs `openDatabase()` against a copy of a real database to prove startup
migrations stay re-runnable and additive.

> Latest verified suite status: 46 files, 539 tests passing.

## Build configuration

### `vite.config.ts`
- React plugin
- development proxy for `/api` and `/socket.io`

### `tsconfig.engine.json`
- compiles only `src/game.ts`
- outputs the shared engine bundle into `server/game.js`

### `eslint.config.js`
- flat ESLint config
- TypeScript, React Hooks, and refresh rules

### `package.json`
Key scripts include:
- `npm run dev`
- `npm run dev:full`
- `npm run server`
- `npm run assets:generate`
- `npm run build:engine`
- `npm run build`
- `npm run lint`
- `npm test`
- `npm run qa:viewport`
- `npm run release:check`

## Layout QA

### `scripts/verify-responsive-layout.mjs`
- starts a temporary Vite server unless `QA_URL` points at an existing app instance
- uses `playwright-core` with a local Chromium/Chrome executable
- checks Home, Play, Collection, Social, Shop, Settings, Social/Shop/Settings subviews, and AI battle when available
- sweeps phone, tablet, narrow desktop, short desktop, and wide desktop viewport sizes
- writes screenshots and `responsive-layout-report.json` to `.layout-qa/`
- fails on horizontal document overflow, clipped visible content, or offscreen interactive controls; touch-target issues are reported as warnings

All four QA tools share `scripts/lib/qa-app.mjs`. If the server has not
finished first-launch setup it serves the setup screen instead of the app;
the harness checks `/api/setup/status` and stops with that explanation rather
than timing out on every state.

## Deployment

### `Dockerfile`
- multi-stage Node 20 Alpine build
- generates assets and production bundles during the build stage
- ships only runtime dependencies, server files, public assets, and built client output

### `docker-compose.yml`
- single-service deployment
- persistent mount for `/app/data`
- restart-friendly local hosting setup

### `render.yaml`
- Render deployment configuration for remote hosting

### `scripts/update.sh` (`npm run update:server`)
- resolves the data directory the server really uses (`DATA_DIR` in the shell,
  the systemd unit, the PM2 process, `.env`, then `./data`) and logs it
- pauses the managed service, then writes `backups/update-<timestamp>/`: repo
  snapshot, `local-data.tar.gz`, `external-data.tar.gz` for a `DATA_DIR`
  outside the repo, the Docker volume, `.env`, and `metadata.txt`
- copies the database with `scripts/sqlite-snapshot.cjs` (SQLite online
  backup, integrity-checked, single file) and aborts before any code change if
  that fails
- fast-forward-only pull, `npm ci` + build or `docker compose build`, restart,
  health check; on failure restarts the paused service and names the backup

### `scripts/restore-backup.sh` (`npm run restore:server`)
- moves the current data directory and `.env` aside as `*.pre-restore-<ts>`
  rather than deleting them
- restores `external-data.tar.gz` to the `data_dir` recorded in metadata, then
  installs the integrity-checked database snapshot
- restoring code never touches `node_modules/`, `dist/` or the data directory

## Runtime data files

### `data/server-config.json`
Stores owner bootstrap and server setup state.

### `data/arena-admin-store.json`
Stores:
- MOTD and seasonal settings
- analytics totals and traffic buckets
- complaint tickets
- activity log and moderation state

