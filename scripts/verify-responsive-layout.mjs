/**
 * Pre-release responsive sweep: the full device matrix, every subview, a
 * screenshot each.
 *
 * This is the slow gate, not the iteration tool. For the fix/verify loop use
 * `npm run qa:probe`, which answers a narrow question in about a second per
 * state and attributes each failure to the CSS declaration behind it.
 *
 *   npm run qa:viewport                       # whole matrix
 *   npm run qa:viewport -- --vp=iphone-15-393x852
 *   npm run qa:viewport -- --route=shop,social
 *   npm run qa:viewport -- --full             # every result in the JSON,
 *                                             # not just the failures
 *
 * Server boot and authentication come from scripts/lib/qa-app.mjs, shared with
 * the probe. They used to be a second inline copy here, which is how this
 * script ended up still pointing at a `qa_tester` account that does not exist —
 * every run would have failed at sign-in.
 */
// Node 22+ strips TypeScript types natively, so the pure scaling helpers can
// be shared with the unit tests instead of duplicated here.
import {
  SCALING_PROBE_WIDTHS,
  SCALING_TARGETS,
  findScalingInversions,
  formatInversion,
} from '../src/utils/layoutScaling.ts'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'
import { ensureAuthenticated, findBrowserExecutable, startApp } from './lib/qa-app.mjs'

const OUTPUT_DIR = path.resolve('.layout-qa')
/**
 * Device matrix.
 *
 * `chromeHeight` is how much vertical space the browser toolbar occupies when
 * it is expanded. Every phone is exercised at BOTH heights, because the bugs
 * that reached players only appear in one of the two states: with the toolbar
 * expanded the app is short and the hand clips; with it retracted the layout
 * grows past the initial containing block and the nav bar falls off the
 * bottom. A single fixed viewport per device — what this harness used to do —
 * cannot see either failure.
 *
 * `safeArea` is applied by overriding the --safe-* custom properties, since
 * headless Chromium never reports real `env(safe-area-inset-*)` values. The
 * zero case is not redundant: Safari reports 0 for the bottom inset whenever
 * the toolbar is hidden, which is exactly when the nav bar needs the padding
 * most.
 */
const VIEWPORTS = [
  { name: 'phone-360x640', width: 360, height: 640, chromeHeight: 56, safeArea: { top: 24, bottom: 24 } },
  { name: 'iphone-se-375x667', width: 375, height: 667, chromeHeight: 88, safeArea: { top: 20, bottom: 0 } },
  { name: 'portrait-394x724', width: 394, height: 724, chromeHeight: 88, safeArea: { top: 44, bottom: 34 } },
  { name: 'iphone-15-393x852', width: 393, height: 852, chromeHeight: 96, safeArea: { top: 59, bottom: 34 } },
  { name: 'pixel-8-412x915', width: 412, height: 915, chromeHeight: 56, safeArea: { top: 24, bottom: 48 } },
  { name: 'large-phone-430x932', width: 430, height: 932, chromeHeight: 96, safeArea: { top: 59, bottom: 34 } },
  { name: 'tablet-768x1024', width: 768, height: 1024, safeArea: { top: 24, bottom: 20 } },
  { name: 'desktop-narrow-1024x768', width: 1024, height: 768 },
  { name: 'desktop-short-1366x768', width: 1366, height: 768 },
  { name: 'desktop-wide-1440x900', width: 1440, height: 900 },
]

/**
 * Expand each device into the browser-chrome states it actually ships in.
 * Devices without a `chromeHeight` (tablet, desktop) have no retracting
 * toolbar and yield a single case.
 */
