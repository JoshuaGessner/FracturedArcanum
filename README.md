# Fractured Arcanum

A mobile-first cosmic-horror card battler built with React, TypeScript, and Vite. Build a deck from 70 unique cards, then battle AI opponents or real players in ranked lane-based combat.

## Features

- **70 cards** across Common, Rare, Epic, and Legendary rarities with 21 unique effects (Guard, Charge, Blast, Lifesteal, Cleave, Silence, Frostbite, and more)
- **Three-lane battlefield** — play units into lanes, attack enemy units or the opposing hero
- **Card pack system** — Basic, Premium, and Legendary packs with duplicate protection
- **Deck builder** with presets (Balanced, Aggro, Control, Tempo) and rarity-based copy limits
- **Ranked matchmaking** with ELO-based rating, seasonal progression, and league tiers
- **AI skirmish** mode for offline practice
- **Reconnect system** — 60-second grace period if you disconnect during a ranked match
- **PWA** — installable on mobile devices from the login screen
- **Economy** — earn Shards from wins and daily quests to buy card packs
- **Account system** — scrypt password hashing, 7-day sessions

## Prerequisites

- **Node.js 20+** (LTS recommended)
- **npm 10+** (comes with Node.js)
- **Docker** (optional, for containerized deployment)

## Quick Start (Development)

```bash
# 1. Clone the repository
git clone <your-repo-url> fractured-arcanum
cd fractured-arcanum

# 2. Install dependencies
npm install

# 3. Generate card art (SVG assets)
npm run assets:generate

# 4. Start the full development stack (frontend + backend)
npm run dev:full
```

This starts:
- **Vite dev server** on `http://localhost:5173` (frontend with hot reload)
- **Express/Socket.IO server** on `http://localhost:43173` (API + WebSocket backend)

Open `http://localhost:5173` in your browser. Create an account and start playing.

### Running Frontend and Backend Separately

```bash
# Terminal 1 — backend only
npm run server

# Terminal 2 — frontend only
npm run dev
```

## Production Build

```bash
# Build everything (TypeScript check + game engine compile + Vite bundle)
npm run build

# Start the production server (serves both API and frontend from dist/)
npm run start
```

The Express server serves the built frontend from `dist/` and the API/WebSocket endpoints from the same port (default `43173`).

## Deployment

### Docker Compose (Recommended)

```bash
# Build and start in detached mode
docker compose up --build -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

The SQLite database persists in a Docker volume (`fractured-arcanum-data`). No data is lost when the container restarts.

### Docker (Manual)

```bash
docker build -t fractured-arcanum .
docker run -d -p 43173:43173 \
  -v fractured-arcanum-data:/app/data \
  fractured-arcanum
```

### Any VPS (DigitalOcean, AWS, Linode, etc.)

```bash
git clone <your-repo-url> fractured-arcanum
cd fractured-arcanum
npm ci --production
npm run assets:generate
npm run build
npm run start
```

Use PM2 for process persistence:

```bash
npm install -g pm2
pm2 start server/server.js --name fractured-arcanum
pm2 save && pm2 startup
```

### Render

A `render.yaml` is included for one-click deployment:

1. Push this repo to GitHub
2. Connect the repo in the [Render Dashboard](https://render.com)
3. Render auto-detects `render.yaml` and deploys

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `43173` | Server listen port |
| `CLIENT_ORIGIN` | `*` (dev) / none (prod) | Comma-separated allowed CORS origins for production (e.g. `https://yourdomain.com`) |
| `VITE_ARENA_URL` | (same origin) | Override the backend URL if frontend and backend are hosted separately |

### Reverse Proxy with Caddy

If you're hosting behind a domain with [Caddy](https://caddyserver.com/), you get automatic HTTPS. Create a `Caddyfile`:

```
yourdomain.com {
    reverse_proxy localhost:43173
}
```

Then set `CLIENT_ORIGIN` to your domain:

