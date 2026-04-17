import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

const cardBlueprints = [
  {
    id: 'spark-imp',
    title: 'Spark Imp',
    accent: '#38bdf8',
    accent2: '#7c3aed',
    prompt: 'small electric imp leaping through rune lightning above a storm altar',
    scene: `
      <circle cx="230" cy="82" r="34" fill="rgba(56,189,248,.22)"/>
      <path d="M162 70 L186 112 L156 112 L188 172" fill="none" stroke="#f8fafc" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M98 196 C122 122 216 122 246 196" fill="#1f3a75"/>
      <circle cx="170" cy="132" r="28" fill="#6d28d9"/>
    `,
  },
  {
    id: 'shade-fox',
    title: 'Shade Fox',
    accent: '#8b5cf6',
    accent2: '#1d4ed8',
    prompt: 'mystic fox silhouette dashing under moonlight through shadow grass',
    scene: `
      <circle cx="218" cy="78" r="30" fill="rgba(255,255,255,.18)"/>
      <path d="M92 188 C124 146 166 128 208 130 C184 162 166 180 222 188 C182 208 136 210 92 188 Z" fill="#312e81"/>
      <path d="M114 142 L132 110 L150 138" fill="none" stroke="#f8fafc" stroke-width="8" stroke-linecap="round"/>
    `,
  },
  {
    id: 'ironbark-guard',
    title: 'Ironbark Guard',
    accent: '#22c55e',
    accent2: '#fbbf24',
    prompt: 'enchanted wooden guardian shielded by iron bark and glowing runes',
    scene: `
      <path d="M170 60 L220 88 V138 C220 174 198 204 170 218 C142 204 120 174 120 138 V88 Z" fill="#365314"/>
      <path d="M170 98 L184 126 L214 132 L184 138 L170 166 L156 138 L126 132 L156 126 Z" fill="#fde68a"/>
      <rect x="88" y="186" width="164" height="28" rx="14" fill="#14532d"/>
    `,
  },
  {
    id: 'dawn-healer',
    title: 'Dawn Healer',
    accent: '#f59e0b',
    accent2: '#fb7185',
    prompt: 'radiant healer channeling sunrise light over a blessed shrine',
    scene: `
      <circle cx="170" cy="92" r="38" fill="rgba(251,191,36,.35)"/>
      <path d="M170 112 V184 M134 148 H206" stroke="#fff7ed" stroke-width="12" stroke-linecap="round"/>
      <path d="M90 198 C122 154 218 154 250 198" fill="#7c2d12" opacity=".6"/>
    `,
  },
  {
    id: 'rune-scholar',
    title: 'Rune Scholar',
    accent: '#38bdf8',
    accent2: '#a78bfa',
    prompt: 'arcane scholar studying a floating rune tome in a moonlit library',
    scene: `
      <rect x="118" y="118" width="104" height="70" rx="10" fill="#1d4ed8"/>
      <path d="M170 118 V188" stroke="#dbeafe" stroke-width="4"/>
      <path d="M132 136 Q154 124 170 136 Q186 124 208 136" fill="none" stroke="#dbeafe" stroke-width="4"/>
      <circle cx="170" cy="78" r="26" fill="rgba(56,189,248,.28)"/>
    `,
  },
  {
    id: 'sky-raider',
    title: 'Sky Raider',
    accent: '#60a5fa',
    accent2: '#06b6d4',
    prompt: 'swift winged raider soaring through cloud lanes above the arena',
    scene: `
      <path d="M92 164 C132 132 148 126 170 132 C190 126 208 132 248 164 C214 160 196 164 170 178 C144 164 126 160 92 164 Z" fill="#dbeafe" opacity=".85"/>
      <circle cx="170" cy="120" r="16" fill="#38bdf8"/>
      <path d="M62 198 H278" stroke="rgba(255,255,255,.2)" stroke-width="8" stroke-linecap="round"/>
    `,
  },
  {
    id: 'moonwell-sage',
    title: 'Moonwell Sage',
    accent: '#818cf8',
    accent2: '#38bdf8',
    prompt: 'wise sage beside a glowing moonwell with shimmering water magic',
    scene: `
      <circle cx="170" cy="84" r="34" fill="rgba(165,180,252,.28)"/>
      <ellipse cx="170" cy="176" rx="64" ry="26" fill="#0f4c81"/>
      <ellipse cx="170" cy="176" rx="40" ry="12" fill="#93c5fd"/>
      <path d="M120 142 C136 120 204 120 220 142" fill="none" stroke="#c4b5fd" stroke-width="8" stroke-linecap="round"/>
    `,
  },
  {
    id: 'ember-witch',
    title: 'Ember Witch',
    accent: '#ef4444',
    accent2: '#f59e0b',
    prompt: 'ember witch casting fiery runes across a dark volcanic battlefield',
    scene: `
      <path d="M170 66 C194 100 206 128 206 150 C206 176 190 194 170 194 C150 194 134 176 134 150 C134 128 146 100 170 66 Z" fill="#fb7185"/>
      <path d="M150 164 C162 152 170 134 176 114 C186 132 190 146 190 158 C190 172 182 180 170 180 C160 180 152 174 150 164 Z" fill="#fbbf24"/>
      <circle cx="226" cy="102" r="14" fill="rgba(251,191,36,.35)"/>
    `,
  },
  {
    id: 'storm-brute',
    title: 'Storm Brute',
    accent: '#64748b',
    accent2: '#38bdf8',
    prompt: 'massive storm brute marching through thunder and rain with heavy armor',
    scene: `
      <path d="M104 194 C110 144 136 120 170 120 C204 120 230 144 236 194 Z" fill="#475569"/>
      <circle cx="170" cy="96" r="24" fill="#64748b"/>
      <path d="M122 74 L148 98 L134 98 L154 126" fill="none" stroke="#e0f2fe" stroke-width="8" stroke-linecap="round"/>
    `,
  },
  {
    id: 'sunforged-giant',
    title: 'Sunforged Giant',
    accent: '#fbbf24',
    accent2: '#f97316',
    prompt: 'towering sunforged giant emerging from a radiant forge temple',
    scene: `
      <circle cx="170" cy="74" r="36" fill="rgba(251,191,36,.34)"/>
      <path d="M114 196 C122 134 146 108 170 108 C194 108 218 134 226 196 Z" fill="#ea580c"/>
      <path d="M144 124 H196 L188 164 H152 Z" fill="#fde68a" opacity=".55"/>
    `,
  },
  {
    id: 'void-leech',
    title: 'Void Leech',
    accent: '#dc2626',
    accent2: '#7c3aed',
    prompt: 'dark leech creature draining glowing purple energy from a rift',
    scene: `
      <ellipse cx="170" cy="148" rx="60" ry="36" fill="#3b0764"/>
      <circle cx="170" cy="108" r="28" fill="#7c3aed" opacity=".7"/>
      <path d="M142 108 C142 88 198 88 198 108" fill="none" stroke="#f87171" stroke-width="8" stroke-linecap="round"/>
      <circle cx="156" cy="102" r="5" fill="#fca5a5"/>
      <circle cx="184" cy="102" r="5" fill="#fca5a5"/>
    `,
  },
  {
    id: 'warcry-sentinel',
    title: 'Warcry Sentinel',
    accent: '#f59e0b',
    accent2: '#dc2626',
    prompt: 'armored sentinel blowing a war horn on a fortress rampart at dawn',
    scene: `
      <path d="M120 196 C128 146 150 122 170 122 C190 122 212 146 220 196 Z" fill="#92400e"/>
      <circle cx="170" cy="98" r="22" fill="#b45309"/>
      <path d="M198 118 L248 132 L246 142 L196 136" fill="#fbbf24"/>
      <rect x="86" y="188" width="168" height="12" rx="6" fill="#78350f"/>
    `,
  },
  {
    id: 'venom-drake',
    title: 'Venom Drake',
    accent: '#22c55e',
    accent2: '#14532d',
    prompt: 'venomous drake exhaling toxic green mist over a swamp lair',
    scene: `
      <path d="M100 188 C120 140 150 116 170 116 C190 116 220 140 240 188 Z" fill="#14532d"/>
      <circle cx="170" cy="96" r="24" fill="#166534"/>
      <path d="M136 90 L154 104 M186 104 L204 90" fill="none" stroke="#4ade80" stroke-width="6" stroke-linecap="round"/>
      <path d="M148 128 C160 142 180 142 192 128" fill="none" stroke="#bbf7d0" stroke-width="4"/>
      <circle cx="130" cy="158" r="8" fill="rgba(74,222,128,.3)"/>
      <circle cx="214" cy="148" r="6" fill="rgba(74,222,128,.25)"/>
    `,
  },
  {
    id: 'aegis-knight',
    title: 'Aegis Knight',
    accent: '#3b82f6',
    accent2: '#fbbf24',
    prompt: 'noble knight behind a massive glowing shield with golden rune crest',
    scene: `
      <path d="M170 64 L226 94 V154 C226 192 200 210 170 222 C140 210 114 192 114 154 V94 Z" fill="#1e3a5f"/>
      <path d="M170 84 L202 102 V142 C202 168 188 182 170 190 C152 182 138 168 138 142 V102 Z" fill="#2563eb"/>
      <path d="M170 110 L180 130 L200 134 L180 138 L170 158 L160 138 L140 134 L160 130 Z" fill="#fde68a"/>
    `,
  },
  {
    id: 'soul-reaver',
    title: 'Soul Reaver',
    accent: '#6b21a8',
    accent2: '#f43f5e',
    prompt: 'spectral reaver drawing ghostly souls from a dark battlefield',
    scene: `
      <path d="M110 194 C120 148 146 122 170 122 C194 122 220 148 230 194 Z" fill="#3b0764"/>
      <circle cx="170" cy="100" r="22" fill="#6b21a8"/>
      <path d="M126 168 C136 144 150 148 152 172" fill="none" stroke="rgba(248,113,113,.5)" stroke-width="4"/>
      <path d="M192 168 C202 144 216 148 218 172" fill="none" stroke="rgba(248,113,113,.5)" stroke-width="4"/>
      <circle cx="162" cy="96" r="4" fill="#f87171"/>
      <circle cx="178" cy="96" r="4" fill="#f87171"/>
    `,
  },
  {
    id: 'tide-caller',
    title: 'Tide Caller',
    accent: '#06b6d4',
    accent2: '#1e40af',
    prompt: 'small water mage summoning rising ocean waves under a moonlit sky',
    scene: `
      <circle cx="170" cy="78" r="24" fill="rgba(6,182,212,.3)"/>
      <path d="M60 168 C100 148 140 158 170 148 C200 158 240 148 280 168 V210 H60 Z" fill="#0e7490" opacity=".7"/>
      <path d="M80 178 C110 162 150 172 170 162 C190 172 230 162 260 178" fill="none" stroke="#67e8f9" stroke-width="6" stroke-linecap="round"/>
      <circle cx="170" cy="128" r="14" fill="#155e75"/>
    `,
  },
  {
    id: 'crystal-golem',
    title: 'Crystal Golem',
    accent: '#a78bfa',
    accent2: '#7c3aed',
    prompt: 'massive crystalline golem standing as an impenetrable fortress wall',
    scene: `
      <path d="M120 196 L148 104 L170 76 L192 104 L220 196 Z" fill="#5b21b6"/>
      <path d="M148 104 L170 76 L192 104 L170 132 Z" fill="#a78bfa" opacity=".6"/>
      <path d="M134 162 L170 132 L206 162" fill="none" stroke="#ddd6fe" stroke-width="4"/>
      <rect x="94" y="192" width="152" height="12" rx="6" fill="#4c1d95"/>
    `,
  },
  {
    id: 'blaze-runner',
    title: 'Blaze Runner',
    accent: '#f97316',
    accent2: '#ef4444',
    prompt: 'fiery speedster trailing flames as they dash across the arena',
    scene: `
      <path d="M220 168 C200 132 184 128 170 128 C156 128 140 136 120 156" fill="none" stroke="#fb923c" stroke-width="12" stroke-linecap="round"/>
      <circle cx="170" cy="124" r="18" fill="#f97316"/>
      <path d="M200 128 C218 114 230 126 226 148" fill="none" stroke="#fbbf24" stroke-width="6" stroke-linecap="round"/>
      <path d="M136 148 C120 138 108 142 110 162" fill="none" stroke="#fb923c" stroke-width="5" stroke-linecap="round" opacity=".6"/>
    `,
  },
  {
    id: 'nether-witch',
    title: 'Nether Witch',
    accent: '#a855f7',
    accent2: '#ec4899',
    prompt: 'mysterious witch casting dual nether spells crackling with purple energy',
    scene: `
      <path d="M170 62 L194 110 L148 110 Z" fill="#581c87"/>
      <circle cx="170" cy="138" r="24" fill="#7e22ce"/>
      <path d="M118 158 C134 128 150 128 170 138 C190 128 206 128 222 158" fill="none" stroke="#d8b4fe" stroke-width="6" stroke-linecap="round"/>
      <circle cx="128" cy="162" r="8" fill="rgba(236,72,153,.4)"/>
      <circle cx="212" cy="162" r="8" fill="rgba(168,85,247,.4)"/>
    `,
  },
  {
    id: 'runebound-oracle',
    title: 'Runebound Oracle',
    accent: '#818cf8',
    accent2: '#06b6d4',
    prompt: 'ancient oracle surrounded by floating glowing rune tablets',
    scene: `
      <circle cx="170" cy="108" r="30" fill="#312e81"/>
      <rect x="118" y="142" width="28" height="38" rx="6" fill="#4338ca" transform="rotate(-12 132 161)"/>
      <rect x="194" y="142" width="28" height="38" rx="6" fill="#4338ca" transform="rotate(12 208 161)"/>
      <rect x="156" y="148" width="28" height="38" rx="6" fill="#6366f1"/>
      <circle cx="170" cy="84" r="14" fill="rgba(6,182,212,.3)"/>
    `,
  },
]