function expandViewports(viewports) {
  return viewports.flatMap((viewport) => {
    const base = { ...viewport, safeArea: viewport.safeArea ?? { top: 0, bottom: 0 } }
    if (!viewport.chromeHeight) return [base]

    return [
      // Toolbar expanded: the shortest the app ever gets.
      {
        ...base,
        name: `${viewport.name}-toolbar`,
        height: viewport.height - viewport.chromeHeight,
      },
      // Toolbar retracted: full height, and on iOS the bottom safe-area
      // inset collapses to 0 in this state.
      {
        ...base,
        name: `${viewport.name}-fullscreen`,
        safeArea: { ...base.safeArea, bottom: 0 },
      },
    ]
  })
}

const ROUTES = [
  { id: 'home', label: 'Home' },
  { id: 'collection', label: 'Collection' },
  { id: 'social', label: 'Social', subviews: ['Overview', 'Friends', 'Rankings', 'Clan', 'Trades'] },
  { id: 'shop', label: 'Shop', subviews: ['Overview', 'Vault', 'Packs', 'Themes', 'Borders', 'Breakdown'] },
  { id: 'settings', label: 'Settings', subviews: ['Overview', 'Preferences', 'Support'] },
]

const CLIPPED_SELECTOR = [
  '.section-card', '.utility-card', '.spotlight-card', '.shop-market-card',
  '.settings-command-card', '.settings-section-panel', '.shop-section-panel', '.social-list',
  '.leaderboard-list', '.deck-roster', '.builder-card', '.theme-offer-card', '.battlefield-stage',
  '.battle-hand-rail',
].join(', ')

const TEXT_SELECTOR = [
  'button', '.badge', '.deck-status', '.shop-resource-chip', '.settings-status-chip', '.scene-link-label',
  '.slot-head strong', '.builder-card-meta-compact', '.builder-card-meta-full', '.card-name', '.note', '.mini-text',
  '.shop-hub-panel strong', '.settings-hub-tile strong', '.social-info-bar-label', '.subview-label',
].join(', ')

function qaLog(message) {
  console.log(`[viewport-qa] ${message}`)
}


async function clickPrimaryScreen(page, label) {
  const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).last()
  if (await button.count()) {
    await button.click()
    await page.waitForTimeout(560)
  }
}

async function clickSubview(page, label) {
  const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first()
  if (await button.count()) {
    await button.click()
    await page.waitForTimeout(560)
  }
}

/* SCALING_PROBE_WIDTHS / SCALING_TARGETS are imported from
   src/utils/layoutScaling.ts so the harness and the unit tests cannot drift. */

/** Measure each target's box width and the font-size of its label. */
async function collectComponentScaling(page) {
  return page.evaluate(({ targets }) => {
    const out = {}
    for (const target of targets) {
      const box = document.querySelector(target.box)
      const text = document.querySelector(target.text)
      if (!box || !text) continue
      const rect = box.getBoundingClientRect()
      if (rect.width < 1) continue
      out[target.name] = {
        width: Math.round(rect.width),
        fontSize: Math.round(parseFloat(getComputedStyle(text).fontSize) * 100) / 100,
      }
    }
    return out
  }, { targets: SCALING_TARGETS })
}

/* findScalingInversions lives in src/utils/layoutScaling.ts — it is pure, so
   it is unit-tested in `npm test` rather than only here. */

/**
 * The two failures players actually reported: "I can't see my hand" and
 * "the bottom nav bar is missing".
 *
 * Both are measured against `window.visualViewport` rather than the layout
 * viewport. That distinction is the whole point — when the iOS toolbar
 * retracts, the layout viewport grows while the visible region does not, so a
 * layout-viewport check reports a nav bar that no player can actually see as
 * being perfectly in frame.
 */
