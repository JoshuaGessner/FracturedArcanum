/**
 * Insignia: the keyword seals, the league shields and the shard.
 *
 * The first-pass versions were flat clip-art — saturated squares with a white
 * outline, Tailwind blues and purples that belonged to no palette in the game.
 * These are redrawn as engraved marks in the card art's light: fine strokes in
 * one tint per effect family, a faint wash of the same tint behind the mark,
 * and no background tile of their own, because every place a seal appears
 * (the card face, the inspect glossary) already sets it in a medallion.
 *
 * Effect families share a tint so a player learns the colour before the
 * shape: ember for tempo and momentum, blood for damage, verdigris for
 * restoration, violet for death and theft, frost for denial and cards.
 */

const svg = (viewBox, body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">${body}</svg>`

const TINTS = {
  ember: '#f3d08a',
  blood: '#ec8a7c',
  verdigris: '#9edcc6',
  violet: '#d0aef0',
  frost: '#a9cdf0',
  bone: '#eadfc8',
}

/** One keyword seal: a wash, then the engraved mark, in a single tint. */
const seal = (label, tint, body, wash = '') => svg('0 0 40 40',
  `${wash ? `<g fill="${tint}" fill-opacity="0.22" stroke="none">${wash}</g>` : ''}`
  + `<g fill="none" stroke="${tint}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</g>`,
  label)

const effects = {
  charge: seal('Charge', TINTS.ember,
    '<path d="M23 5L12 22h8l-3 13 11-18h-8z"/>',
    '<path d="M23 5L12 22h8l-3 13 11-18h-8z"/>'),
  guard: seal('Guard', TINTS.bone,
    '<path d="M20 5l12 4.5v9.5c0 7.6-5 13-12 16-7-3-12-8.4-12-16V9.5z"/><path d="M20 11v18M13 17.5h14"/>',
    '<path d="M20 5l12 4.5v9.5c0 7.6-5 13-12 16-7-3-12-8.4-12-16V9.5z"/>'),
  rally: seal('Rally', TINTS.ember,
    '<path d="M11 6v29"/><path d="M11 7h18l-4.5 6.5L29 20H11"/><path d="M15.5 11.5h6"/>',
    '<path d="M11 7h18l-4.5 6.5L29 20H11z"/>'),
  blast: seal('Blast', TINTS.blood,
    '<path d="M20 5l3.2 9.3 9.6-2.6-6.4 7.6 7.6 6.4-9.8.4-1 9.9-3.2-9.3-9.6 2.6 6.4-7.6-7.6-6.4 9.8-.4z"/>',
    '<circle cx="20" cy="20" r="7"/>'),
  heal: seal('Heal', TINTS.verdigris,
    '<path d="M16.5 7h7v9.5H33v7h-9.5V33h-7v-9.5H7v-7h9.5z"/>',
    '<path d="M16.5 7h7v9.5H33v7h-9.5V33h-7v-9.5H7v-7h9.5z"/>'),
  draw: seal('Draw', TINTS.frost,
    '<rect x="13" y="7" width="15" height="21" rx="2"/><path d="M9.5 11.5v18.5a2 2 0 0 0 2 2H24"/><path d="M20.5 13v9M16 17.5h9"/>'),
  fury: seal('Fury', TINTS.blood,
    '<path d="M20 34c-6.5 0-10.5-4.3-10.5-10 0-6 4.6-9 6-15 3.5 2.5 5 5.6 4.5 9 2-1.3 3-3.5 3-6 4.5 3.5 7.5 7.5 7.5 12 0 5.7-4 10-10.5 10z"/>',
    '<path d="M20 34c-3 0-5-2-5-4.8 0-3 2.6-4.5 3.8-7.2 2.6 2 5.2 4.3 5.2 7.2 0 2.8-1.6 4.8-4 4.8z"/>'),
  drain: seal('Drain', TINTS.violet,
    '<path d="M20 6c5 6.5 8.5 11.4 8.5 16a8.5 8.5 0 0 1-17 0c0-4.6 3.5-9.5 8.5-16z"/><path d="M14 30.5l-3 4M26 30.5l3 4"/>',
    '<path d="M20 6c5 6.5 8.5 11.4 8.5 16a8.5 8.5 0 0 1-17 0c0-4.6 3.5-9.5 8.5-16z"/>'),
  empower: seal('Empower', TINTS.ember,
    '<path d="M20 33V9M12 17l8-8 8 8"/><path d="M12 27l8-8 8 8"/>'),
  poison: seal('Poison', TINTS.verdigris,
    '<path d="M16 6h8M17 6v7.5L9.8 27.6A4 4 0 0 0 13.4 33h13.2a4 4 0 0 0 3.6-5.4L23 13.5V6"/><path d="M13 24h14"/>',
    '<path d="M13 24h14l3.2 3.6A4 4 0 0 1 26.6 33H13.4a4 4 0 0 1-3.6-5.4z"/>'),
  shield: seal('Shield', TINTS.frost,
    '<circle cx="20" cy="20" r="13"/><circle cx="20" cy="20" r="8.5"/><path d="M20 7v26M7 20h26"/>',
    '<circle cx="20" cy="20" r="8.5"/>'),
  siphon: seal('Siphon', TINTS.violet,
    '<path d="M6 14c4.7-5 9.3-5 14 0s9.3 5 14 0"/><path d="M6 26c4.7 5 9.3 5 14 0s9.3-5 14 0"/>',
    '<circle cx="20" cy="20" r="3.4"/>'),
  bolster: seal('Bolster', TINTS.ember,
    '<path d="M8 30h24M10.5 30V18l9.5-8 9.5 8v12"/><path d="M15.5 30v-7h9v7"/>',
    '<path d="M10.5 30V18l9.5-8 9.5 8v12z"/>'),
  cleave: seal('Cleave', TINTS.blood,
    '<path d="M8 32C11 18 20 9.5 33 7"/><path d="M8 32l2.4-7.4M8 32l7.4-2"/><path d="M14 33c5.5-1 10.5-4.5 14-10"/>'),
  lifesteal: seal('Lifesteal', TINTS.blood,
    '<path d="M20 33S8 25.5 8 16.5A6.5 6.5 0 0 1 20 13a6.5 6.5 0 0 1 12 3.5C32 25.5 20 33 20 33z"/><path d="M20 13v11M16 20l4 4 4-4"/>',
    '<path d="M20 33S8 25.5 8 16.5A6.5 6.5 0 0 1 20 13a6.5 6.5 0 0 1 12 3.5C32 25.5 20 33 20 33z"/>'),
  summon: seal('Summon', TINTS.violet,
    '<ellipse cx="20" cy="29" rx="13" ry="4.5"/><path d="M14 28.5l3-19h6l3 19"/><path d="M20 5v-1"/>',
    '<ellipse cx="20" cy="29" rx="13" ry="4.5"/>'),
  silence: seal('Silence', TINTS.frost,
    '<circle cx="20" cy="20" r="13"/><path d="M10.8 29.2l18.4-18.4"/><path d="M15 17h10M15 23h7"/>'),
  frostbite: seal('Frostbite', TINTS.frost,
    '<path d="M20 5v30M7 12.5l26 15M7 27.5l26-15"/><path d="M16.5 7.5L20 11l3.5-3.5M16.5 32.5L20 29l3.5 3.5"/>'),
  enrage: seal('Enrage', TINTS.blood,
    '<path d="M6 21c4.5-6 9-9 14-9s9.5 3 14 9c-4.5 6-9 9-14 9s-9.5-3-14-9z"/><path d="M8 11l7 4.5M32 11l-7 4.5"/>',
    '<circle cx="20" cy="21" r="4.5"/>'),
  deathrattle: seal('Deathrattle', TINTS.violet,
    '<path d="M20 6c-6.6 0-11 4.4-11 10.4 0 3.6 1.7 6.2 4.4 7.6V29c0 .8.6 1.4 1.4 1.4h10.4c.8 0 1.4-.6 1.4-1.4v-5c2.7-1.4 4.4-4 4.4-7.6C31 10.4 26.6 6 20 6z"/><circle cx="15.6" cy="17" r="2.4"/><circle cx="24.4" cy="17" r="2.4"/><path d="M17.5 30.4V34M22.5 30.4V34"/>'),
  overwhelm: seal('Overwhelm', TINTS.ember,
    '<path d="M6 30l8-8 6 6 14-14"/><path d="M26 10h8v8"/><path d="M6 22l8-8 6 6"/>',
    '<path d="M6 30l8-8 6 6 14-14v24H6z"/>'),
}

/**
 * League shields: a dark enamel field inside a cast rim. The rim's metal is
 * the league; the engraving inside is its mark, struck in the same metal.
 */
const LEAGUE_METALS = {
  bronze: { light: '#e0a374', mid: '#a8683a', dark: '#5a3418' },
  silver: { light: '#eceae4', mid: '#a8a29a', dark: '#5c5751' },
  gold: { light: '#f8dc94', mid: '#e0a84e', dark: '#8f5a1f' },
  diamond: { light: '#e6d2f2', mid: '#a374c8', dark: '#4d2f63' },
}

const SHIELD_PATH = 'M60 8L100 22v40c0 25-16 42-40 52-24-10-40-27-40-52V22z'
const SHIELD_INNER = 'M60 18L91 29v33c0 20-12.5 34-31 42.4C41.5 96 29 82 29 62V29z'

function leagueShield(id, label, metal, engraving) {
  const { light, mid, dark } = LEAGUE_METALS[metal]
  const defs = '<defs>'
    + `<linearGradient id="${id}-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${light}"/><stop offset="55%" stop-color="${mid}"/><stop offset="100%" stop-color="${dark}"/></linearGradient>`
    + `<radialGradient id="${id}-field" cx="50%" cy="35%" r="70%"><stop offset="0%" stop-color="#3a2e28"/><stop offset="100%" stop-color="#120d0b"/></radialGradient>`
    + '</defs>'
  return svg('0 0 120 120',
    defs
    + `<path d="${SHIELD_PATH}" fill="url(#${id}-rim)"/>`
    + `<path d="${SHIELD_INNER}" fill="url(#${id}-field)" stroke="${dark}" stroke-width="1.5"/>`
    + `<g fill="none" stroke="${light}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${engraving}</g>`
    + `<path d="M60 12.5L96 25" stroke="#fff" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>`,
    label)
}

const ranks = {
  'rank-bronze.svg': leagueShield('rb', 'Bronze league', 'bronze',
    '<path d="M44 46l32 32M76 46L44 78"/><path d="M40 50l8-8M80 50l-8-8"/>'),
  'rank-silver.svg': leagueShield('rs', 'Silver league', 'silver',
    '<path d="M60 38c-9 10-9 28 0 46 9-18 9-36 0-46z"/><path d="M48 70h24"/>'),
  'rank-gold.svg': leagueShield('rg', 'Gold league', 'gold',
    '<path d="M42 52l9 9 9-15 9 15 9-9-4 26H46z"/><path d="M46 84h28"/>'),
  'rank-diamond.svg': leagueShield('rd', 'Diamond league', 'diamond',
    '<path d="M60 38l20 22-20 28-20-28z"/><path d="M40 60h40M52 60l8-22 8 22-8 28-8-28"/>'),
}

/** The shard: a cut ember crystal, the currency mark in the top bar. */
const shard = svg('0 0 32 32',
  '<defs>'
  + '<linearGradient id="sh-l" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fbe3a8"/><stop offset="100%" stop-color="#e0a84e"/></linearGradient>'
  + '<linearGradient id="sh-r" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e0a84e"/><stop offset="100%" stop-color="#8f5a1f"/></linearGradient>'
  + '</defs>'
  + '<path d="M16 2l9.5 8.5L16 30 6.5 10.5z" fill="#5a3418"/>'
  + '<path d="M16 2L6.5 10.5h9.5z" fill="#fbe3a8"/>'
  + '<path d="M16 2l9.5 8.5H16z" fill="#f0c46e"/>'
  + '<path d="M6.5 10.5H16V30z" fill="url(#sh-l)"/>'
  + '<path d="M25.5 10.5H16V30z" fill="url(#sh-r)"/>'
  + '<path d="M16 2l9.5 8.5L16 30 6.5 10.5z" fill="none" stroke="#2a1606" stroke-width="1.2" stroke-linejoin="round"/>',
  'Shard')

/**
 * The versus seal: engraved V and S inside a ring, crossed blades behind. No
 * backdrop of its own — the overlays it sits in already dim the screen, and a
 * baked-in black box showed as an opaque rectangle off-centre on wide screens.
 */
function versusSeal() {
  const ticks = Array.from({ length: 48 }, (_, index) => {
    const angle = (index / 48) * Math.PI * 2
    const inner = index % 4 === 0 ? 150 : 158
    return `M${(300 + Math.cos(angle) * inner).toFixed(1)} ${(200 + Math.sin(angle) * inner).toFixed(1)}L${(300 + Math.cos(angle) * 166).toFixed(1)} ${(200 + Math.sin(angle) * 166).toFixed(1)}`
  }).join('')
  const defs = '<defs>'
    + '<linearGradient id="vs-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fbe3a8"/><stop offset="55%" stop-color="#e0a84e"/><stop offset="100%" stop-color="#8f5a1f"/></linearGradient>'
    + '<radialGradient id="vs-field" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#3a2a1f" stop-opacity="0.92"/><stop offset="100%" stop-color="#0d0a0a" stop-opacity="0.92"/></radialGradient>'
    + '</defs>'
  const blades = '<g fill="none" stroke="#c9a96e" stroke-opacity="0.4" stroke-width="6" stroke-linecap="round">'
    + '<path d="M150 70l300 260M450 70L150 330"/><path d="M178 122l-26 26M422 122l26 26"/></g>'
  const letters = '<g fill="none" stroke="url(#vs-gold)" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M196 130l52 140 52-140" stroke-width="20"/>'
    + '<path d="M180 130h34M282 130h34" stroke-width="8"/>'
    + '<path d="M402 148c-12-16-30-22-48-22-26 0-42 15-42 34 0 44 92 30 92 78 0 21-18 36-46 36-22 0-40-8-52-24" stroke-width="18"/>'
    + '</g>'
  return svg('0 0 600 400',
    defs
    + '<circle cx="300" cy="200" r="172" fill="url(#vs-field)"/>'
    + blades
    + `<g fill="none" stroke="#c9a96e" stroke-linecap="round"><circle cx="300" cy="200" r="172" stroke-width="4"/><circle cx="300" cy="200" r="142" stroke-width="2" stroke-opacity="0.6"/><path d="${ticks}" stroke-width="2" stroke-opacity="0.7"/></g>`
    + letters,
    'Versus')
}

/** A laurel of paired leaves along an arc, for the result crests. */
function laurel(cx, cy, radius, side) {
  const leaves = Array.from({ length: 8 }, (_, index) => {
    const angle = Math.PI / 2 + side * (0.35 + index * 0.27)
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    const tilt = (angle * 180) / Math.PI + (side > 0 ? 60 : -60)
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="16" ry="6" transform="rotate(${tilt.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`
  }).join('')
  return leaves
}

function resultCrest(label, metal, emblem) {
  const { light, mid, dark } = metal
  const defs = '<defs>'
    + `<linearGradient id="rc-${label}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${light}"/><stop offset="55%" stop-color="${mid}"/><stop offset="100%" stop-color="${dark}"/></linearGradient>`
    + '</defs>'
  return svg('0 0 200 200',
    defs
    + `<g fill="url(#rc-${label})" stroke="${dark}" stroke-width="1.5">${laurel(100, 100, 80, 1)}${laurel(100, 100, 80, -1)}</g>`
    + `<circle cx="100" cy="100" r="54" fill="#1d1511" stroke="url(#rc-${label})" stroke-width="6"/>`
    + `<g fill="none" stroke="${light}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${emblem}</g>`,
    `${label[0].toUpperCase()}${label.slice(1)} crest`)
}

const RESULT_METALS = {
  victory: LEAGUE_METALS.gold,
  defeat: { light: '#f0a294', mid: '#b04236', dark: '#4a1410' },
  draw: LEAGUE_METALS.silver,
}

/**
 * The NEW ribbon for first-time cards: a swallow-tailed crimson band with the
 * word cut as strokes, so it never depends on a font being installed.
 */
function newRibbon() {
  const defs = '<defs><linearGradient id="nr-band" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="#d8665a"/><stop offset="55%" stop-color="#a5352f"/><stop offset="100%" stop-color="#5a1715"/>'
    + '</linearGradient></defs>'
  const letters = '<g fill="none" stroke="#fbe3a8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M38 40V20l14 20V20"/>'
    + '<path d="M74 20H62v20h12M62 30h9"/>'
    + '<path d="M82 20l4.5 20L92 26l5.5 14L102 20"/>'
    + '</g>'
  return svg('0 0 140 60',
    defs
    + '<path d="M4 14h24v32H4l8-16z" fill="#4a1410"/><path d="M136 14h-24v32h24l-8-16z" fill="#4a1410"/>'
    + '<path d="M22 10h96v40H22z" fill="url(#nr-band)" stroke="#e0a84e" stroke-width="2"/>'
    + '<path d="M22 15h96M22 45h96" stroke="#e0a84e" stroke-opacity="0.45" stroke-width="1"/>'
    + letters,
    'New')
}

/** File name → SVG for public/generated/ui/. */
export function buildInsigniaFiles() {
  return {
    ...Object.fromEntries(Object.entries(effects).map(([id, body]) => [`fx-${id}.svg`, body])),
    ...ranks,
    'shard.svg': shard,
    'overlay-vs.svg': versusSeal(),
    'ribbon-new.svg': newRibbon(),
    'overlay-victory.svg': resultCrest('victory', RESULT_METALS.victory,
      '<path d="M76 124l48-48M124 124L76 76"/><path d="M70 82l12-12M130 82l-12-12"/>'),
    'overlay-defeat.svg': resultCrest('defeat', RESULT_METALS.defeat,
      // A sword snapped in two: hilt and guard low left, the broken tip
      // knocked askew above the break.
      '<circle cx="66" cy="134" r="4"/><path d="M69 131l9-9"/><path d="M68 112l22 22"/>'
      + '<path d="M79 121l19-19"/><path d="M106 99l22-22 4-10-10 4-22 22"/>'),
    'overlay-draw.svg': resultCrest('draw', RESULT_METALS.draw,
      '<path d="M100 70v62M80 132h40M72 80h56"/><path d="M72 80l-12 26h24zM128 80l-12 26h24z"/>'),
  }
}

export const EFFECT_SEAL_IDS = Object.keys(effects)
