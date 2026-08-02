import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCardArtFiles } from './lib/card-art.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, '../public')
const generatedDir = path.join(publicDir, 'generated')
const cardsDir = path.join(generatedDir, 'cards')
const uiDir = path.join(generatedDir, 'ui')

;[publicDir, generatedDir, cardsDir, uiDir].forEach((dir) => mkdirSync(dir, { recursive: true }))

const palette = {
  bg: '#0b1020',
  panel: '#16213d',
  accent: '#7c3aed',
  accent2: '#38bdf8',
  gold: '#fbbf24',
  text: '#f8f7ff',
  ember: '#fb7185',
  jade: '#34d399',
}

const assetProvider = process.env.ASSET_PROVIDER ?? 'local-svg'
const assetApiReady = Boolean(process.env.ASSET_API_KEY)

const sharedFiles = {
  'fractured-arcanum-logo.svg': `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 220" role="img" aria-label="Fractured Arcanum logo">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.accent2}"/>
      <stop offset="100%" stop-color="${palette.accent}"/>
    </linearGradient>
  </defs>
  <rect width="720" height="220" rx="32" fill="${palette.bg}"/>
  <circle cx="108" cy="110" r="58" fill="url(#g)" opacity="0.95"/>
  <path d="M108 62 L128 102 L176 110 L128 118 L108 158 L88 118 L40 110 L88 102Z" fill="${palette.gold}"/>
  <text x="196" y="95" font-size="40" font-family="Verdana,Segoe UI,sans-serif" font-weight="700" fill="${palette.text}">FRACTURED</text>
  <text x="196" y="148" font-size="40" font-family="Verdana,Segoe UI,sans-serif" font-weight="700" fill="url(#g)">ARCANUM</text>
  <text x="196" y="185" font-size="15" font-family="Verdana,Segoe UI,sans-serif" fill="#cfd8ff">Cosmic-horror card battler</text>
</svg>`.trim(),
  'fractured-arcanum-crest.svg': `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Fractured Arcanum crest">
  <defs>
    <linearGradient id="shield" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.accent2}"/>
      <stop offset="100%" stop-color="${palette.accent}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="48" fill="${palette.bg}"/>
  <path d="M128 36 L196 64 V122 C196 167 169 205 128 222 C87 205 60 167 60 122 V64 Z" fill="url(#shield)"/>
  <path d="M128 71 L144 110 L187 128 L144 146 L128 185 L112 146 L69 128 L112 110 Z" fill="${palette.gold}"/>
  <circle cx="128" cy="128" r="14" fill="#0b1020"/>
  <circle cx="128" cy="128" r="6" fill="#fbbf24"/>
</svg>`.trim(),
  'fractured-arcanum-board.svg': `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-label="Fractured Arcanum board art">
  <defs>
    <radialGradient id="mist" cx="50%" cy="20%" r="70%">
      <stop offset="0%" stop-color="#263d78"/>
      <stop offset="100%" stop-color="${palette.bg}"/>
    </radialGradient>
    <linearGradient id="lane" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(124,58,237,.15)"/>
      <stop offset="50%" stop-color="rgba(56,189,248,.25)"/>
      <stop offset="100%" stop-color="rgba(124,58,237,.15)"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#mist)"/>
  <circle cx="800" cy="150" r="130" fill="rgba(56,189,248,.12)"/>
  <circle cx="1300" cy="170" r="90" fill="rgba(124,58,237,.12)"/>
  <rect x="110" y="260" width="1380" height="90" rx="32" fill="url(#lane)"/>
  <rect x="110" y="405" width="1380" height="90" rx="32" fill="url(#lane)"/>
  <rect x="110" y="550" width="1380" height="90" rx="32" fill="url(#lane)"/>
  <g fill="none" stroke="rgba(251,191,36,.3)" stroke-width="4">
    <circle cx="200" cy="740" r="70"/>
    <circle cx="1400" cy="740" r="70"/>
    <path d="M760 80 L800 40 L840 80 L800 120 Z" />
  </g>
</svg>`.trim(),
  'fractured-arcanum-card.svg': `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 600" role="img" aria-label="Fractured Arcanum card frame">
  <defs>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.accent2}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0.38"/>
    </linearGradient>
  </defs>
  <rect width="420" height="600" rx="34" fill="#191f3d"/>
  <rect x="16" y="16" width="388" height="568" rx="28" fill="url(#frame)" stroke="rgba(251,191,36,.55)"/>
  <circle cx="74" cy="74" r="28" fill="rgba(56,189,248,.25)"/>
  <circle cx="346" cy="526" r="34" fill="rgba(124,58,237,.24)"/>
  <path d="M210 98 L227 132 L263 140 L227 148 L210 182 L193 148 L157 140 L193 132 Z" fill="rgba(251,191,36,.55)"/>
</svg>`.trim(),
  'fractured-arcanum-hero-player.svg': `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="Fractured Arcanum hero portrait">
  <defs>
    <linearGradient id="heroA" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.accent2}"/>
      <stop offset="100%" stop-color="${palette.accent}"/>
    </linearGradient>
  </defs>
  <rect width="320" height="320" rx="40" fill="#10182f"/>
  <circle cx="160" cy="96" r="52" fill="url(#heroA)"/>
  <path d="M78 260 C92 180 126 142 160 142 C194 142 228 180 242 260 Z" fill="#263d78"/>
  <path d="M122 108 L160 54 L198 108" fill="none" stroke="${palette.gold}" stroke-width="10" stroke-linecap="round"/>
  <circle cx="142" cy="95" r="5" fill="#fff"/>
  <circle cx="178" cy="95" r="5" fill="#fff"/>
</svg>`.trim(),
  'fractured-arcanum-hero-enemy.svg': `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="Fractured Arcanum enemy portrait">
  <defs>
    <linearGradient id="heroB" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ef4444"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="320" height="320" rx="40" fill="#1a1027"/>
  <circle cx="160" cy="96" r="52" fill="url(#heroB)"/>
  <path d="M76 260 C92 176 128 142 160 142 C192 142 228 176 244 260 Z" fill="#3a1d46"/>
  <path d="M110 70 L134 34 L160 72 L186 34 L210 70" fill="none" stroke="${palette.gold}" stroke-width="8" stroke-linecap="round"/>
  <circle cx="142" cy="98" r="5" fill="#fff"/>
  <circle cx="178" cy="98" r="5" fill="#fff"/>
</svg>`.trim(),
  'generated/ui/admin-ops-banner.svg': `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 280" role="img" aria-label="Fractured Arcanum admin operations banner">
  <defs>
    <linearGradient id="ops-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="960" height="280" rx="32" fill="url(#ops-bg)"/>
  <circle cx="164" cy="92" r="58" fill="rgba(56,189,248,.18)"/>
  <circle cx="790" cy="82" r="44" fill="rgba(124,58,237,.18)"/>
  <rect x="76" y="154" width="230" height="62" rx="16" fill="rgba(15,23,42,.6)" stroke="rgba(56,189,248,.25)"/>
  <rect x="332" y="124" width="260" height="92" rx="16" fill="rgba(15,23,42,.48)" stroke="rgba(251,191,36,.25)"/>
  <rect x="620" y="144" width="254" height="72" rx="16" fill="rgba(15,23,42,.58)" stroke="rgba(124,58,237,.25)"/>
  <text x="78" y="76" font-size="32" font-family="Verdana,Segoe UI,sans-serif" font-weight="700" fill="#f8f7ff">Arena Operations</text>
  <text x="78" y="110" font-size="16" font-family="Verdana,Segoe UI,sans-serif" fill="#d7e5ff">Traffic, complaints, and release-quality monitoring</text>
</svg>`.trim(),
  'generated/ui/asset-forge-banner.svg': `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 280" role="img" aria-label="Fractured Arcanum art forge banner">
  <defs>
    <linearGradient id="forge-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#160f28"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="960" height="280" rx="32" fill="url(#forge-bg)"/>
  <circle cx="178" cy="96" r="54" fill="rgba(251,191,36,.2)"/>
  <path d="M168 54 L186 92 L228 102 L186 112 L168 150 L150 112 L108 102 L150 92 Z" fill="#fbbf24"/>
  <text x="278" y="92" font-size="34" font-family="Verdana,Segoe UI,sans-serif" font-weight="700" fill="#fff">Arcanum Forge Pipeline</text>
  <text x="278" y="126" font-size="16" font-family="Verdana,Segoe UI,sans-serif" fill="#dbeafe">Local generated art, manifest-driven replacement, production-safe polish</text>
</svg>`.trim(),
  'generated/ui/season-medal.svg': `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="Fractured Arcanum season medal">
  <defs>
    <linearGradient id="medal-core" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fde68a"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="240" height="240" rx="38" fill="#10182f"/>
  <path d="M76 28 H108 L120 76 L132 28 H164 L146 104 H94 Z" fill="#7c3aed"/>
  <circle cx="120" cy="136" r="58" fill="url(#medal-core)" stroke="rgba(255,255,255,.25)" stroke-width="8"/>
  <path d="M120 96 L132 122 L160 126 L138 144 L144 172 L120 158 L96 172 L102 144 L80 126 L108 122 Z" fill="#fff8dc"/>
</svg>`.trim(),
  'generated/ui/reward-chest.svg': `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" role="img" aria-label="Fractured Arcanum reward chest">
  <rect width="320" height="240" rx="34" fill="#1a1328"/>
  <rect x="56" y="98" width="208" height="92" rx="18" fill="#7c3aed" stroke="#fbbf24" stroke-width="8"/>
  <path d="M56 108 C88 56 232 56 264 108" fill="#a78bfa" stroke="#fbbf24" stroke-width="8"/>
  <rect x="146" y="86" width="28" height="104" rx="10" fill="#fbbf24"/>
  <circle cx="160" cy="142" r="14" fill="#fff7ed"/>
  <circle cx="70" cy="42" r="10" fill="rgba(255,255,255,.18)"/>
  <circle cx="254" cy="46" r="8" fill="rgba(255,255,255,.15)"/>
</svg>`.trim(),
}

