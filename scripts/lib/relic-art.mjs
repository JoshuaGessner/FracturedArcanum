/**
 * Relic art: the three card packs and the card back.
 *
 * The packs used to be flat app-icon shapes — a brown box with a blue dot, a
 * yellow chest — in a different world from the cards inside them. They are
 * relics now, drawn in the card art's light: a cord-bound folio sealed in
 * wax, a violet grimoire with a silver clasp, a gilded reliquary with an
 * ember eye. The card back is what a face-down card shows during a pack
 * ceremony, so it is drawn once and shared rather than reusing pack art.
 */

const svg = (viewBox, body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">${body}</svg>`

/** A ring of short engraved ticks, used on seals and the card back. */
function tickRing(cx, cy, inner, outer, count, extraEvery = 0) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    const r1 = extraEvery && index % extraEvery === 0 ? inner - (outer - inner) : inner
    return `M${(cx + Math.cos(angle) * r1).toFixed(1)} ${(cy + Math.sin(angle) * r1).toFixed(1)}L${(cx + Math.cos(angle) * outer).toFixed(1)} ${(cy + Math.sin(angle) * outer).toFixed(1)}`
  }).join('')
}

function boundFolio() {
  const defs = '<defs>'
    + '<linearGradient id="folio-leather" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6b4429"/><stop offset="55%" stop-color="#3f2717"/><stop offset="100%" stop-color="#22140b"/></linearGradient>'
    + '<linearGradient id="folio-cord" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#6e5232"/><stop offset="50%" stop-color="#a98457"/><stop offset="100%" stop-color="#6e5232"/></linearGradient>'
    + '<radialGradient id="folio-wax" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#d0574b"/><stop offset="60%" stop-color="#8f2a25"/><stop offset="100%" stop-color="#561614"/></radialGradient>'
    + '</defs>'
  const body = defs
    + '<rect x="28" y="18" width="144" height="244" rx="12" fill="url(#folio-leather)" stroke="#170d07" stroke-width="3"/>'
    + '<rect x="38" y="28" width="124" height="224" rx="8" fill="none" stroke="#c9a96e" stroke-opacity="0.45" stroke-width="1.5" stroke-dasharray="5 4"/>'
    + '<path d="M44 40q56-14 112 0" fill="none" stroke="#f1e7d3" stroke-opacity="0.08" stroke-width="6" stroke-linecap="round"/>'
    + '<rect x="90" y="18" width="20" height="244" fill="url(#folio-cord)"/>'
    + '<rect x="28" y="128" width="144" height="18" fill="url(#folio-cord)"/>'
    + '<path d="M90 18v244M110 18v244M28 128h144M28 146h144" stroke="#2c1d10" stroke-opacity="0.6" stroke-width="1"/>'
    + '<circle cx="100" cy="137" r="30" fill="#3d0f0d" opacity="0.5"/>'
    + '<path d="M100 104c10 2 22 6 28 16 6 12 2 24-2 32-6 10-18 16-28 15-12 0-22-6-28-16-5-9-6-21-1-31 6-10 19-16 31-16z" fill="url(#folio-wax)" stroke="#3d0f0d" stroke-width="1.5"/>'
    + '<circle cx="100" cy="137" r="18" fill="none" stroke="#3d0f0d" stroke-opacity="0.7" stroke-width="1.6"/>'
    + '<path d="M100 124l11 19H89z" fill="none" stroke="#3d0f0d" stroke-opacity="0.85" stroke-width="1.8" stroke-linejoin="round"/>'
    + '<path d="M86 118q8-6 18-4" fill="none" stroke="#f3c2b6" stroke-opacity="0.45" stroke-width="2.4" stroke-linecap="round"/>'
  return svg('0 0 200 280', body, 'Bound folio card pack')
}

