/**
 * Card illustration system — one bespoke scene per card in CARD_LIBRARY,
 * composed inside a shared cosmic-horror atmosphere so the whole set reads
 * as a single hand.
 *
 * Style contract (every card):
 *  1. Abyss sky — near-black gradient in the tribe's hue, one low
 *     "drowned light" radial, pallid star specks.
 *  2. A celestial motif behind the focal point: broken ring, rift, or
 *     sunken moon.
 *  3. Far cyclopean ruins at low opacity.
 *  4. Fog bands behind and in front of the subject.
 *  5. The focal horror itself — bespoke per card, dark body tones, one
 *     glow accent, and eyes that give off light.
 *  6. Ground fringe, vignette, and stipple grain.
 *
 * Rarity escalates the aura only (sigil ring → double ring → corona), so
 * commons and legendaries still share one palette discipline.
 *
 * The card list is imported from the compiled engine so this file can
 * never drift from the library again: a library card without a scene is a
 * build error, not a silent fallback.
 */
import { CARD_LIBRARY } from '../../server/game.js'

const W = 340
const H = 220

/**
 * One palette per tribe. All skies converge to near-black; the tribe only
 * chooses which sickness tints the dark.
 *  sky1/sky2 — gradient stops   glow — the single accent light
 *  body/shade — creature tones  rim — pallid edge light   eye — eye glow
 */
export const TRIBE_PALETTES = {
  elemental: { sky1: '#08141f', sky2: '#02050a', glow: '#4fd8c4', body: '#22525d', shade: '#0e313b', rim: '#9ff0e2', eye: '#d7fff6' },
  beast: { sky1: '#140e0c', sky2: '#050303', glow: '#c98a4b', body: '#54392a', shade: '#2b1c13', rim: '#e0bd92', eye: '#ffb84d' },
  undead: { sky1: '#0a1410', sky2: '#030705', glow: '#8fd3a3', body: '#3c5244', shade: '#1b2b20', rim: '#cfe8d4', eye: '#b4ffcf' },
  dragon: { sky1: '#170a10', sky2: '#050205', glow: '#e0564a', body: '#5e2d3a', shade: '#2e131b', rim: '#f0a98e', eye: '#ffcf6e' },
  mech: { sky1: '#0e0f12', sky2: '#040405', glow: '#c9a35a', body: '#4d4636', shade: '#262115', rim: '#e6cf9a', eye: '#9adfd2' },
  arcane: { sky1: '#110b20', sky2: '#040309', glow: '#a37fe8', body: '#453770', shade: '#221a3d', rim: '#cdb6ff', eye: '#e6d9ff' },
  warrior: { sky1: '#0d0e15', sky2: '#040407', glow: '#d9a866', body: '#414a5c', shade: '#1e2431', rim: '#b8c4d9', eye: '#ffd9a0' },
  nature: { sky1: '#0b1208', sky2: '#030503', glow: '#97c06b', body: '#3e5230', shade: '#1d2a15', rim: '#cfe0a8', eye: '#e4ffb0' },
  demon: { sky1: '#160914', sky2: '#050208', glow: '#d84a6f', body: '#57263f', shade: '#2b1220', rim: '#f08eae', eye: '#ff9db8' },
  none: { sky1: '#0d0d14', sky2: '#040406', glow: '#8f9bb8', body: '#424255', shade: '#20202b', rim: '#c2c9dd', eye: '#e4e9f7' },
  token: { sky1: '#0a1118', sky2: '#030507', glow: '#9fd8e8', body: '#35505f', shade: '#18272f', rim: '#cfeaf4', eye: '#e8fbff' },
}

export function artHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

// ── Shared scenery ─────────────────────────────────────────────────────

/** Pallid star specks, hash-scattered so each card's sky is its own. */
function stars(h, rim) {
  let out = ''
  for (let i = 0; i < 9; i++) {
    const x = 22 + ((h * (i + 3) * 7919) % 296)
    const y = 16 + ((h * (i + 7) * 104729) % 78)
    const r = 0.7 + ((h * (i + 1)) % 3) * 0.35
    const o = 0.12 + ((h * (i + 5)) % 4) * 0.05
    out += `<circle cx="${x}" cy="${y}" r="${r.toFixed(2)}" fill="${rim}" opacity="${o.toFixed(2)}"/>`
  }
  return out
}

/** Celestial motifs — exactly one sits behind every focal point. */
const MOTIFS = {
  /** A ring with a bite taken out of it — the eclipse that never closes. */
  ring: (p, cx, cy, r) => `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.glow}" stroke-width="2.5" opacity=".38"
      stroke-dasharray="${(r * 4.4).toFixed(0)} ${(r * 1.9).toFixed(0)}"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 7}" fill="none" stroke="${p.rim}" stroke-width="1" opacity=".2"/>`,
  /** A vertical tear in the sky, brighter at the seam. */
  rift: (p, cx, cy, r) => `
    <path d="M${cx} ${cy - r} C${cx + r * 0.3} ${cy - r * 0.4} ${cx - r * 0.26} ${cy + r * 0.34} ${cx} ${cy + r}"
      fill="none" stroke="${p.glow}" stroke-width="3" opacity=".42" stroke-linecap="round"/>
    <path d="M${cx} ${cy - r} C${cx + r * 0.3} ${cy - r * 0.4} ${cx - r * 0.26} ${cy + r * 0.34} ${cx} ${cy + r}"
      fill="none" stroke="${p.rim}" stroke-width="8" opacity=".1" stroke-linecap="round"/>`,
  /** A drowned moon, low and heavy, half-eaten by the dark. */
  moon: (p, cx, cy, r) => `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.glow}" opacity=".16"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="${p.rim}" opacity=".14"/>
    <path d="M${cx - r} ${cy} A${r} ${r} 0 0 0 ${cx + r} ${cy}" fill="${p.sky2}" opacity=".55"/>`,
}

/** Far cyclopean ruins — wrong-angled slabs on the horizon. */
function ruins(h, p) {
  const x0 = 30 + (h % 40)
  const lean = (h % 2 === 0 ? 1 : -1) * (4 + (h % 6))
  return `
  <g fill="${p.shade}" opacity=".5">
    <path d="M${x0} 178 L${x0 + 14 + lean} 108 L${x0 + 30} 176 Z"/>
    <path d="M${x0 + 196} 178 L${x0 + 210 - lean} 96 L${x0 + 230} 174 Z"/>
    <path d="M${x0 + 236} 180 L${x0 + 244} 132 L${x0 + 258} 178 Z"/>
  </g>
  <g stroke="${p.glow}" stroke-width="1" opacity=".18" fill="none">
    <path d="M${x0 + 8} 150 h12 M${x0 + 204} 132 h10 M${x0 + 207} 148 h12"/>
  </g>`
}

/** A translucent fog band across the frame. */
function fog(p, y, amp, opacity) {
  return `<path d="M-4 ${y} C60 ${y - amp} 130 ${y + amp} 190 ${y} C250 ${y - amp} 300 ${y + amp} 344 ${y - amp / 2} V${y + 34} H-4 Z" fill="${p.rim}" opacity="${opacity}"/>`
}

/** Ground fringe: black reeds / spines silhouetted along the bottom. */
function ground(h, p) {
  let spines = ''
  for (let i = 0; i < 11; i++) {
    const x = 8 + i * 32 + ((h * (i + 2)) % 14)
    const tall = 8 + ((h * (i + 3)) % 17)
    const bend = ((h * (i + 1)) % 9) - 4
    spines += `<path d="M${x} 220 C${x + 1} ${212 - tall} ${x + bend} ${208 - tall} ${x + bend * 2} ${202 - tall}" stroke="${p.shade}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
  }
  return `
  <path d="M0 196 C60 186 120 194 170 190 C230 185 290 194 340 187 V220 H0 Z" fill="${p.sky2}" opacity=".9"/>
  ${spines}`
}

/** Corner-dark vignette plus a breath of grain. */
function vignetteAndGrain(id, h, p) {
  let grain = ''
  for (let i = 0; i < 26; i++) {
    const x = (h * (i + 11) * 31) % 340
    const y = (h * (i + 17) * 57) % 220
    grain += `<circle cx="${x}" cy="${y}" r=".6" fill="${p.rim}" opacity=".05"/>`
  }
  return `
  <rect width="${W}" height="${H}" rx="28" fill="url(#vig-${id})"/>
  ${grain}`
}

// ── Creature part helpers ──────────────────────────────────────────────

/** A pair of glowing eyes; the one constant across every horror. */
export function eyes(p, x1, y1, x2, y2, r = 3, tilt = 0) {
  const slant = tilt ? ` transform="rotate(${tilt} ${(x1 + x2) / 2} ${(y1 + y2) / 2})"` : ''
  return `<g${slant}>
    <circle cx="${x1}" cy="${y1}" r="${r * 2.1}" fill="${p.eye}" opacity=".14"/>
    <circle cx="${x2}" cy="${y2}" r="${r * 2.1}" fill="${p.eye}" opacity=".14"/>
    <circle cx="${x1}" cy="${y1}" r="${r}" fill="${p.eye}"/>
    <circle cx="${x2}" cy="${y2}" r="${r}" fill="${p.eye}"/>
  </g>`
}

/** A scatter of too many eyes, for the things that should not have any. */
export function eyeCluster(p, cx, cy, spread, count, seed) {
  let out = ''
  for (let i = 0; i < count; i++) {
    const a = (seed * (i + 3)) % 360
    const d = ((seed * (i + 7)) % 100) / 100 * spread
    const x = cx + Math.cos((a * Math.PI) / 180) * d
    const y = cy + Math.sin((a * Math.PI) / 180) * d * 0.6
    const r = 1.4 + ((seed * (i + 1)) % 3) * 0.8
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r * 1.9}" fill="${p.eye}" opacity=".12"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${p.eye}"/>`
  }
  return out
}

// ── Bespoke scenes ─────────────────────────────────────────────────────
// One entry per library card (plus battle tokens and the load-error seal).
// `motif` = [kind, cx, cy, r] behind the subject; `draw` paints the horror.