// ─── Phase 3A — game UI assets ────────────────────────────────────
// All paths are relative to publicDir; entries with `generated/ui/...`
// prefix land in public/generated/ui/.

const svg = (viewBox, body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">${body}</svg>`

// Backgrounds (1440×900, full-bleed, layered gradient + scene shapes)
const bg = (id, label, defs, scene) => svg(
  '0 0 1440 900',
  `<defs>${defs}</defs><rect width="1440" height="900" fill="url(#${id}-grad)"/>${scene}`,
  label,
)

const backgrounds = {
  'bg-main-menu.svg': bg('mm', 'Main menu background',
    '<linearGradient id="mm-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0a0f24"/><stop offset="60%" stop-color="#1a1240"/><stop offset="100%" stop-color="#070914"/></linearGradient>',
    `<g opacity="0.55"><path d="M0 700 L240 540 L480 640 L720 480 L960 600 L1200 500 L1440 660 L1440 900 L0 900 Z" fill="#181530"/><path d="M0 780 L300 660 L600 760 L900 640 L1200 740 L1440 680 L1440 900 L0 900 Z" fill="#0d0d24"/></g><g opacity="0.4"><circle cx="220" cy="180" r="3" fill="#7c3aed"/><circle cx="640" cy="120" r="2" fill="#38bdf8"/><circle cx="1040" cy="220" r="3" fill="#fbbf24"/><circle cx="1290" cy="140" r="2" fill="#a78bfa"/><circle cx="380" cy="260" r="2" fill="#fff"/><circle cx="860" cy="320" r="3" fill="#7c3aed"/></g><path d="M120 80 Q720 0 1320 80 Q720 30 120 80 Z" fill="rgba(124,58,237,0.18)"/>`,
  ),
  'bg-play.svg': bg('pl', 'Play screen background',
    '<radialGradient id="pl-grad" cx="50%" cy="55%" r="80%"><stop offset="0%" stop-color="#3a1c2c"/><stop offset="100%" stop-color="#0e0815"/></radialGradient>',
    `<g fill="#1a0d1a"><rect x="0" y="700" width="1440" height="200"/></g><g stroke="#7c3aed" stroke-width="6" fill="none" opacity="0.5"><path d="M120 800 L120 200 Q120 100 220 100 L1220 100 Q1320 100 1320 200 L1320 800"/><path d="M260 800 L260 280 Q260 200 340 200 L1100 200 Q1180 200 1180 280 L1180 800"/></g><circle cx="720" cy="450" r="180" fill="none" stroke="#fbbf24" stroke-width="4" opacity="0.4"/><circle cx="720" cy="450" r="120" fill="none" stroke="#fbbf24" stroke-width="3" opacity="0.6"/><g fill="#fbbf24" opacity="0.7"><circle cx="160" cy="780" r="14"/><circle cx="1280" cy="780" r="14"/></g>`,
  ),
  'bg-collection.svg': bg('cl', 'Collection screen background',
    '<linearGradient id="cl-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1d1530"/><stop offset="100%" stop-color="#0a0814"/></linearGradient>',
    `<g fill="#241a3d"><rect x="60" y="120" width="80" height="780"/><rect x="160" y="180" width="80" height="720"/><rect x="260" y="100" width="80" height="800"/><rect x="1100" y="140" width="80" height="760"/><rect x="1200" y="200" width="80" height="700"/><rect x="1300" y="120" width="80" height="780"/></g><g fill="rgba(251,191,36,0.18)"><rect x="60" y="320" width="80" height="6"/><rect x="60" y="540" width="80" height="6"/><rect x="160" y="380" width="80" height="6"/><rect x="260" y="280" width="80" height="6"/><rect x="1100" y="360" width="80" height="6"/><rect x="1200" y="420" width="80" height="6"/><rect x="1300" y="320" width="80" height="6"/></g><g opacity="0.4"><circle cx="500" cy="280" r="2" fill="#fbbf24"/><circle cx="700" cy="200" r="3" fill="#fbbf24"/><circle cx="900" cy="280" r="2" fill="#fbbf24"/></g>`,
  ),
  'bg-social.svg': bg('sc', 'Social screen background',
    '<linearGradient id="sc-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#251d12"/><stop offset="100%" stop-color="#0d0a05"/></linearGradient>',
    `<g fill="#3d2818"><rect x="0" y="600" width="1440" height="300"/></g><g fill="#5a3820"><rect x="200" y="650" width="1040" height="60" rx="8"/><rect x="160" y="710" width="1120" height="40" rx="6"/></g><g stroke="#7a4a28" stroke-width="6" fill="none"><line x1="120" y1="120" x2="120" y2="600"/><line x1="1320" y1="120" x2="1320" y2="600"/></g><g><rect x="100" y="100" width="120" height="180" fill="#7c3aed" opacity="0.5"/><rect x="1220" y="100" width="120" height="180" fill="#fbbf24" opacity="0.5"/></g><circle cx="200" cy="550" r="80" fill="rgba(251,127,36,0.4)"/>`,
  ),
  'bg-shop.svg': bg('sh', 'Shop screen background',
    '<linearGradient id="sh-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a1545"/><stop offset="100%" stop-color="#0a0414"/></linearGradient>',
    `<g fill="#7c3aed" opacity="0.4"><path d="M200 0 L240 200 L160 200 Z"/><path d="M600 0 L640 200 L560 200 Z"/><path d="M1000 0 L1040 200 L960 200 Z"/></g><g fill="#fbbf24" opacity="0.4"><path d="M400 0 L440 240 L360 240 Z"/><path d="M800 0 L840 240 L760 240 Z"/><path d="M1200 0 L1240 240 L1160 240 Z"/></g><g><rect x="100" y="600" width="180" height="180" rx="14" fill="#3d2350" stroke="#fbbf24" stroke-width="4"/><rect x="1160" y="600" width="180" height="180" rx="14" fill="#3d2350" stroke="#fbbf24" stroke-width="4"/></g><g fill="#fde68a" opacity="0.7"><circle cx="190" cy="690" r="20"/><circle cx="1250" cy="690" r="20"/></g>`,
  ),
  'bg-battle.svg': bg('bt', 'Battle screen background',
    '<radialGradient id="bt-grad" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#263d78"/><stop offset="100%" stop-color="#0b1020"/></radialGradient>',
    `<g><rect x="60" y="180" width="1320" height="100" rx="20" fill="rgba(124,58,237,0.18)"/><rect x="60" y="380" width="1320" height="100" rx="20" fill="rgba(56,189,248,0.18)"/><rect x="60" y="580" width="1320" height="100" rx="20" fill="rgba(124,58,237,0.18)"/></g><circle cx="720" cy="430" r="140" fill="none" stroke="rgba(251,191,36,0.4)" stroke-width="4"/><circle cx="720" cy="430" r="80" fill="none" stroke="rgba(251,191,36,0.6)" stroke-width="3"/><g fill="#fbbf24" opacity="0.8"><circle cx="120" cy="820" r="16"/><circle cx="1320" cy="820" r="16"/></g>`,
  ),
  'bg-settings.svg': bg('st', 'Settings screen background',
    '<linearGradient id="st-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#241a14"/><stop offset="100%" stop-color="#0d0805"/></linearGradient>',
    `<g fill="#3a2615"><rect x="100" y="200" width="600" height="500" rx="14"/></g><g fill="#5a3820" opacity="0.7"><rect x="800" y="240" width="540" height="80" rx="6"/><rect x="800" y="360" width="540" height="80" rx="6"/><rect x="800" y="480" width="540" height="80" rx="6"/></g><g fill="#fbbf24" opacity="0.6"><circle cx="780" cy="240" r="12"/><circle cx="780" cy="360" r="12"/><circle cx="780" cy="480" r="12"/></g><path d="M150 220 L650 220 L650 680 L150 680 Z" fill="none" stroke="#7a4a28" stroke-width="3"/>`,
  ),
}

// Navigation tile illustrations (240×320)
const tileBg = (defs, accent) => `<defs>${defs}</defs><rect width="240" height="320" rx="20" fill="#181230"/><rect x="8" y="8" width="224" height="304" rx="14" fill="url(#tile-grad)" stroke="${accent}" stroke-width="2"/>`

// Nav glyphs are stroked with `currentColor` and no fill, so a single asset
// serves both the rest and active states — CSS supplies the tint.
const navGlyph = (id, label, body) => [`nav-${id}.svg`, svg('0 0 24 24',
  `<g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</g>`,
  label)]

const navGlyphs = Object.fromEntries([
  // Home — a keep/gate silhouette, echoing the arena crest.
  navGlyph('home', 'Home', '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5.5h5V20"/>'),
  // Collection — overlapping cards, the deck-forge metaphor.
  navGlyph('collection', 'Collection', '<rect x="7.5" y="4.5" width="11" height="15" rx="2"/><path d="M4.5 7v11.5a2 2 0 0 0 2 2H15"/>'),
  // Shop — an awning over a stall, matching the existing shop tile.
  navGlyph('shop', 'Shop', '<path d="M4 9.5h16V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z"/><path d="M4 9.5 5.8 4.2A1 1 0 0 1 6.75 3.5h10.5a1 1 0 0 1 .95.7L20 9.5"/><path d="M9.5 13.5h5"/>'),
  // Social — two figures, the clan/friends surface.
  navGlyph('social', 'Social', '<circle cx="9" cy="8" r="3"/><path d="M3.5 20.5a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.8"/><path d="M17.5 15.2a5.5 5.5 0 0 1 3 5.3"/>'),
  // Battle — crossed blades for the primary call to action.
  navGlyph('battle', 'Battle', '<path d="M4.5 3.5h3l10 13.5-1.5 1.5-1.5 1.5L4.5 9.5Z"/><path d="M19.5 3.5h-3l-4 5.4"/><path d="M9.5 13.4 5.5 19l1.5 1.5"/>'),
  // Settings — gear, used by the top-bar account menu.
  // Settings — a cogged gear. Radial tick marks read as a sun/brightness
  // control at 22px, so the teeth are drawn as a closed outline instead.
  navGlyph('settings', 'Settings', '<circle cx="12" cy="12" r="3.1"/><path d="M19.05 14.6a1.55 1.55 0 0 0 .31 1.71l.06.06a1.88 1.88 0 1 1-2.66 2.66l-.06-.06a1.55 1.55 0 0 0-1.71-.31 1.55 1.55 0 0 0-.94 1.42v.16a1.88 1.88 0 1 1-3.76 0v-.08a1.55 1.55 0 0 0-1.01-1.42 1.55 1.55 0 0 0-1.71.31l-.06.06a1.88 1.88 0 1 1-2.66-2.66l.06-.06a1.55 1.55 0 0 0 .31-1.71 1.55 1.55 0 0 0-1.42-.94h-.16a1.88 1.88 0 1 1 0-3.76h.08a1.55 1.55 0 0 0 1.42-1.01 1.55 1.55 0 0 0-.31-1.71l-.06-.06a1.88 1.88 0 1 1 2.66-2.66l.06.06a1.55 1.55 0 0 0 1.71.31h.07a1.55 1.55 0 0 0 .94-1.42v-.16a1.88 1.88 0 1 1 3.76 0v.08a1.55 1.55 0 0 0 .94 1.42 1.55 1.55 0 0 0 1.71-.31l.06-.06a1.88 1.88 0 1 1 2.66 2.66l-.06.06a1.55 1.55 0 0 0-.31 1.71v.07a1.55 1.55 0 0 0 1.42.94h.16a1.88 1.88 0 1 1 0 3.76h-.08a1.55 1.55 0 0 0-1.42.94Z"/>'),
])

const tiles = {
  'tile-play.svg': svg('0 0 240 320',
    `${tileBg('<linearGradient id="tile-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3d1a2f"/><stop offset="100%" stop-color="#1a0a18"/></linearGradient>', '#fbbf24')}<circle cx="120" cy="170" r="70" fill="none" stroke="#fbbf24" stroke-width="4"/><path d="M75 130 L165 220 M165 130 L75 220" stroke="#e2e8f0" stroke-width="10" stroke-linecap="round"/><path d="M120 80 L130 110 L160 115 L138 134 L144 164 L120 150 L96 164 L102 134 L80 115 L110 110 Z" fill="#fbbf24" opacity="0.5"/>`,
    'Play tile'),
  'tile-collection.svg': svg('0 0 240 320',
    `${tileBg('<linearGradient id="tile-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a2540"/><stop offset="100%" stop-color="#0a0f24"/></linearGradient>', '#38bdf8')}<rect x="50" y="100" width="140" height="160" rx="6" fill="#1d4ed8" stroke="#fbbf24" stroke-width="3"/><line x1="120" y1="100" x2="120" y2="260" stroke="#fbbf24" stroke-width="2"/><g fill="#fff" opacity="0.5"><rect x="65" y="120" width="40" height="3"/><rect x="65" y="135" width="35" height="3"/><rect x="135" y="120" width="40" height="3"/><rect x="135" y="135" width="38" height="3"/></g><path d="M170 70 L180 90 L200 90 L184 102 L190 122 L170 110 L150 122 L156 102 L140 90 L160 90 Z" fill="#fbbf24"/>`,
    'Collection tile'),
  'tile-social.svg': svg('0 0 240 320',
    `${tileBg('<linearGradient id="tile-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a3320"/><stop offset="100%" stop-color="#0a140a"/></linearGradient>', '#34d399')}<path d="M80 110 L80 180 Q80 220 110 240 L120 250 L130 240 Q160 220 160 180 L160 110 L120 90 Z" fill="#34d399" opacity="0.7" stroke="#fbbf24" stroke-width="3"/><path d="M120 130 L130 155 L160 158 L138 175 L146 200 L120 188 L94 200 L102 175 L80 158 L110 155 Z" fill="#fbbf24" opacity="0.6"/>`,
    'Social tile'),
  'tile-shop.svg': svg('0 0 240 320',
    `${tileBg('<linearGradient id="tile-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3d2350"/><stop offset="100%" stop-color="#1a0a28"/></linearGradient>', '#fbbf24')}<rect x="55" y="160" width="130" height="90" rx="10" fill="#7c3aed" stroke="#fbbf24" stroke-width="4"/><path d="M55 165 C75 110 165 110 185 165" fill="#a78bfa" stroke="#fbbf24" stroke-width="4"/><rect x="115" y="150" width="20" height="100" rx="4" fill="#fbbf24"/><circle cx="125" cy="195" r="10" fill="#fff8dc"/><g fill="#fde68a" opacity="0.7"><circle cx="120" cy="80" r="3"/><circle cx="90" cy="100" r="2"/><circle cx="150" cy="100" r="2"/></g>`,
    'Shop tile'),
  'tile-settings.svg': svg('0 0 240 320',
    `${tileBg('<linearGradient id="tile-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a2a35"/><stop offset="100%" stop-color="#10101a"/></linearGradient>', '#94a3b8')}<g transform="translate(120,160)"><circle r="60" fill="none" stroke="#94a3b8" stroke-width="6"/><circle r="20" fill="#fbbf24"/><g fill="#94a3b8"><rect x="-8" y="-78" width="16" height="20" rx="3"/><rect x="-8" y="58" width="16" height="20" rx="3"/><rect x="-78" y="-8" width="20" height="16" rx="3" /><rect x="58" y="-8" width="20" height="16" rx="3"/><rect x="-58" y="-58" width="16" height="20" rx="3" transform="rotate(-45)"/><rect x="42" y="-58" width="16" height="20" rx="3" transform="rotate(45)"/><rect x="-58" y="42" width="20" height="16" rx="3" transform="rotate(45)"/><rect x="42" y="42" width="16" height="20" rx="3" transform="rotate(-45)"/></g></g>`,
    'Settings tile'),
  'tile-battle.svg': svg('0 0 240 320',
    `${tileBg('<linearGradient id="tile-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3d1010"/><stop offset="100%" stop-color="#180505"/></linearGradient>', '#ef4444')}<path d="M60 80 L180 80 L200 240 L120 280 L40 240 Z" fill="#7c1d1d" stroke="#fbbf24" stroke-width="4"/><path d="M120 100 L130 130 L160 134 L138 152 L146 184 L120 168 L94 184 L102 152 L80 134 L110 130 Z" fill="#fbbf24"/>`,
    'Battle tile'),

  // ── Navigation glyphs (24×24) ──────────────────────────────────────
  // The nav bar used to reuse the 240×320 `tile-*` card art, scaled down to a
  // 16px square. At that size the tile frame, gradient, and inner artwork all
  // collapse into an unreadable smudge. These are drawn at the size they are
  // actually used: single-weight strokes on a 24px grid, `currentColor` so the
  // active/inactive tint comes from CSS rather than a second asset.
  ...navGlyphs,
}

// Rank insignia (120×120)
const rankShield = (id, label, fill, accent, ornament) => svg('0 0 120 120',
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${fill}"/><stop offset="100%" stop-color="${accent}"/></linearGradient></defs><path d="M60 8 L100 24 V64 C100 88 84 104 60 114 C36 104 20 88 20 64 V24 Z" fill="url(#${id})" stroke="#fbbf24" stroke-width="3"/>${ornament}`,
  label)

const ranks = {
  'rank-bronze.svg': rankShield('rb', 'Bronze rank', '#a16234', '#5a3818',
    `<path d="M40 50 L80 80 M80 50 L40 80" stroke="#fde68a" stroke-width="6" stroke-linecap="round"/>`),
  'rank-silver.svg': rankShield('rs', 'Silver rank', '#cbd5e1', '#64748b',
    `<path d="M60 38 C50 50 50 70 60 90 C70 70 70 50 60 38 Z" fill="#fff" opacity="0.8"/><circle cx="60" cy="65" r="6" fill="#fbbf24"/>`),
  'rank-gold.svg': rankShield('rg', 'Gold rank', '#fbbf24', '#a16207',
    `<g><path d="M60 28 L65 48 L86 50 L70 64 L75 86 L60 76 L45 86 L50 64 L34 50 L55 48 Z" fill="#fff8dc"/><circle cx="60" cy="60" r="20" fill="none" stroke="#fff8dc" stroke-width="2"/></g>`),
  'rank-diamond.svg': rankShield('rd', 'Diamond rank', '#a78bfa', '#5b21b6',
    `<path d="M60 30 L88 60 L60 100 L32 60 Z" fill="#e9d5ff" stroke="#fff" stroke-width="2"/><path d="M60 30 L60 100 M32 60 L88 60" stroke="#fff" stroke-width="2" opacity="0.6"/><circle cx="60" cy="22" r="6" fill="#fbbf24"/>`),
}

// Pack covers (200×280)
const pack = (id, label, bgGrad, accent, body) => svg('0 0 200 280',
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${bgGrad}</linearGradient></defs><rect width="200" height="280" rx="14" fill="url(#${id})" stroke="${accent}" stroke-width="3"/>${body}`,
  label)

const packs = {
  'pack-standard.svg': pack('ps', 'Standard pack',
    '<stop offset="0%" stop-color="#5a3a1a"/><stop offset="100%" stop-color="#2d1d0d"/>', '#a16234',
    `<rect x="30" y="60" width="140" height="160" rx="8" fill="#7a4a28"/><circle cx="100" cy="140" r="30" fill="#1d4ed8" opacity="0.6"/><circle cx="100" cy="140" r="18" fill="#38bdf8"/><path d="M30 130 H170" stroke="#fbbf24" stroke-width="3" opacity="0.5"/>`),
  'pack-premium.svg': pack('pp', 'Premium pack',
    '<stop offset="0%" stop-color="#3d1a55"/><stop offset="100%" stop-color="#1a0a28"/>', '#fbbf24',
    `<rect x="30" y="50" width="140" height="180" rx="10" fill="#7c3aed" stroke="#fbbf24" stroke-width="2"/><path d="M30 50 L100 130 L170 50" fill="#5b21b6" stroke="#fbbf24" stroke-width="2"/><circle cx="100" cy="170" r="30" fill="rgba(251,191,36,0.5)"/><path d="M100 145 L110 165 L130 168 L116 182 L120 200 L100 192 L80 200 L84 182 L70 168 L90 165 Z" fill="#fbbf24"/>`),
  'pack-legendary.svg': pack('pl', 'Legendary pack',
    '<stop offset="0%" stop-color="#5a3a05"/><stop offset="100%" stop-color="#2d1f00"/>', '#fde68a',
    `<rect x="30" y="80" width="140" height="140" rx="10" fill="#fbbf24" stroke="#fde68a" stroke-width="3"/><path d="M30 80 C50 40 150 40 170 80" fill="#f59e0b" stroke="#fde68a" stroke-width="3"/><rect x="90" y="60" width="20" height="160" rx="4" fill="#7c2d12"/><circle cx="100" cy="150" r="12" fill="#fff8dc"/><g fill="#fff8dc" opacity="0.8"><path d="M100 30 L110 50 L130 52 L114 64 L120 84 L100 74 L80 84 L86 64 L70 52 L90 50 Z"/></g>`),
}

// Rarity gems (32×32)
//
// Each rarity gets its own SILHOUETTE, not just its own hue. These render as
// small as 12px on compact collection cards and in the battle hand, where four
// identically-shaped gems separated only by fill are unreadable — and invisible
// to a colourblind player. The shapes escalate in complexity (disc → block →
// shard → starburst) so the hierarchy survives in greyscale.
//
// Rarity is the one card signal cosmetic frames may never override, so the gem
// has to carry it alone at thumbnail size.
const gem = (id, label, color, dark, shape, facets) => svg('0 0 32 32',
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="${dark}"/></linearGradient></defs>${shape.replace('__FILL__', `url(#${id})`)}<path d="${facets}" stroke="#fff" stroke-width="0.5" opacity="0.6" fill="none"/>`,
  label)

const gems = {
  // Disc — the plainest form.
  'gem-common.svg': gem('gc', 'Common gem', '#cbd5e1', '#64748b',
    '<circle cx="16" cy="16" r="10.5" fill="__FILL__" stroke="#fff" stroke-width="1"/>',
    'M16 5.5 A10.5 10.5 0 0 1 26.5 16'),
  // Cut block — four flat sides.
  'gem-rare.svg': gem('gr', 'Rare gem', '#60a5fa', '#1d4ed8',
    '<rect x="5.5" y="5.5" width="21" height="21" rx="3.5" fill="__FILL__" stroke="#fff" stroke-width="1"/>',
    'M5.5 11 H26.5 M11 5.5 V26.5'),
  // Faceted shard — pentagon, point up.
  'gem-epic.svg': gem('ge', 'Epic gem', '#a78bfa', '#5b21b6',
    '<path d="M16 4 L27 12 L22.8 25 L9.2 25 L5 12 Z" fill="__FILL__" stroke="#fff" stroke-width="1"/>',
    'M16 4 L16 25 M5 12 L27 12'),
  // Starburst — eight points.
  'gem-legendary.svg': gem('gl', 'Legendary gem', '#fde68a', '#d97706',
    '<path d="M16 3 L18.4 10.5 L24.6 6.4 L21.5 13.6 L29 16 L21.5 18.4 L24.6 25.6 L18.4 21.5 L16 29 L13.6 21.5 L7.4 25.6 L10.5 18.4 L3 16 L10.5 13.6 L7.4 6.4 L13.6 10.5 Z" fill="__FILL__" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>',
    'M16 9 L16 23 M9 16 L23 16'),
}

// UI chrome — buttons (200×64), panel frame, divider, pips, stat icons
const chrome = {
  'btn-primary.svg': svg('0 0 200 64',
    `<defs><linearGradient id="bp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#3b1d80"/></linearGradient></defs><rect x="2" y="2" width="196" height="60" rx="14" fill="url(#bp)" stroke="#fbbf24" stroke-width="2"/><circle cx="10" cy="10" r="3" fill="#fbbf24"/><circle cx="190" cy="10" r="3" fill="#fbbf24"/><circle cx="10" cy="54" r="3" fill="#fbbf24"/><circle cx="190" cy="54" r="3" fill="#fbbf24"/>`,
    'Primary button frame'),
  'btn-ghost.svg': svg('0 0 200 64',
    `<rect x="2" y="2" width="196" height="60" rx="14" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.25)" stroke-width="2" stroke-dasharray="4 3"/>`,
    'Ghost button frame'),
  'btn-danger.svg': svg('0 0 200 64',
    `<defs><linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7c1d1d"/><stop offset="100%" stop-color="#3d0a0a"/></linearGradient></defs><rect x="2" y="2" width="196" height="60" rx="14" fill="url(#bd)" stroke="#ef4444" stroke-width="2"/><path d="M0 32 Q50 28 100 32 Q150 36 200 32" stroke="#ef4444" stroke-width="1" fill="none" opacity="0.6"/>`,
    'Danger button frame'),
  'panel-frame.svg': svg('0 0 400 300',
    `<rect x="6" y="6" width="388" height="288" rx="20" fill="rgba(15,17,40,0.85)" stroke="#fbbf24" stroke-width="3"/><g fill="#fbbf24"><circle cx="20" cy="20" r="5"/><circle cx="380" cy="20" r="5"/><circle cx="20" cy="280" r="5"/><circle cx="380" cy="280" r="5"/></g><g stroke="#fbbf24" stroke-width="1" opacity="0.6"><line x1="40" y1="20" x2="360" y2="20"/><line x1="40" y1="280" x2="360" y2="280"/></g>`,
    'Panel frame'),
  'divider-rune.svg': svg('0 0 400 24',
    `<line x1="0" y1="12" x2="180" y2="12" stroke="#fbbf24" stroke-width="2" opacity="0.5"/><line x1="220" y1="12" x2="400" y2="12" stroke="#fbbf24" stroke-width="2" opacity="0.5"/><circle cx="200" cy="12" r="8" fill="none" stroke="#fbbf24" stroke-width="2"/><path d="M196 8 L204 16 M204 8 L196 16" stroke="#fbbf24" stroke-width="1.5"/>`,
    'Rune divider'),
  'pip-mana-empty.svg': svg('0 0 24 24',
    `<path d="M12 4 L20 18 L12 22 L4 18 Z" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0.6"/>`,
    'Empty mana pip'),
  'pip-mana-filled.svg': svg('0 0 24 24',
    `<defs><linearGradient id="pmf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7dd3fc"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs><path d="M12 4 L20 18 L12 22 L4 18 Z" fill="url(#pmf)" stroke="#fff" stroke-width="1"/>`,
    'Filled mana pip'),
  'pip-momentum-empty.svg': svg('0 0 24 24',
    `<circle cx="12" cy="12" r="8" fill="none" stroke="#fb923c" stroke-width="2" opacity="0.6"/>`,
    'Empty momentum pip'),
  'pip-momentum-filled.svg': svg('0 0 24 24',
    `<defs><radialGradient id="pme" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#c2410c"/></radialGradient></defs><circle cx="12" cy="12" r="8" fill="url(#pme)" stroke="#fff" stroke-width="1"/>`,
    'Filled momentum pip'),
  'icon-health.svg': svg('0 0 24 24',
    `<path d="M12 21 C6 16 2 12 2 8 C2 5 5 3 8 3 C10 3 12 5 12 5 C12 5 14 3 16 3 C19 3 22 5 22 8 C22 12 18 16 12 21 Z" fill="#ef4444" stroke="#fff" stroke-width="1"/>`,
    'Health icon'),
  'icon-attack.svg': svg('0 0 24 24',
    `<path d="M12 2 L16 8 L14 10 L20 18 L18 20 L10 14 L8 16 L4 12 L8 8 Z" fill="#cbd5e1" stroke="#fff" stroke-width="0.5"/><path d="M14 4 L18 8" stroke="#fbbf24" stroke-width="1"/>`,
    'Attack icon'),
  'icon-guard.svg': svg('0 0 24 24',
    `<path d="M12 2 L20 5 V12 C20 17 16 21 12 22 C8 21 4 17 4 12 V5 Z" fill="#1d4ed8" stroke="#fbbf24" stroke-width="1"/><path d="M12 7 L13 11 L17 11 L14 14 L15 18 L12 16 L9 18 L10 14 L7 11 L11 11 Z" fill="#fbbf24"/>`,
    'Guard icon'),
  'icon-edit.svg': svg('0 0 24 24',
    `<path d="M4 20 L4 17 L15 6 L18 9 L7 20 Z" fill="#cbd5e1" stroke="#fff" stroke-width="0.5"/><path d="M15 6 L17 4 L20 7 L18 9 Z" fill="#fbbf24" stroke="#fff" stroke-width="0.5"/>`,
    'Edit icon'),
  'icon-delete.svg': svg('0 0 24 24',
    `<path d="M8 6 V4 C8 3 9 2 10 2 H14 C15 2 16 3 16 4 V6" fill="none" stroke="#ef4444" stroke-width="1.5"/><rect x="5" y="6" width="14" height="16" rx="2" fill="#ef4444" stroke="#fff" stroke-width="0.5"/><path d="M10 10 V18 M14 10 V18" stroke="#fff" stroke-width="1.5"/>`,
    'Delete icon'),
}

// Effect icons (40×40, 20 entries)
const fx = (id, label, color, body) => svg('0 0 40 40',
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#1a1530"/></linearGradient></defs><rect width="40" height="40" rx="8" fill="url(#${id})" opacity="0.85"/>${body}`,
  label)

const effects = {
  'fx-charge.svg': fx('fc', 'Charge', '#facc15', `<path d="M22 6 L12 22 L18 22 L14 34 L28 18 L22 18 L26 6 Z" fill="#fef9c3" stroke="#fff" stroke-width="0.5"/>`),
  'fx-guard.svg': fx('fg', 'Guard', '#1d4ed8', `<path d="M20 6 L30 10 V20 C30 27 26 32 20 34 C14 32 10 27 10 20 V10 Z" fill="#dbeafe" stroke="#fff" stroke-width="1"/>`),
  'fx-rally.svg': fx('fr', 'Rally', '#f97316', `<path d="M8 18 L20 14 L20 26 Z" fill="#fed7aa"/><path d="M22 14 Q30 18 30 22 Q30 26 22 26" fill="none" stroke="#fed7aa" stroke-width="2"/><path d="M28 12 Q34 18 34 22 Q34 26 28 28" fill="none" stroke="#fed7aa" stroke-width="1.5" opacity="0.6"/>`),
  'fx-blast.svg': fx('fb', 'Blast', '#ef4444', `<g fill="#fbbf24" stroke="#fff" stroke-width="0.5"><path d="M20 6 L24 18 L36 16 L26 24 L32 36 L20 28 L8 36 L14 24 L4 16 L16 18 Z"/></g>`),
  'fx-heal.svg': fx('fh', 'Heal', '#22c55e', `<path d="M16 8 H24 V16 H32 V24 H24 V32 H16 V24 H8 V16 H16 Z" fill="#bbf7d0" stroke="#fff" stroke-width="1"/>`),
  'fx-draw.svg': fx('fd', 'Draw', '#38bdf8', `<rect x="12" y="8" width="16" height="22" rx="2" fill="#dbeafe" stroke="#fff" stroke-width="1"/><path d="M20 12 V26 M14 19 L26 19" stroke="#1d4ed8" stroke-width="2"/>`),
  'fx-fury.svg': fx('ff', 'Fury', '#dc2626', `<path d="M12 16 Q16 10 20 14 Q24 8 28 14 Q26 22 20 24 Q14 22 12 16 Z" fill="#fbbf24"/><circle cx="20" cy="28" r="4" fill="#fef3c7"/>`),
  'fx-drain.svg': fx('fdr', 'Drain', '#7c3aed', `<circle cx="20" cy="16" r="8" fill="#3b1d80" stroke="#a78bfa" stroke-width="1"/><path d="M16 22 L14 32 M20 24 L20 34 M24 22 L26 32" stroke="#a78bfa" stroke-width="1.5"/>`),
  'fx-empower.svg': fx('fe', 'Empower', '#fbbf24', `<g stroke="#fff8dc" stroke-width="2" fill="none"><path d="M14 30 L14 16 L10 20 M14 16 L18 20"/><path d="M26 30 L26 12 L22 16 M26 12 L30 16"/></g>`),
  'fx-poison.svg': fx('fp', 'Poison', '#16a34a', `<path d="M14 8 H26 L24 16 L28 16 L20 32 L12 16 L16 16 Z" fill="#86efac"/><circle cx="20" cy="14" r="2" fill="#000"/><circle cx="17" cy="11" r="1" fill="#000"/><circle cx="23" cy="11" r="1" fill="#000"/>`),
  'fx-shield.svg': fx('fs', 'Shield', '#0ea5e9', `<g fill="none" stroke="#dbeafe" stroke-width="2"><path d="M10 10 H30 V14 H10 Z"/><path d="M12 14 H28 V18 H12 Z"/><path d="M14 18 H26 V22 H14 Z"/><path d="M16 22 H24 V26 H16 Z"/></g>`),
  'fx-siphon.svg': fx('fsi', 'Siphon', '#a855f7', `<g stroke="#e9d5ff" stroke-width="2" fill="none"><path d="M8 14 Q14 8 20 14 Q26 20 32 14"/><path d="M8 26 Q14 32 20 26 Q26 20 32 26"/></g><circle cx="20" cy="20" r="3" fill="#fbbf24"/>`),
  'fx-bolster.svg': fx('fbo', 'Bolster', '#06b6d4', `<path d="M6 28 Q12 16 20 14 Q28 16 34 28" fill="#67e8f9" stroke="#fff" stroke-width="1"/><path d="M14 22 L20 16 L26 22" stroke="#fff" stroke-width="2" fill="none"/>`),
  'fx-cleave.svg': fx('fcl', 'Cleave', '#94a3b8', `<path d="M6 28 Q14 4 34 12" fill="none" stroke="#e2e8f0" stroke-width="3"/><path d="M30 8 L34 12 L30 16" fill="#cbd5e1"/>`),
  'fx-lifesteal.svg': fx('fl', 'Lifesteal', '#dc2626', `<circle cx="20" cy="20" r="10" fill="#7f1d1d" stroke="#fff" stroke-width="1"/><path d="M16 16 L20 12 L24 16" fill="#fff"/><path d="M16 24 L20 28 L24 24" fill="#fff"/><circle cx="14" cy="14" r="2" fill="#fbbf24"/>`),
  'fx-summon.svg': fx('fsu', 'Summon', '#a78bfa', `<ellipse cx="20" cy="22" rx="12" ry="6" fill="#5b21b6" stroke="#fbbf24" stroke-width="1"/><path d="M14 22 L18 8 L22 8 L26 22" fill="#a78bfa" stroke="#fff" stroke-width="0.5"/>`),
  'fx-silence.svg': fx('fsl', 'Silence', '#64748b', `<circle cx="20" cy="20" r="12" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 3"/><path d="M10 30 L30 10" stroke="#ef4444" stroke-width="3"/>`),
  'fx-frostbite.svg': fx('ffr', 'Frostbite', '#06b6d4', `<g stroke="#bae6fd" stroke-width="2" fill="none"><path d="M20 6 L20 34"/><path d="M6 20 L34 20"/><path d="M10 10 L30 30"/><path d="M30 10 L10 30"/></g>`),
  'fx-enrage.svg': fx('fen', 'Enrage', '#dc2626', `<ellipse cx="20" cy="20" rx="14" ry="10" fill="#fef2f2"/><path d="M6 14 L14 18 M34 14 L26 18 M6 26 L14 22 M34 26 L26 22" stroke="#7f1d1d" stroke-width="2"/><circle cx="20" cy="20" r="4" fill="#000"/>`),
  'fx-deathrattle.svg': fx('fde', 'Deathrattle', '#52525b', `<circle cx="20" cy="20" r="10" fill="#e7e5e4" stroke="#fff" stroke-width="1"/><circle cx="16" cy="18" r="2" fill="#000"/><circle cx="24" cy="18" r="2" fill="#000"/><path d="M14 24 L26 24" stroke="#000" stroke-width="2"/><path d="M16 28 L20 32 L24 28" stroke="#a78bfa" stroke-width="1.5" fill="none"/>`),
}

// Overlays + glows
const overlays = {
  'overlay-vs.svg': svg('0 0 600 400',
    `<defs><linearGradient id="vs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#d97706"/></linearGradient></defs><rect width="600" height="400" fill="rgba(0,0,0,0.6)"/><path d="M180 100 L260 300 L300 200 L340 300 L420 100" fill="none" stroke="url(#vs)" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/><text x="300" y="240" text-anchor="middle" font-size="120" font-family="Verdana,Segoe UI,sans-serif" font-weight="900" fill="url(#vs)" stroke="#fff" stroke-width="2">VS</text>`,
    'Versus splash'),
  'overlay-victory.svg': svg('0 0 600 200',
    `<defs><linearGradient id="ov" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#a16207"/></linearGradient></defs><path d="M40 20 L560 20 L540 160 L300 180 L60 160 Z" fill="url(#ov)" stroke="#fff" stroke-width="3"/><text x="300" y="120" text-anchor="middle" font-size="64" font-family="Verdana,Segoe UI,sans-serif" font-weight="900" fill="#7c2d12">VICTORY</text>`,
    'Victory banner'),
  'overlay-defeat.svg': svg('0 0 600 200',
    `<defs><linearGradient id="od" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3d1010"/><stop offset="100%" stop-color="#1a0505"/></linearGradient></defs><path d="M40 20 L560 30 L520 170 L300 180 L80 160 Z" fill="url(#od)" stroke="#ef4444" stroke-width="3"/><text x="300" y="120" text-anchor="middle" font-size="64" font-family="Verdana,Segoe UI,sans-serif" font-weight="900" fill="#ef4444">DEFEAT</text>`,
    'Defeat banner'),
  'overlay-draw.svg': svg('0 0 600 200',
    `<rect x="40" y="20" width="520" height="160" rx="14" fill="#3a3025" stroke="#cbd5e1" stroke-width="3"/><text x="300" y="120" text-anchor="middle" font-size="64" font-family="Verdana,Segoe UI,sans-serif" font-weight="900" fill="#e2e8f0">DRAW</text>`,
    'Draw banner'),
  'overlay-attack-arrow.svg': svg('0 0 64 64',
    `<defs><linearGradient id="aagrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#fde68a"/><stop offset="55%" stop-color="#f97316"/><stop offset="100%" stop-color="#dc2626"/></linearGradient></defs><path d="M2 28 L36 28 L36 18 L62 32 L36 46 L36 36 L2 36 Z" fill="url(#aagrad)" stroke="#fff7ed" stroke-width="2" stroke-linejoin="round"/>`,
    'Attack target arrowhead'),
  'overlay-hero-cracks.svg': svg('0 0 200 200',
    `<g fill="none" stroke="#fef2f2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"><path d="M22 18 L46 56 L34 84 L62 110 L48 138 L78 158"/><path d="M178 22 L150 60 L166 84 L138 116 L154 144 L122 162"/><path d="M100 8 L96 38 L112 62 L92 92"/><path d="M14 102 L42 116 L26 142"/><path d="M186 108 L160 122 L172 150"/></g><g fill="rgba(220,38,38,0.55)" stroke="#fee2e2" stroke-width="1.5"><polygon points="46,56 52,52 50,62"/><polygon points="150,60 144,55 146,66"/><polygon points="92,92 98,86 102,98"/></g>`,
    'Hero portrait edge cracks flash'),
  'overlay-hero-halo.svg': svg('0 0 200 200',
    `<defs><radialGradient id="hheal" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(187,247,208,0.85)"/><stop offset="60%" stop-color="rgba(34,197,94,0.4)"/><stop offset="100%" stop-color="rgba(22,101,52,0)"/></radialGradient></defs><circle cx="100" cy="100" r="100" fill="url(#hheal)"/><g stroke="rgba(220,252,231,0.7)" stroke-width="2" fill="none"><circle cx="100" cy="100" r="62"/><circle cx="100" cy="100" r="84"/></g>`,
    'Hero heal halo overlay'),
  'glow-common.svg': svg('0 0 200 200',
    `<defs><radialGradient id="gco" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(203,213,225,0.7)"/><stop offset="100%" stop-color="rgba(100,116,139,0)"/></radialGradient></defs><circle cx="100" cy="100" r="100" fill="url(#gco)"/>`,
    'Common glow'),
  'glow-rare.svg': svg('0 0 200 200',
    `<defs><radialGradient id="gra" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(96,165,250,0.8)"/><stop offset="100%" stop-color="rgba(29,78,216,0)"/></radialGradient></defs><circle cx="100" cy="100" r="100" fill="url(#gra)"/>`,
    'Rare glow'),
  'glow-epic.svg': svg('0 0 200 200',
    `<defs><radialGradient id="gep" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(167,139,250,0.85)"/><stop offset="100%" stop-color="rgba(91,33,182,0)"/></radialGradient></defs><circle cx="100" cy="100" r="100" fill="url(#gep)"/><g stroke="rgba(255,255,255,0.5)" stroke-width="2" fill="none"><circle cx="100" cy="100" r="60"/></g>`,
    'Epic glow'),
  'glow-legendary.svg': svg('0 0 200 200',
    `<defs><radialGradient id="gle" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(254,230,138,0.95)"/><stop offset="50%" stop-color="rgba(217,119,6,0.5)"/><stop offset="100%" stop-color="rgba(120,53,15,0)"/></radialGradient></defs><circle cx="100" cy="100" r="100" fill="url(#gle)"/><g stroke="rgba(254,230,138,0.7)" stroke-width="3" fill="none"><line x1="100" y1="0" x2="100" y2="200"/><line x1="0" y1="100" x2="200" y2="100"/><line x1="20" y1="20" x2="180" y2="180"/><line x1="180" y1="20" x2="20" y2="180"/></g>`,
    'Legendary glow'),
  'pack-burst.svg': svg('0 0 400 400',
    `<defs><radialGradient id="pbCore" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(255,251,214,1)"/><stop offset="35%" stop-color="rgba(254,230,138,0.85)"/><stop offset="70%" stop-color="rgba(217,119,6,0.35)"/><stop offset="100%" stop-color="rgba(120,53,15,0)"/></radialGradient><linearGradient id="pbRay" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(255,251,214,0.95)"/><stop offset="100%" stop-color="rgba(254,230,138,0)"/></linearGradient></defs><circle cx="200" cy="200" r="200" fill="url(#pbCore)"/><g fill="url(#pbRay)" transform="translate(200 200)"><polygon points="-12,-200 12,-200 0,-40"/><polygon points="-12,200 12,200 0,40" transform="rotate(180)"/><polygon points="-12,-200 12,-200 0,-40" transform="rotate(45)"/><polygon points="-12,-200 12,-200 0,-40" transform="rotate(90)"/><polygon points="-12,-200 12,-200 0,-40" transform="rotate(135)"/><polygon points="-12,-200 12,-200 0,-40" transform="rotate(225)"/><polygon points="-12,-200 12,-200 0,-40" transform="rotate(270)"/><polygon points="-12,-200 12,-200 0,-40" transform="rotate(315)"/><polygon points="-6,-180 6,-180 0,-30" transform="rotate(22.5)" opacity="0.65"/><polygon points="-6,-180 6,-180 0,-30" transform="rotate(67.5)" opacity="0.65"/><polygon points="-6,-180 6,-180 0,-30" transform="rotate(112.5)" opacity="0.65"/><polygon points="-6,-180 6,-180 0,-30" transform="rotate(157.5)" opacity="0.65"/><polygon points="-6,-180 6,-180 0,-30" transform="rotate(202.5)" opacity="0.65"/><polygon points="-6,-180 6,-180 0,-30" transform="rotate(247.5)" opacity="0.65"/><polygon points="-6,-180 6,-180 0,-30" transform="rotate(292.5)" opacity="0.65"/><polygon points="-6,-180 6,-180 0,-30" transform="rotate(337.5)" opacity="0.65"/></g>`,
    'Pack opening golden burst'),
  'ribbon-new.svg': svg('0 0 120 60',
    `<defs><linearGradient id="rnFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fef2f2"/><stop offset="35%" stop-color="#ef4444"/><stop offset="100%" stop-color="#7f1d1d"/></linearGradient></defs><path d="M6 14 L98 14 L114 30 L98 46 L6 46 L18 30 Z" fill="url(#rnFill)" stroke="#fde68a" stroke-width="2" stroke-linejoin="round"/><path d="M6 14 L18 30 L6 46 L0 30 Z" fill="#7f1d1d" stroke="#fde68a" stroke-width="1.5"/><text x="58" y="38" text-anchor="middle" font-size="22" font-family="Verdana,Segoe UI,sans-serif" font-weight="900" fill="#fff8dc" stroke="#7f1d1d" stroke-width="0.6">NEW!</text>`,
    'New card discovery ribbon'),
}

// Particles (16×16)
const particles = {
  'particle-rune.svg': svg('0 0 16 16',
    `<path d="M8 2 L11 8 L8 14 L5 8 Z" fill="rgba(167,139,250,0.7)" stroke="#fff" stroke-width="0.5"/>`,
    'Rune particle'),
  'particle-ember.svg': svg('0 0 16 16',
    `<defs><radialGradient id="pe" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fef3c7"/><stop offset="100%" stop-color="rgba(251,127,36,0)"/></radialGradient></defs><circle cx="8" cy="8" r="6" fill="url(#pe)"/>`,
    'Ember particle'),
  'particle-dust.svg': svg('0 0 16 16',
    `<circle cx="8" cy="8" r="3" fill="rgba(254,240,138,0.4)"/>`,
    'Dust particle'),
  'particle-frost.svg': svg('0 0 16 16',
    `<g stroke="#bae6fd" stroke-width="1.5" fill="none"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></g>`,
    'Frost particle'),
}

// Combine all UI assets — these write into public/generated/ui/
const uiAssets = {
  ...backgrounds,
  ...tiles,
  ...ranks,
  ...packs,
  ...gems,
  ...chrome,
  ...effects,
  ...overlays,
  ...particles,
}

const allCards = buildCardArtFiles()

const uiAssetType = (id) => {
  if (id.startsWith('bg-')) return 'ui-background'
  if (id.startsWith('tile-')) return 'ui-nav-tile'
  if (id.startsWith('nav-')) return 'ui-nav-glyph'
  if (id.startsWith('rank-')) return 'ui-rank'
  if (id === 'pack-burst.svg' || id === 'ribbon-new.svg') return 'ui-overlay'
  if (id.startsWith('pack-')) return 'ui-pack'
  if (id.startsWith('gem-')) return 'ui-rarity-gem'
  if (id.startsWith('btn-') || id.startsWith('panel-') || id.startsWith('divider-') || id.startsWith('pip-') || id.startsWith('icon-')) return 'ui-chrome'
  if (id.startsWith('fx-')) return 'ui-effect'
  if (id.startsWith('overlay-') || id.startsWith('glow-')) return 'ui-overlay'
  if (id.startsWith('particle-')) return 'ui-particle'
  return 'ui-misc'
}

const manifest = {
  generatedAt: new Date().toISOString(),
  provider: assetProvider,
  apiReady: assetApiReady,
  commercialSafe: true,
  notes: 'All bundled defaults are original local SVG assets. If an external image service is later connected, review output manually before shipping.',
  assets: [
    ...Object.keys(sharedFiles).map((file) => ({
      id: file,
      path: `/${file}`,
      type: file.includes('banner') ? 'ui-banner' : 'brand',
      source: 'local-generated',
    })),
    ...Object.keys(uiAssets).map((file) => ({
      id: file,
      path: `/generated/ui/${file}`,
      type: uiAssetType(file),
      source: 'local-generated',
    })),
    ...allCards.map((card) => ({
      id: card.id,
      path: `/generated/cards/${card.id}.svg`,
      type: 'card-art',
      source: 'local-generated',
      rarity: card.rarity ?? 'common',
    })),
  ],
}

for (const [name, content] of Object.entries(sharedFiles)) {
  writeFileSync(path.join(publicDir, name), `${content}\n`, 'utf8')
}

for (const [name, content] of Object.entries(uiAssets)) {
  writeFileSync(path.join(uiDir, name), `${content}\n`, 'utf8')
}

// Prune art for cards that no longer exist before writing the live set,
// so retired ids cannot linger and mask a broken lookup.
const cardFileNames = new Set(allCards.map((card) => `${card.id}.svg`))
for (const existing of readdirSync(cardsDir)) {
  if (existing.endsWith('.svg') && !cardFileNames.has(existing)) {
    unlinkSync(path.join(cardsDir, existing))
  }
}
for (const card of allCards) {
  writeFileSync(path.join(cardsDir, `${card.id}.svg`), `${card.svg}\n`, 'utf8')
}

writeFileSync(path.join(generatedDir, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(
  `Generated ${Object.keys(sharedFiles).length + Object.keys(uiAssets).length + allCards.length} Fractured Arcanum assets via ${assetProvider}${assetApiReady ? ' with API-ready pipeline hooks' : ''}.`,
)