```bash
# In docker-compose.yml or your environment
CLIENT_ORIGIN=https://yourdomain.com
```

Caddy automatically provisions TLS certificates via Let's Encrypt. WebSocket connections (`/socket.io/`) are proxied automatically — no extra configuration needed.

### Reverse Proxy with nginx

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:43173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## How to Play

1. Create an account on the login screen
2. Edit your deck in the Deck Forge — minimum 15 cards, max 30
3. Start a match:
   - **AI Skirmish** — practice against a bot (runs locally, no server needed)
   - **Find Ranked Match** — queue for a server-authoritative match against a real player
4. Play cards from your hand into open lanes (costs mana, which grows each turn)
5. Tap a ready unit, then tap an enemy unit or hero to attack
6. Guard units must be attacked before you can hit other targets
7. Spend 3 Momentum on Momentum Burst for direct hero damage + card draw
8. Reduce the enemy hero to 0 health to win
9. Earn Shards and rating from victories

### Ranked Matches

- Matches are server-authoritative — the server validates every action
- If you disconnect, you have **60 seconds** to reconnect before forfeiting
- Your opponent sees a "waiting for reconnect" message during that window
- Rating changes use an ELO system with seasonal tiers (Bronze → Silver → Gold → Champion)

## Card Rarities

| Rarity | Cards | Deck Limit |
|---|---|---|
| ● Common | 28 | 2 copies |
| ◆ Rare | 22 | 2 copies |
| ◈ Epic | 14 | 2 copies |
| ★ Legendary | 6 | 1 copy |

## Card Packs

| Pack | Cost | Contents |
|---|---|---|
| Basic | 50 shards | 3 Common + 1 Rare (each slot can upgrade) |
| Premium | 150 shards | 3 Common + 1 Rare + 1 Epic guaranteed |
| Legendary | 400 shards | 1 Common + 2 Rare + 1 Epic + 1 Legendary guaranteed |

## Commands Reference

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (frontend only, port 5173) |
| `npm run server` | Build engine + start backend (port 43173) |
| `npm run dev:full` | Full dev stack (frontend + backend concurrently) |
| `npm run build` | Production build (engine + type check + Vite) |
| `npm run start` | Start production server |
| `npm run build:engine` | Compile `src/game.ts` → `server/game.js` |
| `npm run assets:generate` | Generate SVG card art and brand assets |
| `npm test` | Run Vitest test suite |
| `npm run lint` | ESLint check |
| `npm run release:check` | Test + lint + build (pre-deploy validation) |

## Project Structure

```
src/
  App.tsx            React SPA (all screens, game UI, deck builder, shop)
  App.css            Styles with rarity theming and responsive design
  game.ts            Game engine (cards, effects, combat, turn logic)
  game.test.ts       Test suite
  audio.ts           Sound effect playback
server/
  server.js          Express + Socket.IO server (auth, matchmaking, game rooms)
  game-room.js       Server-authoritative game room manager
  db.js              SQLite database (accounts, sessions, economy, match history)
scripts/
  generate-brand-assets.mjs   SVG card art generator
public/
  generated/cards/   Generated card illustrations (WebP/SVG)
  generated/ui/      UI assets
  sw.js              Service worker for PWA
  manifest.webmanifest
data/
  fractured-arcanum.db   SQLite database (auto-created on first run)
```

## Architecture Notes

- **Game engine** (`src/game.ts`) is pure functional — all functions take state in, return new state, no side effects. Shared between client and server.
- **Server-authoritative multiplayer** — the client sends action intents, the server validates and executes them, then broadcasts redacted state (opponent's hand is hidden).
- **Reconnect system** — account-to-room mapping allows players to rejoin an in-progress ranked match after a disconnect. A 60-second grace period prevents instant forfeits from network blips.
- **AI mode** runs entirely client-side — no server needed for single-player.

## License

This is a prototype project. All card names, art, and game mechanics are original.
