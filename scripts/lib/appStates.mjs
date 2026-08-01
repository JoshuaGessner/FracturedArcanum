/**
 * The shared map of "places in the app worth measuring", plus the navigation
 * needed to reach them.
 *
 * Both QA tools import this: probe-layout.mjs (layout invariants) and
 * snap-layout.mjs (visual baselines). Keeping one definition means a new screen
 * is added once and both tools pick it up, and — more importantly — that the
 * hard-won navigation details below cannot drift out of sync between them.
 */

/**
 * Viewports. `group` lets the CLI take `--vp=desktop` rather than five names.
 * `safeArea` drives the layout's own custom properties, because headless
 * Chromium never reports real `env(safe-area-inset-*)` values.
 */
export const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900, group: 'desktop' },
  { name: 'desktop-1280x800', width: 1280, height: 800, group: 'desktop' },
  { name: 'desktop-short-1366x768', width: 1366, height: 768, group: 'desktop' },
  { name: 'desktop-wide-1920x1080', width: 1920, height: 1080, group: 'desktop' },
  { name: 'desktop-narrow-1024x768', width: 1024, height: 768, group: 'desktop' },
  { name: 'tablet-768x1024', width: 768, height: 1024, group: 'tablet' },
  { name: 'phone-393x852', width: 393, height: 852, group: 'phone', safeArea: { top: 59, bottom: 34 } },
  { name: 'phone-short-360x584', width: 360, height: 584, group: 'phone', safeArea: { top: 24, bottom: 24 } },
]

/**
 * `expect` is the selector proving the state was actually reached. It is not
 * bookkeeping: navigation clicks are best-effort, so without a positive
 * assertion a state that silently failed to open reports zero findings — or
 * captures a screenshot of the wrong screen — and looks like a pass.
 *
 * A multi-step `enter` also returns a trace: one line per step saying what it
 * found. Every step swallows its own failure by design — a missing control must
 * not abort the run — which used to mean a failed state reported the single
 * word "absent" and nothing about which of four steps produced it. The trace is
 * printed with the `state-not-reached` finding, so an intermittent failure
 * arrives already diagnosed instead of needing to be reproduced first.
 */

