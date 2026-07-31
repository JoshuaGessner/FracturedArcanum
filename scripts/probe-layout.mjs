/**
 * Layout probe — fast, filterable, assertion-first.
 *
 * Companion to verify-responsive-layout.mjs, not a replacement. That script is
 * the pre-release sweep: every device, every subview, a screenshot each. This
 * one is the fix/verify loop. It answers a narrow question in a few seconds and
 * prints a verdict, so iterating on a CSS fix does not cost a full matrix run.
 *
 *   npm run qa:probe                                    # desktop, every state
 *   npm run qa:probe -- --vp=desktop-1440x900 --state=home
 *   npm run qa:probe -- --only=wheel --state=quests
 *   npm run qa:probe -- --all-viewports --full
 *
 * Design rules, learned from the sweep script's failure modes:
 *   • Filterable. Confirming one fix must not cost 284 screen states.
 *   • Text out, not pixels. Findings are assertions with numbers. Screenshots
 *     are written to disk only when asked for, never inlined.
 *   • Budgeted output. Default prints at most MAX_LINES lines of findings; the
 *     complete record goes to .layout-qa/probe.json.
 *   • Failures name a cause. Every finding is attributed to the CSS declaration
 *     that produced the offending value, plus the resolved value of any custom
 *     property it depends on — because in this codebase the rule is usually
 *     right and the variable is wrong.
 *   • A fresh browser context per viewport, so one bad state cannot poison the
 *     rest of the run.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'
import { attributeProperty, customPropertiesIn } from './lib/cssAttribution.mjs'
import { installProbe } from './lib/layoutInvariants.mjs'
import { ensureAuthenticated, findBrowserExecutable, startApp } from './lib/qa-app.mjs'
import {
  STATES,
  reachedState,
  resetToShell,
  selectStates,
  selectViewports,
  waitForSettled,
} from './lib/appStates.mjs'

const OUTPUT_DIR = path.resolve('.layout-qa')
const MAX_LINES = 40
/** Landmark centres must agree within this many px. */
const CENTER_TOLERANCE = 1
/** Wheel delta and how long to wait for the compositor to apply it. */
const WHEEL_DELTA = 240
const WHEEL_SETTLE_MS = 700


const CHECKS = ['centering', 'overlay', 'wheel']

/**
 * Hard ceiling on one state, entry plus checks.
 *
 * Every individual state completes in a few seconds, so anything approaching
 * this is wedged rather than slow. Without the ceiling one bad state takes the
 * whole run with it and reports nothing at all — which is precisely the failure
 * mode that made the old sweep unusable.
 */
const STATE_BUDGET_MS = 45_000

