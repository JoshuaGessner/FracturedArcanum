/**
 * Scene art: the battle table, the carved plate an empty lane shows, and the
 * candle-lit rooms behind each menu screen.
 *
 * Drawn in the card art's light — umber dark, a candle at each corner, a
 * ritual circle worn into the wood under the lanes — so the board reads as a
 * place rather than a grid of boxes. Deterministic: scattered marks come from
 * a seeded generator, so regenerating never produces a diff by itself.
 */

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const svg = (viewBox, body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">${body}</svg>`

function ritualCircle(cx, cy, radius, random) {
  const ticks = Array.from({ length: 72 }, (_, index) => {
    const angle = (index / 72) * Math.PI * 2
    const inner = radius - (index % 6 === 0 ? 22 : 10)
    const x1 = cx + Math.cos(angle) * inner
    const y1 = cy + Math.sin(angle) * inner
    const x2 = cx + Math.cos(angle) * radius
    const y2 = cy + Math.sin(angle) * radius
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`
  }).join('')
  const star = Array.from({ length: 7 }, (_, index) => {
    const angle = (index * 3 / 7) * Math.PI * 2 - Math.PI / 2
    const r = radius * 0.78
    return `${index === 0 ? 'M' : 'L'}${(cx + Math.cos(angle) * r).toFixed(1)} ${(cy + Math.sin(angle) * r).toFixed(1)}`
  }).join('') + 'Z'
  const glyphs = Array.from({ length: 14 }, (_, index) => {
    const angle = (index / 14) * Math.PI * 2 + random() * 0.08
    const r = radius * 0.9
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    const h = 7 + random() * 6
    return `<path d="M${x.toFixed(1)} ${(y - h).toFixed(1)}v${(h * 2).toFixed(1)}M${(x - 4).toFixed(1)} ${(y - 2).toFixed(1)}l8 ${(random() * 6 - 3).toFixed(1)}"/>`
  }).join('')
  return `<g fill="none" stroke="#c9a96e" stroke-linecap="round">`
    + `<circle cx="${cx}" cy="${cy}" r="${radius}" stroke-opacity="0.16" stroke-width="2"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${radius - 34}" stroke-opacity="0.1" stroke-width="1.5"/>`
    + `<path d="${ticks}" stroke-opacity="0.12" stroke-width="1.4"/>`
    + `<path d="${star}" stroke-opacity="0.08" stroke-width="1.5"/>`
    + `<g stroke-opacity="0.13" stroke-width="1.6">${glyphs}</g>`
    + `</g>`
}

function woodGrain(width, height, random) {
  const lines = Array.from({ length: 26 }, (_, index) => {
    const y = (index + 0.5) * (height / 26) + (random() - 0.5) * 18
    const wobble = () => (random() - 0.5) * 22
    return `<path d="M-20 ${y.toFixed(1)}C${width * 0.25} ${(y + wobble()).toFixed(1)} ${width * 0.6} ${(y + wobble()).toFixed(1)} ${width + 20} ${(y + wobble()).toFixed(1)}" stroke-opacity="${(0.05 + random() * 0.07).toFixed(3)}"/>`
  }).join('')
  return `<g fill="none" stroke="#6b4a33" stroke-width="2">${lines}</g>`
}

function candle(cx, cy) {
  return `<g><circle cx="${cx}" cy="${cy}" r="230" fill="url(#candle-glow)"/>`
    + `<ellipse cx="${cx}" cy="${cy + 26}" rx="22" ry="7" fill="#1a110c" opacity="0.8"/>`
    + `<rect x="${cx - 12}" y="${cy - 8}" width="24" height="34" rx="4" fill="#d8c7a4" opacity="0.55"/>`
    + `<path d="M${cx} ${cy - 30}c6 8 7 15 0 22c-7-7-6-14 0-22z" fill="#f3d08a" opacity="0.9"/>`
    + `</g>`
}

function battleTable() {
  const random = seeded(1729)
  const width = 1440
  const height = 900
  const defs = '<defs>'
    + '<radialGradient id="table-base" cx="50%" cy="48%" r="75%">'
    + '<stop offset="0%" stop-color="#33241b"/><stop offset="55%" stop-color="#1d1511"/><stop offset="100%" stop-color="#0a0706"/>'
    + '</radialGradient>'
    + '<radialGradient id="candle-glow" cx="50%" cy="50%" r="50%">'
    + '<stop offset="0%" stop-color="#e0a84e" stop-opacity="0.22"/><stop offset="45%" stop-color="#e0a84e" stop-opacity="0.07"/><stop offset="100%" stop-color="#e0a84e" stop-opacity="0"/>'
    + '</radialGradient>'
    + '<radialGradient id="table-vignette" cx="50%" cy="50%" r="72%">'
    + '<stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.62"/>'
    + '</radialGradient>'
    + '</defs>'
  const body = defs
    + `<rect width="${width}" height="${height}" fill="url(#table-base)"/>`
    + woodGrain(width, height, random)
    + ritualCircle(width / 2, height / 2, 360, random)
    + candle(96, 110) + candle(width - 96, 110) + candle(96, height - 120) + candle(width - 96, height - 120)
    + `<rect width="${width}" height="${height}" fill="url(#table-vignette)"/>`
  return svg(`0 0 ${width} ${height}`, body, 'Candle-lit ritual table')
}

function laneSigil() {
  const random = seeded(31)
  const ticks = Array.from({ length: 24 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2
    const r1 = index % 3 === 0 ? 40 : 44
    return `M${(60 + Math.cos(angle) * r1).toFixed(1)} ${(60 + Math.sin(angle) * r1).toFixed(1)}L${(60 + Math.cos(angle) * 48).toFixed(1)} ${(60 + Math.sin(angle) * 48).toFixed(1)}`
  }).join('')
  const runes = Array.from({ length: 3 }, (_, index) => {
    const angle = (index / 3) * Math.PI * 2 - Math.PI / 2
    const x = 60 + Math.cos(angle) * 22
    const y = 60 + Math.sin(angle) * 22
    return `<path d="M${x.toFixed(1)} ${(y - 5).toFixed(1)}v10M${(x - 3.5).toFixed(1)} ${(y - 1).toFixed(1)}l7 ${(random() * 4 - 2).toFixed(1)}"/>`
  }).join('')
  const body = '<g fill="none" stroke="#c9a96e" stroke-linecap="round" stroke-linejoin="round">'
    + '<circle cx="60" cy="60" r="48" stroke-opacity="0.5" stroke-width="1.6"/>'
    + '<circle cx="60" cy="60" r="36" stroke-opacity="0.32" stroke-width="1.2"/>'
    + `<path d="${ticks}" stroke-opacity="0.42" stroke-width="1.2"/>`
    + '<path d="M60 26L89.4 77H30.6z" stroke-opacity="0.36" stroke-width="1.3"/>'
    + `<g stroke-opacity="0.55" stroke-width="1.5">${runes}</g>`
    + '<circle cx="60" cy="60" r="3" fill="#c9a96e" fill-opacity="0.5" stroke="none"/>'
    + '</g>'
  return svg('0 0 120 120', body, 'Lane sigil')
}

/** Shared ground for the menu scenes: warm umber, one light source, vignette. */
function menuGround(id, lightX, lightY) {
  return '<defs>'
    + `<radialGradient id="${id}-base" cx="${lightX}%" cy="${lightY}%" r="85%">`
    + '<stop offset="0%" stop-color="#3a2a1f"/><stop offset="50%" stop-color="#1d1511"/><stop offset="100%" stop-color="#0a0706"/>'
    + '</radialGradient>'
    + `<radialGradient id="${id}-vignette" cx="50%" cy="50%" r="72%">`
    + '<stop offset="58%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.6"/>'
    + '</radialGradient>'
    + '<radialGradient id="candle-glow" cx="50%" cy="50%" r="50%">'
    + '<stop offset="0%" stop-color="#e0a84e" stop-opacity="0.24"/><stop offset="45%" stop-color="#e0a84e" stop-opacity="0.07"/><stop offset="100%" stop-color="#e0a84e" stop-opacity="0"/>'
    + '</radialGradient>'
    + '</defs>'
    + `<rect width="1440" height="900" fill="url(#${id}-base)"/>`
}

const vignette = (id) => `<rect width="1440" height="900" fill="url(#${id}-vignette)"/>`
const brass = (body, opacity = 0.18, width = 2) =>
  `<g fill="none" stroke="#c9a96e" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${body}</g>`

/** A row of book spines along a shelf, heights and widths seeded. */
function shelf(x0, x1, baseY, random) {
  const spines = []
  let x = x0
  while (x < x1) {
    const w = 18 + random() * 22
    const h = 90 + random() * 70
    const lean = random() < 0.12 ? (random() - 0.5) * 16 : 0
    spines.push(`<path d="M${x.toFixed(1)} ${baseY}l${lean.toFixed(1)} ${(-h).toFixed(1)}h${w.toFixed(1)}l${(-lean).toFixed(1)} ${h.toFixed(1)}"/>`)
    if (random() < 0.5) spines.push(`<path d="M${(x + 4 + lean / 2).toFixed(1)} ${(baseY - h * 0.7).toFixed(1)}h${(w - 8).toFixed(1)}"/>`)
    x += w + 3 + random() * 4
  }
  return spines.join('') + `<path d="M${x0 - 20} ${baseY + 4}H${x1 + 20}" stroke-width="4"/>`
}

function archiveScene() {
  const random = seeded(4242)
  const body = menuGround('ar', 50, 30)
    + brass(shelf(80, 1360, 300, random) + shelf(80, 1360, 560, random) + shelf(80, 1360, 820, random), 0.13)
    + candle(720, 200)
    + ritualCircle(720, 450, 300, random)
    + vignette('ar')
  return svg('0 0 1440 900', body, 'Archive of bound folios by candlelight')
}

function hallScene() {
  const random = seeded(1213)
  const arches = [260, 720, 1180].map((cx) =>
    `<path d="M${cx - 170} 900V380a170 170 0 0 1 340 0V900"/><path d="M${cx - 140} 900V392a140 140 0 0 1 280 0V900"/>`).join('')
  const body = menuGround('hl', 50, 26)
    + brass(arches, 0.12, 2.4)
    + ritualCircle(720, 470, 330, random)
    + candle(150, 760) + candle(1290, 760)
    + vignette('hl')
  return svg('0 0 1440 900', body, 'Vaulted hall around the arena circle')
}

function lantern(cx, top, length) {
  return `<path d="M${cx} 0V${top}"/>`
    + `<path d="M${cx - 18} ${top + 6}h36l8 14v${length}l-8 14h-36l-8-14v${-length}z"/>`
    + `<path d="M${cx - 26} ${top + 20}h52M${cx - 26} ${top + 20 + length}h52"/>`
}

function bazaarScene() {
  const random = seeded(808)
  const awning = Array.from({ length: 12 }, (_, index) => {
    const x = index * 120
    return `<path d="M${x} 70q60 54 120 0"/>`
  }).join('')
  const crates = Array.from({ length: 7 }, (_, index) => {
    const x = 90 + index * 190 + random() * 30
    const w = 110 + random() * 50
    const h = 70 + random() * 60
    return `<rect x="${x.toFixed(1)}" y="${(840 - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="4"/><path d="M${x.toFixed(1)} ${(840 - h / 2).toFixed(1)}h${w.toFixed(1)}"/>`
  }).join('')
  const scale = '<path d="M720 220V560M620 560h200M600 250h240"/>'
    + '<path d="M600 250l-50 120h100zM840 250l-50 120h100z"/>'
    + '<path d="M550 370a50 18 0 0 0 100 0M790 370a50 18 0 0 0 100 0"/>'
  const body = menuGround('bz', 50, 38)
    + brass(awning + '<path d="M0 70H1440"/>', 0.16)
    + brass(lantern(260, 80, 50) + lantern(1180, 80, 50) + lantern(720, 70, 34), 0.2)
    + `<circle cx="260" cy="180" r="200" fill="url(#candle-glow)"/><circle cx="1180" cy="180" r="200" fill="url(#candle-glow)"/>`
    + brass(scale, 0.14, 2.4)
    + brass(crates, 0.1)
    + vignette('bz')
  return svg('0 0 1440 900', body, 'Merchant bazaar under hanging lanterns')
}

function tankard(x, y) {
  return `<path d="M${x} ${y}v-70h56v70z"/><path d="M${x + 56} ${y - 54}h14a14 14 0 0 1 0 28h-14"/><path d="M${x} ${y - 52}h56"/>`
}

function tavernScene() {
  const random = seeded(2718)
  const planks = Array.from({ length: 6 }, (_, index) => `<path d="M60 ${640 + index * 40}H1380"/>`).join('')
  const mugs = [220, 470, 900, 1130].map((x) => tankard(x + random() * 30, 620)).join('')
  const hearth = '<path d="M520 520V260a200 160 0 0 1 400 0V520"/><path d="M560 520V290a160 128 0 0 1 320 0V520"/>'
    + '<path d="M640 520c10-60 40-80 80-120 40 40 70 60 80 120"/>'
  const body = menuGround('tv', 50, 44)
    + `<circle cx="720" cy="430" r="420" fill="url(#candle-glow)"/>`
    + brass(hearth, 0.16, 2.4)
    + brass(planks + '<path d="M40 620H1400"/>', 0.12)
    + brass(mugs, 0.15)
    + candle(110, 560) + candle(1330, 560)
    + vignette('tv')
  return svg('0 0 1440 900', body, 'Tavern hearth and long table')
}

function astrolabeScene() {
  const random = seeded(99)
  const rings = [300, 240, 180].map((r, index) => `<circle cx="720" cy="450" r="${r}" stroke-opacity="${0.16 - index * 0.03}"/>`).join('')
  const spokes = Array.from({ length: 12 }, (_, index) => {
    const a = (index / 12) * Math.PI * 2
    return `M${(720 + Math.cos(a) * 180).toFixed(1)} ${(450 + Math.sin(a) * 180).toFixed(1)}L${(720 + Math.cos(a) * 300).toFixed(1)} ${(450 + Math.sin(a) * 300).toFixed(1)}`
  }).join('')
  const body = menuGround('as', 50, 50)
    + brass(rings, 1) + brass(`<path d="${spokes}"/>`, 0.1)
    + brass('<ellipse cx="720" cy="450" rx="300" ry="110" transform="rotate(-24 720 450)"/>', 0.12)
    + ritualCircle(720, 450, 120, random)
    + vignette('as')
  return svg('0 0 1440 900', body, 'Brass astrolabe')
}

/** File name → SVG for public/generated/ui/. */
export function buildSceneFiles() {
  return {
    'bg-battle.svg': battleTable(),
    'bg-main-menu.svg': hallScene(),
    'bg-play.svg': hallScene(),
    'bg-collection.svg': archiveScene(),
    'bg-shop.svg': bazaarScene(),
    'bg-social.svg': tavernScene(),
    'bg-settings.svg': astrolabeScene(),
    'lane-sigil.svg': laneSigil(),
  }
}