// ─── Procedural card art for the extended library ───────────────────────────

const RARITY_BORDERS = {
  common: 'rgba(156,163,175,.45)',
  rare: 'rgba(59,130,246,.55)',
  epic: 'rgba(168,85,247,.6)',
  legendary: 'rgba(245,158,11,.7)',
}

const CARD_THEMES = {
  'flame': { c1: '#ef4444', c2: '#f97316', bg: '#451a03' },
  'fire': { c1: '#fb923c', c2: '#ef4444', bg: '#451a03' },
  'ember': { c1: '#f97316', c2: '#dc2626', bg: '#431407' },
  'blaze': { c1: '#fbbf24', c2: '#ef4444', bg: '#451a03' },
  'inferno': { c1: '#ef4444', c2: '#fbbf24', bg: '#7c2d12' },
  'lava': { c1: '#ef4444', c2: '#ea580c', bg: '#7c2d12' },
  'crimson': { c1: '#dc2626', c2: '#a855f7', bg: '#450a0a' },
  'stone': { c1: '#94a3b8', c2: '#64748b', bg: '#1e293b' },
  'iron': { c1: '#9ca3af', c2: '#6b7280', bg: '#1f2937' },
  'clay': { c1: '#a16207', c2: '#92400e', bg: '#451a03' },
  'crystal': { c1: '#a78bfa', c2: '#7c3aed', bg: '#2e1065' },
  'obsidian': { c1: '#475569', c2: '#1e293b', bg: '#0f172a' },
  'dark': { c1: '#6b21a8', c2: '#1e1b4b', bg: '#0c0a1e' },
  'shadow': { c1: '#581c87', c2: '#1e1b4b', bg: '#0c0a1e' },
  'void': { c1: '#7c3aed', c2: '#312e81', bg: '#0c0a1e' },
  'nether': { c1: '#a855f7', c2: '#ec4899', bg: '#2e1065' },
  'necro': { c1: '#6b21a8', c2: '#1e1b4b', bg: '#0c0a1e' },
  'ghost': { c1: '#93c5fd', c2: '#6b7280', bg: '#1e293b' },
  'bone': { c1: '#d4d4d8', c2: '#71717a', bg: '#27272a' },
  'plague': { c1: '#84cc16', c2: '#65a30d', bg: '#1a2e05' },
  'poison': { c1: '#22c55e', c2: '#15803d', bg: '#052e16' },
  'swamp': { c1: '#4ade80', c2: '#166534', bg: '#052e16' },
  'moss': { c1: '#86efac', c2: '#15803d', bg: '#052e16' },
  'thorn': { c1: '#22c55e', c2: '#854d0e', bg: '#14532d' },
  'nature': { c1: '#4ade80', c2: '#22c55e', bg: '#14532d' },
  'jungle': { c1: '#16a34a', c2: '#15803d', bg: '#052e16' },
  'druid': { c1: '#4ade80', c2: '#22c55e', bg: '#14532d' },
  'ancient': { c1: '#a3a3a3', c2: '#525252', bg: '#171717' },
  'elven': { c1: '#93c5fd', c2: '#22c55e', bg: '#0a3622' },
  'silver': { c1: '#e2e8f0', c2: '#94a3b8', bg: '#1e293b' },
  'golden': { c1: '#fbbf24', c2: '#f59e0b', bg: '#78350f' },
  'gold': { c1: '#fbbf24', c2: '#f59e0b', bg: '#78350f' },
  'frost': { c1: '#67e8f9', c2: '#06b6d4', bg: '#083344' },
  'glacial': { c1: '#a5f3fc', c2: '#22d3ee', bg: '#083344' },
  'ice': { c1: '#67e8f9', c2: '#0891b2', bg: '#083344' },
  'sea': { c1: '#38bdf8', c2: '#0284c7', bg: '#0c4a6e' },
  'coral': { c1: '#fb7185', c2: '#06b6d4', bg: '#083344' },
  'deep': { c1: '#0891b2', c2: '#1e3a8a', bg: '#0c4a6e' },
  'tide': { c1: '#38bdf8', c2: '#1d4ed8', bg: '#1e3a8a' },
  'water': { c1: '#38bdf8', c2: '#6366f1', bg: '#1e3a8a' },
  'storm': { c1: '#60a5fa', c2: '#7c3aed', bg: '#1e1b4b' },
  'thunder': { c1: '#fbbf24', c2: '#3b82f6', bg: '#1e3a8a' },
  'tempest': { c1: '#818cf8', c2: '#3b82f6', bg: '#312e81' },
  'wind': { c1: '#a5f3fc', c2: '#93c5fd', bg: '#0c4a6e' },
  'dust': { c1: '#d4d4d8', c2: '#a8a29e', bg: '#292524' },
  'sand': { c1: '#fcd34d', c2: '#d97706', bg: '#78350f' },
  'war': { c1: '#ef4444', c2: '#b91c1c', bg: '#450a0a' },
  'battle': { c1: '#f87171', c2: '#dc2626', bg: '#450a0a' },
  'wild': { c1: '#84cc16', c2: '#ca8a04', bg: '#365314' },
  'blood': { c1: '#dc2626', c2: '#7f1d1d', bg: '#450a0a' },
  'mana': { c1: '#7c3aed', c2: '#2563eb', bg: '#312e81' },
  'rune': { c1: '#818cf8', c2: '#6366f1', bg: '#1e1b4b' },
  'arcane': { c1: '#a78bfa', c2: '#7c3aed', bg: '#2e1065' },
  'celestial': { c1: '#fde68a', c2: '#818cf8', bg: '#1e1b4b' },
  'moon': { c1: '#93c5fd', c2: '#a78bfa', bg: '#312e81' },
  'spark': { c1: '#38bdf8', c2: '#fbbf24', bg: '#1e3a8a' },
  'phoenix': { c1: '#f97316', c2: '#fbbf24', bg: '#7c2d12' },
  'spirit': { c1: '#c4b5fd', c2: '#6366f1', bg: '#312e81' },
  'velara': { c1: '#fde68a', c2: '#818cf8', bg: '#312e81' },
  'malachar': { c1: '#7c3aed', c2: '#0f172a', bg: '#0c0a1e' },
  'kronos': { c1: '#fbbf24', c2: '#d97706', bg: '#78350f' },
  'aethon': { c1: '#60a5fa', c2: '#fbbf24', bg: '#1e3a8a' },
  'drakarion': { c1: '#ef4444', c2: '#fbbf24', bg: '#7c2d12' },
  'zephyr': { c1: '#67e8f9', c2: '#a5f3fc', bg: '#083344' },
}

function simpleHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function getCardTheme(cardId) {
  const parts = cardId.split('-')
  for (const part of parts) {
    if (CARD_THEMES[part]) return CARD_THEMES[part]
  }
  // fallback
  return { c1: '#64748b', c2: '#475569', bg: '#1e293b' }
}

const SCENE_TEMPLATES = [
  // creature: circle head + body triangle
  (h, c1, c2) => `
    <circle cx="170" cy="${80 + (h % 20)}" r="${22 + (h % 14)}" fill="${c1}" opacity=".8"/>
    <path d="M${110 + (h % 20)} 196 C${120 + (h % 10)} ${140 + (h % 20)} ${150 + (h % 8)} ${110 + (h % 18)} 170 ${110 + (h % 18)} C${190 - (h % 8)} ${110 + (h % 18)} ${220 - (h % 10)} ${140 + (h % 20)} ${230 - (h % 20)} 196 Z" fill="${c2}"/>
    <circle cx="${155 + (h % 10)}" cy="${76 + (h % 20)}" r="4" fill="#fff"/>
    <circle cx="${179 + (h % 6)}" cy="${76 + (h % 20)}" r="4" fill="#fff"/>`,
  // magic: orb with rays
  (h, c1, c2) => `
    <circle cx="170" cy="${108 + (h % 16)}" r="${30 + (h % 16)}" fill="${c1}" opacity=".35"/>
    <circle cx="170" cy="${108 + (h % 16)}" r="${18 + (h % 10)}" fill="${c2}" opacity=".7"/>
    <path d="M170 ${72 + (h % 12)} V${58 + (h % 8)} M${136 + (h % 8)} ${88 + (h % 12)} L${122 + (h % 10)} ${76 + (h % 10)} M${204 - (h % 8)} ${88 + (h % 12)} L${218 - (h % 10)} ${76 + (h % 10)}" stroke="${c1}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path d="M90 194 C130 ${150 + (h % 16)} 210 ${150 + (h % 16)} 250 194" fill="${c2}" opacity=".3"/>`,
  // shield / armor
  (h, c1, c2) => `
    <path d="M170 ${62 + (h % 16)} L${216 + (h % 14)} ${90 + (h % 10)} V${148 + (h % 14)} C${216 + (h % 14)} ${180 + (h % 12)} ${192 + (h % 10)} ${200 + (h % 8)} 170 ${210 + (h % 8)} C${148 - (h % 10)} ${200 + (h % 8)} ${124 - (h % 14)} ${180 + (h % 12)} ${124 - (h % 14)} ${148 + (h % 14)} V${90 + (h % 10)} Z" fill="${c2}"/>
    <path d="M170 ${82 + (h % 14)} L${184 + (h % 8)} ${108 + (h % 10)} L${206 + (h % 10)} ${114 + (h % 8)} L${184 + (h % 8)} ${120 + (h % 10)} L170 ${146 + (h % 12)} L${156 - (h % 8)} ${120 + (h % 10)} L${134 - (h % 10)} ${114 + (h % 8)} L${156 - (h % 8)} ${108 + (h % 10)} Z" fill="${c1}" opacity=".6"/>`,
  // beast: elongated body with tail
  (h, c1, c2) => `
    <path d="M${100 + (h % 20)} 186 C${124 + (h % 10)} ${142 + (h % 16)} ${150 + (h % 8)} ${120 + (h % 14)} 170 ${120 + (h % 14)} C${190 - (h % 8)} ${120 + (h % 14)} ${216 - (h % 10)} ${142 + (h % 16)} ${240 - (h % 20)} 186 Z" fill="${c2}"/>
    <circle cx="170" cy="${100 + (h % 14)}" r="${20 + (h % 8)}" fill="${c1}"/>
    <path d="${240 - (h % 20)} 186 C${252 - (h % 14)} ${168 + (h % 12)} ${264 - (h % 12)} ${172 + (h % 10)} ${268 - (h % 16)} ${158 + (h % 16)}" fill="none" stroke="${c1}" stroke-width="${5 + (h % 3)}" stroke-linecap="round"/>
    <circle cx="${160 + (h % 6)}" cy="${96 + (h % 14)}" r="3" fill="#fff"/>
    <circle cx="${176 + (h % 4)}" cy="${96 + (h % 14)}" r="3" fill="#fff"/>`,
  // dragon / winged
  (h, c1, c2) => `
    <path d="M${88 + (h % 16)} ${158 + (h % 14)} C${128 + (h % 10)} ${126 + (h % 14)} ${148 + (h % 8)} ${118 + (h % 12)} 170 ${118 + (h % 12)} C${192 - (h % 8)} ${118 + (h % 12)} ${212 - (h % 10)} ${126 + (h % 14)} ${252 - (h % 16)} ${158 + (h % 14)} C${216 - (h % 10)} ${152 + (h % 12)} ${198 + (h % 6)} ${158 + (h % 10)} 170 ${170 + (h % 10)} C${142 - (h % 6)} ${158 + (h % 10)} ${124 + (h % 10)} ${152 + (h % 12)} ${88 + (h % 16)} ${158 + (h % 14)} Z" fill="${c2}" opacity=".75"/>
    <circle cx="170" cy="${104 + (h % 12)}" r="${18 + (h % 8)}" fill="${c1}"/>
    <path d="M${86 + (h % 16)} ${148 + (h % 12)} L${62 + (h % 14)} ${108 + (h % 20)} M${254 - (h % 16)} ${148 + (h % 12)} L${278 - (h % 14)} ${108 + (h % 20)}" stroke="${c1}" stroke-width="${4 + (h % 3)}" stroke-linecap="round" fill="none"/>`,
  // elemental: swirl
  (h, c1, c2) => `
    <circle cx="170" cy="${110 + (h % 18)}" r="${36 + (h % 14)}" fill="${c2}" opacity=".4"/>
    <path d="M170 ${76 + (h % 14)} C${200 + (h % 12)} ${82 + (h % 10)} ${214 + (h % 10)} ${110 + (h % 10)} ${206 + (h % 8)} ${138 + (h % 14)} C${198 + (h % 6)} ${162 + (h % 10)} ${186 + (h % 8)} ${172 + (h % 8)} 170 ${174 + (h % 10)}" fill="none" stroke="${c1}" stroke-width="${6 + (h % 4)}" stroke-linecap="round"/>
    <path d="M170 ${174 + (h % 10)} C${154 - (h % 8)} ${172 + (h % 8)} ${142 - (h % 6)} ${162 + (h % 10)} ${134 - (h % 8)} ${138 + (h % 14)} C${126 - (h % 10)} ${110 + (h % 10)} ${140 - (h % 12)} ${82 + (h % 10)} 170 ${76 + (h % 14)}" fill="none" stroke="${c1}" stroke-width="${4 + (h % 3)}" stroke-linecap="round" opacity=".5"/>`,
]