/** Trimmed text of the first match, or a marker when the node is absent. */
async function textOf(page, selector) {
  const node = page.locator(selector).first()
  if (await node.count() === 0) return '(absent)'
  return ((await node.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim() || '(empty)'
}

/** Wait for a selector, reporting whether it arrived rather than throwing. */
async function appeared(page, selector, timeout) {
  return page.waitForSelector(selector, { timeout }).then(() => true).catch(() => false)
}

export const STATES = [
  {
    name: 'home',
    expect: '.home-screen.screen-panel.active',
    enter: async (page) => { await gotoScreen(page, 'home') },
  },
  {
    name: 'quests',
    expect: '.quest-ledger-panel',
    enter: async (page) => {
      await gotoScreen(page, 'home')
      const clicked = await clickIfPresent(page, '.home-open-ledger-cta')
      const opened = await appeared(page, '.quest-ledger-panel', 4_000)
      return [
        `.home-open-ledger-cta clicked: ${clicked}`,
        `.quest-ledger-panel appeared: ${opened}`,
      ]
    },
  },
  {
    name: 'battle-sheet',
    expect: '.sheet-panel',
    enter: async (page) => {
      await gotoScreen(page, 'home')
      const label = await textOf(page, '.home-battle-cta-label')
      const clicked = await clickIfPresent(page, '.home-battle-cta')
      const opened = await appeared(page, '.sheet-panel', 4_000)
      return [
        `home battle CTA reads "${label}" — "Resume" means a match survived the reset`,
        `.home-battle-cta clicked: ${clicked}`,
        `.sheet-panel appeared: ${opened}`,
      ]
    },
  },
  {
    name: 'collection',
    expect: '.collection-screen.screen-panel.active',
    enter: async (page) => { await gotoScreen(page, 'collection') },
  },
  {
    name: 'shop',
    expect: '.shop-screen.screen-panel.active',
    enter: async (page) => { await gotoScreen(page, 'shop') },
  },
  {
    name: 'social',
    expect: '.social-screen.screen-panel.active',
    enter: async (page) => { await gotoScreen(page, 'social') },
  },
  {
    name: 'battle',
    expect: '.battlefield.active',
    // Starts a real AI match. `resetToShell` clears it again via the app's own
    // two-step exit before the next state, so it does not contaminate later
    // viewports. See abandonBattleIfActive.
    //
    // Excluded from visual baselines: each match deals a random hand, so the
    // frame differs by ~1.2% between runs with no code change at all. Raising
    // the diff threshold to absorb that would blind the check to real layout
    // shifts everywhere else, so the state is skipped for pixels and covered
    // by qa:probe instead, which measures geometry rather than colour.
    volatile: true,
    enter: async (page) => {
      await gotoScreen(page, 'home')
      const label = await textOf(page, '.home-battle-cta-label')
      const ctaClicked = await clickIfPresent(page, '.home-battle-cta')
      const sheetOpened = await appeared(page, '.sheet-panel', 4_000)

      // Four distinct ways this fails, and they need four different fixes: a
      // match survived the reset so the CTA resumes instead of opening the
      // sheet; the sheet never opened; the AI card is disabled because the deck
      // is short; or the match itself never started.
      const ai = page.locator('.mode-card-ai').first()
      const present = await ai.count() > 0
      const blocked = present
        ? await ai.evaluate((el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true')
        : false
      if (present && !blocked) await ai.click({ timeout: 3_000 }).catch(() => {})
      const started = await appeared(page, '.battlefield.active', 8_000)

      return [
        `home battle CTA reads "${label}" — "Resume" means a match survived the reset`,
        `.home-battle-cta clicked: ${ctaClicked}`,
        `.sheet-panel appeared: ${sheetOpened}`,
        `.mode-card-ai present: ${present}, disabled: ${blocked}`,
        `.battlefield.active appeared within 8s: ${started}`,
      ]
    },
  },
]

export function selectViewports({ viewports, all } = {}) {
  if (viewports) {
    const chosen = VIEWPORTS.filter(
      (vp) => viewports.includes(vp.name) || viewports.includes(vp.group),
    )
    if (chosen.length === 0) {
      throw new Error(
        `No viewport matched "${viewports.join(',')}". Known: ${VIEWPORTS.map((vp) => vp.name).join(', ')}`,
      )
    }
    return chosen
  }
  // Desktop by default. A default that sweeps every device is what made the
  // old harness too slow to use in a fix/verify loop.
  return all ? VIEWPORTS : VIEWPORTS.filter((vp) => vp.group === 'desktop')
}

export function selectStates({ states } = {}) {
  if (!states) return STATES
  const chosen = STATES.filter((state) => states.includes(state.name))
  if (chosen.length === 0) {
    throw new Error(
      `No state matched "${states.join(',')}". Known: ${STATES.map((s) => s.name).join(', ')}`,
    )
  }
  return chosen
}

// ── Navigation ────────────────────────────────────────────────────────────

export async function clickIfPresent(page, selector) {
  const target = page.locator(selector).first()
  if (await target.count()) {
    await target.click({ timeout: 3_000 }).catch(() => {})
    return true
  }
  return false
}

/**
 * Switch primary screens. Targets NavBar's `data-nav` attribute rather than an
 * accessible-name lookup: `getByRole` builds the accessibility tree for the
 * whole document on every call, which on this app's DOM costs orders of
 * magnitude more than the work it precedes.
 */
export async function gotoScreen(page, navId) {
  const button = page.locator(`.scene-rail [data-nav="${navId}"]`).first()
  if (await button.count()) await button.click({ timeout: 3_000 }).catch(() => {})
  await waitForSettled(page)
}

/** How long to wait for a screen transition before measuring anyway. */
export const SETTLE_TIMEOUT_MS = 3_000

/**
 * Wait for a transition to finish rather than sleeping through it.
 *
 * Four things here are easy to get wrong, and each one silently costs either
 * correctness or 30s a call:
 *
 *   1. `waitForFunction(fn, arg, options)` — options is the THIRD parameter.
 *      Passing `{ timeout }` second makes it the page function's argument and
 *      leaves the timeout at its 30s default.
 *
 *   2. "No animation is running" is never true here: the shell has permanent
 *      ambient animations (`ambientFloat` on `.app-shell::before`). Only a
 *      *finite* running animation means a transition is still in flight.
 *
 *   3. The shell's `screen-enter-*` class is not a transition marker. App.tsx
 *      holds it in `screenTransitionClass` state that is only reassigned, never
 *      cleared, so one of the four is always present.
 *
 *   4. Watching only `.screen-panel.active` misses portalled overlays.
 *      `.sheet-panel` enters with `translateY(14px) -> 0`; measuring during it
 *      once reported the sheet overflowing the viewport by 13.9px — an
 *      animation frame masquerading as a layout bug.
 */
export async function waitForSettled(page) {
  await page
    .waitForFunction(
      () => {
        const panel = document.querySelector('.screen-panel.active')
        if (!panel) return false
        return document.getAnimations().every((animation) => {
          if (animation.playState !== 'running') return true
          const iterations = animation.effect?.getComputedTiming?.().iterations
          return iterations === Infinity
        })
      },
      undefined,
      { timeout: SETTLE_TIMEOUT_MS },
    )
    .catch(() => {})
}

/**
 * Headless Chromium never reports real safe-area insets, so drive the custom
 * properties the layout actually consumes. `scroll-behavior` is forced instant
 * so a wheel assertion is readable immediately rather than mid-animation.
 *
 * Re-applied on every load — a navigation discards injected style tags.
 */
export async function applyProbeStyles(page, viewport) {
  await page.addStyleTag({
    content: `:root {
      --safe-top: ${viewport.safeArea?.top ?? 0}px;
      --safe-bottom: ${viewport.safeArea?.bottom ?? 0}px;
    }
    * { scroll-behavior: auto !important; }`,
  }).catch(() => {})
}

/**
 * Clear any match left over from a previous state or viewport.
 *
 * A server-backed match outlives the tab: it survives a reload and a brand-new
 * browser context. That is by design, and the app models the exit in two steps
 * — "Leave" on the battle screen *pauses* the match and returns to the lobby
 * (App.tsx `handleLeaveBattle`), and only Home's "Abandon" button ends it
 * (`handleAbandonBattle`, which surrenders to the server).
 *
 * Clicking only Leave leaves the match pending, which keeps HomeScreen's CTA in
 * its "Resume Battle" form. `.home-battle-cta` then re-enters the match instead
 * of opening the launch sheet, making `battle-sheet` unreachable for the rest
 * of the run. So: leave, then abandon.
 */
export async function abandonBattleIfActive(page) {
  if (await page.locator('.battlefield.active').count() > 0) {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.battlefield button, .app-shell button')]
        .find((el) => (el.textContent || '').trim() === 'Leave')
      button?.click()
    })
    await page.waitForSelector('.battlefield.active', { state: 'detached', timeout: 5_000 }).catch(() => {})
  }

  const abandoned = await page
    .waitForFunction(
      () => {
        const button = document.querySelector('.home-battle-secondary')
        if (!button) {
          const label = document.querySelector('.home-battle-cta-label')
          return !/resume|rejoin/i.test(label?.textContent ?? '')
        }
        button.click()
        return true
      },
      undefined,
      { timeout: 4_000, polling: 100 },
    )
    .then(() => true)
    .catch(() => false)

  if (!abandoned) return

  await page
    .waitForFunction(
      () => {
        const label = document.querySelector('.home-battle-cta-label')
        return !/resume|rejoin/i.test(label?.textContent ?? '')
      },
      undefined,
      { timeout: 6_000, polling: 100 },
    )
    .catch(() => {})
}

/**
 * Return the app to a freshly loaded shell. Auth lives in localStorage, so a
 * reload keeps the session while discarding every component's local state —
 * HomeScreen's `homeSubview` among them, which clicking the nav does not reset.
 */
export async function resetToShell(page, app, viewport) {
  await page.goto(app.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.screen-panel.active', { timeout: 10_000 }).catch(() => {})
  await applyProbeStyles(page, viewport)
  await abandonBattleIfActive(page)
  await waitForSettled(page)
}

/** Did we actually get where we meant to go? */
export async function reachedState(page, state) {
  if (!state.expect) return true
  return await page.locator(state.expect).first().count() > 0
}