function violetGrimoire() {
  const defs = '<defs>'
    + '<linearGradient id="grim-cover" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#5d3a80"/><stop offset="55%" stop-color="#36204c"/><stop offset="100%" stop-color="#180d22"/></linearGradient>'
    + '<linearGradient id="grim-silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e8e6ea"/><stop offset="50%" stop-color="#a7a2ad"/><stop offset="100%" stop-color="#5d5864"/></linearGradient>'
    + '<radialGradient id="grim-eye" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#f1e7d3"/><stop offset="45%" stop-color="#b993d6"/><stop offset="100%" stop-color="#3a2050"/></radialGradient>'
    + '</defs>'
  const corner = (x, y, sx, sy) => `<path d="M${x} ${y}l${32 * sx} 0l${-32 * sx} ${32 * sy}z" fill="url(#grim-silver)" stroke="#2a1838" stroke-width="1.2"/>`
  const body = defs
    + '<rect x="24" y="16" width="152" height="248" rx="10" fill="url(#grim-cover)" stroke="#120a19" stroke-width="3"/>'
    + '<rect x="24" y="16" width="14" height="248" rx="6" fill="#241433"/>'
    + '<rect x="46" y="32" width="114" height="216" rx="6" fill="none" stroke="#c4a6dc" stroke-opacity="0.35" stroke-width="1.4"/>'
    + corner(38, 16, 1, 1) + corner(176, 16, -1, 1) + corner(38, 264, 1, -1) + corner(176, 264, -1, -1)
    + `<path d="${tickRing(103, 140, 46, 54, 36, 6)}" fill="none" stroke="#c4a6dc" stroke-opacity="0.5" stroke-width="1.4" stroke-linecap="round"/>`
    + '<circle cx="103" cy="140" r="42" fill="none" stroke="#c4a6dc" stroke-opacity="0.4" stroke-width="1.4"/>'
    + '<rect x="160" y="122" width="26" height="36" rx="5" fill="url(#grim-silver)" stroke="#2a1838" stroke-width="1.4"/>'
    + '<circle cx="173" cy="140" r="5" fill="#2a1838"/>'
    + '<path d="M70 140c9-13 21-20 33-20s24 7 33 20c-9 13-21 20-33 20s-24-7-33-20z" fill="#1c1027" stroke="#c4a6dc" stroke-width="1.6"/>'
    + '<circle cx="103" cy="140" r="11" fill="url(#grim-eye)"/>'
    + '<circle cx="103" cy="140" r="4" fill="#120a19"/>'
  return svg('0 0 200 280', body, 'Violet grimoire card pack')
}

function gildedReliquary() {
  const defs = '<defs>'
    + '<linearGradient id="reli-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f6d892"/><stop offset="40%" stop-color="#d69a3e"/><stop offset="100%" stop-color="#6f4216"/></linearGradient>'
    + '<linearGradient id="reli-gold-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff0c4"/><stop offset="100%" stop-color="#9a6421"/></linearGradient>'
    + '<radialGradient id="reli-window" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="#3a2410"/><stop offset="100%" stop-color="#120a05"/></radialGradient>'
    + '<radialGradient id="reli-ember" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fff2c8"/><stop offset="35%" stop-color="#f3d08a"/><stop offset="70%" stop-color="#e0a84e" stop-opacity="0.55"/><stop offset="100%" stop-color="#e0a84e" stop-opacity="0"/></radialGradient>'
    + '</defs>'
  const body = defs
    + '<path d="M30 262V92Q30 22 100 14Q170 22 170 92V262z" fill="url(#reli-gold)" stroke="#4a2a0c" stroke-width="3"/>'
    + '<path d="M44 250V98Q44 38 100 30Q156 38 156 98V250z" fill="none" stroke="url(#reli-gold-edge)" stroke-width="2"/>'
    + '<path d="M58 238V104Q58 56 100 48Q142 56 142 104V238z" fill="url(#reli-window)" stroke="#5a360f" stroke-width="2"/>'
    + '<circle cx="100" cy="132" r="56" fill="url(#reli-ember)"/>'
    + `<path d="${tickRing(100, 132, 40, 46, 30, 5)}" fill="none" stroke="#f3d08a" stroke-opacity="0.55" stroke-width="1.4" stroke-linecap="round"/>`
    + '<path d="M74 132c7-10 16-15 26-15s19 5 26 15c-7 10-16 15-26 15s-19-5-26-15z" fill="#2a160a" stroke="#f3d08a" stroke-width="1.6"/>'
    + '<circle cx="100" cy="132" r="7" fill="#f3d08a"/>'
    + '<circle cx="100" cy="132" r="2.6" fill="#2a160a"/>'
    + '<path d="M66 196q34 14 68 0M70 214q30 10 60 0" fill="none" stroke="#f3d08a" stroke-opacity="0.35" stroke-width="1.4" stroke-linecap="round"/>'
    + '<path d="M100 2l8 14-8 8-8-8z" fill="url(#reli-gold-edge)" stroke="#4a2a0c" stroke-width="1.4"/>'
    + '<circle cx="100" cy="13" r="3.4" fill="#b8403a"/>'
    + '<rect x="24" y="256" width="152" height="14" rx="4" fill="url(#reli-gold)" stroke="#4a2a0c" stroke-width="2"/>'
  return svg('0 0 200 280', body, 'Gilded reliquary card pack')
}