/** Reject with a clear label rather than hanging forever. */
function withBudget(promise, label, ms = STATE_BUDGET_MS) {
  let timer
  const budget = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms budget`)), ms)
  })
  return Promise.race([promise, budget]).finally(() => clearTimeout(timer))
}

// ── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = {
    viewports: null,
    states: null,
    checks: null,
    all: false,
    full: false,
    shots: false,
  }
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=')
    if (key === 'vp' || key === 'viewport') options.viewports = value.split(',')
    else if (key === 'state' || key === 'route') options.states = value.split(',')
    else if (key === 'only' || key === 'check') options.checks = value.split(',')
    else if (key === 'all-viewports') options.all = true
    else if (key === 'full') options.full = true
    else if (key === 'shots') options.shots = true
    else if (key === 'help') options.help = true
  }
  return options
}


// ── CDP attribution ───────────────────────────────────────────────────────

async function attribute(cdp, documentNodeId, selector, properties) {
  const found = await cdp.send('DOM.querySelector', { nodeId: documentNodeId, selector }).catch(() => null)
  if (!found?.nodeId) return null
  const matched = await cdp
    .send('CSS.getMatchedStylesForNode', { nodeId: found.nodeId })
    .catch(() => null)
  if (!matched) return null

  const out = []
  for (const property of properties) {
    const result = attributeProperty(matched, property)
    if (result) out.push(result)
  }
  return out
}

/** Resolve the custom properties an attributed declaration depends on. */
async function resolveVars(page, selector, attributions) {
  const names = [...new Set(attributions.flatMap((entry) => customPropertiesIn(entry.declaration)))]
  if (names.length === 0) return {}
  return page.evaluate(
    ({ selector: sel, names: wanted }) => {
      const el = document.querySelector(sel)
      if (!el) return {}
      const style = getComputedStyle(el)
      const out = {}
      for (const name of wanted) out[name] = style.getPropertyValue(name).trim() || '(unset)'
      return out
    },
    { selector, names },
  )
}

// ── Checks ────────────────────────────────────────────────────────────────

async function checkCentering(page, cdp, documentNodeId) {
  const findings = []
  const alignment = await page.evaluate(() => window.__qaProbe.landmarkAlignment())

  if (alignment.spread > CENTER_TOLERANCE) {
    // Name the landmark furthest from the viewport centre — that is the one to
    // look at, whichever direction the disagreement runs.
    const worst = [...alignment.landmarks].sort(
      (a, b) => Math.abs(b.offsetFromViewportCenter) - Math.abs(a.offsetFromViewportCenter),
    )[0]
    const attributions = worst
      ? await attribute(cdp, documentNodeId, `.${worst.selector.split('.').slice(1).join('.')}`, [
        'margin-left', 'margin-right', 'max-width', 'width', 'justify-self', 'padding-left', 'padding-right',
      ]).catch(() => null)
      : null
    findings.push({
      check: 'centering',
      kind: 'landmark-center-mismatch',
      severity: 'fail',
      summary: `Chrome landmarks disagree on the horizontal centre by ${alignment.spread}px`,
      detail: alignment.landmarks.map(
        (entry) => `${entry.name} centre=${entry.center} (${entry.offsetFromViewportCenter >= 0 ? '+' : ''}${entry.offsetFromViewportCenter} vs viewport) w=${entry.box.width}`,
      ),
      worst: worst?.name,
      attributions: attributions ?? [],
    })
  }

  const asymmetric = await page.evaluate(() => window.__qaProbe.symmetry())
  for (const entry of asymmetric) {
    const selector = `[data-qa-center-id="${entry.id}"]`
    const attributions = (await attribute(cdp, documentNodeId, selector, [
      'margin-left', 'margin-right', 'justify-self', 'align-self', 'max-width',
    ])) ?? []
    // Only asymmetry that *declares* centring intent is a bug. `margin: auto`
    // resolves to a used px value in computed style, so intent can only be read
    // from the authored declaration — which is what attribution gives us.
    const declaresCentering = attributions.some(
      (item) => /auto/.test(item.declaration) && /^margin-(left|right|inline)/.test(item.property)
        || /center/.test(item.declaration) && item.property === 'justify-self',
    )
    if (!declaresCentering) continue
    findings.push({
      check: 'centering',
      kind: 'declared-centered-but-offset',
      severity: 'fail',
      summary: `${entry.selector} declares centring but sits ${entry.delta}px off centre in ${entry.parentSelector}`,
      detail: [`leftGap=${entry.leftGap} rightGap=${entry.rightGap} slack=${entry.slack} width=${entry.box.width}`],
      attributions,
    })
  }
  return findings
}

async function checkOverlays(page, cdp, documentNodeId) {
  const { overlays } = await page.evaluate(() => window.__qaProbe.overlays())
  const findings = []

  for (const overlay of overlays) {
    const selector = `[data-qa-overlay-id="${overlay.id}"]`
    const escaped = Object.entries(overlay.overflow).filter(([, px]) => px > 1)

    if (escaped.length > 0) {
      const attributions = (await attribute(cdp, documentNodeId, selector, [
        'max-height', 'height', 'top', 'bottom', 'position', 'align-items', 'padding-bottom',
      ])) ?? []
      const vars = await resolveVars(page, selector, attributions)
      findings.push({
        check: 'overlay',
        kind: 'overlay-escapes-viewport',
        severity: 'fail',
        summary: `${overlay.selector} escapes the visible viewport (${escaped.map(([edge, px]) => `${edge} by ${px}px`).join(', ')})`,
        detail: [
          `box top=${overlay.box.top} bottom=${overlay.box.bottom} height=${overlay.box.height}`,
          `position=${overlay.positionUsed} max-height=${overlay.maxHeightUsed} scrollsY=${overlay.scrollsY} content=${overlay.scrollHeight}/${overlay.clientHeight}`,
        ],
        attributions,
        resolvedVars: vars,
      })
    }

    if (overlay.unreachable.length > 0) {
      findings.push({
        check: 'overlay',
        kind: 'overlay-action-unreachable',
        severity: 'fail',
        summary: `${overlay.selector} has ${overlay.unreachable.length} action(s) the player cannot reach`,
        detail: overlay.unreachable.map(
          (action) => `${action.selector} "${action.text}" visibleHeight=${action.visibleHeight}/${action.box.height}`,
        ),
        attributions: [],
      })
    }

    if (overlay.contentOverflows && !overlay.scrollsY) {
      findings.push({
        check: 'overlay',
        kind: 'overlay-content-clipped',
        severity: 'fail',
        summary: `${overlay.selector} content overflows but the overlay does not scroll`,
        detail: [`scrollHeight=${overlay.scrollHeight} clientHeight=${overlay.clientHeight} overflow-y is not auto/scroll`],
        attributions: (await attribute(cdp, documentNodeId, selector, ['overflow-y', 'max-height'])) ?? [],
      })
    }
  }
  return findings
}

/**
 * The wheel check. Everything else here reads computed style; this one dispatches
 * a real wheel event through the browser's input pipeline, which is the only way
 * to tell "declared scrollable" apart from "scrollable by a mouse".
 */
async function checkWheel(page, cdp, documentNodeId) {
  const candidates = await page.evaluate(() => window.__qaProbe.scrollCandidates())
  const findings = []
  // Passing scrollers are recorded too. Without them a run that found no
  // scroll containers at all is indistinguishable from one where every
  // container scrolled correctly — and those need very different follow-up.
  const passed = []

  for (const candidate of candidates) {
    const selector = `[data-qa-scroll-id="${candidate.id}"]`

    if (!candidate.reachable) {
      findings.push({
        check: 'wheel',
        kind: 'scroller-not-reachable',
        severity: 'fail',
        summary: `${candidate.selector} scrolls but is clipped to ${candidate.visible.width}x${candidate.visible.height} — no room to point at it`,
        detail: [`box=${JSON.stringify(candidate.box)} visible=${JSON.stringify(candidate.visible)}`],
        attributions: (await attribute(cdp, documentNodeId, selector, ['overflow-y', 'height', 'max-height'])) ?? [],
      })
      continue
    }

    // Distinct verdict, as promised: something sitting on top of the scroller
    // has a completely different fix from a scroller that ignores the wheel.
    if (!candidate.hitIsSelfOrDescendant) {
      findings.push({
        check: 'wheel',
        kind: 'scroller-covered',
        severity: 'fail',
        summary: `${candidate.selector} is covered at its centre by ${candidate.hitSelector} — the wheel will never reach it`,
        detail: [`probe point (${candidate.point.x}, ${candidate.point.y}) hit-tests to ${candidate.hitSelector}`],
        attributions: (await attribute(cdp, documentNodeId, selector, ['overflow-y', 'pointer-events', 'z-index'])) ?? [],
      })
      continue
    }

    await page.evaluate((id) => window.__qaProbe.resetScrollTop(id), candidate.id)
    const before = await page.evaluate((id) => window.__qaProbe.readScrollTop(id), candidate.id)

    await page.mouse.move(candidate.point.x, candidate.point.y)
    await page.mouse.wheel(0, WHEEL_DELTA)

    // Wheel scrolling is composited and async — `wheel()` resolves when the
    // event is dispatched, not when the scroll is applied. Polling for the
    // change is what keeps this from flaking.
    const moved = await page
      .waitForFunction(
        ({ id, from }) => window.__qaProbe.readScrollTop(id) !== from,
        { id: candidate.id, from: before },
        { timeout: WHEEL_SETTLE_MS, polling: 50 },
      )
      .then(() => true)
      .catch(() => false)

    const after = await page.evaluate((id) => window.__qaProbe.readScrollTop(id), candidate.id)

    if (moved) {
      passed.push({
        selector: candidate.selector,
        scrolled: `${before} -> ${after}`,
        content: `${candidate.scrollHeight}/${candidate.clientHeight}`,
      })
    }

    if (!moved) {
      // Separate a scroller the wheel cannot drive from one that cannot scroll
      // at all — the latter means the geometry, not the input, is wrong.
      const programmatic = await page.evaluate(
        (id) => window.__qaProbe.canScrollProgrammatically(id),
        candidate.id,
      )
      findings.push({
        check: 'wheel',
        kind: programmatic ? 'wheel-has-no-effect' : 'scroller-cannot-scroll',
        severity: 'fail',
        summary: programmatic
          ? `${candidate.selector} ignores the mouse wheel although it scrolls programmatically`
          : `${candidate.selector} reports overflow but cannot scroll at all`,
        detail: [
          `scrollTop ${before} -> ${after} after ${WHEEL_DELTA}px wheel at (${candidate.point.x}, ${candidate.point.y})`,
          `content=${candidate.scrollHeight}/${candidate.clientHeight} overflow-y=${candidate.overflowY} overscroll-behavior-y=${candidate.overscrollBehaviorY}`,
        ],
        attributions: (await attribute(cdp, documentNodeId, selector, [
          'overflow-y', 'overscroll-behavior-y', 'height', 'max-height', 'touch-action',
        ])) ?? [],
      })
    }

    await page.evaluate((id) => window.__qaProbe.resetScrollTop(id), candidate.id)
  }

  return { findings, checked: candidates.length, passed }
}

// ── Reporting ─────────────────────────────────────────────────────────────

function formatFinding(finding, options) {
  const lines = [`  ✗ [${finding.check}] ${finding.summary}`]
  for (const detail of finding.detail ?? []) lines.push(`      ${detail}`)
  for (const item of finding.attributions ?? []) {
    const conditions = [
      ...(item.media ?? []).map((text) => `@media ${text}`),
      ...(item.containerQueries ?? []).map((text) => `@container ${text}`),
    ]
    const suffix = conditions.length ? `  [${conditions.join(' ')}]` : ''
    lines.push(`      ← ${item.selector} { ${item.declaration} }${suffix}`)
  }
  for (const [name, value] of Object.entries(finding.resolvedVars ?? {})) {
    lines.push(`        ${name} = ${value}`)
  }
  return options.full ? lines : lines.slice(0, 6)
}

function report(results, options) {
  const all = results.flatMap((entry) =>
    entry.findings.map((finding) => ({ ...finding, viewport: entry.viewport, state: entry.state })))

  const states = results.length
  const checkedScrollers = results.reduce((sum, entry) => sum + (entry.scrollersChecked ?? 0), 0)
  console.log(`\nProbed ${states} state(s); ${checkedScrollers} scroll container(s) wheel-tested.`)

  if (all.length === 0) {
    console.log('All invariants passed.\n')
    return 0
  }

  const grouped = new Map()
  for (const finding of all) {
    const key = `${finding.viewport} · ${finding.state}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(finding)
  }

  console.log(`${all.length} finding(s):\n`)
  let printed = 0
  let truncated = false
  for (const [key, findings] of grouped) {
    if (printed >= MAX_LINES && !options.full) { truncated = true; break }
    console.log(`${key}`)
    for (const finding of findings) {
      const lines = formatFinding(finding, options)
      if (printed + lines.length > MAX_LINES && !options.full) { truncated = true; break }
      console.log(lines.join('\n'))
      printed += lines.length
    }
    console.log('')
  }
  if (truncated) {
    console.log(`… output truncated at ${MAX_LINES} lines. Re-run with --full, or read .layout-qa/probe.json.\n`)
  }
  return all.length
}

