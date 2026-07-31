/**
 * Removes rules from App.css whose selectors only ever target classes that
 * nothing in the codebase renders.
 *
 * Uses postcss (already present via Vite) rather than regex surgery, because
 * the risky cases are structural, not textual:
 *
 *   - `.hero-health, .stats { … }` mixes a dead class with a live one. Only the
 *     dead selector may be dropped; the rule must survive.
 *   - `.home-final-main .badge { … }` is dead because its *ancestor* is dead,
 *     even though `.badge` is live.
 *   - Emptying a rule can empty its enclosing `@media`, which must then go too.
 *
 * Deliberately conservative. A selector is only dropped when every compound
 * part that carries a class references at least one dead class, and the
 * selector contains no id, attribute, or bare element target that could still
 * match something. Anything it cannot prove dead, it keeps.
 *
 * Usage:
 *   node scripts/prune-dead-css.mjs           # dry run, prints a report
 *   node scripts/prune-dead-css.mjs --write   # applies the edit
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import postcss from 'postcss'

// src/styles/*.css, not src/App.css — that file is an @import index now.
const STYLES_DIR = path.resolve('src/styles')
const CSS_FILES = readdirSync(STYLES_DIR)
  .filter((name) => name.endsWith('.css'))
  .sort()
  .map((name) => path.join(STYLES_DIR, name))
const WRITE = process.argv.includes('--write')

// Reuse the audit as the single source of truth for what is dead, via its
// machine-readable output — scraping the human report dropped names that
// happened to collide with the summary headings.
const audit = JSON.parse(
  execFileSync('node', [path.resolve('scripts/audit-css-usage.mjs'), '--json'], { encoding: 'utf8' }),
)
const dead = new Set(audit.dead)

/** Class tokens in one comma-free selector. */
const classesIn = (selector) => [...selector.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map((m) => m[1])

/**
 * True when this selector can only ever match dead markup.
 *
 * Requires (a) at least one class present, (b) no id/attribute/element anchor
 * that might match live markup on its own, and (c) at least one compound in
 * the descendant chain that is entirely dead — killing an ancestor kills the
 * whole selector.
 */
function isDeadSelector(selector) {
  const trimmed = selector.trim()
  if (!trimmed) return false

  // Anything targeting ids, attributes, or :root is out of scope.
  if (/[#[]/.test(trimmed) || trimmed.includes(':root')) return false

  const all = classesIn(trimmed)
  if (all.length === 0) return false

  // Split into descendant/child/sibling compounds; if any whole compound is
  // dead, nothing downstream of it can render.
  const compounds = trimmed.split(/\s*[>+~]\s*|\s+/).filter(Boolean)
  for (const compound of compounds) {
    const classes = classesIn(compound)
    if (classes.length === 0) continue // bare element or pseudo — not decisive
    // ANY dead class kills the compound, not just all of them: a compound is a
    // set of classes that must be present on the SAME element at once, so
    // `.ops-grid.settings-screen` can never match if `.ops-grid` is never
    // rendered — even though `.settings-screen` is very much alive.
    if (classes.some((c) => dead.has(c))) return true
  }
  return false
}

const removed = { rules: 0, selectors: 0, atRules: 0, declarations: 0 }
const removedNames = new Set()
let linesBefore = 0
let linesAfter = 0

// One module at a time. Parsing `src/App.css` would parse an @import index and
// silently rewrite the load-bearing import order rather than any real rules.
for (const cssPath of CSS_FILES) {
  const css = readFileSync(cssPath, 'utf8')
  const root = postcss.parse(css, { from: cssPath })
  linesBefore += css.split('\n').length

root.walkRules((rule) => {
  // Skip keyframe steps (`from`, `to`, `50%`) — not selectors in this sense.
  if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return

  const keep = []
  for (const selector of rule.selectors) {
    if (isDeadSelector(selector)) {
      removed.selectors += 1
      classesIn(selector).forEach((c) => { if (dead.has(c)) removedNames.add(c) })
    } else {
      keep.push(selector)
    }
  }

  if (keep.length === 0) {
    removed.rules += 1
    removed.declarations += rule.nodes?.length ?? 0
    rule.remove()
  } else if (keep.length !== rule.selectors.length) {
    rule.selectors = keep
  }
})

// An @media/@container/@supports left with nothing inside is noise.
let pruning = true
while (pruning) {
  pruning = false
  root.walkAtRules((atRule) => {
    if (/keyframes$/.test(atRule.name)) return
    const meaningful = (atRule.nodes ?? []).filter((n) => n.type !== 'comment')
    if (meaningful.length === 0) {
      atRule.remove()
      removed.atRules += 1
      pruning = true
    }
  })
}

  const output = root.toString()
  linesAfter += output.split('\n').length
  if (WRITE) writeFileSync(cssPath, output, 'utf8')
}

console.log(`stylesheets:             ${CSS_FILES.length} files in src/styles/`)
console.log(`dead classes from audit: ${dead.size}`)
console.log(`selectors dropped:       ${removed.selectors}`)
console.log(`rules removed:           ${removed.rules}`)
console.log(`declarations removed:    ${removed.declarations}`)
console.log(`empty at-rules removed:  ${removed.atRules}`)
console.log(`lines:                   ${linesBefore} -> ${linesAfter}  (-${linesBefore - linesAfter})`)
console.log(`classes actually hit:    ${removedNames.size}`)

if (WRITE) {
  console.log('\nwritten.')
} else {
  console.log('\ndry run — pass --write to apply')
}
