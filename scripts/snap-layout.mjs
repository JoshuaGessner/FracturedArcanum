/**
 * Visual baselines — the safety net for broad restyling work.
 *
 *   npm run qa:snap                    # record baselines (desktop)
 *   npm run qa:snap -- --all-viewports # record every viewport
 *   npm run qa:snap:check              # compare against the baselines
 *
 * Why this exists alongside probe-layout.mjs: the probe answers "does this
 * specific invariant still hold". It cannot answer "did restyling the shop
 * quietly change the collection screen too". That question needs pixels.
 *
 * The output contract is deliberate. Images are written to disk; what comes
 * back on stdout is a table of percentages. A human opens the PNGs when a
 * number looks wrong. This keeps a full 56-state visual regression run to a
 * few dozen lines of text, which is what makes it usable in an agent loop
 * rather than something that has to be babysat.
 *
 * Diff images are written for every changed state, with changed pixels
 * highlighted, so triage is "look at the three files named in the summary"
 * rather than "re-run and watch".
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { installProbe } from './lib/layoutInvariants.mjs'
import { ensureAuthenticated, findBrowserExecutable, startApp } from './lib/qa-app.mjs'
import { reachedState, resetToShell, selectStates, selectViewports, waitForSettled } from './lib/appStates.mjs'

const OUTPUT_DIR = path.resolve('.layout-qa')
const BASELINE_DIR = path.join(OUTPUT_DIR, 'baseline')
const CURRENT_DIR = path.join(OUTPUT_DIR, 'current')
const DIFF_DIR = path.join(OUTPUT_DIR, 'diff')

/**
 * Per-pixel colour distance below which two pixels count as identical.
 * 0.1 is pixelmatch's default and is tuned to ignore antialiasing noise while
 * still catching a one-pixel shift of a real edge.
 */
const PIXEL_THRESHOLD = 0.1

/**
 * How much of an image may change before it is reported as a regression.
 *
 * Not zero. The app has genuinely non-deterministic surfaces — ambient
 * gradients animate on a 12s loop, quest progress and currency reflect live
 * account state, and text antialiasing varies by a pixel between runs. A zero
 * threshold reports every state as changed on every run, which trains you to
 * ignore the output. 0.1% of a 1440x900 frame is ~1300 pixels: far more than
 * noise, far less than any real layout shift.
 */
const CHANGE_THRESHOLD_PCT = 0.1

function parseArgs(argv) {
  const options = { viewports: null, states: null, all: false, check: false, update: false }
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=')
    if (key === 'vp' || key === 'viewport') options.viewports = value.split(',')
    else if (key === 'state') options.states = value.split(',')
    else if (key === 'all-viewports') options.all = true
    else if (key === 'check') options.check = true
    else if (key === 'update') options.update = true
    else if (key === 'help') options.help = true
  }
  return options
}

const HELP = `
Visual baselines for layout work.

  (no flags)          Record baselines into .layout-qa/baseline/
  --check             Capture into .layout-qa/current/ and diff vs baseline
  --update            Re-record baselines, replacing the existing set
  --vp=<name|group>   Viewport(s). Groups: desktop, tablet, phone. Default: desktop
  --state=<name,...>  Limit to specific states
  --all-viewports     Every viewport rather than just desktop
  --help

  QA_URL=http://…     Snapshot an already-running app instead of booting one.

Record a baseline before starting a restyle, then --check after. Anything over
${CHANGE_THRESHOLD_PCT}% changed is reported with a diff image you can open.
`

function shotName(viewport, state) {
  return `${viewport.name}--${state.name}.png`
}

/** Capture every requested state once, into `targetDir`. */
async function capture(targetDir, { viewports, states, log }) {
  await rm(targetDir, { recursive: true, force: true })
  await mkdir(targetDir, { recursive: true })

  const app = await startApp({ log })
  const browser = await chromium.launch({ headless: true, executablePath: findBrowserExecutable() })
  const captured = []
  const skipped = []

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      })
      await context.addInitScript(installProbe)
      const page = await context.newPage()

      try {
        await ensureAuthenticated(page, app.url, app.apiOrigin)
        for (const state of states) {
          await resetToShell(page, app, viewport)
          await state.enter(page)
          await waitForSettled(page)

          // A screenshot of the wrong screen silently poisons the baseline, so
          // an unreached state is skipped and reported rather than captured.
          if (!await reachedState(page, state)) {
            skipped.push(`${viewport.name} · ${state.name}`)
            log(`${viewport.name} · ${state.name} → SKIPPED (never reached)`)
            continue
          }

          const file = path.join(targetDir, shotName(viewport, state))
          await page.screenshot({ path: file, animations: 'disabled' })
          captured.push(file)
          log(`${viewport.name} · ${state.name} → captured`)
        }
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
    await app.stop()
  }

  return { captured, skipped }
}