// ── One state ─────────────────────────────────────────────────────────────

/**
 * Drive the app into one state and run the selected checks against it.
 * Pure of the run loop so it can be wrapped in a timeout budget.
 */
async function probeState({ page, cdp, app, viewport, state, checks, options }) {
  const timings = {}
  const timed = async (name, fn) => {
    const started = Date.now()
    const value = await fn()
    timings[name] = Date.now() - started
    return value
  }

  // Reload before each state. Subview position (HomeScreen's `homeSubview`,
  // for one) is React state that clicking the nav does not reset, so without
  // this the quests view leaks into the next state and its entry selector is
  // silently absent.
  await timed('reset', () => resetToShell(page, app, viewport))
  await timed('enter', async () => {
    await state.enter(page)
    await waitForSettled(page)
  })

  // The document node must be re-fetched after DOM changes, or
  // DOM.querySelector resolves against a stale document.
  //
  // `depth: 0` deliberately: depth -1 serialises the entire DOM tree over the
  // protocol on every state, which on this app's tree costs far more than
  // every check combined. DOM.querySelector pushes the nodes it needs.
  const { root } = await timed('getDocument', () => cdp.send('DOM.getDocument', { depth: 0 }))

  const findings = []
  let scrollersChecked = 0
  let scrollersPassed = []

  // Prove we got where we meant to go before trusting any measurement.
  const reached = await reachedState(page, state)
  if (!reached) {
    findings.push({
      check: 'state',
      kind: 'state-not-reached',
      severity: 'blocked',
      summary: `state "${state.name}" was never reached — "${state.expect}" is absent, so its checks proved nothing`,
      detail: ['Navigation is best-effort; the entry control was missing or did not respond.'],
      attributions: [],
    })
  }

  if (reached && checks.includes('centering')) {
    findings.push(...await timed('centering', () => checkCentering(page, cdp, root.nodeId)))
  }
  if (reached && checks.includes('overlay')) {
    findings.push(...await timed('overlay', () => checkOverlays(page, cdp, root.nodeId)))
  }
  if (reached && checks.includes('wheel')) {
    const wheel = await timed('wheel', () => checkWheel(page, cdp, root.nodeId))
    findings.push(...wheel.findings)
    scrollersChecked = wheel.checked
    scrollersPassed = wheel.passed
  }

  if (options.shots) {
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `probe-${viewport.name}-${state.name}.png`),
    })
  }

  return { findings, scrollersChecked, scrollersPassed, timings }
}

