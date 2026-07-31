/**
 * Regenerates `matched-styles.json`, the recorded `CSS.getMatchedStylesForNode`
 * payload that cssAttribution.test.mjs asserts against.
 *
 * Run this if Chrome's CSS protocol shape changes and the attribution tests
 * start failing for reasons unrelated to our logic:
 *   node scripts/lib/__fixtures__/record-matched-styles.mjs
 *
 * The synthetic page mirrors the shapes App.css actually uses: a four-value
 * padding shorthand, calc() over custom properties, a :not() chain, matching
 * and non-matching @media and @container blocks, ::before,
 * ::-webkit-scrollbar, an !important override, and an inline style. The
 * recorded `computed` block is Chrome's own resolved values, so the tests
 * compare attribution against ground truth rather than against the docs.
 */
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].find((p) => existsSync(p))

const PAGE = `
<style id="sheet-a">
  :root { --app-h: 900px; --space-6: 24px; }
  .panel { padding: 8px 16px 20px 16px; max-height: 400px; overflow-y: auto; }
  .box .panel { max-height: calc(var(--app-h) - var(--space-6)); }
  .box .panel:not(.inert) { padding-bottom: 40px; }
  .panel::before { content: ''; height: 4px; display: block; }
  .panel::-webkit-scrollbar { width: 6px; }
  @media (min-width: 99999px) { .panel { max-height: 1px; } }
  @media (min-width: 100px) { .panel { border-radius: 20px; } }
  .wrap { container-type: inline-size; container-name: sheet; }
  @container sheet (width >= 200px) { .panel { row-gap: 12px; } }
  @container sheet (width >= 99999px) { .panel { row-gap: 99px; } }
  .shouty { max-height: 555px !important; }
</style>
<div class="box"><div class="wrap" style="width:300px">
  <div class="panel shouty" style="overflow-y: scroll">hi</div>
</div></div>
`

const browser = await chromium.launch({ headless: true, executablePath: CHROME })
const page = await browser.newPage()
await page.setContent(PAGE)

const cdp = await page.context().newCDPSession(page)
await cdp.send('DOM.enable')
await cdp.send('CSS.enable')
const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.panel' })
const matched = await cdp.send('CSS.getMatchedStylesForNode', { nodeId })

// Ground truth the attribution must agree with.
const computed = await page.evaluate(() => {
  const el = document.querySelector('.panel')
  const cs = getComputedStyle(el)
  return {
    maxHeight: cs.maxHeight,
    paddingBottom: cs.paddingBottom,
    paddingTop: cs.paddingTop,
    overflowY: cs.overflowY,
    rowGap: cs.rowGap,
    borderTopLeftRadius: cs.borderTopLeftRadius,
    appH: cs.getPropertyValue('--app-h').trim(),
  }
})

// Resolved from this file rather than cwd so the recorder works from anywhere.
const outDir = import.meta.dirname
await mkdir(outDir, { recursive: true })
await writeFile(
  path.join(outDir, 'matched-styles.json'),
  `${JSON.stringify({ matched, computed }, null, 2)}\n`,
)
console.log(`wrote ${path.join(outDir, 'matched-styles.json')}`)
console.log(JSON.stringify(computed, null, 2))

await browser.close()
