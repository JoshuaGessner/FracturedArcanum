/**
 * Reports class selectors in App.css that nothing in the codebase renders.
 *
 * Deleting CSS on the strength of a script is only safe if the script is hard
 * to fool, so this runs two independent detections and only calls a class dead
 * when BOTH agree:
 *
 *   1. token  — every string literal and template-literal chunk in the sources
 *               is split into whitespace-separated tokens; a class is live if
 *               it appears as a whole token. Precise, but blind to a class
 *               that is only ever built by concatenation.
 *   2. loose  — a substring search for the class name anywhere in the sources.
 *               Over-reports (a prefix of a longer name counts), which is
 *               exactly what you want as a safety net.
 *
 * A class is reported dead only if the token scan misses it AND the loose scan
 * misses it AND it does not start with a known runtime-built prefix.
 *
 * Usage: node scripts/audit-css-usage.mjs [--list]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const CSS_PATH = path.resolve('src/App.css')
const SCAN_DIRS = [path.resolve('src'), path.resolve('scripts')]
const SCAN_FILES = [path.resolve('index.html')]

/**
 * A hand-maintained list of runtime-built prefixes is a trap: miss one and the
 * audit reports live code as dead. `legendary-shake-a` and
 * `pack-ceremony-pack-burst` are real classes built as
 * `` `legendary-shake-${…}` `` and `` `pack-ceremony-pack-${phase}` ``, and
 * both the token scan and the substring scan miss them for the same reason —
 * the literal never appears anywhere in the sources.
 *
 * So the prefixes are derived from the sources instead: any template literal
 * of the form `…some-prefix-${…}` contributes `some-prefix-`, and any
 * `'some-prefix-' + x` concatenation does the same.
 */
function discoverDynamicPrefixes(source) {
  const prefixes = new Set()
  // `foo-${bar}` — capture the class-ish fragment before the interpolation.
  for (const match of source.matchAll(/([a-zA-Z][\w-]*-)\$\{/g)) {
    prefixes.add(match[1])
  }
  // 'foo-' + bar
  for (const match of source.matchAll(/['"]([a-zA-Z][\w-]*-)['"]\s*\+/g)) {
    prefixes.add(match[1])
  }
  return prefixes
}

/** Pseudo-classes and state words that are toggled, not authored as literals. */
const STATE_WORDS = new Set([
  'active', 'hidden', 'disabled', 'is-active', 'is-dragging', 'is-drag-sibling',
  'is-drag-active', 'ready', 'warning', 'filled', 'complete', 'clamped',
  'focusable', 'unplayable', 'compact', 'mini', 'small', 'open', 'closed',
])

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx?|jsx?|mjs|cjs|html)$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * The audit and the pruner both discuss class names in their own comments
 * (`.hero-health`, `.home-final-main`). Scanning them marks those names live
 * and quietly shrinks the dead list — the tooling would exempt exactly the
 * examples it documents. Excluded from their own input.
 */
const SELF = new Set([
  path.resolve('scripts/audit-css-usage.mjs'),
  path.resolve('scripts/prune-dead-css.mjs'),
])

const sourceFiles = [...SCAN_DIRS.flatMap((d) => walk(d)), ...SCAN_FILES]
  .filter((f) => !SELF.has(f))
const haystack = sourceFiles.map((f) => readFileSync(f, 'utf8')).join('\n')

// ── detection 1: whole-token set ────────────────────────────────────────────
// Pull the contents of every quoted string and template literal, then split on
// anything that cannot appear in a class name.
const tokens = new Set()
for (const match of haystack.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g)) {
  const text = match[1] ?? match[2] ?? match[3] ?? ''
  for (const token of text.split(/[^\w-]+/)) {
    if (token) tokens.add(token)
  }
}

// ── the stylesheet's class inventory ────────────────────────────────────────
const css = readFileSync(CSS_PATH, 'utf8')
// Strip comments so prose like "the .foo rule" is not mistaken for a selector.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
const classes = new Set()
for (const match of cssNoComments.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) {
  classes.add(match[1])
}

// Derived from the sources, not hand-listed — see discoverDynamicPrefixes.
const dynamicPrefixes = discoverDynamicPrefixes(haystack)

const dead = []
const dynamic = []
const live = []
for (const cls of [...classes].sort()) {
  if ([...dynamicPrefixes].some((p) => cls.startsWith(p)) || STATE_WORDS.has(cls)) {
    dynamic.push(cls)
    continue
  }
  const byToken = tokens.has(cls)
  const byLoose = haystack.includes(cls)
  if (byToken || byLoose) live.push(cls)
  else dead.push(cls)
}

// `--json` is what scripts/prune-dead-css.mjs consumes. Parsing the human
// report instead silently lost two class names whose text collided with the
// summary headings, so the machine path is kept separate from the prose one.
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ dead, dynamicPrefixes: [...dynamicPrefixes], live: live.length }, null, 2))
} else {
  console.log(`stylesheet:        ${path.relative(process.cwd(), CSS_PATH)}`)
  console.log(`sources scanned:   ${sourceFiles.length} files`)
  console.log('')
  console.log(`class names:       ${classes.size}`)
  console.log(`live:              ${live.length}`)
  console.log(`runtime-built:     ${dynamic.length} (assumed live)`)
  console.log(`DEAD:              ${dead.length}`)

  if (process.argv.includes('--list')) {
    console.log('')
    console.log(dead.join('\n'))
  }
}