async function collectDockVisibility(page, contextLabel) {
  return page.evaluate(({ contextLabel: label }) => {
    const vv = window.visualViewport
    const view = {
      width: Math.round(vv?.width ?? window.innerWidth),
      height: Math.round(vv?.height ?? window.innerHeight),
      offsetTop: Math.round(vv?.offsetTop ?? 0),
    }

    // Anything below this line is off the visible screen, whatever the layout
    // viewport believes.
    const visibleBottom = view.offsetTop + view.height
    const issues = []

    const check = (element, name, { requireFully = true } = {}) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return null

      const overflowBottom = Math.round(rect.bottom - visibleBottom)
      const overflowTop = Math.round(view.offsetTop - rect.top)
      const record = {
        name,
        rect: {
          x: Math.round(rect.x), y: Math.round(rect.y),
          width: Math.round(rect.width), height: Math.round(rect.height),
        },
        overflowBottom,
        overflowTop,
      }

      // 1px of tolerance absorbs subpixel rounding at fractional DPRs.
      if (requireFully && overflowBottom > 1) {
        issues.push({ ...record, kind: 'clipped-bottom' })
      }
      if (requireFully && overflowTop > 1) {
        issues.push({ ...record, kind: 'clipped-top' })
      }
      return record
    }

    const navRect = check(document.querySelector('.scene-rail'), 'nav-bar')
    check(document.querySelector('.topbar'), 'top-bar')

    // Every hand card must be fully visible. The old layout clipped the
    // bottom of all of them by a fixed number of pixels, so checking only
    // the first or last card would have missed nothing — but checking all of
    // them is what catches a partial overlap regression later.
    const handCards = [...document.querySelectorAll('.battle-hand-rail .hand-card')]
    handCards.forEach((card, index) => check(card, `hand-card-${index}`))

    // A hand rail whose content is taller than its own box is clipping even
    // if the rail itself sits inside the viewport.
    const rail = document.querySelector('.battle-hand-rail')
    if (rail && rail.scrollHeight > rail.clientHeight + 1) {
      issues.push({
        name: 'hand-rail',
        kind: 'content-overflows-rail',
        scrollHeight: rail.scrollHeight,
        clientHeight: rail.clientHeight,
      })
    }

    // Touch-target floor. 44px is the documented minimum; the old nav shrank
    // to 40px on short screens specifically to fit six tabs.
    const smallTargets = [...document.querySelectorAll('.scene-link, .topbar-settings-btn, .home-battle-cta')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.height > 0 && rect.height < 44)
      .map(({ element, rect }) => ({
        name: element.className,
        kind: 'target-below-44px',
        height: Math.round(rect.height),
      }))

    return {
      contextLabel: label,
      visualViewport: view,
      layoutViewport: { width: window.innerWidth, height: window.innerHeight },
      navRect,
      handCardCount: handCards.length,
      issues: [...issues, ...smallTargets],
    }
  }, { contextLabel })
}
async function collectLayoutMetrics(page, contextLabel) {
  return page.evaluate(({ clippedSelector, textSelector, contextLabel: label }) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const documentOverflowX = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - viewport.width
    const active = document.querySelector('.screen-panel.active')
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const summarize = (element) => {
      const rect = element.getBoundingClientRect()
      return {
        selector: element.className && typeof element.className === 'string' ? element.className : element.tagName.toLowerCase(),
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 110),
        rect: {
          x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height),
        },
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }
    }
    const summarizeRect = (rect) => ({
      x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height),
    })

    const isClippingX = (style) => /(hidden|clip)/.test(style.overflowX)
    const isClippingY = (style) => /(hidden|clip)/.test(style.overflowY)
    const isScrollableX = (element) => {
      const style = getComputedStyle(element)
      return /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 2
    }
    const isScrollableY = (element) => {
      const style = getComputedStyle(element)
      return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 2
    }
    const hasScrollableAncestor = (element, axis) => {
      let current = element.parentElement
      while (current && current !== document.body) {
        if (axis === 'x' && isScrollableX(current)) return true
        if (axis === 'y' && isScrollableY(current)) return true
        current = current.parentElement
      }
      return false
    }

    const clippedContainers = [...document.querySelectorAll(clippedSelector)]
      .filter((element) => {
        if (!visible(element)) return false
        const style = getComputedStyle(element)
        const clipsX = isClippingX(style)
        const clipsY = isClippingY(style)
        return (clipsX && element.scrollWidth > element.clientWidth + 2) || (clipsY && element.scrollHeight > element.clientHeight + 2)
      })
      .slice(0, 12)
      .map(summarize)

    const clippedText = [...document.querySelectorAll(textSelector)]
      .filter((element) => {
        if (!visible(element)) return false
        const text = (element.textContent || '').trim()
        if (text.length < 2) return false
        const style = getComputedStyle(element)
        return (isClippingX(style) && element.scrollWidth > element.clientWidth + 2)
          || (isClippingY(style) && element.scrollHeight > element.clientHeight + 2)
      })
      .slice(0, 16)
      .map(summarize)

    const offscreenInteractive = [...document.querySelectorAll('button, input, select, textarea, a[href]')]
      .filter((element) => {
        if (!visible(element)) return false
        const rect = element.getBoundingClientRect()
        const escapedHorizontally = rect.left < -2 || rect.right > viewport.width + 2
        const escapedVertically = rect.bottom < -2 || rect.top > viewport.height + 2
        return (escapedHorizontally && !hasScrollableAncestor(element, 'x'))
          || (escapedVertically && !hasScrollableAncestor(element, 'y'))
      })
      .slice(0, 8)
      .map(summarize)

    const smallTouchTargets = [...document.querySelectorAll('button, input, select, textarea, a[href]')]
      .filter((element) => {
        if (!visible(element)) return false
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const isIcon = element.classList.contains('icon-only') || element.classList.contains('mini')
        const isCompactInput = element instanceof HTMLInputElement && /^(checkbox|radio)$/.test(element.type)
        return !isIcon && !isCompactInput && style.pointerEvents !== 'none' && (rect.width < 40 || rect.height < 32)
      })
      .slice(0, 10)
      .map(summarize)

    const layoutConflicts = []
    const intersectRects = (first, second) => ({
      top: Math.max(first.top, second.top),
      right: Math.min(first.right, second.right),
      bottom: Math.min(first.bottom, second.bottom),
      left: Math.max(first.left, second.left),
    })
    const getVisibleClipRect = (element) => {
      let clip = { top: 0, right: viewport.width, bottom: viewport.height, left: 0 }
      let current = element.parentElement
      while (current && current !== document.body) {
        const style = getComputedStyle(current)
        if (current.classList.contains('hand-card')) {
          current = current.parentElement
          continue
        }
        const clipsX = /(hidden|clip|auto|scroll)/.test(style.overflowX)
        const clipsY = /(hidden|clip|auto|scroll)/.test(style.overflowY)
        if (clipsX || clipsY) {
          const rect = current.getBoundingClientRect()
          clip = intersectRects(clip, {
            top: clipsY ? rect.top : clip.top,
            right: clipsX ? rect.right : clip.right,
            bottom: clipsY ? rect.bottom : clip.bottom,
            left: clipsX ? rect.left : clip.left,
          })
        }
        current = current.parentElement
      }
      return clip
    }
    const isHorizontallyVisibleInClip = (rect, clip) => rect.right > clip.left + 2 && rect.left < clip.right - 2

    document.querySelectorAll('.battle-hand-rail .hand-card').forEach((card, cardIndex) => {
      if (!visible(card)) return
      const cardRect = card.getBoundingClientRect()
      const cardClip = getVisibleClipRect(card)
      if (!isHorizontallyVisibleInClip(cardRect, cardClip)) return
      card.querySelectorAll('.card-top, .cost-pill, .battle-hand-effect').forEach((target) => {
        if (!visible(target)) return
        const targetRect = target.getBoundingClientRect()
        const targetClip = getVisibleClipRect(target)
        if (!isHorizontallyVisibleInClip(targetRect, targetClip)) return
        const topCrop = targetClip.top - targetRect.top
        const bottomCrop = targetRect.bottom - targetClip.bottom
        if (topCrop > 1 || bottomCrop > 1) {
          layoutConflicts.push({
            type: 'battle-hand-card-top-clipped',
            selector: target.className && typeof target.className === 'string' ? target.className : target.tagName.toLowerCase(),
            text: `Battle hand card ${cardIndex + 1} top controls are clipped by an overflow container.`,
            rect: summarizeRect(targetRect),
            clipRect: summarizeRect({
              x: targetClip.left,
              y: targetClip.top,
              width: Math.max(0, targetClip.right - targetClip.left),
              height: Math.max(0, targetClip.bottom - targetClip.top),
            }),
            topCrop: Math.round(topCrop),
            bottomCrop: Math.round(bottomCrop),
          })
        }
      })
    })

    const vaultPanel = document.querySelector('.reward-vault-card')
    const vaultToolbar = document.querySelector('.reward-vault-card .shop-section-toolbar')
    const vaultConsole = document.querySelector('.reward-vault-console')
    const vaultMedallion = document.querySelector('.reward-vault-medallion')
    if (vaultPanel && vaultToolbar && vaultConsole && vaultMedallion && visible(vaultPanel)) {
      const panelRect = vaultPanel.getBoundingClientRect()
      const toolbarRect = vaultToolbar.getBoundingClientRect()
      const consoleRect = vaultConsole.getBoundingClientRect()
      const medallionRect = vaultMedallion.getBoundingClientRect()
      if (consoleRect.left < panelRect.left - 2 || consoleRect.right > panelRect.right + 2) {
        layoutConflicts.push({
          type: 'vault-console-width',
          selector: 'reward-vault-console',
          text: 'Reward Vault console does not fit inside the Vault panel.',
          rect: { x: Math.round(consoleRect.x), y: Math.round(consoleRect.y), width: Math.round(consoleRect.width), height: Math.round(consoleRect.height) },
          panelRect: { x: Math.round(panelRect.x), y: Math.round(panelRect.y), width: Math.round(panelRect.width), height: Math.round(panelRect.height) },
        })
      }
      if (medallionRect.top < toolbarRect.bottom + 4) {
        layoutConflicts.push({
          type: 'vault-medallion-toolbar-overlap',
          selector: 'reward-vault-medallion',
          text: 'Reward Vault medallion overlaps or tucks under the sticky toolbar.',
          rect: { x: Math.round(medallionRect.x), y: Math.round(medallionRect.y), width: Math.round(medallionRect.width), height: Math.round(medallionRect.height) },
          toolbarRect: { x: Math.round(toolbarRect.x), y: Math.round(toolbarRect.y), width: Math.round(toolbarRect.width), height: Math.round(toolbarRect.height) },
        })
      }
    }

    return {
      contextLabel: label,
      viewport,
      documentOverflowX,
      activePanel: active ? summarize(active) : null,
      clippedContainers,
      clippedText,
      offscreenInteractive,
      smallTouchTargets,
      layoutConflicts,
    }
  }, { clippedSelector: CLIPPED_SELECTOR, textSelector: TEXT_SELECTOR, contextLabel })
}

