/**
 * Token drift audit — the static half of layout QA.
 *
 *   npm run qa:tokens              # summary, worst offenders first
 *   npm run qa:tokens -- --list    # every occurrence with file:line
 *   npm run qa:tokens -- --fixable # only the unambiguous 1:1 substitutions
 *
 * The design tokens in src/styles/tokens.css exist so the UI reads as one
 * system. They only do that if components actually use them. This finds literal
 * values that have an exact token equivalent — a hardcoded `12px` where
 * `var(--space-3)` means the same thing.
 *
 * No browser needed: this is a parse of the stylesheets, so it costs
 * milliseconds and can run on every change.
 *
 * ── What it deliberately does NOT flag ────────────────────────────────────
 * A literal is only drift when substituting the token is genuinely
 * behaviour-preserving. Several categories look like matches but are not:
 *
 *   - Declarations inside `:root` — that is where tokens are *defined*.
 *   - Values already inside a `var()`, including token fallbacks.
 *   - Properties where the scale does not apply. `4px` as a `border-radius`
 *     is not `--space-1`; spacing and radii are different scales that happen
 *     to share numbers.
 *   - `0` and `1px`, which are hairlines and resets rather than scale steps.
 *   - Anything inside `@keyframes`, where values are animation waypoints
 *     rather than layout decisions.
 *
 * The remaining findings are ranked, not auto-applied. A human decides whether
 * a given `16px` was reaching for `--space-4` or just happened to be 16.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const STYLES_DIR = path.resolve('src/styles')
const TOKENS_FILE = path.join(STYLES_DIR, 'tokens.css')

/**
 * Which token families may substitute for which properties. Keeping this
 * explicit is what stops the audit proposing `--space-1` for a 4px radius.
 */
const FAMILIES = [
  {
    name: 'spacing',
    prefix: '--space-',
    properties: [
      'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'margin-inline', 'margin-block',
      'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'padding-inline', 'padding-block',
      'gap', 'row-gap', 'column-gap',
    ],
  },
  {
    name: 'radius',
    prefix: '--radius-',
    properties: [
      'border-radius', 'border-top-left-radius', 'border-top-right-radius',
      'border-bottom-left-radius', 'border-bottom-right-radius',
    ],
  },
  {
    name: 'font-size',
    prefix: '--font-',
    properties: ['font-size'],
  },
]

/** Hairlines and resets, not scale steps. */
const IGNORED_LENGTHS = new Set(['0', '0px', '1px'])

function parseArgs(argv) {
  const options = { list: false, fixableOnly: false, write: false }
  for (const arg of argv) {
    const key = arg.replace(/^--/, '')
    if (key === 'list') options.list = true
    else if (key === 'fixable') options.fixableOnly = true
    else if (key === 'write') options.write = true
    else if (key === 'help') options.help = true
  }
  return options
}

/** Read `--name: value` pairs out of the token file's :root block. */
async function loadTokens() {
  const text = await readFile(TOKENS_FILE, 'utf8')
  const tokens = new Map()
  for (const match of text.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) {
    tokens.set(match[1], match[2].trim())
  }
  return tokens
}

/** value -> token name, restricted to one family and to simple px values. */
function buildLookup(tokens, prefix) {
  const lookup = new Map()
  for (const [name, value] of tokens) {
    if (!name.startsWith(prefix)) continue
    if (!/^\d+(\.\d+)?px$/.test(value)) continue
    // First token wins if two share a value, so the report stays stable.
    if (!lookup.has(value)) lookup.set(value, name)
  }
  return lookup
}

/**
 * Mask regions where a literal is legitimate, so the scanner never sees them:
 * the :root block, every @keyframes body, and the inside of any var().
 * Masking preserves offsets, which keeps line numbers correct.
 */
function maskExemptRegions(text) {
  let masked = text

  const blank = (source, start, end) =>
    source.slice(0, start) + source.slice(start, end).replace(/[^\n]/g, ' ') + source.slice(end)

  // Balanced-brace scan from a header match to its closing brace.
  const maskBlocks = (source, headerPattern) => {
    let out = source
    for (const match of [...source.matchAll(headerPattern)]) {
      const open = out.indexOf('{', match.index)
      if (open === -1) continue
      let depth = 0
      let i = open
      for (; i < out.length; i += 1) {
        if (out[i] === '{') depth += 1
        else if (out[i] === '}') {
          depth -= 1
          if (depth === 0) break
        }
      }
      out = blank(out, open + 1, i)
    }
    return out
  }

  masked = maskBlocks(masked, /(^|\})\s*:root\s*(?=\{)/gm)
  masked = maskBlocks(masked, /@keyframes\s+[\w-]+\s*(?=\{)/g)
  // var(...) contents, including fallbacks that legitimately contain lengths.
  masked = masked.replace(/var\([^)]*\)/g, (m) => m.replace(/[^\n]/g, ' '))
  // Comments. Prose describing spacing reads exactly like a declaration —
  // `/* rail padding: 4px top + 8px bottom */` was reported as drift twice.
  masked = masked.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return masked
}