export const CARD_SCENES = {
  // ═══ Commons ═══
  'spark-imp': {
    motif: ['rift', 170, 82, 50],
    draw: (p) => `
      <path d="M126 178 C138 158 150 152 162 150 L154 136 L170 142 L168 126 L182 138 L192 128 L192 144 C206 148 218 158 228 176" fill="${p.body}"/>
      <path d="M126 178 C138 158 150 152 162 150 L154 136 L170 142" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".4"/>
      <path d="M118 182 L102 168 M132 172 L120 152 M222 172 L238 154 M232 180 L248 170" stroke="${p.glow}" stroke-width="3" stroke-linecap="round" opacity=".85"/>
      <path d="M146 118 L158 96 L152 96 L166 72 M196 120 L188 100 L196 100 L184 78" stroke="${p.glow}" stroke-width="2" stroke-linecap="round" fill="none" opacity=".7"/>
      <path d="M150 160 Q170 168 190 160" stroke="${p.shade}" stroke-width="3" fill="none"/>
      ${eyes(p, 160, 150, 181, 150, 3.4)}
      <circle cx="170" cy="118" r="2" fill="${p.eye}" opacity=".8"/>
      <circle cx="140" cy="132" r="1.4" fill="${p.eye}" opacity=".6"/>`,
  },
  'tide-caller': {
    motif: ['moon', 170, 66, 34],
    draw: (p) => `
      <path d="M156 190 L152 132 C152 118 158 108 170 104 C182 108 188 118 188 132 L184 190 Z" fill="${p.shade}"/>
      <path d="M170 104 C162 96 160 88 164 78 C172 84 176 82 178 74 C184 84 180 98 170 104 Z" fill="${p.body}"/>
      <path d="M150 128 C136 120 128 108 130 92 M190 128 C204 120 212 108 210 92" stroke="${p.body}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M36 176 C70 158 96 170 118 160 C100 148 96 132 104 118 C122 132 142 130 150 140" fill="${p.body}" opacity=".8"/>
      <path d="M226 172 C250 158 268 162 296 148 C280 140 274 128 278 116 C292 126 306 126 312 134" fill="${p.body}" opacity=".7"/>
      <circle cx="112" cy="138" r="3.4" fill="${p.eye}"/>
      <circle cx="284" cy="134" r="2.8" fill="${p.eye}"/>
      ${eyes(p, 165, 90, 175, 90, 2)}
      <path d="M60 182 Q170 196 300 178" stroke="${p.glow}" stroke-width="1.4" fill="none" opacity=".4"/>`,
  },
  'cave-bat': {
    motif: ['ring', 170, 96, 56],
    draw: (p) => `
      <path d="M76 70 C104 96 130 104 148 100 L148 88 C122 88 98 74 76 54 Z" fill="${p.shade}"/>
      <path d="M264 70 C236 96 210 104 192 100 L192 88 C218 88 242 74 264 54 Z" fill="${p.shade}"/>
      <path d="M148 96 C148 78 158 66 170 66 C182 66 192 78 192 96 C192 126 184 148 170 160 C156 148 148 126 148 96 Z" fill="${p.body}"/>
      <path d="M148 96 C148 78 158 66 170 66" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".45"/>
      <circle cx="170" cy="112" r="9" fill="${p.shade}"/>
      <circle cx="170" cy="112" r="9" fill="none" stroke="${p.glow}" stroke-width="1.4" opacity=".8"/>
      <path d="M164 108 L176 116 M176 108 L164 116" stroke="${p.glow}" stroke-width="1" opacity=".6"/>
      <path d="M158 160 C160 176 156 186 148 194 M182 160 C180 176 184 186 192 194" stroke="${p.body}" stroke-width="3" fill="none" stroke-linecap="round"/>
      ${eyeCluster(p, 170, 82, 12, 4, 37)}`,
  },
  'copper-automaton': {
    motif: ['ring', 170, 90, 52],
    draw: (p) => `
      <path d="M144 190 L148 128 C148 112 156 102 170 102 C184 102 192 112 192 128 L196 190 Z" fill="${p.body}"/>
      <path d="M150 128 h40 M152 144 h36 M154 160 h32" stroke="${p.shade}" stroke-width="3"/>
      <path d="M156 102 L152 84 C152 72 160 64 170 64 C180 64 188 72 188 84 L184 102 Z" fill="none" stroke="${p.body}" stroke-width="4"/>
      <circle cx="170" cy="84" r="5" fill="${p.eye}"/>
      <circle cx="170" cy="84" r="10" fill="${p.eye}" opacity=".15"/>
      <path d="M148 118 C132 122 124 134 122 150 M192 118 C208 122 216 134 218 150" stroke="${p.body}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M122 150 L118 168 M218 150 L224 166" stroke="${p.shade}" stroke-width="4" stroke-linecap="round"/>
      <path d="M160 190 L158 204 M180 190 L182 204" stroke="${p.shade}" stroke-width="5" stroke-linecap="round"/>
      <path d="M170 102 V116 M164 108 h12" stroke="${p.glow}" stroke-width="1.4" opacity=".7"/>`,
  },
  'shade-fox': {
    motif: ['moon', 226, 72, 30],
    draw: (p) => `
      <path d="M96 170 C118 150 142 142 168 144 C186 146 200 140 210 128 C214 140 210 150 200 158 C222 158 240 166 250 180 C216 176 190 180 168 176 C142 172 116 176 96 170 Z" fill="${p.body}"/>
      <path d="M210 128 L206 108 L196 124 M222 132 L228 116 L214 126" fill="${p.body}"/>
      <path d="M96 170 C80 162 66 164 52 176 C68 178 80 184 90 192 C74 194 62 200 56 208" fill="none" stroke="${p.body}" stroke-width="7" stroke-linecap="round"/>
      <path d="M168 144 C186 146 200 140 210 128" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".5"/>
      ${eyes(p, 203, 134, 213, 138, 2.6, -8)}
      <path d="M120 176 L112 196 M150 178 L146 198 M196 172 L202 192" stroke="${p.shade}" stroke-width="4" stroke-linecap="round"/>`,
  },
  'ironbark-guard': {
    motif: ['ring', 170, 84, 48],
    draw: (p) => `
      <path d="M100 190 L104 120 L112 120 L116 190 M150 192 L154 108 L162 108 L166 192 M204 192 L208 116 L216 116 L220 190 M254 190 L258 126 L266 126 L270 190" fill="${p.body}"/>
      <path d="M104 124 Q110 116 112 124 M154 112 Q158 102 162 112 M208 120 Q212 110 216 120 M258 130 Q262 122 266 130" fill="${p.rim}" opacity=".5"/>
      <path d="M92 150 C150 138 220 138 278 150 M92 172 C150 160 220 160 278 172" stroke="${p.shade}" stroke-width="7" fill="none"/>
      <path d="M128 154 C134 130 146 118 160 116 C150 132 148 146 152 162" fill="${p.shade}"/>
      <path d="M176 158 C180 138 192 126 206 126 C198 140 196 152 200 166" fill="${p.shade}"/>
      ${eyes(p, 142, 136, 154, 134, 2.4)}
      <path d="M110 146 h6 M162 142 h6 M212 144 h6" stroke="${p.glow}" stroke-width="1.6" opacity=".6"/>`,
  },
  'dawn-healer': {
    motif: ['moon', 170, 64, 30],
    draw: (p) => `
      <path d="M140 192 C138 146 148 116 170 100 C192 116 202 146 200 192 Z" fill="${p.body}"/>
      <path d="M170 100 C160 92 156 82 158 70 C166 76 174 76 182 70 C184 82 180 92 170 100 Z" fill="${p.shade}"/>
      <path d="M148 148 C138 142 132 132 132 120 L148 132 Z M192 148 C202 142 208 132 208 120 L192 132 Z" fill="${p.body}"/>
      <rect x="166" y="116" width="8" height="26" rx="3" fill="${p.shade}"/>
      <path d="M170 108 C167 102 167 97 170 92 C173 97 173 102 170 108 Z" fill="${p.eye}"/>
      <circle cx="170" cy="100" r="16" fill="${p.eye}" opacity=".12"/>
      <circle cx="170" cy="100" r="28" fill="${p.eye}" opacity=".06"/>
      ${eyes(p, 163, 84, 177, 84, 1.8)}
      <path d="M150 170 C158 164 182 164 190 170" stroke="${p.glow}" stroke-width="1.4" fill="none" opacity=".5"/>`,
  },
  'blaze-runner': {
    motif: ['rift', 216, 84, 46],
    draw: (p) => `
      <path d="M118 178 C136 172 148 162 154 148 L144 146 C154 136 162 124 166 110 L174 122 L182 102 L188 118 L200 108 C198 124 192 136 184 144 L196 146 C188 162 172 174 152 180 Z" fill="${p.body}"/>
      <path d="M166 110 L174 122 L182 102 L188 118 L200 108" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".5"/>
      <path d="M118 178 C100 184 84 184 70 178 M128 166 C112 168 100 166 90 160" stroke="${p.glow}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>
      <path d="M204 152 C214 144 220 134 222 122 M206 166 C220 162 230 154 236 142" stroke="${p.glow}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>
      ${eyes(p, 172, 132, 184, 130, 2.6, -10)}
      <circle cx="98" cy="172" r="2" fill="${p.eye}" opacity=".7"/>
      <circle cx="230" cy="130" r="1.6" fill="${p.eye}" opacity=".6"/>`,
  },
  'void-leech': {
    motif: ['rift', 170, 78, 48],
    draw: (p) => `
      <path d="M112 182 C112 158 124 144 142 140 C168 134 186 118 190 94 C210 102 216 126 204 144 C194 158 176 164 158 166 C140 168 128 174 124 186 Z" fill="${p.body}"/>
      <path d="M142 140 C168 134 186 118 190 94" fill="none" stroke="${p.rim}" stroke-width="1.4" opacity=".45"/>
      <circle cx="196" cy="86" r="14" fill="${p.shade}"/>
      <circle cx="196" cy="86" r="14" fill="none" stroke="${p.glow}" stroke-width="1.6" opacity=".8"/>
      <path d="M190 80 L202 92 M202 80 L190 92 M196 76 V96 M186 86 H206" stroke="${p.glow}" stroke-width="1" opacity=".6"/>
      <path d="M226 120 C220 108 212 98 204 92 M232 140 C228 126 222 114 214 104" stroke="${p.glow}" stroke-width="1.6" fill="none" opacity=".5" stroke-dasharray="3 4"/>
      <circle cx="238" cy="128" r="8" fill="${p.glow}" opacity=".2"/>
      ${eyeCluster(p, 150, 150, 16, 5, 61)}`,
  },
  'bog-lurker': {
    motif: ['moon', 116, 70, 30],
    draw: (p) => `
      <path d="M96 162 C120 148 148 142 172 146 C198 150 222 148 244 156 C226 160 214 158 204 162 C224 164 238 168 246 176 L94 176 C102 170 110 166 96 162 Z" fill="${p.body}"/>
      <path d="M128 146 Q136 128 148 128 Q144 140 148 148 M176 144 Q184 128 196 130 Q190 140 194 150" fill="${p.shade}"/>
      ${eyes(p, 146, 138, 190, 140, 3.2)}
      <path d="M60 176 H286 M74 186 H272 M92 196 H254" stroke="${p.shade}" stroke-width="5" stroke-linecap="round" opacity=".8"/>
      <path d="M100 176 C100 168 104 162 110 158 M240 176 C242 168 240 160 234 156" stroke="${p.glow}" stroke-width="1.2" fill="none" opacity=".4"/>
      <circle cx="122" cy="182" r="2" fill="${p.glow}" opacity=".5"/>
      <circle cx="218" cy="184" r="2.4" fill="${p.glow}" opacity=".4"/>`,
  },
  'militia-recruit': {
    motif: ['ring', 170, 88, 50],
    draw: (p) => `
      <path d="M138 192 C138 158 148 136 170 128 C192 136 202 158 202 192 Z" fill="${p.body}"/>
      <path d="M170 128 C161 121 158 112 161 102 C167 108 173 108 179 102 C182 112 179 121 170 128 Z" fill="${p.shade}"/>
      <path d="M148 158 C140 150 136 140 138 128 L152 144 Z" fill="${p.body}"/>
      <path d="M192 150 L206 122 L210 126 L200 152 Z" fill="${p.rim}" opacity=".8"/>
      <rect x="112" y="168" width="6" height="20" fill="${p.shade}"/>
      <rect x="222" y="164" width="6" height="24" fill="${p.shade}"/>
      <path d="M115 162 C113 157 113 153 115 149 C117 153 117 157 115 162 Z M225 158 C223 153 223 149 225 145 C227 149 227 153 225 158 Z" fill="${p.eye}"/>
      <circle cx="115" cy="156" r="8" fill="${p.eye}" opacity=".14"/>
      <circle cx="225" cy="152" r="8" fill="${p.eye}" opacity=".14"/>
      ${eyes(p, 164, 114, 176, 114, 1.8)}`,
  },
  'rust-golem': {
    motif: ['moon', 236, 70, 32],
    draw: (p) => `
      <path d="M118 192 C116 156 128 130 152 118 C144 108 146 96 156 90 C150 104 160 112 172 110 C196 106 218 122 226 148 C232 168 230 182 224 192 Z" fill="${p.body}"/>
      <path d="M152 118 C144 108 146 96 156 90" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".4"/>
      <path d="M140 148 h24 M136 164 h20 M182 150 h26 M186 166 h22" stroke="${p.shade}" stroke-width="4"/>
      <path d="M158 128 L166 136 L158 144" fill="none" stroke="${p.shade}" stroke-width="3"/>
      <circle cx="184" cy="128" r="5" fill="${p.eye}"/>
      <circle cx="184" cy="128" r="11" fill="${p.eye}" opacity=".13"/>
      <path d="M130 178 C126 168 118 164 108 166 M216 156 C224 148 234 146 244 152" stroke="${p.body}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M148 100 C142 92 134 88 124 90" stroke="${p.glow}" stroke-width="1.4" fill="none" opacity=".5"/>`,
  },
  'rune-scholar': {
    motif: ['ring', 170, 86, 52],
    draw: (p) => `
      <path d="M142 192 C140 154 150 130 170 122 C190 130 200 154 198 192 Z" fill="${p.body}"/>
      <path d="M170 122 C160 115 157 105 161 95 C167 101 173 101 179 95 C183 105 180 115 170 122 Z" fill="${p.shade}"/>
      <path d="M132 140 L166 132 L166 154 L132 162 Z M208 140 L174 132 L174 154 L208 162 Z" fill="${p.shade}"/>
      <path d="M132 140 L166 132 M174 132 L208 140" stroke="${p.glow}" stroke-width="1.4" opacity=".7"/>
      <path d="M140 148 h18 M142 156 h14 M182 148 h18 M184 156 h14" stroke="${p.glow}" stroke-width="1.2" opacity=".55"/>
      ${glyphShards(p, 170, 70, 29, 3)}
      ${eyes(p, 164, 108, 176, 108, 1.8)}
      <path d="M154 176 h32" stroke="${p.shade}" stroke-width="2" opacity=".8"/>`,
  },
  'sky-raider': {
    motif: ['rift', 170, 74, 52],
    draw: (p) => `
      <path d="M170 66 L162 92 L146 96 C120 100 100 92 84 74 C106 80 124 78 138 70 L154 62 Z" fill="${p.body}"/>
      <path d="M170 66 L178 92 L194 96 C220 100 240 92 256 74 C234 80 216 78 202 70 L186 62 Z" fill="${p.body}"/>
      <path d="M162 92 C158 118 162 142 170 162 C178 142 182 118 178 92 C176 84 164 84 162 92 Z" fill="${p.shade}"/>
      <path d="M170 162 L166 190 M170 162 L178 186" stroke="${p.shade}" stroke-width="3" stroke-linecap="round"/>
      <path d="M148 128 L124 168 M126 162 L120 174 L134 172" stroke="${p.rim}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      ${eyes(p, 166, 98, 174, 98, 2)}
      <path d="M84 74 C106 80 124 78 138 70" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".4"/>`,
  },
  'thornback-boar': {
    motif: ['ring', 170, 82, 48],
    draw: (p) => `
      <path d="M104 186 C104 152 126 128 162 124 C196 120 226 132 240 156 C246 168 246 178 240 186 Z" fill="${p.body}"/>
      <path d="M130 130 L124 106 L140 122 M154 122 L152 96 L166 118 M182 118 L184 94 L194 116 M208 122 L216 102 L220 124" fill="${p.shade}"/>
      <path d="M240 156 C250 158 256 164 258 172 L242 172" fill="${p.shade}"/>
      <path d="M234 168 L252 162 M238 176 L254 174" stroke="${p.rim}" stroke-width="2.6" stroke-linecap="round"/>
      ${eyes(p, 224, 152, 236, 158, 2.6, -6)}
      <path d="M120 186 L116 200 M146 188 L144 202 M198 188 L200 202 M228 186 L232 200" stroke="${p.shade}" stroke-width="5" stroke-linecap="round"/>
      <path d="M162 124 C196 120 226 132 240 156" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".4"/>`,
  },
  'wind-sprite': {
    motif: ['moon', 170, 70, 34],
    draw: (p) => `
      <path d="M92 150 C118 134 148 130 170 138 C196 148 224 146 248 132 C240 152 220 164 196 166 C216 172 234 170 250 162 C238 180 214 188 188 184 C158 180 124 184 100 172 C110 166 122 162 134 162 C118 158 104 156 92 150 Z" fill="${p.body}" opacity=".85"/>
      <path d="M148 140 C156 132 168 128 180 130" fill="none" stroke="${p.rim}" stroke-width="1.6" opacity=".5"/>
      ${eyes(p, 160, 148, 182, 146, 3)}
      <path d="M156 160 Q172 166 188 158" stroke="${p.shade}" stroke-width="2.4" fill="none"/>
      <path d="M70 168 C82 164 92 164 102 168 M240 118 C252 114 262 114 272 118" stroke="${p.glow}" stroke-width="1.4" fill="none" opacity=".4"/>`,
  },
  'granite-sentinel': {
    motif: ['ring', 170, 92, 60],
    draw: (p) => `
      <path d="M144 192 L150 74 L170 58 L190 74 L196 192 Z" fill="${p.body}"/>
      <path d="M150 74 L170 58 L190 74" fill="none" stroke="${p.rim}" stroke-width="1.6" opacity=".5"/>
      <path d="M170 96 C165 102 165 110 170 116 C175 110 175 102 170 96 Z" fill="${p.eye}"/>
      <circle cx="170" cy="106" r="14" fill="${p.eye}" opacity=".12"/>
      <path d="M158 134 h24 M160 146 h20 M158 158 h24 M162 170 h16" stroke="${p.glow}" stroke-width="1.6" opacity=".6"/>
      <path d="M156 88 L152 128 M184 88 L188 132" stroke="${p.shade}" stroke-width="2.4"/>
      <path d="M120 192 C126 180 136 174 148 174 M220 192 C214 180 204 174 192 174" fill="none" stroke="${p.shade}" stroke-width="4"/>`,
  },
  'fire-imp': {
    motif: ['rift', 170, 80, 46],
    draw: (p) => `
      <path d="M140 178 C140 152 152 136 170 132 C188 136 200 152 200 178 Z" fill="${p.body}"/>
      <path d="M170 132 C160 126 156 116 158 104 C164 110 170 110 176 102 C182 112 180 124 170 132 Z" fill="${p.shade}"/>
      <path d="M152 112 L142 92 L158 102 M188 112 L198 92 L182 102" fill="${p.body}"/>
      <path d="M156 158 Q170 170 184 158 L180 164 L174 160 L170 166 L166 160 L160 164 Z" fill="${p.eye}" opacity=".9"/>
      ${eyes(p, 161, 144, 179, 144, 3)}
      <path d="M118 168 C110 158 108 146 112 134 C118 142 126 144 132 140" fill="${p.glow}" opacity=".5"/>
      <path d="M222 164 C230 154 232 142 228 130 C222 138 214 140 208 136" fill="${p.glow}" opacity=".5"/>
      <path d="M140 178 L136 192 M200 178 L206 192" stroke="${p.shade}" stroke-width="4" stroke-linecap="round"/>`,
  },
  'field-medic': {
    motif: ['moon', 122, 68, 28],
    draw: (p) => `
      <path d="M144 192 C142 154 152 128 172 118 C192 128 202 154 200 192 Z" fill="${p.body}"/>
      <path d="M172 118 C162 111 159 101 163 91 C169 97 175 97 181 91 C185 101 182 111 172 118 Z" fill="${p.shade}"/>
      <path d="M150 144 C136 140 126 130 122 116 L138 128 Z" fill="${p.body}"/>
      <rect x="208" y="106" width="5" height="86" rx="2" fill="${p.shade}"/>
      <rect x="200" y="112" width="21" height="16" rx="3" fill="${p.shade}"/>
      <path d="M210 114 v12 M204 120 h12" stroke="${p.eye}" stroke-width="2.4"/>
      <circle cx="210" cy="120" r="12" fill="${p.eye}" opacity=".12"/>
      <path d="M150 160 C146 168 146 176 150 184 M194 160 C198 168 198 176 194 184" stroke="${p.shade}" stroke-width="2" fill="none"/>
      ${eyes(p, 166, 104, 178, 104, 1.8)}
      <path d="M156 138 C162 134 168 133 174 135" stroke="${p.rim}" stroke-width="1.4" fill="none" opacity=".5"/>`,
  },
  'sand-elemental': {
    motif: ['rift', 170, 76, 50],
    draw: (p) => `
      <path d="M150 192 C142 168 146 146 158 128 C150 122 148 112 152 102 C160 108 166 106 170 98 C174 106 180 108 188 102 C192 112 190 122 182 128 C194 146 198 168 190 192 Z" fill="${p.body}"/>
      <path d="M158 128 C150 122 148 112 152 102" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".4"/>
      <path d="M152 140 C160 136 180 136 188 140 M148 156 C158 152 182 152 192 156 M146 172 C158 168 182 168 194 172" stroke="${p.shade}" stroke-width="3" fill="none"/>
      ${eyes(p, 163, 116, 177, 116, 2.6)}
      <path d="M120 150 C112 144 108 136 110 126 M226 146 C234 140 238 130 236 120" stroke="${p.glow}" stroke-width="1.6" fill="none" opacity=".4"/>
      <circle cx="116" cy="132" r="1.6" fill="${p.glow}" opacity=".5"/>
      <circle cx="230" cy="128" r="1.6" fill="${p.glow}" opacity=".5"/>
      <circle cx="132" cy="164" r="1.4" fill="${p.glow}" opacity=".4"/>`,
  },
  'pack-wolf': {
    motif: ['moon', 170, 64, 34],
    draw: (p) => `
      <path d="M96 176 C104 154 118 142 136 140 L130 124 L144 132 L148 118 L158 134 C168 138 174 148 176 162 L172 186 Z" fill="${p.body}"/>
      <path d="M176 168 C182 150 194 140 208 138 L204 124 L216 132 L220 120 L228 134 C238 140 244 150 244 164 L240 184 Z" fill="${p.shade}"/>
      <path d="M244 172 C250 158 260 150 272 150 L270 138 L280 146 L284 136 L290 148 C298 154 302 164 300 176 L296 188 Z" fill="${p.shade}" opacity=".7"/>
      ${eyes(p, 134, 142, 146, 140, 2.6, -6)}
      ${eyes(p, 210, 144, 220, 142, 2.2, -6)}
      <circle cx="276" cy="154" r="1.8" fill="${p.eye}" opacity=".8"/>
      <circle cx="285" cy="152" r="1.8" fill="${p.eye}" opacity=".8"/>
      <path d="M136 140 L130 124 L144 132" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".5"/>
      <path d="M108 176 C104 184 104 190 108 196" stroke="${p.shade}" stroke-width="3" fill="none"/>`,
  },
  'clockwork-knight': {
    motif: ['ring', 170, 88, 54],
    draw: (p) => `
      <path d="M146 192 L150 126 C150 110 158 100 170 100 C182 100 190 110 190 126 L194 192 Z" fill="${p.body}"/>
      <path d="M158 100 L156 82 L170 74 L184 82 L182 100 Z" fill="${p.body}"/>
      <path d="M160 88 h20" stroke="${p.eye}" stroke-width="3"/>
      <circle cx="170" cy="88" r="13" fill="${p.eye}" opacity=".1"/>
      <circle cx="170" cy="140" r="13" fill="none" stroke="${p.shade}" stroke-width="3"/>
      <path d="M170 129 v22 M159 140 h22 M162 132 l16 16 M178 132 l-16 16" stroke="${p.shade}" stroke-width="2"/>
      <circle cx="170" cy="140" r="4" fill="${p.glow}" opacity=".8"/>
      <path d="M148 132 C136 136 128 146 126 160 L122 192 M192 132 C204 136 212 146 214 160 L218 192" fill="none" stroke="${p.shade}" stroke-width="5"/>
      <path d="M214 156 L232 148 L236 154 L220 164" fill="${p.rim}" opacity=".7"/>
      <path d="M150 126 C150 110 158 100 170 100" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".45"/>`,
  },
  'storm-brute': {
    motif: ['rift', 170, 68, 54],
    draw: (p) => `
      <path d="M132 192 L140 132 L128 128 L146 112 L142 96 L160 102 L170 82 L182 100 L200 92 L196 110 L214 122 L200 132 L208 192 Z" fill="${p.body}"/>
      <path d="M146 112 L142 96 L160 102 L170 82" fill="none" stroke="${p.rim}" stroke-width="1.4" opacity=".5"/>
      ${eyes(p, 162, 112, 180, 112, 3)}
      <path d="M156 136 h30 M152 152 h36 M154 168 h32" stroke="${p.shade}" stroke-width="3.4"/>
      <path d="M118 100 L134 118 L124 118 L138 138 M224 96 L210 116 L220 116 L206 136" stroke="${p.glow}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".75"/>
      <path d="M132 192 L124 204 M208 192 L216 204" stroke="${p.shade}" stroke-width="6" stroke-linecap="round"/>`,
  },
  'siege-turtle': {
    motif: ['moon', 250, 66, 30],
    draw: (p) => `
      <path d="M92 182 C92 138 126 108 172 108 C218 108 252 138 252 182 Z" fill="${p.body}"/>
      <path d="M120 148 h28 M116 166 h32 M172 132 v50 M196 144 h30 M200 162 h28 M148 128 C158 122 186 122 196 128" stroke="${p.shade}" stroke-width="3.4" fill="none"/>
      <path d="M140 108 L136 92 L148 100 M172 104 L172 86 L182 98 M204 110 L210 94 L214 108" fill="${p.shade}"/>
      <path d="M92 182 C80 180 72 172 70 162 C78 164 84 162 88 156 C94 162 96 172 92 182 Z" fill="${p.shade}"/>
      ${eyes(p, 79, 166, 87, 170, 2, -8)}
      <path d="M108 182 L104 194 M150 182 L148 196 M196 182 L198 196 M240 182 L244 194" stroke="${p.shade}" stroke-width="6" stroke-linecap="round"/>
      <path d="M126 116 C142 108 202 108 218 116" fill="none" stroke="${p.rim}" stroke-width="1.4" opacity=".45"/>
      <path d="M160 140 h6 M204 152 h6" stroke="${p.glow}" stroke-width="1.6" opacity=".6"/>`,
  },
  'flame-juggler': {
    motif: ['ring', 170, 84, 50],
    draw: (p) => `
      <path d="M146 192 C144 156 154 132 172 124 C190 132 200 156 198 192 Z" fill="${p.body}"/>
      <path d="M172 124 C162 117 159 107 163 97 C169 103 175 103 181 97 C185 107 182 117 172 124 Z" fill="${p.shade}"/>
      <path d="M172 110 C168 100 168 90 174 80 C176 90 182 94 188 92 C188 102 182 110 172 110 Z" fill="${p.eye}" opacity=".85"/>
      <path d="M150 150 C140 146 134 138 132 128 M194 150 C204 146 210 138 212 128" stroke="${p.body}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M130 122 C127 116 127 111 130 106 C133 111 133 116 130 122 Z M214 122 C211 116 211 111 214 106 C217 111 217 116 214 122 Z" fill="${p.eye}" opacity=".8"/>
      <circle cx="130" cy="114" r="9" fill="${p.eye}" opacity=".14"/>
      <circle cx="214" cy="114" r="9" fill="${p.eye}" opacity=".14"/>
      ${eyes(p, 166, 110, 178, 110, 1.8)}
      <path d="M158 170 Q172 178 186 170" stroke="${p.shade}" stroke-width="2.4" fill="none"/>`,
  },
  'highland-archer': {
    motif: ['moon', 232, 66, 30],
    draw: (p) => `
      <path d="M148 192 C146 156 156 130 176 120 C194 130 204 156 202 192 Z" fill="${p.body}"/>
      <path d="M176 120 C166 113 163 103 167 93 C173 99 179 99 185 93 C189 103 186 113 176 120 Z" fill="${p.shade}"/>
      <path d="M136 88 C124 110 124 138 136 160" fill="none" stroke="${p.shade}" stroke-width="4"/>
      <path d="M136 88 L136 160" stroke="${p.rim}" stroke-width="1.2" opacity=".6"/>
      <path d="M136 124 H188" stroke="${p.rim}" stroke-width="2"/>
      <path d="M130 124 L118 124 M136 118 L136 130" stroke="${p.glow}" stroke-width="1.6" opacity=".7"/>
      <path d="M124 124 C118 120 114 114 113 107" stroke="${p.glow}" stroke-width="1.2" fill="none" opacity=".5" stroke-dasharray="2 3"/>
      <path d="M84 192 L92 168 L104 192 Z M242 192 L250 164 L262 192 Z" fill="${p.shade}"/>
      ${eyes(p, 170, 106, 182, 106, 1.8)}`,
  },
  'moss-treant': {
    motif: ['ring', 170, 78, 52],
    draw: (p) => `
      <path d="M140 192 C136 160 142 134 158 118 C150 112 148 102 152 92 C160 98 168 96 172 88 C178 96 186 98 192 92 C196 104 192 114 184 120 C198 136 204 162 200 192 Z" fill="${p.body}"/>
      <path d="M126 116 C142 108 158 108 170 114 C160 96 144 92 126 100 Z" fill="${p.shade}"/>
      <path d="M214 116 C198 108 182 108 172 114 C182 96 198 92 214 100 Z" fill="${p.shade}"/>
      <path d="M126 100 C144 92 160 96 170 114 M214 100 C198 92 182 96 172 114" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".5"/>
      ${eyes(p, 162, 132, 178, 132, 2.6)}
      <path d="M156 156 h28 M160 170 h20" stroke="${p.shade}" stroke-width="2.6"/>
      <circle cx="140" cy="86" r="1.8" fill="${p.glow}" opacity=".6"/>
      <circle cx="196" cy="80" r="1.6" fill="${p.glow}" opacity=".6"/>
      <circle cx="170" cy="70" r="1.4" fill="${p.glow}" opacity=".5"/>`,
  },
  'coral-guardian': {
    motif: ['moon', 170, 62, 32],
    draw: (p) => `
      <path d="M110 192 L114 138 C114 122 124 112 138 110 L134 92 L146 104 L150 86 L160 102 C174 102 184 112 186 126 L226 126 C238 126 246 136 246 148 L242 192 Z" fill="${p.body}"/>
      <path d="M134 92 L146 104 L150 86 L160 102" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".5"/>
      <path d="M196 126 L192 108 L202 118 L208 100 L214 118 L224 106 L226 126" fill="${p.shade}"/>
      <path d="M126 148 C132 142 140 140 148 142 M162 138 C170 132 178 132 186 136" stroke="${p.shade}" stroke-width="2.6" fill="none"/>
      ${eyes(p, 156, 152, 172, 152, 2.8)}
      <path d="M120 170 h32 M180 160 h44" stroke="${p.shade}" stroke-width="3"/>
      <circle cx="230" cy="144" r="2" fill="${p.glow}" opacity=".7"/>
      <circle cx="138" cy="126" r="1.8" fill="${p.glow}" opacity=".6"/>`,
  },

  // ═══ Rares ═══
  'moonwell-sage': {
    motif: ['moon', 170, 60, 36],
    draw: (p) => `
      <ellipse cx="170" cy="176" rx="62" ry="16" fill="${p.shade}"/>
      <ellipse cx="170" cy="172" rx="44" ry="10" fill="${p.glow}" opacity=".2"/>
      <path d="M148 176 C146 138 154 112 170 102 C186 112 194 138 192 176 Z" fill="${p.body}"/>
      <path d="M170 102 C161 95 158 86 161 76 C167 82 173 82 179 76 C182 86 179 95 170 102 Z" fill="${p.shade}"/>
      <path d="M170 102 C186 112 194 138 192 176" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".45"/>
      ${eyes(p, 164, 88, 176, 88, 1.8)}
      <ellipse cx="170" cy="182" rx="24" ry="5" fill="${p.eye}" opacity=".25"/>
      <path d="M158 186 C164 182 176 182 182 186" stroke="${p.eye}" stroke-width="1.4" fill="none" opacity=".5"/>
      <path d="M132 150 C126 144 122 136 122 126 M208 150 C214 144 218 136 218 126" stroke="${p.glow}" stroke-width="1.4" fill="none" opacity=".4"/>`,
  },
  'ember-witch': {
    motif: ['rift', 170, 76, 50],
    draw: (p) => `
      <path d="M142 192 C140 152 150 124 170 114 C190 124 200 152 198 192 Z" fill="${p.body}"/>
      <path d="M170 114 L188 84 L176 88 L178 66 L166 84 L154 74 L158 96 Z" fill="${p.shade}"/>
      <path d="M156 138 C150 148 150 160 156 172 M184 138 C190 148 190 160 184 172" stroke="${p.glow}" stroke-width="1.6" fill="none" opacity=".55"/>
      <path d="M162 146 C158 154 158 162 162 170 M178 146 C182 154 182 162 178 170" stroke="${p.glow}" stroke-width="1.2" fill="none" opacity=".4"/>
      ${eyes(p, 163, 104, 177, 104, 2.2)}
      <path d="M140 150 C132 144 128 134 130 122 L144 136 Z" fill="${p.body}"/>
      <path d="M200 150 C208 144 212 134 210 122 L196 136 Z" fill="${p.body}"/>
      <circle cx="128" cy="112" r="2" fill="${p.eye}" opacity=".7"/>
      <circle cx="214" cy="108" r="1.8" fill="${p.eye}" opacity=".7"/>
      <circle cx="170" cy="60" r="1.6" fill="${p.eye}" opacity=".6"/>`,
  },
  'venom-drake': {
    motif: ['ring', 170, 86, 54],
    draw: (p) => `
      <path d="M120 188 C112 170 116 152 132 142 C152 130 196 130 214 146 C228 158 228 176 216 188 C200 172 178 166 156 170 C172 176 186 184 194 194 L128 194 C122 192 118 190 120 188 Z" fill="${p.body}"/>
      <path d="M132 142 C136 120 148 104 168 98 C160 112 162 124 172 132 Z" fill="${p.body}"/>
      <path d="M168 98 C176 92 186 90 196 94 C190 102 190 110 194 116 L172 132 Z" fill="${p.shade}"/>
      <path d="M168 98 C176 92 186 90 196 94" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".5"/>
      ${eyes(p, 180, 104, 190, 102, 2.4, -8)}
      <path d="M186 116 L184 126 M192 114 L192 124" stroke="${p.rim}" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="184" cy="130" r="1.6" fill="${p.glow}" opacity=".8"/>
      <circle cx="193" cy="129" r="1.4" fill="${p.glow}" opacity=".7"/>
      <path d="M214 146 C228 158 228 176 216 188" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".4"/>`,
  },
  'warcry-sentinel': {
    motif: ['ring', 170, 82, 50],
    draw: (p) => `
      <path d="M146 192 C144 154 154 128 172 118 C190 128 200 154 198 192 Z" fill="${p.body}"/>
      <path d="M172 118 C162 111 159 101 163 91 C169 97 175 97 181 91 C185 101 182 111 172 118 Z" fill="${p.shade}"/>
      <ellipse cx="172" cy="108" rx="4.5" ry="7" fill="${p.sky2}"/>
      <ellipse cx="172" cy="108" rx="4.5" ry="7" fill="none" stroke="${p.eye}" stroke-width="1" opacity=".6"/>
      <path d="M188 128 C200 122 210 122 220 128 L216 138 C208 132 200 132 194 136 Z" fill="${p.shade}"/>
      <path d="M226 118 C232 112 236 104 236 96 M234 130 C242 126 248 120 252 112 M238 142 C248 142 256 138 264 132" stroke="${p.glow}" stroke-width="1.8" fill="none" opacity=".55" stroke-linecap="round"/>
      <path d="M150 144 C142 138 138 128 140 118 L152 132 Z" fill="${p.body}"/>
      ${eyes(p, 166, 100, 178, 100, 1.6)}
      <path d="M120 160 C114 156 110 150 108 142" stroke="${p.glow}" stroke-width="1.2" fill="none" opacity=".35"/>`,
  },
  'aegis-knight': {
    motif: ['ring', 170, 84, 54],
    draw: (p) => `
      <path d="M196 192 C194 156 202 132 218 124 C234 132 242 156 240 192 Z" fill="${p.shade}"/>
      <path d="M218 124 C210 118 207 109 210 100 C215 105 221 105 226 100 C229 109 226 118 218 124 Z" fill="${p.shade}"/>
      <path d="M112 192 L116 118 C116 104 128 94 148 92 C168 94 180 104 180 118 L184 192 Z" fill="${p.body}"/>
      <path d="M116 118 C116 104 128 94 148 92" fill="none" stroke="${p.rim}" stroke-width="1.4" opacity=".55"/>
      <path d="M148 110 L154 126 L170 128 L156 138 L160 156 L148 146 L136 156 L140 138 L126 128 L142 126 Z" fill="none" stroke="${p.glow}" stroke-width="1.6" opacity=".75"/>
      <path d="M130 166 h36 M134 178 h28" stroke="${p.shade}" stroke-width="2.4"/>
      ${eyes(p, 214, 108, 224, 108, 1.6)}
      <circle cx="148" cy="132" r="3" fill="${p.eye}" opacity=".9"/>`,
  },
  'soul-reaver': {
    motif: ['rift', 170, 74, 54],
    draw: (p) => `
      <path d="M146 192 C142 150 152 120 174 108 C194 120 204 150 200 192 Z" fill="${p.body}"/>
      <path d="M174 108 C164 101 161 91 165 81 C171 87 177 87 183 81 C187 91 184 101 174 108 Z" fill="${p.shade}"/>
      <path d="M136 70 C130 106 132 142 142 176" fill="none" stroke="${p.shade}" stroke-width="4"/>
      <path d="M136 70 C118 72 104 82 96 98 C112 94 126 96 136 104 Z" fill="${p.body}"/>
      <path d="M136 70 C118 72 104 82 96 98" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".5"/>
      <rect x="160" y="126" width="28" height="34" rx="4" fill="none" stroke="${p.shade}" stroke-width="3"/>
      <path d="M166 126 v34 M174 126 v34 M182 126 v34" stroke="${p.shade}" stroke-width="1.6"/>
      <path d="M214 150 C222 138 224 126 218 114 C228 120 234 132 232 146 C240 138 242 128 240 118 C248 130 246 146 236 156 C228 162 220 158 214 150 Z" fill="${p.glow}" opacity=".3"/>
      <circle cx="174" cy="142" r="4" fill="${p.eye}" opacity=".8"/>
      ${eyes(p, 168, 92, 180, 92, 1.8)}`,
  },
  'crystal-golem': {
    motif: ['ring', 170, 80, 56],
    draw: (p) => `
      <path d="M120 192 L132 128 L120 116 L142 106 L146 84 L164 96 L170 70 L180 96 L198 82 L200 106 L222 114 L208 128 L220 192 Z" fill="${p.body}"/>
      <path d="M142 106 L146 84 L164 96 L170 70 L180 96 L198 82" fill="none" stroke="${p.rim}" stroke-width="1.4" opacity=".55"/>
      <path d="M152 136 C158 128 166 124 176 126 C186 128 192 134 194 144 C190 152 182 156 172 156 C162 156 154 148 152 136 Z" fill="${p.shade}"/>
      <path d="M160 136 L170 130 L182 138 L176 148 L164 146 Z" fill="none" stroke="${p.glow}" stroke-width="1.6" opacity=".85"/>
      <circle cx="171" cy="140" r="3.4" fill="${p.eye}"/>
      <circle cx="171" cy="140" r="9" fill="${p.eye}" opacity=".15"/>
      <path d="M144 164 h20 M178 168 h22" stroke="${p.shade}" stroke-width="2.6"/>
      <path d="M132 128 L152 134 M208 128 L192 136" stroke="${p.shade}" stroke-width="2"/>`,
  },
  'runebound-oracle': {
    motif: ['ring', 170, 82, 58],
    draw: (p) => `
      <path d="M144 192 C142 156 150 130 170 120 C190 130 198 156 196 192 Z" fill="${p.body}"/>
      <path d="M170 120 C160 113 157 103 161 93 C167 99 173 99 179 93 C183 103 180 113 170 120 Z" fill="${p.shade}"/>
      <ellipse cx="170" cy="104" rx="7" ry="9" fill="${p.sky2}"/>
      <circle cx="170" cy="104" r="2.6" fill="${p.eye}"/>
      <circle cx="170" cy="104" r="7" fill="${p.eye}" opacity=".14"/>
      <rect x="112" y="120" width="20" height="28" rx="3" fill="${p.shade}" transform="rotate(-14 122 134)"/>
      <rect x="208" y="120" width="20" height="28" rx="3" fill="${p.shade}" transform="rotate(14 218 134)"/>
      <rect x="132" y="82" width="18" height="26" rx="3" fill="${p.shade}" transform="rotate(-8 141 95)"/>
      <rect x="190" y="82" width="18" height="26" rx="3" fill="${p.shade}" transform="rotate(8 199 95)"/>
      <path d="M118 128 h8 M120 136 h6 M212 128 h8 M214 136 h6 M137 90 h8 M139 98 h6 M195 90 h8 M197 98 h6" stroke="${p.glow}" stroke-width="1.3" opacity=".7"/>
      <path d="M132 148 C142 156 158 160 170 160 C182 160 198 156 208 148" stroke="${p.glow}" stroke-width="1.2" fill="none" opacity=".4" stroke-dasharray="3 4"/>`,
  },
  'frost-weaver': {
    motif: ['moon', 170, 62, 34],
    draw: (p) => `
      <path d="M154 132 C154 120 160 112 170 110 C180 112 186 120 186 132 C186 144 180 152 170 154 C160 152 154 144 154 132 Z" fill="${p.body}"/>
      <path d="M158 118 C144 108 132 106 118 110 M156 130 C140 128 126 132 116 140 M158 142 C146 148 138 156 134 168 M182 118 C196 108 208 106 222 110 M184 130 C200 128 214 132 224 140 M182 142 C194 148 202 156 206 168" stroke="${p.body}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <path d="M118 110 L110 104 M116 140 L106 142 M134 168 L128 176 M222 110 L230 104 M224 140 L234 142 M206 168 L212 176" stroke="${p.shade}" stroke-width="3" stroke-linecap="round"/>
      <path d="M110 84 L140 100 M132 78 L148 96 M230 84 L200 100 M208 78 L192 96 M170 62 L170 92" stroke="${p.glow}" stroke-width="1.1" opacity=".45"/>
      <circle cx="140" cy="100" r="1.6" fill="${p.glow}" opacity=".8"/>
      <circle cx="200" cy="100" r="1.6" fill="${p.glow}" opacity=".8"/>
      <circle cx="170" cy="92" r="1.8" fill="${p.glow}" opacity=".8"/>
      ${eyeCluster(p, 170, 126, 10, 6, 43)}
      <path d="M162 146 Q170 152 178 146" stroke="${p.shade}" stroke-width="1.6" fill="none"/>`,
  },
  'crimson-berserker': {
    motif: ['rift', 170, 72, 52],
    draw: (p) => `
      <path d="M148 192 C144 156 152 130 172 120 C192 130 200 156 196 192 Z" fill="${p.body}"/>
      <path d="M172 120 C162 113 159 103 163 93 C169 99 175 99 181 93 C185 103 182 113 172 120 Z" fill="${p.shade}"/>
      <path d="M150 140 C136 130 128 116 128 100 L144 116 Z" fill="${p.body}"/>
      <path d="M128 100 L112 76 L134 84 L128 60 L146 82" fill="none" stroke="${p.rim}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M112 76 L134 84 L128 60" fill="${p.rim}" opacity=".8"/>
      <path d="M196 140 C204 134 210 126 212 116 L200 126 Z" fill="${p.body}"/>
      ${eyes(p, 166, 104, 178, 104, 2.4)}
      <path d="M206 96 C212 90 220 88 228 90 M216 108 C224 104 232 104 238 108" stroke="${p.glow}" stroke-width="1.4" fill="none" opacity=".45"/>
      <circle cx="224" cy="98" r="1.6" fill="${p.glow}" opacity=".6"/>
      <path d="M158 148 h28 M162 162 h20" stroke="${p.shade}" stroke-width="2.4"/>`,
  },
  'ghost-knight': {
    motif: ['moon', 170, 64, 36],
    draw: (p) => `
      <path d="M146 178 L150 118 C150 104 158 94 170 94 C182 94 190 104 190 118 L194 178 C186 186 178 180 170 186 C162 180 154 186 146 178 Z" fill="${p.body}" opacity=".8"/>
      <path d="M158 94 L156 76 L170 68 L184 76 L182 94 Z" fill="${p.body}" opacity=".85"/>
      <path d="M160 84 h20" stroke="${p.eye}" stroke-width="3"/>
      <circle cx="170" cy="84" r="12" fill="${p.eye}" opacity=".12"/>
      <path d="M170 68 L170 54 L180 60" fill="none" stroke="${p.rim}" stroke-width="2" opacity=".6"/>
      <path d="M156 120 L184 120 L180 148 L160 148 Z" fill="none" stroke="${p.glow}" stroke-width="1.4" opacity=".5"/>
      <path d="M170 120 V148 M156 134 H184" stroke="${p.glow}" stroke-width="1.1" opacity=".4"/>
      <path d="M146 178 C140 186 134 190 126 192 M194 178 C200 186 206 190 214 192" stroke="${p.body}" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>
      <path d="M150 118 C150 104 158 94 170 94" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".5"/>`,
  },
  'war-mammoth': {
    motif: ['ring', 170, 76, 54],
    draw: (p) => `
      <path d="M100 190 C98 150 122 120 164 116 C204 112 236 130 246 160 C250 172 248 182 242 190 Z" fill="${p.body}"/>
      <path d="M118 142 C132 130 152 124 172 124 M112 158 C128 146 152 140 176 140" stroke="${p.shade}" stroke-width="4" fill="none"/>
      <path d="M136 122 Q142 106 156 102 Q152 114 156 122 M180 116 Q188 102 202 102 Q196 112 200 120" fill="${p.shade}"/>
      <path d="M240 156 C252 150 258 140 258 128 C264 140 264 152 256 162 Z" fill="${p.rim}" opacity=".85"/>
      <path d="M228 168 C240 164 248 156 250 146" fill="none" stroke="${p.rim}" stroke-width="3" stroke-linecap="round"/>
      ${eyes(p, 222, 150, 234, 154, 2.4, -6)}
      <path d="M116 190 L112 204 M148 192 L146 206 M196 192 L198 206 M232 190 L236 204" stroke="${p.shade}" stroke-width="6" stroke-linecap="round"/>
      <path d="M164 116 C204 112 236 130 246 160" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".4"/>`,
  },
  'thunder-hawk': {
    motif: ['rift', 170, 70, 54],
    draw: (p) => `
      <path d="M170 92 L156 110 L134 114 C106 116 82 106 64 84 C90 94 112 92 130 82 L152 74 Z" fill="${p.body}"/>
      <path d="M170 92 L184 110 L206 114 C234 116 258 106 276 84 C250 94 228 92 210 82 L188 74 Z" fill="${p.body}"/>
      <path d="M156 110 C152 130 156 148 170 162 C184 148 188 130 184 110 C180 100 160 100 156 110 Z" fill="${p.shade}"/>
      <path d="M170 162 L162 184 M170 162 L178 182 M170 162 L170 190" stroke="${p.shade}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M164 96 L170 106 L176 96" fill="none" stroke="${p.rim}" stroke-width="2"/>
      ${eyes(p, 163, 90, 177, 90, 2.2)}
      <path d="M120 104 L132 120 L124 120 L136 138 M220 104 L208 120 L216 120 L204 138" stroke="${p.glow}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".7"/>
      <path d="M64 84 C90 94 112 92 130 82" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".4"/>`,
  },
  'hex-spider': {
    motif: ['ring', 170, 108, 74],
    draw: (p) => `
      <path d="M96 60 L244 60 M110 170 L230 170 M96 60 L110 170 M244 60 L230 170 M120 60 L130 170 M170 60 L170 170 M220 60 L210 170 M100 92 L240 92 M104 128 L236 128" stroke="${p.glow}" stroke-width=".8" opacity=".3"/>
      <ellipse cx="170" cy="118" rx="20" ry="24" fill="${p.body}"/>
      <circle cx="170" cy="92" r="11" fill="${p.body}"/>
      <path d="M156 104 C138 98 124 100 110 110 M158 116 C142 118 130 126 122 138 M160 128 C148 136 142 148 140 162 M184 104 C202 98 216 100 230 110 M182 116 C198 118 210 126 218 138 M180 128 C192 136 198 148 200 162" stroke="${p.shade}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M162 132 L170 142 L178 132" fill="none" stroke="${p.glow}" stroke-width="1.4" opacity=".8"/>
      <path d="M170 118 m-8 0 a8 8 0 1 0 16 0" fill="none" stroke="${p.glow}" stroke-width="1.2" opacity=".6"/>
      ${eyeCluster(p, 170, 90, 9, 6, 53)}`,
  },
  'iron-clad': {
    motif: ['ring', 170, 82, 52],
    draw: (p) => `
      <path d="M132 192 L136 122 C136 102 150 90 170 90 C190 90 204 102 204 122 L208 192 Z" fill="${p.body}"/>
      <path d="M136 122 C136 102 150 90 170 90" fill="none" stroke="${p.rim}" stroke-width="1.4" opacity=".5"/>
      <path d="M144 120 h52 M142 140 h56 M144 160 h52" stroke="${p.shade}" stroke-width="4"/>
      <circle cx="150" cy="130" r="2" fill="${p.rim}"/><circle cx="190" cy="130" r="2" fill="${p.rim}"/>
      <circle cx="148" cy="150" r="2" fill="${p.rim}"/><circle cx="192" cy="150" r="2" fill="${p.rim}"/>
      <path d="M160 102 h20 v8 h-20 Z" fill="${p.shade}"/>
      <path d="M163 106 h14" stroke="${p.eye}" stroke-width="2.4"/>
      <circle cx="170" cy="106" r="11" fill="${p.eye}" opacity=".12"/>
      <rect x="216" y="140" width="10" height="14" rx="4" fill="${p.shade}"/>
      <path d="M221 140 V126 M221 154 C221 162 218 168 212 172" stroke="${p.shade}" stroke-width="2" fill="none"/>
      <circle cx="221" cy="147" r="2.4" fill="${p.glow}" opacity=".8"/>
      <path d="M148 178 h44" stroke="${p.shade}" stroke-width="2.6"/>`,
  },
  'shadow-dancer': {
    motif: ['moon', 170, 62, 36],
    draw: (p) => `
      <path d="M162 190 C156 168 158 148 168 132 C160 122 158 110 164 98 C170 106 178 108 186 104 C188 116 184 126 176 132 C188 148 190 168 184 190 Z" fill="${p.body}"/>
      <path d="M164 98 C170 106 178 108 186 104" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".5"/>
      <path d="M168 132 C150 128 136 132 124 144 C140 144 152 150 158 160" fill="${p.body}" opacity=".7"/>
      <path d="M176 132 C194 128 208 132 220 144 C204 144 192 150 186 160" fill="${p.body}" opacity=".7"/>
      <path d="M124 144 C112 150 104 160 100 174 M220 144 C232 150 240 160 244 174" stroke="${p.body}" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>
      ${eyes(p, 168, 112, 178, 112, 2)}
      <path d="M148 178 C142 184 138 192 136 200 M196 178 C202 184 206 192 208 200" stroke="${p.shade}" stroke-width="2.4" fill="none" opacity=".7"/>`,
  },
  'arcane-artificer': {
    motif: ['ring', 216, 84, 40],
    draw: (p) => `
      <path d="M136 192 C134 156 144 130 164 120 C184 130 194 156 192 192 Z" fill="${p.body}"/>
      <path d="M164 120 C154 113 151 103 155 93 C161 99 167 99 173 93 C177 103 174 113 164 120 Z" fill="${p.shade}"/>
      <path d="M186 148 C198 138 208 126 214 112 L220 118 C214 132 206 144 196 154 Z" fill="${p.body}"/>
      <circle cx="222" cy="100" r="10" fill="${p.glow}" opacity=".3"/>
      <circle cx="222" cy="100" r="5" fill="${p.eye}" opacity=".9"/>
      <path d="M222 86 V78 M232 92 L238 86 M234 104 H242 M212 92 L206 86" stroke="${p.glow}" stroke-width="1.4" opacity=".6" stroke-linecap="round"/>
      <path d="M144 150 C136 146 130 138 128 128 L142 138 Z" fill="${p.body}"/>
      ${eyes(p, 158, 104, 170, 104, 1.8)}
      <path d="M150 166 h28 M154 178 h20" stroke="${p.shade}" stroke-width="2.2"/>
      <path d="M196 154 C204 158 210 164 214 172" stroke="${p.glow}" stroke-width="1.2" fill="none" opacity=".4" stroke-dasharray="2 3"/>`,
  },
  'vine-lasher': {
    motif: ['rift', 170, 72, 50],
    draw: (p) => `
      <path d="M132 192 C126 170 130 150 144 136 C136 128 134 116 140 106 C148 114 158 114 164 106 C170 114 180 114 188 106 C194 116 192 128 184 136 C198 150 202 170 196 192 Z" fill="${p.body}"/>
      <path d="M140 106 C148 114 158 114 164 106" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".45"/>
      <path d="M150 152 Q164 162 180 152 L176 160 L168 156 L164 162 L158 156 L152 160 Z" fill="${p.eye}" opacity=".85"/>
      ${eyeCluster(p, 164, 130, 15, 5, 47)}
      <path d="M132 160 C114 154 102 142 96 124 C110 132 122 132 130 126" fill="none" stroke="${p.body}" stroke-width="5" stroke-linecap="round"/>
      <path d="M196 160 C216 156 230 146 238 128 C224 134 212 132 204 126" fill="none" stroke="${p.body}" stroke-width="5" stroke-linecap="round"/>
      <path d="M96 124 L88 112 M238 128 L248 114" stroke="${p.shade}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="92" cy="118" r="1.8" fill="${p.glow}" opacity=".6"/>
      <circle cx="243" cy="121" r="1.8" fill="${p.glow}" opacity=".6"/>`,
  },
  'storm-shaman': {
    motif: ['rift', 170, 66, 56],
    draw: (p) => `
      <path d="M142 192 C140 154 150 126 170 116 C190 126 200 154 198 192 Z" fill="${p.body}"/>
      <path d="M170 116 C160 109 157 99 161 89 C167 95 173 95 179 89 C183 99 180 109 170 116 Z" fill="${p.shade}"/>
      <path d="M148 140 C136 132 130 120 130 106 L146 122 Z M192 140 C204 132 210 120 210 106 L194 122 Z" fill="${p.body}"/>
      <path d="M130 100 L122 82 L134 90 L132 72 M210 100 L218 82 L206 90 L208 72" stroke="${p.glow}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M170 84 L166 68 L174 70 L170 54" stroke="${p.glow}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>
      ${eyes(p, 164, 100, 176, 100, 2)}
      <path d="M154 152 h32 M158 166 h24" stroke="${p.shade}" stroke-width="2.4"/>
      <circle cx="128" cy="76" r="1.8" fill="${p.eye}" opacity=".7"/>
      <circle cx="212" cy="76" r="1.8" fill="${p.eye}" opacity=".7"/>`,
  },
  'bone-collector': {
    motif: ['moon', 122, 66, 30],
    draw: (p) => `
      <path d="M148 192 C144 160 152 134 172 122 C190 132 198 158 196 192 Z" fill="${p.body}"/>
      <path d="M172 122 C162 115 159 105 163 95 C169 101 175 101 181 95 C185 105 182 115 172 122 Z" fill="${p.shade}"/>
      <path d="M186 132 C202 124 214 110 218 92 L226 98 C222 118 210 134 194 144 Z" fill="${p.shade}"/>
      <path d="M196 100 h22 M198 112 h18 M202 88 h14" stroke="${p.rim}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="222" cy="100" r="3" fill="${p.rim}"/>
      <circle cx="219" cy="112" r="2.6" fill="${p.rim}"/>
      <path d="M148 148 C138 144 132 136 130 126 L144 136 Z" fill="${p.body}"/>
      <path d="M130 126 C126 118 126 110 130 102 L136 116 Z" fill="${p.rim}" opacity=".7"/>
      ${eyes(p, 166, 106, 178, 106, 1.8)}
      <path d="M158 156 h26 M162 170 h18" stroke="${p.shade}" stroke-width="2.2"/>`,
  },
  'lava-hound': {
    motif: ['rift', 170, 70, 50],
    draw: (p) => `
      <path d="M104 186 C108 158 126 140 152 136 L146 118 L162 128 L168 112 L180 130 C204 132 222 146 230 168 C234 176 234 182 230 186 Z" fill="${p.body}"/>
      <path d="M152 136 L146 118 L162 128 L168 112" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".45"/>
      <path d="M132 156 C144 150 158 148 172 150 M124 170 C140 162 160 160 178 164" stroke="${p.glow}" stroke-width="1.8" fill="none" opacity=".55"/>
      <path d="M188 148 C196 144 206 144 214 148" stroke="${p.glow}" stroke-width="1.4" fill="none" opacity=".45"/>
      ${eyes(p, 160, 134, 174, 134, 2.6)}
      <path d="M150 148 Q162 156 176 150 L172 156 L166 152 L162 158 L156 152 Z" fill="${p.eye}" opacity=".8"/>
      <path d="M120 186 L116 200 M152 188 L150 202 M196 188 L198 202 M222 186 L226 200" stroke="${p.shade}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="196" cy="128" r="1.8" fill="${p.eye}" opacity=".6"/>
      <circle cx="132" cy="130" r="1.6" fill="${p.eye}" opacity=".5"/>`,
  },
  'bronze-drake': {
    motif: ['ring', 170, 78, 52],
    draw: (p) => `
      <path d="M140 192 C136 168 142 148 158 136 C150 124 150 110 160 100 C164 112 174 116 184 112 C196 124 198 142 190 156 C200 166 204 178 202 192 Z" fill="${p.body}"/>
      <path d="M160 100 C164 112 174 116 184 112" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".5"/>
      <path d="M158 136 C138 128 124 114 118 94 C134 102 148 102 158 96 M190 140 C210 134 222 122 226 104 C214 112 202 112 194 108" fill="${p.shade}"/>
      <path d="M168 96 L164 80 L174 88 L178 72 L184 86" fill="none" stroke="${p.shade}" stroke-width="2.6" stroke-linejoin="round"/>
      ${eyes(p, 167, 108, 179, 108, 2.2)}
      <path d="M154 152 C162 148 178 148 186 152 M150 168 C160 164 180 164 190 168" stroke="${p.shade}" stroke-width="2.6" fill="none"/>
      <path d="M202 178 C212 174 218 166 220 156" stroke="${p.body}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  },

  // ═══ Epics ═══
  'nether-witch': {
    motif: ['rift', 170, 64, 58],
    draw: (p) => `
      <path d="M148 178 C146 142 154 116 172 106 C190 116 198 142 196 178 Z" fill="${p.body}"/>
      <path d="M172 106 C162 99 159 89 163 79 C169 85 175 85 181 79 C185 89 182 99 172 106 Z" fill="${p.shade}"/>
      <path d="M148 178 C154 186 162 190 172 190 C182 190 190 186 196 178" fill="none" stroke="${p.glow}" stroke-width="1.4" opacity=".5"/>
      <path d="M126 130 C118 116 118 100 128 88 C128 104 136 114 148 118 M218 130 C226 116 226 100 216 88 C216 104 208 114 196 118" fill="${p.body}" opacity=".75"/>
      <path d="M120 140 C104 136 92 126 86 110 M224 140 C240 136 252 126 258 110" stroke="${p.glow}" stroke-width="1.6" fill="none" opacity=".5" stroke-dasharray="4 4"/>
      ${glyphShards(p, 170, 66, 71, 4)}
      ${eyes(p, 166, 90, 178, 90, 2.2)}
      <circle cx="90" cy="116" r="2" fill="${p.eye}" opacity=".7"/>
      <circle cx="252" cy="114" r="2" fill="${p.eye}" opacity=".7"/>
      <path d="M158 136 h30 M162 152 h22" stroke="${p.shade}" stroke-width="2.4"/>`,
  },
  'sunforged-giant': {
    motif: ['moon', 170, 74, 44],
    draw: (p) => `
      <circle cx="170" cy="76" r="26" fill="${p.sky2}"/>
      <circle cx="170" cy="76" r="26" fill="none" stroke="${p.glow}" stroke-width="3" opacity=".8"/>
      <circle cx="170" cy="76" r="33" fill="${p.glow}" opacity=".1"/>
      <path d="M170 40 V30 M198 50 L205 43 M206 76 H216 M198 102 L205 109 M142 50 L135 43 M134 76 H124 M142 102 L135 109" stroke="${p.glow}" stroke-width="2" opacity=".5" stroke-linecap="round"/>
      <path d="M122 192 L130 138 C134 118 148 106 170 106 C192 106 206 118 210 138 L218 192 Z" fill="${p.body}"/>
      <path d="M130 138 C134 118 148 106 170 106" fill="none" stroke="${p.rim}" stroke-width="1.4" opacity=".5"/>
      <path d="M148 136 h44 M144 156 h52 M146 176 h48" stroke="${p.shade}" stroke-width="4"/>
      <path d="M106 160 C96 156 90 148 88 138 L104 146 Z M234 160 C244 156 250 148 252 138 L236 146 Z" fill="${p.body}"/>
      <path d="M162 120 h16" stroke="${p.eye}" stroke-width="2.6"/>`,
  },
  'abyssal-tyrant': {
    motif: ['moon', 170, 60, 38],
    draw: (p) => `
      <path d="M136 150 C136 116 150 94 170 88 C190 94 204 116 204 150 C204 168 196 180 184 186 L156 186 C144 180 136 168 136 150 Z" fill="${p.body}"/>
      <path d="M136 128 L122 108 L140 116 M204 128 L218 108 L200 116 M152 96 L146 76 L162 88 M188 96 L194 76 L178 88" fill="${p.shade}"/>
      <path d="M150 186 C142 196 132 202 120 204 M162 186 C158 198 152 206 144 212 M178 186 C182 198 188 206 196 212 M190 186 C198 196 208 202 220 204" stroke="${p.body}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M150 186 C142 196 132 202 120 204" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".35"/>
      ${eyeCluster(p, 170, 126, 22, 7, 83)}
      <path d="M154 156 Q170 166 186 156" stroke="${p.shade}" stroke-width="3" fill="none"/>
      <path d="M158 160 L160 168 M166 163 L167 172 M174 163 L173 172 M182 160 L180 168" stroke="${p.shade}" stroke-width="2"/>
      <path d="M170 88 C190 94 204 116 204 150" fill="none" stroke="${p.rim}" stroke-width="1.4" opacity=".45"/>`,
  },
  'phoenix-ascendant': {
    motif: ['rift', 170, 68, 56],
    draw: (p) => `
      <path d="M130 178 C138 172 146 172 154 176 M186 176 C194 172 202 172 210 178 M138 186 C150 180 190 180 202 186" stroke="${p.rim}" stroke-width="2.4" fill="none" opacity=".55" stroke-linecap="round"/>
      <path d="M146 184 C142 176 142 168 146 160 M158 188 C154 180 154 170 158 162 M182 188 C186 180 186 170 182 162 M194 184 C198 176 198 168 194 160" stroke="${p.rim}" stroke-width="2" fill="none" opacity=".4"/>
      <path d="M170 84 C162 100 158 116 160 132 L146 124 C138 138 138 154 146 168 C154 158 162 154 170 154 C178 154 186 158 194 168 C202 154 202 138 194 124 L180 132 C182 116 178 100 170 84 Z" fill="${p.body}"/>
      <path d="M170 84 C162 100 158 116 160 132" fill="none" stroke="${p.glow}" stroke-width="1.6" opacity=".6"/>
      <path d="M170 96 C166 108 164 120 166 130 C168 136 172 136 174 130 C176 120 174 108 170 96 Z" fill="${p.glow}" opacity=".7"/>
      ${eyes(p, 164, 140, 176, 140, 2.2)}
      <path d="M120 130 C112 122 108 112 108 100 M220 130 C228 122 232 112 232 100" stroke="${p.glow}" stroke-width="1.4" fill="none" opacity=".4"/>
      <circle cx="112" cy="110" r="1.8" fill="${p.eye}" opacity=".7"/>
      <circle cx="228" cy="110" r="1.8" fill="${p.eye}" opacity=".7"/>`,
  },
  'glacial-colossus': {
    motif: ['ring', 170, 72, 58],
    draw: (p) => `
      <path d="M112 192 L124 118 L112 108 L134 96 L140 66 L160 84 L170 54 L182 84 L202 68 L206 98 L228 110 L216 120 L228 192 Z" fill="${p.body}"/>
      <path d="M134 96 L140 66 L160 84 L170 54 L182 84 L202 68" fill="none" stroke="${p.rim}" stroke-width="1.6" opacity=".6"/>
      <path d="M150 128 h40 M144 148 h52 M148 168 h44" stroke="${p.shade}" stroke-width="3.4"/>
      ${eyes(p, 160, 108, 180, 108, 3)}
      <path d="M124 140 L108 148 M216 138 L232 146" stroke="${p.rim}" stroke-width="2" opacity=".5"/>
      <path d="M96 192 C100 182 108 176 118 174 M244 192 C240 182 232 176 222 174" fill="none" stroke="${p.shade}" stroke-width="4"/>
      <path d="M136 108 L132 124 M204 110 L208 126" stroke="${p.glow}" stroke-width="1.4" opacity=".5"/>`,
  },
  'blood-queen': {
    motif: ['moon', 170, 58, 36],
    draw: (p) => `
      <path d="M144 192 C142 150 152 122 170 112 C188 122 198 150 196 192 Z" fill="${p.body}"/>
      <path d="M170 112 C160 105 157 95 161 85 C167 91 173 91 179 85 C183 95 180 105 170 112 Z" fill="${p.shade}"/>
      <path d="M156 88 L152 70 L162 80 L170 62 L178 80 L188 70 L184 88" fill="${p.glow}" opacity=".75"/>
      <path d="M148 128 C138 124 130 116 126 106 L142 116 Z M192 128 C202 124 210 116 214 106 L198 116 Z" fill="${p.body}"/>
      <path d="M206 130 C214 128 220 130 224 136 C218 138 214 142 212 148 C208 142 206 136 206 130 Z" fill="${p.shade}"/>
      <circle cx="216" cy="138" r="2" fill="${p.glow}" opacity=".8"/>
      ${eyes(p, 164, 96, 176, 96, 2)}
      <path d="M120 100 L126 92 L130 100 M236 106 L242 98 L246 106" fill="none" stroke="${p.shade}" stroke-width="2" opacity=".8"/>
      <path d="M158 148 h24 M162 164 h16" stroke="${p.shade}" stroke-width="2.2"/>
      <path d="M170 112 C188 122 198 150 196 192" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".4"/>`,
  },
  'iron-juggernaut': {
    motif: ['ring', 170, 74, 56],
    draw: (p) => `
      <path d="M110 192 L118 130 C122 108 142 96 170 96 C198 96 218 108 222 130 L230 192 Z" fill="${p.body}"/>
      <path d="M118 130 C122 108 142 96 170 96" fill="none" stroke="${p.rim}" stroke-width="1.5" opacity=".5"/>
      <path d="M132 128 h76 M128 148 h84 M130 168 h80" stroke="${p.shade}" stroke-width="5"/>
      <circle cx="140" cy="138" r="2.2" fill="${p.rim}"/><circle cx="200" cy="138" r="2.2" fill="${p.rim}"/>
      <circle cx="138" cy="158" r="2.2" fill="${p.rim}"/><circle cx="202" cy="158" r="2.2" fill="${p.rim}"/>
      <path d="M154 108 h32 v10 h-32 Z" fill="${p.shade}"/>
      <path d="M158 113 h24" stroke="${p.eye}" stroke-width="3"/>
      <circle cx="170" cy="113" r="14" fill="${p.eye}" opacity=".1"/>
      <path d="M104 150 C94 146 88 138 86 126 L102 136 Z M236 150 C246 146 252 138 254 126 L238 136 Z" fill="${p.body}"/>
      <path d="M148 96 L144 82 M192 96 L196 82" stroke="${p.shade}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="144" cy="78" r="3" fill="${p.glow}" opacity=".6"/>
      <circle cx="196" cy="78" r="3" fill="${p.glow}" opacity=".6"/>`,
  },
  'ancient-hydra': {
    motif: ['rift', 170, 66, 56],
    draw: (p) => `
      <path d="M118 192 C112 172 116 154 130 142 C150 126 190 126 210 142 C224 154 228 172 222 192 Z" fill="${p.body}"/>
      <path d="M136 144 C124 128 120 110 126 92 C136 104 148 108 158 104 L150 142 Z" fill="${p.body}"/>
      <path d="M170 138 C166 118 168 98 178 82 C184 96 194 102 204 100 L192 140 Z" fill="${p.shade}"/>
      <path d="M204 144 C210 130 220 120 234 116 C230 128 232 138 240 146 L216 156 Z" fill="${p.body}"/>
      <path d="M126 92 C136 104 148 108 158 104" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".5"/>
      ${eyes(p, 136, 106, 146, 104, 2, -8)}
      ${eyes(p, 180, 96, 190, 96, 2)}
      <circle cx="230" cy="126" r="2" fill="${p.eye}"/>
      <circle cx="237" cy="130" r="2" fill="${p.eye}"/>
      <path d="M132 116 Q138 122 146 120 M176 108 Q184 114 192 110 M222 134 Q228 138 234 136" stroke="${p.shade}" stroke-width="2" fill="none"/>
      <path d="M144 162 Q170 174 196 162" stroke="${p.shade}" stroke-width="3" fill="none"/>`,
  },
  'void-empress': {
    motif: ['moon', 170, 56, 40],
    draw: (p) => `
      <path d="M140 192 C138 148 148 118 170 106 C192 118 202 148 200 192 Z" fill="${p.sky2}"/>
      <path d="M140 192 C138 148 148 118 170 106 C192 118 202 148 200 192" fill="none" stroke="${p.glow}" stroke-width="1.6" opacity=".7"/>
      <circle cx="160" cy="140" r="1.2" fill="${p.rim}" opacity=".8"/>
      <circle cx="178" cy="128" r="1" fill="${p.rim}" opacity=".7"/>
      <circle cx="168" cy="158" r="1.3" fill="${p.rim}" opacity=".75"/>
      <circle cx="184" cy="150" r="1" fill="${p.rim}" opacity=".6"/>
      <circle cx="156" cy="172" r="1.1" fill="${p.rim}" opacity=".7"/>
      <circle cx="176" cy="176" r="1" fill="${p.rim}" opacity=".6"/>
      <path d="M170 106 C162 100 159 92 162 82 C167 88 173 88 178 82 C181 92 178 100 170 106 Z" fill="${p.shade}"/>
      <path d="M152 84 L148 62 L158 74 L164 56 L170 70 L176 56 L182 74 L192 62 L188 84" fill="none" stroke="${p.glow}" stroke-width="2" stroke-linejoin="round" opacity=".85"/>
      ${eyes(p, 164, 92, 176, 92, 2)}
      <path d="M148 128 C140 124 134 116 132 106 M192 128 C200 124 206 116 208 106" stroke="${p.glow}" stroke-width="1.4" fill="none" opacity=".45"/>`,
  },
  'storm-titan': {
    motif: ['rift', 170, 62, 60],
    draw: (p) => `
      <path d="M60 176 C96 160 132 158 170 164 C208 158 244 160 280 176 V220 H60 Z" fill="${p.shade}" opacity=".8"/>
      <path d="M126 176 L134 118 C138 100 152 90 170 90 C188 90 202 100 206 118 L214 176 Z" fill="${p.body}"/>
      <path d="M134 118 C138 100 152 90 170 90" fill="none" stroke="${p.rim}" stroke-width="1.4" opacity=".55"/>
      <path d="M170 90 C161 84 158 75 161 66 C166 72 174 72 179 66 C182 75 179 84 170 90 Z" fill="${p.shade}"/>
      <path d="M150 66 L146 50 L158 58 L170 42 L182 58 L194 50 L190 66" fill="none" stroke="${p.glow}" stroke-width="2" stroke-linejoin="round" opacity=".8"/>
      <path d="M126 140 C114 134 108 124 108 110 L124 124 Z M214 140 C226 134 232 124 232 110 L216 124 Z" fill="${p.body}"/>
      <path d="M108 104 L98 84 L112 94 L110 74 M232 104 L242 84 L228 94 L230 74" stroke="${p.glow}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".8"/>
      ${eyes(p, 163, 76, 177, 76, 2.2)}
      <path d="M148 122 h44 M144 142 h52 M148 160 h44" stroke="${p.shade}" stroke-width="3.4"/>`,
  },
  'necro-sage': {
    motif: ['moon', 170, 58, 36],
    draw: (p) => `
      <path d="M146 188 C144 148 154 120 172 110 C190 120 200 148 198 188 Z" fill="${p.body}"/>
      <path d="M172 110 C162 103 159 93 163 83 C169 89 175 89 181 83 C185 93 182 103 172 110 Z" fill="${p.shade}"/>
      <rect x="206" y="96" width="5" height="92" rx="2" fill="${p.shade}"/>
      <path d="M200 96 h17 l-3 -14 h-11 Z" fill="${p.shade}"/>
      <path d="M204 88 h9" stroke="${p.eye}" stroke-width="2.2"/>
      <circle cx="208" cy="90" r="10" fill="${p.eye}" opacity=".14"/>
      <path d="M108 192 C108 178 114 168 124 164 C120 174 122 184 128 192 Z" fill="${p.body}" opacity=".8"/>
      <path d="M232 192 C232 176 238 166 248 162 C244 172 246 184 252 192 Z" fill="${p.body}" opacity=".8"/>
      <circle cx="119" cy="176" r="1.8" fill="${p.eye}" opacity=".8"/>
      <circle cx="243" cy="174" r="1.8" fill="${p.eye}" opacity=".8"/>
      ${eyes(p, 166, 94, 178, 94, 1.8)}
      <path d="M156 140 h30 M160 156 h22" stroke="${p.shade}" stroke-width="2.2"/>
      <path d="M120 160 C116 152 116 144 120 136 M248 158 C244 150 244 142 248 134" stroke="${p.glow}" stroke-width="1.2" fill="none" opacity=".4"/>`,
  },
  'druid-elder': {
    motif: ['ring', 170, 68, 54],
    draw: (p) => `
      <path d="M144 192 C142 150 152 122 172 112 C190 122 200 150 198 192 Z" fill="${p.body}"/>
      <path d="M172 112 C162 105 159 95 163 85 C169 91 175 91 181 85 C185 95 182 105 172 112 Z" fill="${p.shade}"/>
      <path d="M158 88 C148 78 144 66 146 52 C154 62 162 66 168 64 M186 88 C196 78 200 66 198 52 C190 62 182 66 176 64" fill="none" stroke="${p.shade}" stroke-width="3" stroke-linecap="round"/>
      <rect x="126" y="98" width="5" height="94" rx="2" fill="${p.shade}"/>
      <path d="M128 98 C120 88 118 76 124 64 C130 74 138 78 146 76 C144 88 138 96 128 98 Z" fill="${p.glow}" opacity=".55"/>
      <circle cx="132" cy="82" r="2.4" fill="${p.eye}" opacity=".9"/>
      ${eyes(p, 166, 96, 178, 96, 1.8)}
      <path d="M154 140 C160 134 180 134 188 140 M158 158 h26" stroke="${p.shade}" stroke-width="2.4" fill="none"/>
      <circle cx="150" cy="120" r="1.6" fill="${p.glow}" opacity=".6"/>
      <circle cx="194" cy="124" r="1.6" fill="${p.glow}" opacity=".6"/>
      <circle cx="170" cy="70" r="1.4" fill="${p.glow}" opacity=".5"/>`,
  },
  'shadow-assassin': {
    motif: ['rift', 170, 64, 58],
    draw: (p) => `
      <path d="M188 190 C180 168 178 148 184 130 C174 124 170 112 174 100 C180 108 188 110 196 106 C200 118 196 128 188 134 C198 148 202 166 198 188 Z" fill="${p.body}"/>
      <path d="M174 100 C180 108 188 110 196 106" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".5"/>
      <path d="M184 130 C166 122 152 122 138 130 C126 136 118 146 114 160 C128 150 142 148 154 152" fill="${p.body}" opacity=".75"/>
      <path d="M154 152 L108 176 M116 172 L100 180 L112 186" stroke="${p.rim}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      ${eyes(p, 182, 112, 192, 112, 2, -6)}
      <path d="M148 118 C138 114 130 108 124 98 M142 136 C132 136 122 132 114 126" stroke="${p.shade}" stroke-width="2" fill="none" opacity=".7" stroke-dasharray="4 3"/>
      <path d="M196 148 C204 152 210 158 214 166" stroke="${p.shade}" stroke-width="2.4" fill="none" opacity=".7"/>`,
  },
  'arcane-golem': {
    motif: ['ring', 170, 70, 58],
    draw: (p) => `
      <path d="M124 192 L132 130 C136 110 150 98 170 98 C190 98 204 110 208 130 L216 192 Z" fill="${p.body}"/>
      <path d="M132 130 C136 110 150 98 170 98" fill="none" stroke="${p.rim}" stroke-width="1.4" opacity=".5"/>
      <circle cx="170" cy="138" r="16" fill="${p.sky2}"/>
      <circle cx="170" cy="138" r="16" fill="none" stroke="${p.glow}" stroke-width="1.8" opacity=".85"/>
      <circle cx="170" cy="138" r="6" fill="${p.eye}"/>
      <circle cx="170" cy="138" r="24" fill="${p.eye}" opacity=".08"/>
      <path d="M146 118 L154 112 M186 112 L194 118 M142 160 h12 M186 160 h12 M150 176 h40" stroke="${p.glow}" stroke-width="1.6" opacity=".6"/>
      <path d="M158 108 h24 M162 102 h16" stroke="${p.shade}" stroke-width="2.6"/>
      ${glyphShards(p, 170, 76, 89, 3)}
      <path d="M110 158 C102 152 98 144 98 134 M230 158 C238 152 242 144 242 134" stroke="${p.glow}" stroke-width="1.3" fill="none" opacity=".4"/>`,
  },

  // ═══ Legendaries ═══
  'drakarion-the-eternal': {
    motif: ['moon', 170, 54, 42],
    draw: (p) => `
      <path d="M40 190 C80 176 120 172 170 176 C220 172 260 176 300 190 V220 H40 Z" fill="${p.shade}" opacity=".9"/>
      <path d="M96 178 C92 158 100 142 118 134 C112 122 114 110 124 102 C130 112 140 116 150 112 C158 124 158 138 150 148 C170 144 190 146 204 156 C220 146 224 130 218 114 C230 122 238 136 238 152 C238 170 226 182 208 186 Z" fill="${p.body}"/>
      <path d="M124 102 C130 112 140 116 150 112" fill="none" stroke="${p.rim}" stroke-width="1.5" opacity=".6"/>
      <path d="M118 116 L106 100 L122 106 M136 106 L132 88 L144 100" fill="${p.shade}"/>
      ${eyes(p, 126, 118, 138, 116, 2.8, -6)}
      <path d="M112 134 Q122 142 134 138 M116 148 L120 156 M128 146 L130 154 M140 142 L140 152" stroke="${p.shade}" stroke-width="2.2" fill="none"/>
      <path d="M60 150 C68 128 84 114 106 110 M280 148 C272 128 258 116 238 112" stroke="${p.body}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M60 150 L48 144 M280 148 L292 142" stroke="${p.shade}" stroke-width="4" stroke-linecap="round"/>
      <path d="M168 158 C176 152 188 152 196 158" stroke="${p.rim}" stroke-width="1.4" fill="none" opacity=".45"/>
      <circle cx="54" cy="146" r="2" fill="${p.eye}" opacity=".7"/>
      <circle cx="286" cy="144" r="2" fill="${p.eye}" opacity=".7"/>`,
  },
  'zephyr-world-breaker': {
    motif: ['rift', 170, 58, 62],
    draw: (p) => `
      <path d="M170 60 C210 62 240 84 248 118 C254 148 240 174 212 186 C226 168 230 148 222 130 C240 138 248 154 246 172 M170 60 C130 62 100 84 92 118 C86 148 100 174 128 186 C114 168 110 148 118 130 C100 138 92 154 94 172" fill="none" stroke="${p.body}" stroke-width="7" stroke-linecap="round"/>
      <path d="M170 60 C210 62 240 84 248 118" fill="none" stroke="${p.rim}" stroke-width="1.6" opacity=".5"/>
      <path d="M136 120 C136 96 150 80 170 78 C190 80 204 96 204 120 C204 140 192 154 170 158 C148 154 136 140 136 120 Z" fill="${p.body}"/>
      <path d="M136 120 C136 96 150 80 170 78" fill="none" stroke="${p.rim}" stroke-width="1.4" opacity=".55"/>
      <path d="M150 104 L164 110 M190 104 L176 110" stroke="${p.shade}" stroke-width="2.6" stroke-linecap="round"/>
      ${eyes(p, 158, 114, 182, 114, 3.4)}
      <ellipse cx="170" cy="138" rx="7" ry="10" fill="${p.sky2}"/>
      <path d="M164 132 L170 136 L176 132 M164 145 L170 141 L176 145" stroke="${p.rim}" stroke-width="1.2" fill="none" opacity=".6"/>
      <path d="M148 94 C154 88 162 84 170 84 M148 190 C160 196 180 196 192 190" stroke="${p.glow}" stroke-width="1.6" fill="none" opacity=".5"/>
      <circle cx="120" cy="98" r="1.8" fill="${p.eye}" opacity=".6"/>
      <circle cx="222" cy="98" r="1.8" fill="${p.eye}" opacity=".6"/>
      <circle cx="170" cy="174" r="2" fill="${p.eye}" opacity=".5"/>`,
  },
  'velara-the-lifebinder': {
    motif: ['ring', 170, 62, 56],
    draw: (p) => `
      <path d="M60 200 C100 180 140 176 170 180 C200 176 240 180 280 200" fill="none" stroke="${p.glow}" stroke-width="1.2" opacity=".4"/>
      <path d="M146 192 C144 148 152 118 172 106 C190 118 198 148 196 192 Z" fill="${p.body}"/>
      <path d="M172 106 C162 99 159 89 163 79 C169 85 175 85 181 79 C185 89 182 99 172 106 Z" fill="${p.shade}"/>
      <path d="M148 76 C154 62 166 54 182 54 C176 64 176 74 182 82 C170 88 156 86 148 76 Z" fill="${p.glow}" opacity=".45"/>
      <path d="M188 74 C196 66 206 62 218 64 C212 72 212 80 216 88 C206 90 196 84 188 74 Z" fill="${p.glow}" opacity=".3"/>
      <path d="M148 130 C130 126 116 130 104 142 C118 144 128 150 134 160 M196 130 C214 126 228 130 240 142 C226 144 216 150 210 160" fill="none" stroke="${p.body}" stroke-width="4" stroke-linecap="round"/>
      <path d="M134 160 C130 170 130 180 134 190 M210 160 C214 170 214 180 210 190" stroke="${p.glow}" stroke-width="1.4" fill="none" opacity=".5" stroke-dasharray="3 3"/>
      ${eyes(p, 166, 90, 178, 90, 2)}
      <circle cx="108" cy="146" r="2" fill="${p.eye}" opacity=".7"/>
      <circle cx="236" cy="146" r="2" fill="${p.eye}" opacity=".7"/>
      <circle cx="170" cy="60" r="1.8" fill="${p.eye}" opacity=".8"/>
      <path d="M156 140 C162 134 180 134 188 142 M158 158 h26" stroke="${p.shade}" stroke-width="2.4" fill="none"/>`,
  },
  'malachar-the-undying': {
    motif: ['moon', 170, 52, 40],
    draw: (p) => `
      <path d="M108 192 L112 132 C112 116 124 104 140 102 L200 102 C216 104 228 116 228 132 L232 192 Z" fill="${p.shade}"/>
      <path d="M118 128 L114 108 L126 118 M138 118 L136 96 L148 110 M202 118 L204 96 L192 110 M222 128 L226 108 L214 118" fill="${p.shade}"/>
      <path d="M146 192 C144 152 152 124 170 114 C188 124 196 152 194 192 Z" fill="${p.body}"/>
      <path d="M170 114 C160 107 157 97 161 87 C167 93 173 93 179 87 C183 97 180 107 170 114 Z" fill="${p.shade}"/>
      <path d="M154 88 L150 66 L160 78 L166 60 L172 74 L178 60 L184 78 L194 66 L190 88" fill="none" stroke="${p.glow}" stroke-width="2.2" stroke-linejoin="round" opacity=".9"/>
      ${eyes(p, 164, 98, 176, 98, 2.2)}
      <path d="M124 150 C118 158 116 168 120 178 M216 150 C222 158 224 168 220 178" stroke="${p.body}" stroke-width="3" fill="none" opacity=".6"/>
      <circle cx="122" cy="164" r="2" fill="${p.eye}" opacity=".8"/>
      <circle cx="219" cy="164" r="2" fill="${p.eye}" opacity=".8"/>
      <path d="M156 144 h28 M160 160 h20 M158 176 h24" stroke="${p.shade}" stroke-width="2.4"/>`,
  },
  'kronos-the-forgemaster': {
    motif: ['ring', 170, 60, 54],
    draw: (p) => `
      <path d="M118 192 L126 128 C130 106 146 94 170 94 C194 94 210 106 214 128 L222 192 Z" fill="${p.body}"/>
      <path d="M126 128 C130 106 146 94 170 94" fill="none" stroke="${p.rim}" stroke-width="1.5" opacity=".55"/>
      <path d="M156 106 h28 v10 h-28 Z" fill="${p.shade}"/>
      <path d="M160 111 h20" stroke="${p.eye}" stroke-width="2.6"/>
      <path d="M152 132 C158 126 182 126 188 132 L184 152 C176 148 164 148 156 152 Z" fill="${p.shade}"/>
      <path d="M162 136 h16 M160 144 h20" stroke="${p.glow}" stroke-width="1.8" opacity=".8"/>
      <circle cx="170" cy="140" r="18" fill="${p.glow}" opacity=".1"/>
      <path d="M118 150 C106 144 100 134 100 120 L118 134 Z" fill="${p.body}"/>
      <path d="M222 148 L246 108 M238 104 L254 100 L250 116" stroke="${p.rim}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M246 92 h16 v14 h-16 Z" fill="${p.shade}"/>
      <path d="M156 168 h28 M152 180 h36" stroke="${p.shade}" stroke-width="3"/>
      <circle cx="104" cy="126" r="2" fill="${p.glow}" opacity=".7"/>`,
  },
  'aethon-runekeeper': {
    motif: ['rift', 170, 56, 60],
    draw: (p) => `
      <path d="M146 192 C144 150 152 120 172 108 C190 120 198 150 196 192 Z" fill="${p.body}"/>
      <path d="M172 108 C162 101 159 91 163 81 C169 87 175 87 183 81 C185 91 182 101 172 108 Z" fill="${p.shade}"/>
      <ellipse cx="172" cy="94" rx="8" ry="10" fill="${p.sky2}"/>
      ${eyeCluster(p, 172, 94, 6, 3, 97)}
      <path d="M120 130 L156 122 L156 148 L120 158 Z" fill="${p.shade}"/>
      <path d="M220 130 L184 122 L184 148 L220 158 Z" fill="${p.shade}"/>
      <path d="M120 130 L156 122 M184 122 L220 130" stroke="${p.glow}" stroke-width="1.4" opacity=".7"/>
      <path d="M128 138 h20 M130 148 h16 M192 138 h20 M194 148 h16" stroke="${p.glow}" stroke-width="1.2" opacity=".6"/>
      <circle cx="126" cy="144" r="1" fill="${p.rim}" opacity=".9"/>
      <circle cx="146" cy="152" r="1.2" fill="${p.rim}" opacity=".8"/>
      <circle cx="204" cy="144" r="1" fill="${p.rim}" opacity=".9"/>
      <circle cx="214" cy="152" r="1.2" fill="${p.rim}" opacity=".8"/>
      <path d="M138 160 C130 170 128 182 132 194 M204 160 C212 170 214 182 210 194" stroke="${p.glow}" stroke-width="1.2" fill="none" opacity=".4" stroke-dasharray="2 4"/>
      ${glyphShards(p, 170, 64, 101, 4)}`,
  },

  // ═══ Battle tokens ═══
  'token-spark': {
    motif: ['rift', 170, 78, 40],
    draw: (p) => `
      <path d="M170 88 L158 122 L168 122 L156 158 L182 118 L172 118 L184 88 Z" fill="${p.glow}" opacity=".85"/>
      <circle cx="170" cy="124" r="26" fill="${p.glow}" opacity=".12"/>
      <path d="M140 108 L130 96 M200 108 L210 96 M144 148 L132 156 M196 148 L208 156" stroke="${p.glow}" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>
      ${eyes(p, 162, 132, 178, 132, 1.8)}`,
  },
  'token-wisp': {
    motif: ['moon', 170, 70, 32],
    draw: (p) => `
      <path d="M170 84 C186 98 194 114 194 132 C194 152 184 164 170 166 C156 164 146 152 146 132 C146 114 154 98 170 84 Z" fill="${p.body}"/>
      <path d="M170 84 C186 98 194 114 194 132" fill="none" stroke="${p.rim}" stroke-width="1.3" opacity=".5"/>
      <path d="M170 100 C178 110 182 120 182 130 C182 142 177 150 170 152 C163 150 158 142 158 130 C158 120 162 110 170 100 Z" fill="${p.glow}" opacity=".4"/>
      ${eyes(p, 163, 128, 177, 128, 2.2)}
      <path d="M150 170 C156 176 164 179 170 179 C176 179 184 176 190 170" stroke="${p.glow}" stroke-width="1.2" fill="none" opacity=".4"/>
      <circle cx="146" cy="102" r="1.6" fill="${p.eye}" opacity=".6"/>
      <circle cx="196" cy="106" r="1.4" fill="${p.eye}" opacity=".6"/>`,
  },
  'token-ghoul': {
    motif: ['moon', 170, 66, 34],
    draw: (p) => `
      <path d="M142 192 C140 162 148 138 166 128 C184 138 192 162 190 192 Z" fill="${p.body}"/>
      <path d="M166 128 C157 122 154 113 157 104 C162 109 170 109 175 104 C178 113 175 122 166 128 Z" fill="${p.shade}"/>
      <path d="M144 154 C134 150 128 142 126 132 L140 142 Z" fill="${p.body}"/>
      <path d="M188 150 C196 144 200 136 200 126 L190 138 Z" fill="${p.body}"/>
      <path d="M126 132 L118 122 M200 126 L208 116" stroke="${p.shade}" stroke-width="2.6" stroke-linecap="round"/>
      ${eyes(p, 161, 112, 172, 112, 2)}
      <path d="M158 120 Q166 126 174 120" stroke="${p.shade}" stroke-width="1.6" fill="none"/>
      <path d="M150 176 h32" stroke="${p.shade}" stroke-width="2"/>`,
  },
  'token-wraith': {
    motif: ['rift', 170, 68, 48],
    draw: (p) => `
      <path d="M144 184 C142 144 152 116 170 106 C188 116 198 144 196 184 C188 176 182 182 176 176 C170 182 164 176 158 182 C152 176 148 180 144 184 Z" fill="${p.body}" opacity=".85"/>
      <path d="M170 106 C161 99 158 90 161 80 C166 86 174 86 179 80 C182 90 179 99 170 106 Z" fill="${p.shade}"/>
      <path d="M170 106 C188 116 198 144 196 184" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".45"/>
      ${eyes(p, 164, 92, 176, 92, 2.4)}
      <path d="M148 130 C138 128 130 122 126 112 M192 130 C202 128 210 122 214 112" stroke="${p.body}" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".7"/>
      <path d="M144 184 C140 192 136 198 130 202 M196 184 C200 192 204 198 210 202" stroke="${p.body}" stroke-width="2.4" fill="none" opacity=".4"/>`,
  },
}

/**
 * The seal shown when card art fails to load — an unhallowed sigil in the
 * house style rather than a borrowed card.
 */
export const UNKNOWN_CARD_ID = 'card-unknown'

const UNKNOWN_SCENE = {
  motif: ['ring', 170, 110, 64],
  draw: (p) => `
    <circle cx="170" cy="110" r="40" fill="none" stroke="${p.glow}" stroke-width="1.6" opacity=".55"/>
    <path d="M170 70 L204 130 L136 130 Z" fill="none" stroke="${p.glow}" stroke-width="1.6" opacity=".55"/>
    <path d="M170 150 L136 90 L204 90 Z" fill="none" stroke="${p.rim}" stroke-width="1.2" opacity=".35"/>
    ${eyes(TRIBE_PALETTES.none, 163, 110, 177, 110, 2.6)}
    <path d="M150 166 h40" stroke="${p.shade}" stroke-width="2.4"/>`,
}

/** Floating glyph shards — forbidden writing loose in the air. */
export function glyphShards(p, cx, cy, seed, count = 3) {
  let out = ''
  for (let i = 0; i < count; i++) {
    const x = cx + (((seed * (i + 3)) % 90) - 45)
    const y = cy + (((seed * (i + 5)) % 44) - 22)
    const s = 5 + ((seed * (i + 1)) % 4)
    out += `<g transform="rotate(${((seed * (i + 2)) % 50) - 25} ${x} ${y})" opacity=".55">
      <path d="M${x - s / 2} ${y - s} h${s} l${s / 3} ${s} l-${s / 3} ${s} h-${s} Z" fill="none" stroke="${p.glow}" stroke-width="1.1"/>
      <path d="M${x} ${y - s / 2} v${s}" stroke="${p.glow}" stroke-width="1.1"/>
    </g>`
  }
  return out
}

// ── Composition ────────────────────────────────────────────────────────

const RARITY_BORDERS = {
  common: 'rgba(148,163,184,.35)',
  rare: 'rgba(96,165,250,.5)',
  epic: 'rgba(168,85,247,.55)',
  legendary: 'rgba(245,158,11,.65)',
}

/**
 * Rarity is expressed as an aura around the subject, never a different
 * palette: a faint sigil for rares, orbit rings for epics, a corona for
 * legendaries. Commons carry the atmosphere alone.
 */
const RARITY_AURAS = {
  common: () => '',
  rare: (p) => `
    <ellipse cx="170" cy="184" rx="66" ry="10" fill="none" stroke="${p.glow}" stroke-width="1.2" opacity=".3"/>
    <ellipse cx="170" cy="184" rx="46" ry="6" fill="none" stroke="${p.glow}" stroke-width="1" opacity=".22"/>`,
  epic: (p) => `
    <ellipse cx="170" cy="182" rx="74" ry="12" fill="none" stroke="${p.glow}" stroke-width="1.3" opacity=".35"/>
    <ellipse cx="170" cy="128" rx="92" ry="58" fill="none" stroke="${p.glow}" stroke-width="1" opacity=".18"/>
    <circle cx="86" cy="120" r="2" fill="${p.glow}" opacity=".5"/>
    <circle cx="254" cy="118" r="2" fill="${p.glow}" opacity=".5"/>`,
  legendary: (p) => {
    let rays = ''
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 * Math.PI) / 180
      const x1 = 170 + Math.cos(a) * 66
      const y1 = 118 + Math.sin(a) * 52
      const x2 = 170 + Math.cos(a) * 92
      const y2 = 118 + Math.sin(a) * 74
      rays += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${p.glow}" stroke-width="1.1" opacity=".22"/>`
    }
    return `
    <ellipse cx="170" cy="118" rx="96" ry="76" fill="${p.glow}" opacity=".06"/>
    <ellipse cx="170" cy="182" rx="80" ry="13" fill="none" stroke="${p.glow}" stroke-width="1.4" opacity=".4"/>
    ${rays}`
  },
}