function hasFailures(metrics) {
  return !metrics.activePanel
    || metrics.documentOverflowX > 2
    || metrics.clippedContainers.length > 0
    || metrics.clippedText.length > 0
    || metrics.offscreenInteractive.length > 0
    || metrics.layoutConflicts.length > 0
}

async function collectBattleHandHoverMetrics(page, viewportName) {
  const cards = page.locator('.battle-hand-rail .hand-card')
  const count = await cards.count()
  if (count === 0) return []
  const hoverIndexes = [...new Set([0, Math.floor(count / 2), count - 1])]
  const hoverResults = []
  for (const index of hoverIndexes) {
    await cards.nth(index).hover()
    await page.waitForTimeout(160)
    const label = `${viewportName}-battle-ai-hand-hover-${index + 1}`
    const metrics = await collectLayoutMetrics(page, label)
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}.png`), fullPage: false })
    hoverResults.push({ viewport: viewportName, route: 'battle', subview: `AI Skirmish Hand Hover ${index + 1}`, failed: hasFailures(metrics), ...metrics })
  }
  await page.mouse.move(0, 0)
  return hoverResults
}

/**
 * `--vp=` and `--route=` narrow the matrix; `--full` keeps every result in the
 * JSON report instead of failures only. The unfiltered report used to inline
 * all ~284 states with every measured rect, which made it too large to read.
 */
function parseArgs(argv) {
  const options = { viewports: null, routes: null, full: false }
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=')
    if ((key === 'vp' || key === 'viewport') && value) options.viewports = value.split(',')
    else if ((key === 'route' || key === 'state') && value) options.routes = value.split(',')
    else if (key === 'full') options.full = true
  }
  return options
}

function selectMatrix({ viewports, routes }) {
  const expanded = expandViewports(VIEWPORTS)
  const chosenViewports = viewports
    // Match the device name with or without the -toolbar / -fullscreen suffix,
    // so `--vp=iphone-15-393x852` selects both chrome states of that device.
    ? expanded.filter((vp) => viewports.some((name) => vp.name === name || vp.name.startsWith(`${name}-`)))
    : expanded
  const chosenRoutes = routes ? ROUTES.filter((route) => routes.includes(route.id)) : ROUTES

  if (chosenViewports.length === 0) {
    throw new Error(`No viewport matched "${viewports.join(',')}". Known: ${expanded.map((vp) => vp.name).join(', ')}`)
  }
  if (chosenRoutes.length === 0) {
    throw new Error(`No route matched "${routes.join(',')}". Known: ${ROUTES.map((route) => route.id).join(', ')}`)
  }
  return { viewports: chosenViewports, routes: chosenRoutes }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const matrix = selectMatrix(options)

  await rm(OUTPUT_DIR, { recursive: true, force: true })
  await mkdir(OUTPUT_DIR, { recursive: true })
  const server = await startApp({ log: qaLog })
  const executablePath = findBrowserExecutable()
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const results = []
  /** {viewport, components:{name:{width,fontSize}}} — see findScalingInversions. */
  const scalingSamples = []

  try {
    for (const viewport of matrix.viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      // Headless Chromium never reports real safe-area insets, so drive the
      // custom properties the layout actually consumes. This is what proves
      // the nav bar clears an Android gesture bar or an iPhone home indicator.
      await page.addStyleTag({
        content: `:root {
          --safe-top: ${viewport.safeArea.top}px;
          --safe-bottom: ${viewport.safeArea.bottom}px;
        }`,
      })
      await ensureAuthenticated(page, server.url, server.apiOrigin)

      for (const route of matrix.routes) {
        await clickPrimaryScreen(page, route.label)
        const contexts = route.subviews?.length ? route.subviews : [route.label]
        for (const subview of contexts) {
          if (route.subviews?.length) await clickSubview(page, subview)
          const label = `${viewport.name}-${route.id}-${subview.toLowerCase().replace(/\s+/g, '-')}`
          const metrics = await collectLayoutMetrics(page, label)
          await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}.png`), fullPage: false })
          const dock = await collectDockVisibility(page, label)
          results.push({ viewport: viewport.name, route: route.id, subview, failed: hasFailures(metrics), dock, ...metrics })
        }
      }

      // Battle now launches from the Home hub's sheet rather than a Play tab.
      await clickPrimaryScreen(page, 'Home')
      const battleCta = page.locator('.home-battle-cta').first()
      if (await battleCta.count()) await battleCta.click()
      await page.waitForTimeout(300)
      const aiButton = page.getByRole('button', { name: /AI Skirmish/i }).first()
      if (await aiButton.count()) {
        const disabled = await aiButton.evaluate((element) => element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true')
        if (!disabled) {
          await aiButton.click()
          await page.waitForTimeout(500)
          const label = `${viewport.name}-battle-ai`
          const metrics = await collectLayoutMetrics(page, label)
          await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}.png`), fullPage: false })
          const dock = await collectDockVisibility(page, label)
          results.push({ viewport: viewport.name, route: 'battle', subview: 'AI Skirmish', failed: hasFailures(metrics), dock, ...metrics })
          if (viewport.width >= 768) {
            results.push(...await collectBattleHandHoverMetrics(page, viewport.name))
          }
          const leaveButton = page.getByRole('button', { name: /^Leave$/i }).first()
          if (await leaveButton.count()) await leaveButton.click()
        }
      }
    }

    // ── Component-vs-viewport scaling sweep ─────────────────────────────
    // Separate pass with its own width list: these are breakpoint-adjacent
    // pairs rather than device sizes, and need only one screen each.
    await page.setViewportSize({ width: 1180, height: 900 })
    await ensureAuthenticated(page, server.url, server.apiOrigin)
    for (const width of SCALING_PROBE_WIDTHS) {
      await page.setViewportSize({ width, height: 900 })

      await clickPrimaryScreen(page, 'Cards')
      await page.waitForTimeout(180)
      const cardSample = await collectComponentScaling(page)

      await clickPrimaryScreen(page, 'Shop')
      await page.waitForTimeout(180)
      const shopSample = await collectComponentScaling(page)

      scalingSamples.push({ viewport: width, components: { ...cardSample, ...shopSample } })
    }
  } finally {
    await browser.close()
    await server.stop()
  }

  const dockFailures = results.filter((result) => (result.dock?.issues?.length ?? 0) > 0)
  const failures = results.filter((result) => result.failed || (result.dock?.issues?.length ?? 0) > 0)
  const warnings = results.filter((result) => result.smallTouchTargets.length > 0)
  const inversions = findScalingInversions(scalingSamples)
  // Failures only by default. Inlining all ~284 states with every measured
  // rect produced a report too large to actually read, which meant nobody did.
  // `--full` restores the complete record when you need it.
  await writeFile(
    path.join(OUTPUT_DIR, 'responsive-layout-report.json'),
    JSON.stringify(
      options.full
        ? { failures, warnings, inversions, scalingSamples, results }
        : { failures, warnings, inversions, scalingSamples, resultCount: results.length },
      null,
      2,
    ),
  )

  console.log(`Responsive layout QA checked ${results.length} screen states.`)
  console.log(`Component scaling sampled at ${scalingSamples.length} widths.`)
  console.log(`Screenshots and JSON report written to ${OUTPUT_DIR}`)
  if (warnings.length > 0) console.log(`Touch-target warnings: ${warnings.length}`)

  if (inversions.length > 0) {
    console.error(`Component scaling inversions: ${inversions.length}`)
    for (const inversion of inversions) {
      console.error(`- ${formatInversion(inversion)}`)
    }
    process.exitCode = 1
  }

  if (failures.length > 0) {
    console.error(`Layout failures: ${failures.length}`)
    // Dock failures get their own line — they are the regressions that
    // reached players, and the generic overflow counters do not name them.
    dockFailures.slice(0, 10).forEach((failure) => {
      const kinds = failure.dock.issues.map((issue) => `${issue.name}:${issue.kind}`).join(', ')
      console.error(`- ${failure.contextLabel}: visualViewport=${failure.dock.visualViewport.width}x${failure.dock.visualViewport.height} → ${kinds}`)
    })
    failures.slice(0, 10).forEach((failure) => {
      console.error(`- ${failure.contextLabel}: overflowX=${failure.documentOverflowX}, clippedContainers=${failure.clippedContainers.length}, clippedText=${failure.clippedText.length}, offscreenInteractive=${failure.offscreenInteractive.length}, layoutConflicts=${failure.layoutConflicts.length}`)
    })
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
