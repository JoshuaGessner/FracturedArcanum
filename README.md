# Fractured Arcanum

Fractured Arcanum is a mobile-first cosmic-horror card battler built with React, TypeScript, and Vite. It features 70 unique cards across four rarities, a three-lane battlefield, deck building, card packs, ranked progression, and a live arena service.

## Features

- **70 cards** across Common, Rare, Epic, and Legendary rarities with 21 effects
- **Card pack system** — Basic (50 shards), Premium (150), and Legendary (400) packs with duplicate protection
- **Deck builder** with presets (Balanced, Aggro, Control, Tempo) and legendary copy limits
- **Three-lane battlefield** with Guard, Charge, Rally, Heal, Draw, Blast, Fury, Cleave, Lifesteal, Summon, Silence, Frostbite, Enrage, Deathrattle, Overwhelm, and more
- **AI skirmish**, local duel, and ranked matchmaking modes
- **Rarity-styled UI** — color-coded card borders, legendary shimmer, hover animations
- **Economy** — Shards from wins/dailies, card pack shop, cosmetic theme unlocks
- **Account system** — scrypt password hashing, 7-day sessions, device fingerprint anti-sybil
- **Arena backend** — Express 5 + Socket.IO 4 + SQLite (WAL mode)
- **Admin console** — traffic analytics, complaint review, live ops settings
- **PWA** — installable on mobile with service worker and web manifest
- **Original assets** — all SVG art is procedurally generated, no copyrighted content

## Quick Start

```bash
npm install
npm run assets:generate
npm run dev:full
```

Open http://localhost:5173 in your browser. The arena server runs on port 43173.

## Run Locally

```bash
# Install dependencies
npm install

# Generate card art and brand assets
npm run assets:generate

# Start frontend + backend together
npm run dev:full

# Or run them separately:
npm run dev          # Vite dev server (frontend only)
npm run server       # Arena backend only
```

## Build for Production

```bash
npm run build        # TypeScript check + Vite production build
npm run start        # Serve production build + arena backend
```

The `dist/` folder contains the built frontend. The Express server in `server/server.js` serves both the API and the static frontend in production.

## Host on a Server

### Option A: Any VPS (DigitalOcean, AWS EC2, Linode, etc.)

```bash
# On your server:
git clone <your-repo-url> fractured-arcanum
cd fractured-arcanum
npm install --production
npm run assets:generate
npm run build

# Set environment variables
export PORT=43173
export ADMIN_KEY=your-secret-admin-key
export CLIENT_ORIGIN=https://yourdomain.com

# Start the server
npm run start
```

Use a process manager like PM2 for persistence:

```bash
npm install -g pm2
pm2 start server/server.js --name fractured-arcanum
pm2 save
pm2 startup
```

### Option B: Docker Compose (recommended)

```bash
# Copy and edit the environment file
cp .env.example .env
# IMPORTANT: Change ADMIN_KEY to a secure value

# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

The database persists in a named Docker volume (`fractured-arcanum-data`).

### Option C: Docker (manual)

```bash
docker build -t fractured-arcanum .
docker run -d -p 43173:43173 \
  -e ADMIN_KEY=your-secret-admin-key \
  -e CLIENT_ORIGIN=https://yourdomain.com \
  -v fractured-arcanum-data:/app/data \
  fractured-arcanum
```

### Option D: Render

A `render.yaml` is included for one-click deployment on [Render](https://render.com):

1. Push this repo to GitHub
2. Connect the repo in Render Dashboard
3. Render auto-detects `render.yaml` and deploys
4. Set `ADMIN_KEY` in Render environment variables

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `43173` | Server port |
| `ADMIN_KEY` | none — set this yourself | Admin console access key |
| `CLIENT_ORIGIN` | `*` | Comma-separated allowed CORS origins |
| `VITE_ARENA_URL` | (same origin) | Arena WebSocket URL for split deploys |

### Reverse Proxy (nginx example)

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

1. Create an account or log in
2. Edit your deck in the deck builder — choose from 70 cards across 4 rarities
3. Start a match (AI Skirmish, Local Duel, or Ranked Queue)
4. Play cards from your hand into open lanes (costs mana)
5. Tap a ready unit, then tap an enemy target to attack
6. Guard units must be attacked first
7. Spend 3 Momentum on Momentum Burst for direct hero damage + card draw
8. Reduce the enemy hero to 0 health to win
9. Earn Shards from wins and daily rewards to buy card packs

## Card Rarities

| Rarity | Cards | Deck Limit | Pack Refund |
|---|---|---|---|
| ● Common | 28 | 2 copies | 5 shards |
| ◆ Rare | 22 | 2 copies | 10 shards |
| ◈ Epic | 14 | 2 copies | 25 shards |
| ★ Legendary | 6 | 1 copy | 100 shards |

## Card Packs

| Pack | Cost | Contents |
|---|---|---|
| Basic | 50 shards | 3 Common + 1 Rare (each slot can upgrade) |
| Premium | 150 shards | 3 Common + 1 Rare + 1 Epic guaranteed |
| Legendary | 400 shards | 1 Common + 2 Rare + 1 Epic + 1 Legendary guaranteed |

## Tests

```bash
npm test             # Run test suite
npm run test:watch   # Watch mode
npm run lint         # ESLint check
npm run release:check # Full CI check (test + lint + build)
```

## Project Structure

```
server/
  server.js          Express + Socket.IO arena server
  db.js              SQLite database, auth, economy, card packs
src/
  App.tsx            React client (game UI, deck builder, shop, battle)
  App.css            Production styles with rarity theming
  game.ts            Core game engine (cards, effects, combat)
  game.test.ts       Vitest test suite
  audio.ts           Procedural audio feedback
scripts/
  generate-brand-assets.mjs   SVG card art generator (70+ cards)
public/
  generated/cards/   Generated card illustrations
  generated/ui/      UI banners and medals
data/
  fractured-arcanum.db  SQLite database (auto-created)
```

## Theme & Content

The world of Fractured Arcanum draws on an original cosmic-horror aesthetic — starless skies, hollow idols, cult acolytes, fathomless leviathans, and whispered oracles. All card names, flavor text, character names, and SVG art are original works; no licensed or trademarked horror IP is used.

## License

This is a prototype project. All card names, art, and game mechanics are original.
