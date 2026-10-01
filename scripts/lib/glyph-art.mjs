/**
 * Engraved line glyphs: the tribe sigils and the small interface marks.
 *
 * These replace every emoji the game used to render. Each is a 24×24 line
 * drawing in one ink, so the app paints it through a CSS mask in whatever
 * colour the surrounding text has — a sigil on a bone label, the same sigil
 * in ember on a legendary — instead of a platform emoji whose colour, size and
 * style change from one operating system to the next.
 *
 * Drawn to sit beside the card art: fine strokes, rounded terminals, a single
 * accent detail per mark, nothing filled solid except small pupils and pips.
 */

const STROKE = 'fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'

const glyph = (label, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="${label}"><g ${STROKE}>${body}</g></svg>`

/** A toothed ring, for the mech sigil. Points are computed, not hand-placed. */
function cogPath(cx, cy, outer, inner, teeth) {
  const step = (Math.PI * 2) / teeth
  const points = []
  for (let index = 0; index < teeth; index += 1) {
    const start = index * step - Math.PI / 2
    const angles = [start - step * 0.18, start + step * 0.18, start + step * 0.32, start + step * 0.68]
    const radii = [outer, outer, inner, inner]
    angles.forEach((angle, corner) => {
      points.push(`${(cx + Math.cos(angle) * radii[corner]).toFixed(2)} ${(cy + Math.sin(angle) * radii[corner]).toFixed(2)}`)
    })
  }
  return `M${points.join(' L')} Z`
}

const tribeGlyphs = {
  beast: glyph('Beast sigil',
    '<path d="M6.2 4.2c1.6 4.2 1.5 10.4-1.2 15.8"/>'
    + '<path d="M11.4 3.2c1.7 5.2 1.6 11.4-.7 17.6"/>'
    + '<path d="M16.8 4.2c1.9 4.6 1.4 10.8-1.8 15.8"/>'
    + '<path d="M19.6 8.5c.6 2.6.3 5.4-.9 8"/>'),
  elemental: glyph('Elemental sigil',
    '<path d="M12 21c-4 0-6.6-2.7-6.6-6.3 0-3.7 2.8-5.6 3.7-9.4 2.2 1.6 3 3.6 2.8 5.7 1.2-.8 1.9-2.2 1.9-3.8 2.9 2.2 4.8 4.8 4.8 7.6 0 3.5-2.6 6.2-6.6 6.2z"/>'
    + '<path d="M12 21c-1.7 0-2.9-1.2-2.9-2.9 0-1.8 1.6-2.8 2.4-4.5 1.6 1.2 3.3 2.7 3.3 4.5 0 1.7-1.1 2.9-2.8 2.9z"/>'),
  undead: glyph('Undead sigil',
    '<path d="M12 3.4c-4.4 0-7.6 3-7.6 7.2 0 2.5 1.2 4.3 3 5.3v3.2c0 .5.4.9.9.9h7.4c.5 0 .9-.4.9-.9v-3.2c1.8-1 3-2.8 3-5.3 0-4.2-3.2-7.2-7.6-7.2z"/>'
    + '<circle cx="9" cy="11.2" r="1.7"/><circle cx="15" cy="11.2" r="1.7"/>'
    + '<path d="M12 13.8l-.9 1.7h1.8z"/><path d="M10.2 20v-2.2M13.8 20v-2.2"/>'),
  dragon: glyph('Dragon sigil',
    '<path d="M3.5 18.5c3-1 5-3.1 6.2-6.3C11 8.8 13.6 5.4 20.6 4c-1 2.4-1.4 4.5-1.1 6.5-1.6-.7-3-.6-4.3.2.9 1 1.3 2.3 1.2 3.7-1.5-.8-3-.9-4.5-.3.4 1.4.2 2.8-.6 4.1-2.4-.9-4.9-.9-7.8.3z"/>'
    + '<path d="M9.7 12.2c2.2.2 4.1-.4 5.5-1.5M8.4 15.4c1.6.3 3 .1 4.1-.5"/>'),
  mech: glyph('Mech sigil',
    `<path d="${cogPath(12, 12, 9, 6.6, 8)}"/>`
    + '<circle cx="12" cy="12" r="2.8"/><path d="M12 9.2v-1M12 15.8v-1"/>'),
  arcane: glyph('Arcane sigil',
    '<circle cx="12" cy="12" r="8.6"/>'
    + '<path d="M5.6 12c2-3 4.2-4.5 6.4-4.5s4.4 1.5 6.4 4.5c-2 3-4.2 4.5-6.4 4.5S7.6 15 5.6 12z"/>'
    + '<circle cx="12" cy="12" r="1.9" fill="#000"/>'
    + '<path d="M12 3.4v1.8M12 18.8v1.8"/>'),
  warrior: glyph('Warrior sigil',
    '<path d="M5 4l9.6 9.6M19 4l-9.6 9.6"/>'
    + '<path d="M16.6 11.4l-3.8 3.8M7.4 11.4l3.8 3.8"/>'
    + '<path d="M15 15l3.4 3.4M9 15l-3.4 3.4"/>'
    + '<circle cx="19.2" cy="19.2" r="1.1"/><circle cx="4.8" cy="19.2" r="1.1"/>'),
  nature: glyph('Nature sigil',
    '<path d="M5 19.2C5 11 10.2 5.4 19.4 4.4 18.8 14 13.2 19.2 5 19.2z"/>'
    + '<path d="M5 19.2l9.4-9.4M8.6 15.6h3.6M11.4 12.8V9.2"/>'),
  demon: glyph('Demon sigil',
    '<path d="M6 3.8c-.7 3.5.4 6.1 3 7.5M18 3.8c.7 3.5-.4 6.1-3 7.5"/>'
    + '<path d="M12 9.4c-3.3 0-5.6 2.4-5.6 5.5 0 3.1 2.4 5.7 5.6 5.7s5.6-2.6 5.6-5.7c0-3.1-2.3-5.5-5.6-5.5z"/>'
    + '<path d="M9.4 14.2l1.8.9M14.6 14.2l-1.8.9M10.3 17.7c1.1.7 2.3.7 3.4 0"/>'),
  none: glyph('Unaligned sigil',
    '<path d="M12 3.4l7.2 8.6-7.2 8.6L4.8 12z"/>'
    + '<path d="M12 8v8M9.4 12h5.2"/>'),
}

const interfaceGlyphs = {
  close: glyph('Close', '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  back: glyph('Back', '<path d="M19 12H5.5M11 6l-6 6 6 6"/>'),
  forward: glyph('Forward', '<path d="M5 12h13.5M13 6l6 6-6 6"/>'),
  'chevron-right': glyph('Expand', '<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>'),
  'chevron-down': glyph('Collapse', '<path d="M5.5 9.5l6.5 6.5 6.5-6.5"/>'),
  'active-mark': glyph('Active', '<path d="M12 5.5l6.5 6.5-6.5 6.5-6.5-6.5z" fill="#000"/>'),
  card: glyph('Card',
    '<rect x="6" y="3.5" width="12" height="17" rx="1.8"/>'
    + '<path d="M9 7.5h6M12 11l2.4 2.4-2.4 2.4-2.4-2.4z"/>'),
}

/** File name → SVG, for the generator to write into public/generated/ui/. */
export function buildGlyphFiles() {
  return {
    ...Object.fromEntries(Object.entries(tribeGlyphs).map(([id, body]) => [`tribe-${id}.svg`, body])),
    ...Object.fromEntries(Object.entries(interfaceGlyphs).map(([id, body]) => [`glyph-${id}.svg`, body])),
  }
}

export const TRIBE_GLYPH_IDS = Object.keys(tribeGlyphs)
export const INTERFACE_GLYPH_IDS = Object.keys(interfaceGlyphs)
