/**
 * Cosmetic card frames — what a player earns with shards.
 *
 * Premium card treatments in the genre are materials, not tints: a
 * Hearthstone golden card swaps its whole frame for cast gold, Runeterra
 * renders every frame as real metal and glass, and Marvel Snap's borders
 * climb a visible ladder from plain to ornate. A frame that costs 420 shards
 * has to look like it, at a glance, from across the table.
 *
 * Each frame is drawn at 10× the 63×88 card ratio with a transparent centre
 * and a material band inside the host's bezel. Ornament goes only where the
 * card face leaves room for it: a crest at top centre, and a clasp on each
 * side at the seam where the art meets the name plate (CardFace puts that
 * seam at 54% of the height). The four corners belong to the cost, keyword
 * and stat emblems, so the frame only caps them.
 *
 * The ladder is structural, not just a palette swap: Bronze is beaded cast
 * metal, Frost adds etched crystal, Solar adds an animated ember finish in
 * CSS, Void an animated violet sheen.
 *
 * Rarity is never painted here — the frame contract in cards.css keeps the
 * gem and the inner hairline for rarity, out of any frame's reach.
 */

const W = 630
const H = 880
const R = 52
const INSET = 7
/** The art/plate seam in CardFace (`.cf-plate { inset: 54cqh … }`). */
const SEAM = Math.round(H * 0.54)
const CX = W / 2