// ── Main ──────────────────────────────────────────────────────────────────

const HELP = `
Layout probe — targeted layout invariants with CSS rule attribution.

  --vp=<name|group>       Viewport(s). Groups: desktop, tablet, phone.
                          Default: desktop only.
  --state=<name,...>      State(s): ${STATES.map((s) => (s.optIn ? `${s.name} (opt-in)` : s.name)).join(', ')}
  --only=<check,...>      Check(s): ${CHECKS.join(', ')}
  --all-viewports         Every viewport rather than just desktop.
  --full                  Print every finding line, no budget.
  --shots                 Also write a PNG per state to .layout-qa/.
  --help

  QA_URL=http://…         Probe an already-running app instead of booting one.
`

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) { console.log(HELP); return }

  const viewports = selectViewports(options)
  const states = selectStates(options)
  const checks = options.checks ?? CHECKS
  for (const check of checks) {
    if (!CHECKS.includes(check)) throw new Error(`Unknown check "${check}". Known: ${CHECKS.join(', ')}`)
  }

  await mkdir(OUTPUT_DIR, { recursive: true })
  // Progress goes to stderr, which Node writes unbuffered. On stdout it would
  // be block-buffered whenever output is piped or redirected, so a long run
  // would look frozen and a hang would be indistinguishable from slow work.
  const log = (message) => process.stderr.write(`[probe] ${message}\n`)
  const app = await startApp({ log })
  const browser = await chromium.launch({ headless: true, executablePath: findBrowserExecutable() })
  const results = []

  try {
    for (const viewport of viewports) {
      // A fresh context per viewport: the old sweep shared one page across all
      // of them, so a battle that failed to exit corrupted every later result.
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      })
      await context.addInitScript(installProbe)
      const page = await context.newPage()

      try {
        await ensureAuthenticated(page, app.url, app.apiOrigin)

        const cdp = await context.newCDPSession(page)
        await cdp.send('DOM.enable')
        await cdp.send('CSS.enable')

        for (const state of states) {
          const started = Date.now()
          try {
            const outcome = await withBudget(
              probeState({ page, cdp, app, viewport, state, checks, options }),
              `${viewport.name} · ${state.name}`,
            )
            results.push({ viewport: viewport.name, state: state.name, ...outcome })
            const timingText = Object.entries(outcome.timings)
              .map(([name, ms]) => `${name}=${ms}ms`).join(' ')
            log(`${viewport.name} · ${state.name} → ${outcome.findings.length} finding(s), `
              + `${outcome.scrollersPassed.length}/${outcome.scrollersChecked} scroller(s) ok  `
              + `[${Date.now() - started}ms total; ${timingText}]`)
          } catch (error) {
            // A wedged state is a finding about the app or the harness, not a
            // reason to lose every other result in the run.
            results.push({
              viewport: viewport.name,
              state: state.name,
              findings: [{
                check: 'state',
                kind: 'state-timed-out',
                severity: 'blocked',
                summary: `state "${state.name}" exceeded its ${STATE_BUDGET_MS}ms budget and was abandoned`,
                detail: [String(error.message ?? error)],
                attributions: [],
              }],
              scrollersChecked: 0,
              scrollersPassed: [],
              timings: { total: Date.now() - started },
            })
            log(`${viewport.name} · ${state.name} → TIMED OUT after ${Date.now() - started}ms`)
          }
        }
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
    await app.stop()
  }

  await writeFile(
    path.join(OUTPUT_DIR, 'probe.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
  )
  const count = report(results, options)
  console.log(`Full record: ${path.join(OUTPUT_DIR, 'probe.json')}`)
  if (count > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
