# Supporting Files Index

## Audio — `src/audio.ts` (160 lines)

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

## Entry point — `src/main.tsx` (55 lines)
- mounts the React 19 app under `#root`
- registers the service worker
- dispatches the update-available event used by the shell banner

## Base styles — `src/index.css` (33 lines)
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

> Latest verified suite status: 54 tests passing.

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
- `npm run release:check`

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

## Runtime data files

### `data/server-config.json`
Stores owner bootstrap and server setup state.

### `data/arena-admin-store.json`
Stores:
- MOTD and seasonal settings
- analytics totals and traffic buckets
- complaint tickets
- activity log and moderation state