function cardBack() {
  const defs = '<defs>'
    + '<radialGradient id="back-leather" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#3a2619"/><stop offset="70%" stop-color="#1f140d"/><stop offset="100%" stop-color="#110a06"/></radialGradient>'
    + '</defs>'
  const flourish = (x, y, sx, sy) => `<path d="M${x} ${y + 34 * sy}q0-${34 * sy} ${34 * sx}-${34 * sy}M${x + 8 * sx} ${y + 22 * sy}q0-${14 * sy} ${14 * sx}-${14 * sy}" fill="none" stroke="#c9a96e" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round"/>`
  const body = defs
    + '<rect width="252" height="352" rx="18" fill="url(#back-leather)"/>'
    + '<rect x="10" y="10" width="232" height="332" rx="12" fill="none" stroke="#b89458" stroke-width="2.4"/>'
    + '<rect x="18" y="18" width="216" height="316" rx="8" fill="none" stroke="#b89458" stroke-opacity="0.45" stroke-width="1.2"/>'
    + flourish(26, 26, 1, 1) + flourish(226, 26, -1, 1) + flourish(26, 326, 1, -1) + flourish(226, 326, -1, -1)
    + '<g fill="none" stroke="#c9a96e" stroke-linecap="round" stroke-linejoin="round">'
    + '<circle cx="126" cy="176" r="78" stroke-opacity="0.6" stroke-width="2"/>'
    + '<circle cx="126" cy="176" r="62" stroke-opacity="0.35" stroke-width="1.4"/>'
    + `<path d="${tickRing(126, 176, 66, 76, 48, 4)}" stroke-opacity="0.5" stroke-width="1.4"/>`
    + '<path d="M126 122l47 81h-94z" stroke-opacity="0.55" stroke-width="1.8"/>'
    + '<path d="M126 230l-47-81h94z" stroke-opacity="0.3" stroke-width="1.4"/>'
    + '<path d="M104 176c6-9 13-13 22-13s16 4 22 13c-6 9-13 13-22 13s-16-4-22-13z" stroke-opacity="0.8" stroke-width="1.8"/>'
    + '</g>'
    + '<circle cx="126" cy="176" r="5" fill="#e0a84e"/>'
  return svg('0 0 252 352', body, 'Card back')
}

/** File name → SVG for public/generated/ui/. */
export function buildRelicFiles() {
  return {
    'pack-standard.svg': boundFolio(),
    'pack-premium.svg': violetGrimoire(),
    'pack-legendary.svg': gildedReliquary(),
    'card-back.svg': cardBack(),
  }
}