const extendedCards = [
  // Common (28)
  { id: 'flame-imp', title: 'Flame Imp', rarity: 'common' },
  { id: 'stone-wall', title: 'Stone Wall', rarity: 'common' },
  { id: 'elven-archer', title: 'Elven Archer', rarity: 'common' },
  { id: 'dark-cultist', title: 'Dark Cultist', rarity: 'common' },
  { id: 'mana-wisp', title: 'Mana Wisp', rarity: 'common' },
  { id: 'shadow-fiend', title: 'Shadow Fiend', rarity: 'common' },
  { id: 'frost-archer', title: 'Frost Archer', rarity: 'common' },
  { id: 'iron-guard', title: 'Iron Guard', rarity: 'common' },
  { id: 'war-grunt', title: 'War Grunt', rarity: 'common' },
  { id: 'nature-sprite', title: 'Nature Sprite', rarity: 'common' },
  { id: 'fire-drake', title: 'Fire Drake', rarity: 'common' },
  { id: 'crystal-shard', title: 'Crystal Shard', rarity: 'common' },
  { id: 'swamp-lurker', title: 'Swamp Lurker', rarity: 'common' },
  { id: 'battle-dog', title: 'Battle Dog', rarity: 'common' },
  { id: 'wind-sprite', title: 'Wind Sprite', rarity: 'common' },
  { id: 'ember-mage', title: 'Ember Mage', rarity: 'common' },
  { id: 'stone-golem', title: 'Stone Golem', rarity: 'common' },
  { id: 'sea-serpent', title: 'Sea Serpent', rarity: 'common' },
  { id: 'poison-dart', title: 'Poison Dart', rarity: 'common' },
  { id: 'flame-dancer', title: 'Flame Dancer', rarity: 'common' },
  { id: 'iron-sentry', title: 'Iron Sentry', rarity: 'common' },
  { id: 'plague-rat', title: 'Plague Rat', rarity: 'common' },
  { id: 'wild-boar', title: 'Wild Boar', rarity: 'common' },
  { id: 'dust-devil', title: 'Dust Devil', rarity: 'common' },
  { id: 'moss-troll', title: 'Moss Troll', rarity: 'common' },
  { id: 'thorn-bush', title: 'Thorn Bush', rarity: 'common' },
  { id: 'spark-elemental', title: 'Spark Elemental', rarity: 'common' },
  { id: 'clay-soldier', title: 'Clay Soldier', rarity: 'common' },
  // Rare (22)
  { id: 'fire-imp', title: 'Fire Imp', rarity: 'rare' },
  { id: 'silver-knight', title: 'Silver Knight', rarity: 'rare' },
  { id: 'golden-dragon', title: 'Golden Dragon', rarity: 'rare' },
  { id: 'spirit-healer', title: 'Spirit Healer', rarity: 'rare' },
  { id: 'rune-weaver', title: 'Rune Weaver', rarity: 'rare' },
  { id: 'blood-mage', title: 'Blood Mage', rarity: 'rare' },
  { id: 'thunder-wolf', title: 'Thunder Wolf', rarity: 'rare' },
  { id: 'bone-knight', title: 'Bone Knight', rarity: 'rare' },
  { id: 'sand-wurm', title: 'Sand Wurm', rarity: 'rare' },
  { id: 'moon-druid', title: 'Moon Druid', rarity: 'rare' },
  { id: 'lava-hound', title: 'Lava Hound', rarity: 'rare' },
  { id: 'ghost-knight', title: 'Ghost Knight', rarity: 'rare' },
  { id: 'jungle-panther', title: 'Jungle Panther', rarity: 'rare' },
  { id: 'coral-golem', title: 'Coral Golem', rarity: 'rare' },
  { id: 'obsidian-knight', title: 'Obsidian Knight', rarity: 'rare' },
  { id: 'shadow-assassin', title: 'Shadow Assassin', rarity: 'rare' },
  { id: 'glacial-colossus', title: 'Glacial Colossus', rarity: 'rare' },
  { id: 'arcane-golem', title: 'Arcane Golem', rarity: 'rare' },
  { id: 'storm-shaman', title: 'Storm Shaman', rarity: 'rare' },
  { id: 'bone-collector', title: 'Bone Collector', rarity: 'rare' },
  { id: 'ancient-hydra', title: 'Ancient Hydra', rarity: 'rare' },
  { id: 'druid-elder', title: 'Druid Elder', rarity: 'rare' },
  // Epic (14)
  { id: 'inferno-dragon', title: 'Inferno Dragon', rarity: 'epic' },
  { id: 'abyssal-tyrant', title: 'Abyssal Tyrant', rarity: 'epic' },
  { id: 'iron-clad', title: 'Iron-Clad', rarity: 'epic' },
  { id: 'phoenix-ascendant', title: 'Phoenix Ascendant', rarity: 'epic' },
  { id: 'crimson-witch', title: 'Crimson Witch', rarity: 'epic' },
  { id: 'thunder-titan', title: 'Thunder Titan', rarity: 'epic' },
  { id: 'deep-kraken', title: 'Deep Kraken', rarity: 'epic' },
  { id: 'war-chief', title: 'War Chief', rarity: 'epic' },
  { id: 'crystal-oracle', title: 'Crystal Oracle', rarity: 'epic' },
  { id: 'necro-sage', title: 'Necro-Sage', rarity: 'epic' },
  { id: 'celestial-archer', title: 'Celestial Archer', rarity: 'epic' },
  { id: 'void-stalker', title: 'Void Stalker', rarity: 'epic' },
  { id: 'arcane-artificer', title: 'Arcane Artificer', rarity: 'epic' },
  { id: 'tempest-eagle', title: 'Tempest Eagle', rarity: 'epic' },
  // Legendary (6)
  { id: 'velara', title: 'Velara, Lightbinder', rarity: 'legendary' },
  { id: 'malachar', title: 'Malachar, Shadow Lord', rarity: 'legendary' },
  { id: 'kronos', title: 'Kronos, Titan of Ages', rarity: 'legendary' },
  { id: 'aethon', title: 'Aethon, Skyforger', rarity: 'legendary' },
  { id: 'drakarion', title: 'Drakarion, the Worldflame', rarity: 'legendary' },
  { id: 'zephyr', title: 'Zephyr, the Gale Sovereign', rarity: 'legendary' },
]