async function readPng(file) {
  return PNG.sync.read(await readFile(file))
}

/** Compare `current` against `baseline`, writing a diff image per change. */
async function compare() {
  await mkdir(DIFF_DIR, { recursive: true })
  const baselineFiles = (await readdir(BASELINE_DIR)).filter((f) => f.endsWith('.png')).sort()
  const currentFiles = new Set((await readdir(CURRENT_DIR)).filter((f) => f.endsWith('.png')))

  const rows = []
  for (const name of baselineFiles) {
    if (!currentFiles.has(name)) {
      rows.push({ name, status: 'missing', pct: null })
      continue
    }
    const [before, after] = await Promise.all([
      readPng(path.join(BASELINE_DIR, name)),
      readPng(path.join(CURRENT_DIR, name)),
    ])

    if (before.width !== after.width || before.height !== after.height) {
      rows.push({
        name,
        status: 'resized',
        pct: null,
        note: `${before.width}x${before.height} → ${after.width}x${after.height}`,
      })
      continue
    }

    const diff = new PNG({ width: before.width, height: before.height })
    const changed = pixelmatch(
      before.data, after.data, diff.data,
      before.width, before.height,
      { threshold: PIXEL_THRESHOLD },
    )
    const pct = (changed / (before.width * before.height)) * 100

    if (pct > CHANGE_THRESHOLD_PCT) {
      const diffPath = path.join(DIFF_DIR, name)
      await writeFile(diffPath, PNG.sync.write(diff))
      rows.push({ name, status: 'changed', pct, changed, diffPath })
    } else {
      rows.push({ name, status: 'ok', pct, changed })
    }
  }

  for (const name of currentFiles) {
    if (!baselineFiles.includes(name)) rows.push({ name, status: 'new', pct: null })
  }

  return rows
}

function report(rows) {
  const changed = rows.filter((r) => r.status === 'changed')
  const resized = rows.filter((r) => r.status === 'resized')
  const missing = rows.filter((r) => r.status === 'missing')
  const added = rows.filter((r) => r.status === 'new')
  const ok = rows.filter((r) => r.status === 'ok')

  console.log(`\n${rows.length} state(s) compared — ${ok.length} unchanged, `
    + `${changed.length} changed, ${resized.length} resized, `
    + `${missing.length} missing, ${added.length} new\n`)

  for (const row of [...resized, ...changed].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))) {
    if (row.status === 'resized') {
      console.log(`  ⚠ ${row.name}  dimensions changed: ${row.note}`)
    } else {
      console.log(`  ✗ ${row.name}  ${row.pct.toFixed(2)}% changed (${row.changed} px)`)
      console.log(`      diff: ${row.diffPath}`)
    }
  }
  for (const row of missing) console.log(`  ? ${row.name}  in baseline but not captured this run`)
  for (const row of added) console.log(`  + ${row.name}  captured but not in baseline (re-record to adopt)`)

  if (changed.length === 0 && resized.length === 0) {
    console.log('  No visual regressions above the '
      + `${CHANGE_THRESHOLD_PCT}% threshold.`)
  }
  console.log('')
  return changed.length + resized.length
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) { console.log(HELP); return }

  const viewports = selectViewports(options)
  // Volatile states (see appStates.mjs) render differently every run by their
  // nature, so they are never baselined unless named explicitly. Asking for one
  // by name is treated as deliberate.
  const states = options.states
    ? selectStates(options)
    : selectStates(options).filter((state) => !state.volatile)
  const log = (message) => process.stderr.write(`[snap] ${message}\n`)

  if (options.check) {
    if (!existsSync(BASELINE_DIR)) {
      throw new Error(`No baseline at ${BASELINE_DIR}. Run \`npm run qa:snap\` first.`)
    }
    const { skipped } = await capture(CURRENT_DIR, { viewports, states, log })
    const failures = report(await compare())
    if (skipped.length > 0) {
      console.log(`Skipped (state never reached): ${skipped.join(', ')}\n`)
    }
    // Unreached states are a failure too — they mean the run proved nothing
    // about those screens, which is not the same as "no regression".
    if (failures > 0 || skipped.length > 0) process.exitCode = 1
    return
  }

  const { captured, skipped } = await capture(BASELINE_DIR, { viewports, states, log })
  console.log(`\nRecorded ${captured.length} baseline image(s) in ${BASELINE_DIR}`)
  if (skipped.length > 0) {
    console.log(`Skipped (state never reached): ${skipped.join(', ')}`)
    process.exitCode = 1
  }
  console.log('')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