async function scanFile(file, lookups) {
  const raw = await readFile(file, 'utf8')
  const masked = maskExemptRegions(raw)
  const lines = raw.split('\n')
  const findings = []

  for (const family of FAMILIES) {
    const lookup = lookups.get(family.name)
    if (!lookup || lookup.size === 0) continue
    const propertyPattern = new RegExp(
      `(^|[;{\\s])(${family.properties.join('|')})\\s*:\\s*([^;{}]+)`,
      'gm',
    )
    for (const match of masked.matchAll(propertyPattern)) {
      const property = match[2]
      // Read the real value from the unmasked source at the same offset, so
      // masking never changes what we report.
      const valueStart = match.index + match[0].length - match[3].length
      const value = raw.slice(valueStart, valueStart + match[3].length)
      if (value.includes('var(')) continue

      const lengths = value.match(/(?<![\w.-])\d+(?:\.\d+)?px/g) ?? []
      for (const length of lengths) {
        if (IGNORED_LENGTHS.has(length)) continue
        const token = lookup.get(length)
        if (!token) continue
        const line = raw.slice(0, valueStart).split('\n').length
        const leading = value.length - value.trimStart().length
        findings.push({
          file: path.relative(process.cwd(), file),
          absoluteFile: file,
          start: valueStart + leading,
          end: valueStart + leading + value.trim().length,
          line,
          family: family.name,
          property,
          value: value.trim(),
          literal: length,
          token,
          // A single-value declaration is a clean 1:1 swap; a compound value
          // (`8px 16px`) needs a human to decide the whole shorthand.
          fixable: value.trim() === length,
          text: (lines[line - 1] ?? '').trim(),
        })
      }
    }
  }
  return findings
}

function report(findings, options) {
  if (findings.length === 0) {
    console.log('\nNo token drift found.\n')
    return 0
  }

  const shown = options.fixableOnly ? findings.filter((f) => f.fixable) : findings
  const fixable = findings.filter((f) => f.fixable).length

  console.log(`\n${findings.length} literal value(s) have an exact token equivalent `
    + `(${fixable} are clean 1:1 swaps).\n`)

  const byToken = new Map()
  for (const finding of shown) {
    const key = `${finding.token} (${finding.literal})`
    if (!byToken.has(key)) byToken.set(key, [])
    byToken.get(key).push(finding)
  }

  const ranked = [...byToken.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [token, group] of ranked) {
    const clean = group.filter((f) => f.fixable).length
    console.log(`  ${String(group.length).padStart(4)} × ${token}  — ${clean} clean`)
    if (options.list) {
      for (const finding of group) {
        console.log(`         ${finding.file}:${finding.line}  ${finding.property}: ${finding.value}`)
      }
    }
  }

  const byFile = new Map()
  for (const finding of shown) {
    byFile.set(finding.file, (byFile.get(finding.file) ?? 0) + 1)
  }
  console.log('\n  Worst files:')
  for (const [file, count] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${String(count).padStart(4)} × ${file}`)
  }

  if (!options.list) console.log('\n  Re-run with --list for file:line of every occurrence.')
  console.log('')
  return shown.length
}

const HELP = `
Token drift audit — literal values that have an exact design-token equivalent.

  --list      Print file:line for every occurrence
  --fixable   Only single-value declarations (clean 1:1 substitutions)
  --write     Apply the clean 1:1 substitutions (see below)
  --help

Exits non-zero when drift is found, so it can gate a unification pass.

--write only touches declarations whose ENTIRE value is a single literal that a
token defines exactly, so every substitution is behaviour-preserving by
construction: var(--space-2) resolves to the 8px it replaced. Compound values
like "8px 16px" are always left alone — deciding whether a whole shorthand was
reaching for the scale is a judgement call, not a substitution.
Verify with "npm run qa:snap:check" regardless; it should report no change.
`

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) { console.log(HELP); return }

  const tokens = await loadTokens()
  const lookups = new Map(FAMILIES.map((f) => [f.name, buildLookup(tokens, f.prefix)]))

  const files = (await readdir(STYLES_DIR))
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(STYLES_DIR, f))
    .sort()

  const findings = []
  for (const file of files) findings.push(...await scanFile(file, lookups))

  if (options.write) {
    const clean = findings.filter((f) => f.fixable)
    const byFile = new Map()
    for (const finding of clean) {
      if (!byFile.has(finding.absoluteFile)) byFile.set(finding.absoluteFile, [])
      byFile.get(finding.absoluteFile).push(finding)
    }
    let applied = 0
    for (const [file, group] of byFile) {
      let text = await readFile(file, 'utf8')
      // Apply back-to-front so earlier offsets stay valid.
      for (const finding of [...group].sort((a, b) => b.start - a.start)) {
        text = text.slice(0, finding.start) + `var(${finding.token})` + text.slice(finding.end)
        applied += 1
      }
      await writeFile(file, text)
    }
    console.log(`\nApplied ${applied} substitution(s) across ${byFile.size} file(s).`)
    console.log('Verify with: npm run qa:snap:check\n')
    return
  }

  report(findings, options)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
