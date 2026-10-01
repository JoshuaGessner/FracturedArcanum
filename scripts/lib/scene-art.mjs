/**
 * Scene art: the battle table and the carved plate an empty lane shows.
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

/** File name → SVG for public/generated/ui/. */
export function buildSceneFiles() {
  return {
    'bg-battle.svg': battleTable(),
    'lane-sigil.svg': laneSigil(),
  }
}