const svg = (body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${label}">${body}</svg>`

/** A diagonal metal gradient: light, deep, glint, shadow. */
const metal = (id, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">`
  + stops.map(([offset, colour]) => `<stop offset="${offset}%" stop-color="${colour}"/>`).join('')
  + '</linearGradient>'

/** The bezel band: a stroked rounded rectangle in the frame's material, with
 *  a dark seat on both edges and a lit line along the inner lip. */
function band(width, paint, edge, lip) {
  const half = width / 2
  return `<rect x="${INSET + half}" y="${INSET + half}" width="${W - 2 * (INSET + half)}" height="${H - 2 * (INSET + half)}" rx="${R - half}" fill="none" stroke="${paint}" stroke-width="${width}"/>`
    + `<rect x="${INSET}" y="${INSET}" width="${W - 2 * INSET}" height="${H - 2 * INSET}" rx="${R}" fill="none" stroke="${edge}" stroke-width="3"/>`
    + `<rect x="${INSET + width}" y="${INSET + width}" width="${W - 2 * (INSET + width)}" height="${H - 2 * (INSET + width)}" rx="${R - width}" fill="none" stroke="${edge}" stroke-width="3"/>`
    + `<rect x="${INSET + width - 3}" y="${INSET + width - 3}" width="${W - 2 * (INSET + width - 3)}" height="${H - 2 * (INSET + width - 3)}" rx="${R - width + 3}" fill="none" stroke="${lip}" stroke-width="1.6" opacity="0.7"/>`
}

/** Corner caps: an L-shaped plate over each corner of the band. */
function caps(paint, edge, length, thickness) {
  const cap = `<path d="M${INSET} ${INSET + R + length} V${INSET + R} A${R} ${R} 0 0 1 ${INSET + R} ${INSET} H${INSET + R + length} v${thickness} H${INSET + R} A${R - thickness} ${R - thickness} 0 0 0 ${INSET + thickness} ${INSET + R} V${INSET + R + length} Z" fill="${paint}" stroke="${edge}" stroke-width="2.4" stroke-linejoin="round"/>`
  return mirrorCorners(cap)
}

function mirrorCorners(shape) {
  return `<g>${shape}</g>`
    + `<g transform="translate(${W} 0) scale(-1 1)">${shape}</g>`
    + `<g transform="translate(0 ${H}) scale(1 -1)">${shape}</g>`
    + `<g transform="translate(${W} ${H}) scale(-1 -1)">${shape}</g>`
}

/** One ornament at top centre and one on each side at the seam. */
function placements(crest, clasp) {
  return `<g transform="translate(${CX} ${INSET + 8})">${crest}</g>`
    + `<g transform="translate(${INSET + 12} ${SEAM})">${clasp}</g>`
    + `<g transform="translate(${W - INSET - 12} ${SEAM}) scale(-1 1)">${clasp}</g>`
}

/** Beads along a straight run, for filigree. */
function beads(x1, y1, x2, y2, count, r, fill, edge) {
  let out = ''
  for (let i = 0; i <= count; i++) {
    const t = i / count
    out += `<circle cx="${(x1 + (x2 - x1) * t).toFixed(1)}" cy="${(y1 + (y2 - y1) * t).toFixed(1)}" r="${r}" fill="${fill}" stroke="${edge}" stroke-width="0.8"/>`
  }
  return out
}

/** A spoke rosette, used by Bronze for its crest and clasps. */
function rosette(r, paint, edge, petal) {
  return `<circle r="${r}" fill="${paint}" stroke="${edge}" stroke-width="2.6"/>`
    + Array.from({ length: 8 }, (_, i) => `<ellipse rx="${r * 0.2}" ry="${r * 0.42}" transform="rotate(${i * 45}) translate(0 -${r * 0.56})" fill="${petal}" stroke="${edge}" stroke-width="1.2"/>`).join('')
    + `<circle r="${r * 0.3}" fill="${paint}" stroke="${edge}" stroke-width="1.6"/>`
    + `<circle r="${r * 0.12}" cx="${-r * 0.08}" cy="${-r * 0.1}" fill="#fff4d8" opacity="0.8"/>`
}

function bronzeFiligree() {
  const defs = '<defs>'
    + metal('b', [[0, '#f0d29c'], [30, '#a7743a'], [55, '#e0b070'], [80, '#7a4e20'], [100, '#4a2e10']])
    + '</defs>'
  const edge = '#2e1c08'
  const inner = INSET + 11
  const run = 22
  const beadRuns = beads(INSET + R + 70, inner, CX - 70, inner, 8, 3.4, '#f0d29c', edge)
    + beads(CX + 70, inner, W - INSET - R - 70, inner, 8, 3.4, '#f0d29c', edge)
    + beads(INSET + R + 70, H - inner, W - INSET - R - 70, H - inner, run, 3.4, '#f0d29c', edge)
    + beads(inner, INSET + R + 70, inner, SEAM - 60, 14, 3.4, '#f0d29c', edge)
    + beads(inner, SEAM + 60, inner, H - INSET - R - 70, 12, 3.4, '#f0d29c', edge)
    + beads(W - inner, INSET + R + 70, W - inner, SEAM - 60, 14, 3.4, '#f0d29c', edge)
    + beads(W - inner, SEAM + 60, W - inner, H - INSET - R - 70, 12, 3.4, '#f0d29c', edge)
  const crest = `<path d="M-64 6 C-40 -10 -26 4 0 -4 C26 4 40 -10 64 6" fill="none" stroke="url(#b)" stroke-width="8" stroke-linecap="round"/>`
    + `<path d="M-64 6 C-40 -10 -26 4 0 -4 C26 4 40 -10 64 6" fill="none" stroke="${edge}" stroke-width="1.6" stroke-linecap="round"/>`
    + `<g transform="translate(0 14)">${rosette(30, 'url(#b)', edge, '#f0d29c')}</g>`
  const clasp = `<path d="M0 -46 C22 -30 22 30 0 46" fill="url(#b)" stroke="${edge}" stroke-width="2.4"/>`
    + `<g transform="translate(12 0)">${rosette(18, 'url(#b)', edge, '#f0d29c')}</g>`
  return svg(defs + band(22, 'url(#b)', edge, '#ffe7b8') + beadRuns + caps('url(#b)', edge, 46, 22) + placements(crest, clasp), 'Bronze Filigree frame')
}

/** A frost crystal: six branches, each with two pairs of side shoots. */
function snowflake(len, stroke, width) {
  const branch = `<path d="M0 0 L0 ${-len} M0 ${-len * 0.45} l-${len * 0.24} -${len * 0.22} M0 ${-len * 0.45} l${len * 0.24} -${len * 0.22} M0 ${-len * 0.72} l-${len * 0.16} -${len * 0.15} M0 ${-len * 0.72} l${len * 0.16} -${len * 0.15}"/>`
  return `<g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round">`
    + Array.from({ length: 6 }, (_, i) => `<g transform="rotate(${i * 60})">${branch}</g>`).join('')
    + '</g>'
}

function frostEtching() {
  const defs = '<defs>'
    + metal('f', [[0, '#ffffff'], [30, '#aebfcd'], [55, '#f2f8fc'], [80, '#7f93a4'], [100, '#4e6272']])
    + '<radialGradient id="ice" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#ffffff"/><stop offset="50%" stop-color="#bfe6f6"/><stop offset="100%" stop-color="#4e8aa6"/></radialGradient>'
    + '</defs>'
  const edge = '#33424f'
  // Hoarfrost creeping in from the band: short etched strokes along each side.
  let etch = '<g fill="none" stroke="#e6f4fc" stroke-width="2" stroke-linecap="round" opacity="0.75">'
  for (let y = INSET + R + 50; y < H - INSET - R - 40; y += 64) {
    if (Math.abs(y - SEAM) < 70) continue
    etch += `<path d="M${INSET + 20} ${y} l12 8 l-4 12 M${W - INSET - 20} ${y + 32} l-12 8 l4 12"/>`
  }
  etch += '</g>'
  const crest = `<path d="M0 -6 L34 24 L0 64 L-34 24 Z" fill="url(#ice)" stroke="${edge}" stroke-width="2.6" stroke-linejoin="round"/>`
    + '<path d="M0 -6 L0 64 M-34 24 L34 24" stroke="#ffffff" stroke-width="1.4" opacity="0.6"/>'
    + `<g transform="translate(0 24)">${snowflake(46, '#f4fbff', 3.2)}</g>`
    + '<circle cy="24" r="6" fill="#ffffff"/>'
  const clasp = `<path d="M0 -40 L26 0 L0 40 L6 0 Z" fill="url(#ice)" stroke="${edge}" stroke-width="2.2" stroke-linejoin="round"/>`
    + `<g transform="translate(10 0) scale(0.55)">${snowflake(40, '#f4fbff', 4)}</g>`
  const cornerFlakes = mirrorCorners(`<g transform="translate(${INSET + 30} ${INSET + 30}) scale(0.6)">${snowflake(40, '#f4fbff', 4)}</g>`)
  return svg(defs + band(18, 'url(#f)', edge, '#ffffff') + etch + caps('url(#f)', edge, 40, 18) + cornerFlakes + placements(crest, clasp), 'Frost Etching frame')
}

/** A sun disc with alternating long and short rays. */
function sun(r, rayPaint, edge, core) {
  return Array.from({ length: 16 }, (_, i) => {
    const long = i % 2 === 0
    const reach = long ? r * 1.9 : r * 1.5
    return `<path d="M0 ${-r * 0.9} L${r * 0.22} ${-reach * 0.82} L0 ${-reach} L${-r * 0.22} ${-reach * 0.82} Z" transform="rotate(${i * 22.5})" fill="${rayPaint}" stroke="${edge}" stroke-width="1.2" stroke-linejoin="round"/>`
  }).join('')
    + `<circle r="${r}" fill="${core}" stroke="${edge}" stroke-width="2.6"/>`
    + `<circle r="${r * 0.55}" fill="#fff1c8" opacity="0.8"/>`
}

function solarEmber() {
  const defs = '<defs>'
    + metal('c', [[0, '#e8a060'], [30, '#7a3f18'], [55, '#c8743a'], [80, '#4e2410'], [100, '#2a1206']])
    + '<radialGradient id="sun" cx="45%" cy="40%" r="60%"><stop offset="0%" stop-color="#fff0b8"/><stop offset="55%" stop-color="#f08a2a"/><stop offset="100%" stop-color="#8f3a0c"/></radialGradient>'
    + '<linearGradient id="ember" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#ffb347" stop-opacity="0.9"/><stop offset="100%" stop-color="#ff7a1a" stop-opacity="0"/></linearGradient>'
    + '</defs>'
  const edge = '#1e0c04'
  // Embers rising from the lower band, hot at the base.
  let embers = ''
  for (let i = 0; i < 9; i++) {
    const x = INSET + R + 30 + i * ((W - 2 * (INSET + R + 30)) / 8)
    const tall = 26 + (i % 3) * 14
    embers += `<path d="M${x - 7} ${H - INSET - 18} Q${x} ${H - INSET - 18 - tall} ${x + 7} ${H - INSET - 18} Z" fill="url(#ember)"/>`
  }
  const crest = `<g transform="translate(0 22)">${sun(22, '#f6b25a', edge, 'url(#sun)')}</g>`
  const clasp = `<path d="M0 -44 L22 -12 L30 0 L22 12 L0 44 Z" fill="url(#c)" stroke="${edge}" stroke-width="2.4" stroke-linejoin="round"/>`
    + `<g transform="translate(14 0)">${sun(9, '#f6b25a', edge, 'url(#sun)')}</g>`
  return svg(defs + band(24, 'url(#c)', edge, '#ffcf8a') + embers + caps('url(#c)', edge, 52, 24) + placements(crest, clasp), 'Solar Ember frame')
}

function voidweave() {
  const defs = '<defs>'
    + metal('v', [[0, '#5a4e5c'], [30, '#141015'], [55, '#3a3040'], [80, '#0c090e'], [100, '#000000']])
    + '<linearGradient id="rune" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f0dcff"/><stop offset="100%" stop-color="#9a6cc8"/></linearGradient>'
    + '</defs>'
  const edge = '#000000'
  // Rune ticks cut into the band, each a short violet stroke.
  let runes = '<g stroke="url(#rune)" stroke-width="2.4" stroke-linecap="round" opacity="0.85">'
  for (let y = INSET + R + 60; y < H - INSET - R - 40; y += 58) {
    if (Math.abs(y - SEAM) < 64) continue
    runes += `<path d="M${INSET + 13} ${y} v12 l6 6 M${W - INSET - 13} ${y + 26} v12 l-6 6"/>`
  }
  for (let x = INSET + R + 50; x < W - INSET - R - 40; x += 56) {
    runes += `<path d="M${x} ${H - INSET - 13} h12 l6 -6"/>`
  }
  runes += '</g>'
  // An obsidian shard with a violet rune cut into it.
  const shard = (scale) => `<g transform="scale(${scale})">`
    + '<path d="M0 -6 L30 26 L0 70 L-30 26 Z" fill="url(#v)" stroke="#9a78c0" stroke-width="2.6" stroke-linejoin="round"/>'
    + '<path d="M0 6 L0 52 M-12 22 L0 34 L12 22" stroke="url(#rune)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    + '<circle cy="34" r="4.5" fill="#f0dcff"/></g>'
  const crest = `<path d="M-60 4 L-28 4 L-16 14 M60 4 L28 4 L16 14" stroke="#9a78c0" stroke-width="3" stroke-linecap="round" fill="none"/>${shard(1)}`
  const clasp = `<g transform="translate(6 0) rotate(-90) translate(0 -26)">${shard(0.7)}</g>`
  return svg(defs + band(24, 'url(#v)', edge, '#b48ad8') + runes + caps('url(#v)', '#6c4c90', 50, 24) + placements(crest, clasp), 'Voidweave frame')
}

/** File name → SVG for public/generated/ui/. */
export function buildFrameFiles() {
  return {
    'frame-bronze.svg': bronzeFiligree(),
    'frame-frost.svg': frostEtching(),
    'frame-solar.svg': solarEmber(),
    'frame-void.svg': voidweave(),
  }
}