/**
 * Compose one finished card illustration. `card` needs id, title, rarity,
 * and tribe; the scene must already exist in CARD_SCENES.
 */
export function makeCardArt(card) {
  const p = TRIBE_PALETTES[card.tribe] ?? TRIBE_PALETTES.none
  const h = artHash(card.id)
  const scene = card.id === UNKNOWN_CARD_ID ? UNKNOWN_SCENE : CARD_SCENES[card.id]
  if (!scene) {
    throw new Error(`No card-art scene for "${card.id}" — add one to CARD_SCENES in scripts/lib/card-art.mjs`)
  }
  const [motifKind, mx, my, mr] = scene.motif
  const border = RARITY_BORDERS[card.rarity] ?? RARITY_BORDERS.common
  const aura = (RARITY_AURAS[card.rarity] ?? RARITY_AURAS.common)(p)
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${card.title} illustration">
  <defs>
    <linearGradient id="sky-${card.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.sky1}"/>
      <stop offset="100%" stop-color="${p.sky2}"/>
    </linearGradient>
    <radialGradient id="drown-${card.id}" cx="50%" cy="46%" r="62%">
      <stop offset="0%" stop-color="${p.glow}" stop-opacity="0.2"/>
      <stop offset="60%" stop-color="${p.glow}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${p.glow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig-${card.id}" cx="50%" cy="50%" r="72%">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="76%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.5"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="28" fill="url(#sky-${card.id})"/>
  <rect width="${W}" height="${H}" rx="28" fill="url(#drown-${card.id})"/>
  ${stars(h, p.rim)}
  ${MOTIFS[motifKind](p, mx, my, mr)}
  ${ruins(h, p)}
  ${fog(p, 168 + (h % 8), 8, 0.05)}
  ${aura}
  ${scene.draw(p, h)}
  ${fog(p, 186 + (h % 6), 6, 0.07)}
  ${ground(h, p)}
  ${vignetteAndGrain(card.id, h, p)}
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="22" fill="none" stroke="${border}"/>
</svg>`.trim()
}

/** Battle tokens summoned by card effects — they render on the board too. */
const TOKEN_CARDS = [
  { id: 'token-spark', title: 'Spark', rarity: 'common', tribe: 'token' },
  { id: 'token-wisp', title: 'Wisp', rarity: 'common', tribe: 'token' },
  { id: 'token-ghoul', title: 'Ghoul', rarity: 'common', tribe: 'undead' },
  { id: 'token-wraith', title: 'Wraith', rarity: 'common', tribe: 'undead' },
]

/**
 * Every card art file to write: the live library, the battle tokens, and
 * the unknown-card seal. Throws if any library card lacks a scene, so a new
 * card cannot ship with missing art.
 */
export function buildCardArtFiles() {
  const cards = [
    ...CARD_LIBRARY.map((card) => ({
      id: card.id,
      title: card.name,
      rarity: card.rarity,
      tribe: card.tribe ?? 'none',
    })),
    ...TOKEN_CARDS,
    { id: UNKNOWN_CARD_ID, title: 'Unhallowed Seal', rarity: 'common', tribe: 'none' },
  ]
  const missing = cards.filter((card) => card.id !== UNKNOWN_CARD_ID && !CARD_SCENES[card.id])
  if (missing.length > 0) {
    throw new Error(`Cards without art scenes: ${missing.map((card) => card.id).join(', ')}`)
  }
  return cards.map((card) => ({ ...card, svg: makeCardArt(card) }))
}
