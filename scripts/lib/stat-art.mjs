/**
 * Stat emblems: the three shapes every card in the genre is read by.
 *
 * Hearthstone settled the vocabulary players arrive with — cost in a blue
 * crystal top-left, attack on a yellow blade bottom-left, health on a red
 * blood drop bottom-right — and Runeterra renders the same three as cut
 * materials rather than flat shapes. These follow both: a faceted mana
 * crystal, crossed swords behind an amber boss, and a blood drop, each
 * ringed in cast gold and lit from the upper left so they read as objects
 * sitting on the card, not stickers printed on it.
 *
 * Each emblem leaves a flat, darker field where its number sits, so a white
 * numeral with a dark outline always has contrast behind it — the "solid pip
 * zone" readability rule. CardFace positions the number over that field.
 */

const svg = (body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${label}">${body}</svg>`

const GOLD = '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
  + '<stop offset="0%" stop-color="#fbe3a8"/><stop offset="45%" stop-color="#d69a3e"/><stop offset="100%" stop-color="#6e4214"/>'
  + '</linearGradient>'

/** A cut crystal: crown facets bright, pavilion dark, a glint on the table. */
function manaCrystal() {
  const outline = 'M32 3 L52 14 L58 34 L46 59 L18 59 L6 34 L12 14 Z'
  const defs = '<defs>' + GOLD
    + '<linearGradient id="m" x1="0.2" y1="0" x2="0.8" y2="1">'
    + '<stop offset="0%" stop-color="#b6f4ff"/><stop offset="40%" stop-color="#2fa3c4"/><stop offset="100%" stop-color="#0a3049"/>'
    + '</linearGradient>'
    + '<radialGradient id="mt" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#0d3c58" stop-opacity="0.75"/><stop offset="100%" stop-color="#0d3c58" stop-opacity="0"/></radialGradient>'
    + '</defs>'
  return svg(defs
    + `<path d="${outline}" fill="#2a1606"/>`
    + `<path d="${outline}" fill="url(#m)" stroke="url(#g)" stroke-width="3.2" stroke-linejoin="round"/>`
    // Crown facets — light from the upper left.
    + '<path d="M32 6 L13 16 L22 25 Z" fill="#ffffff" opacity="0.55"/>'
    + '<path d="M32 6 L22 25 L42 25 Z" fill="#e8fcff" opacity="0.35"/>'
    + '<path d="M32 6 L42 25 L51 16 Z" fill="#ffffff" opacity="0.18"/>'
    + '<path d="M13 16 L8 34 L22 25 Z" fill="#ffffff" opacity="0.22"/>'
    // Pavilion — the lower half falls into shadow.
    + '<path d="M8 34 L19 57 L32 48 Z" fill="#000" opacity="0.18"/>'
    + '<path d="M56 34 L45 57 L32 48 Z" fill="#000" opacity="0.32"/>'
    + '<path d="M51 16 L56 34 L42 25 Z" fill="#000" opacity="0.2"/>'
    // The table, where the number sits: a calm, darker field.
    + '<ellipse cx="32" cy="35" rx="17" ry="15" fill="url(#mt)"/>'
    // Glint.
    + '<path d="M19 11 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" fill="#ffffff" opacity="0.9"/>',
    'Mana cost')
}

/** Crossed swords behind an amber boss — the blades say "attack". */
function attackBlade() {
  const defs = '<defs>' + GOLD
    + '<linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#f4f1ea"/><stop offset="50%" stop-color="#b9b4aa"/><stop offset="100%" stop-color="#5e5a54"/></linearGradient>'
    + '<radialGradient id="a" cx="38%" cy="32%" r="70%"><stop offset="0%" stop-color="#ffe08a"/><stop offset="45%" stop-color="#e0901f"/><stop offset="100%" stop-color="#6e3608"/></radialGradient>'
    + '</defs>'
  // One sword, tip up, drawn about the boss's centre; two of them crossed.
  const sword = '<path d="M32 0 L37 9 L37 34 L27 34 L27 9 Z" fill="#2a1606"/>'
    + '<path d="M32 2 L35.6 9.6 L35.6 33 L28.4 33 L28.4 9.6 Z" fill="url(#s)"/>'
    + '<path d="M32 6 L32 31" stroke="#77736c" stroke-width="1.2"/>'
    + '<rect x="21" y="49" width="22" height="5" rx="2" fill="url(#g)" stroke="#2a1606" stroke-width="1.2"/>'
    + '<rect x="29.5" y="54" width="5" height="7" rx="1.5" fill="#5a3418" stroke="#2a1606" stroke-width="1"/>'
  return svg(defs
    + `<g transform="rotate(-38 32 35)">${sword}</g>`
    + `<g transform="rotate(38 32 35)">${sword}</g>`
    // The amber boss the number sits on.
    + '<circle cx="32" cy="35" r="17" fill="#2a1606"/>'
    + '<circle cx="32" cy="35" r="15.5" fill="url(#a)" stroke="url(#g)" stroke-width="2.6"/>'
    + '<circle cx="32" cy="36" r="11" fill="#5a2a06" opacity="0.32"/>'
    + '<path d="M22 28 A12 12 0 0 1 34 22" stroke="#fff6dc" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.75"/>',
    'Attack')
}

/** A blood drop: the genre's health, round where the number sits. */
function healthDrop() {
  const drop = 'M32 3 C32 3 55 27 55 40 A23 22 0 0 1 9 40 C9 27 32 3 32 3 Z'
  const defs = '<defs>' + GOLD
    + '<radialGradient id="h" cx="38%" cy="42%" r="70%"><stop offset="0%" stop-color="#ff9a86"/><stop offset="42%" stop-color="#c8322b"/><stop offset="100%" stop-color="#4e0b0a"/></radialGradient>'
    + '<radialGradient id="ht" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#4a0908" stop-opacity="0.6"/><stop offset="100%" stop-color="#4a0908" stop-opacity="0"/></radialGradient>'
    + '</defs>'
  return svg(defs
    + `<path d="${drop}" fill="#2a1606"/>`
    + `<path d="${drop}" fill="url(#h)" stroke="url(#g)" stroke-width="3.2" stroke-linejoin="round"/>`
    + '<ellipse cx="32" cy="41" rx="15" ry="13" fill="url(#ht)"/>'
    // Wet highlight down the left flank and a pinpoint glint.
    + '<path d="M22 24 C17 31 15 37 16 44" stroke="#ffd6cc" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.7"/>'
    + '<circle cx="25" cy="20" r="2" fill="#ffffff" opacity="0.85"/>',
    'Health')
}

/** File name → SVG for public/generated/ui/. */
export function buildStatFiles() {
  return {
    'stat-mana.svg': manaCrystal(),
    'stat-attack.svg': attackBlade(),
    'stat-health.svg': healthDrop(),
  }
}