function generateExtendedBlueprint(card) {
  const h = simpleHash(card.id)
  const theme = getCardTheme(card.id)
  const templateIdx = h % SCENE_TEMPLATES.length
  const scene = SCENE_TEMPLATES[templateIdx](h, theme.c1, theme.c2)
  return {
    id: card.id,
    title: card.title,
    accent: theme.c1,
    accent2: theme.c2,
    rarity: card.rarity,
    scene,
  }
}

const extendedBlueprints = extendedCards.map(generateExtendedBlueprint)

function makeStars(color = 'rgba(255,255,255,.18)') {
  return Array.from({ length: 7 }, (_, index) => {
    const x = 40 + index * 36
    const y = 28 + (index % 3) * 18
    return `<circle cx="${x}" cy="${y}" r="2.4" fill="${color}"/>`
  }).join('')
}

function makeCardArt(card) {
  const border = RARITY_BORDERS[card.rarity] ?? 'rgba(251,191,36,.45)'
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 220" role="img" aria-label="${card.title} illustration">
  <defs>
    <linearGradient id="sky-${card.id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1226"/>
      <stop offset="100%" stop-color="${card.accent2}" stop-opacity="0.75"/>
    </linearGradient>
    <linearGradient id="ground-${card.id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${card.accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#0b1020" stop-opacity="0.12"/>
    </linearGradient>
  </defs>
  <rect width="340" height="220" rx="28" fill="url(#sky-${card.id})"/>
  <rect x="10" y="10" width="320" height="200" rx="22" fill="none" stroke="${border}"/>
  ${makeStars()}
  <path d="M0 182 C54 154 102 162 170 176 C232 188 280 182 340 154 V220 H0 Z" fill="url(#ground-${card.id})"/>
  ${card.scene}
</svg>`.trim()
}

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

const allCards = [...cardBlueprints, ...extendedBlueprints]

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

for (const card of allCards) {
  writeFileSync(path.join(cardsDir, `${card.id}.svg`), `${makeCardArt(card)}\n`, 'utf8')
}

writeFileSync(path.join(generatedDir, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(
  `Generated ${Object.keys(sharedFiles).length + allCards.length} Fractured Arcanum assets via ${assetProvider}${assetApiReady ? ' with API-ready pipeline hooks' : ''}.`,
)
