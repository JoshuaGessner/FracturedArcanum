import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { chromium } from 'playwright-core'

const OUTPUT_DIR = path.resolve('.layout-qa')
const QA_USERNAME = process.env.QA_USERNAME ?? 'qa_tester'
const QA_PASSWORD = process.env.QA_PASSWORD ?? 'TestUser123'
const VIEWPORTS = [
  { name: 'phone-360x640', width: 360, height: 640 },
  { name: 'iphone-se-375x667', width: 375, height: 667 },
  { name: 'portrait-394x724', width: 394, height: 724 },
  { name: 'iphone-15-393x852', width: 393, height: 852 },
  { name: 'large-phone-430x932', width: 430, height: 932 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'desktop-narrow-1024x768', width: 1024, height: 768 },
  { name: 'desktop-short-1366x768', width: 1366, height: 768 },
  { name: 'desktop-wide-1440x900', width: 1440, height: 900 },
]

const ROUTES = [
  { id: 'home', label: 'Home' },
  { id: 'play', label: 'Play' },
  { id: 'collection', label: 'Collection' },
  { id: 'social', label: 'Social', subviews: ['Overview', 'Friends', 'Rankings', 'Clan', 'Trades'] },
  { id: 'shop', label: 'Shop', subviews: ['Overview', 'Vault', 'Packs', 'Themes', 'Borders', 'Breakdown'] },
  { id: 'settings', label: 'Settings', subviews: ['Overview', 'Preferences', 'Support'] },
]

const CLIPPED_SELECTOR = [
  '.section-card', '.utility-card', '.spotlight-card', '.shop-market-card',
  '.settings-command-card', '.settings-section-panel', '.shop-section-panel', '.social-list',
  '.leaderboard-list', '.deck-roster', '.builder-card', '.theme-offer-card', '.battlefield-stage',
].join(', ')

const TEXT_SELECTOR = [
  'button', '.badge', '.deck-status', '.shop-resource-chip', '.settings-status-chip', '.scene-link-label',
  '.slot-head strong', '.builder-card-meta-compact', '.builder-card-meta-full', '.card-name', '.note', '.mini-text',
  '.shop-hub-panel strong', '.settings-hub-tile strong', '.social-info-bar-label', '.subview-label',
].join(', ')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function qaLog(message) {
  console.log(`[viewport-qa] ${message}`)
}

function hashIp(ip) {
  return createHash('sha256').update(`rc-ip:${ip}`).digest('hex').slice(0, 24)
}

function hashUserAgent(userAgent) {
  return createHash('sha256').update(`rc-ua:${userAgent}`).digest('hex').slice(0, 24)
}

function hashSessionToken(token) {
  return createHash('sha256').update(`rc-session-token:${token}`).digest('hex')
}

function resetLocalhostLoginRateLimits() {
  const dataDir = path.resolve(process.env.DATA_DIR ?? 'data')
  const dbPath = path.join(dataDir, 'fractured-arcanum.db')
  if (!existsSync(dbPath)) return
  const database = new Database(dbPath)
  try {
    const deleteRateLimit = database.prepare('DELETE FROM rate_limits WHERE key = ?')
    for (const ip of ['127.0.0.1', '::1', '0.0.0.0']) {
      deleteRateLimit.run(`login:${hashIp(ip)}`)
    }
  } finally {
    database.close()
  }
}

function ensureViewportQaPasskey(accountId, minCount = 1) {
  const dataDir = path.resolve(process.env.DATA_DIR ?? 'data')
  const dbPath = path.join(dataDir, 'fractured-arcanum.db')
  if (!existsSync(dbPath)) return false

  const database = new Database(dbPath)
  try {
    const existing = database.prepare('SELECT COUNT(*) as cnt FROM account_authenticators WHERE account_id = ?').get(accountId)
    const existingCount = Number(existing?.cnt ?? 0)
    if (existingCount >= minCount) return true

    const insertPasskey = database.prepare(`
      INSERT INTO account_authenticators (
        id, account_id, credential_id, credential_public_key, counter, transports, backed_up, device_type, name
      ) VALUES (?, ?, ?, ?, 0, ?, 1, 'qaDevice', 'Viewport QA Passkey')
    `)
    for (let index = existingCount; index < minCount; index += 1) {
      const suffix = createHash('sha256').update(`viewport-qa-passkey:${accountId}:${index}`).digest('hex').slice(0, 16)
      insertPasskey.run(
        `qa-authnr-${suffix}`,
        accountId,
        `qa-credential-${suffix}`,
        Buffer.from(`viewport-qa-public-key-${suffix}`),
        JSON.stringify(['internal']),
      )
    }
    return true
  } finally {
    database.close()
  }
}

function createViewportQaSession(username) {
  const dataDir = path.resolve(process.env.DATA_DIR ?? 'data')
  const dbPath = path.join(dataDir, 'fractured-arcanum.db')
  if (!existsSync(dbPath)) return null

  const database = new Database(dbPath)
  try {
    const account = database.prepare(`
      SELECT id, account_status, deleted_at
      FROM accounts
      WHERE username = ? COLLATE NOCASE
    `).get(username)
    if (!account || account.account_status !== 'active' || account.deleted_at) return null

    const token = randomBytes(32).toString('hex')
    const sessionId = `sess-${randomBytes(12).toString('hex')}`
    const familyId = `sessfam-${randomBytes(12).toString('hex')}`
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const ipHash = hashIp('127.0.0.1')
    const uaHash = hashUserAgent('viewport-qa')
    const tx = database.transaction(() => {
      database.prepare(`INSERT INTO session_families (id, account_id) VALUES (?, ?)`).run(familyId, account.id)
      database.prepare(`
        INSERT INTO sessions (token, account_id, expires_at, ip_hash, token_hash, family_id, user_agent_hash, last_seen_at, auth_method, last_passkey_reauth_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'passkey', datetime('now'))
      `).run(sessionId, account.id, expiresAt, ipHash, hashSessionToken(token), familyId, uaHash)
      database.prepare(`UPDATE accounts SET last_login = datetime('now') WHERE id = ?`).run(account.id)
    })
    tx()
    return token
  } finally {
    database.close()
  }
}

async function stopProcessGroup(child) {
  if (!child.pid) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await sleep(300)
}

async function runOneShot(command, args, label, timeoutMs = 30_000) {
  qaLog(label)
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${label} timed out\n${output}`))
    }, timeoutMs)

    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.on('exit', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`${label} failed with exit code ${code}\n${output}`))
    })
  })
}

async function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('Could not allocate a local port'))
      })
    })
    server.on('error', reject)
  })
}

function findBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate)) ?? undefined
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1_000)
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (response.ok) return
    } catch {
      await sleep(250)
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function startApiServer(apiPort, preferExisting) {
  const apiOrigin = `http://127.0.0.1:${apiPort}`
  if (preferExisting) {
    try {
      await waitForServer(`${apiOrigin}/api/health`, 2_000)
      return async () => {}
    } catch {
      // Fall through and start an isolated API server on the requested port.
    }
  }

  await runOneShot('npm', ['run', 'build:engine'], 'Building engine for viewport QA')
  qaLog(`Starting API server on ${apiOrigin}`)
  const server = spawn('node', ['server/server.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, PORT: apiPort, VIEWPORT_QA: '1' },
  })
  let output = ''
  server.stdout.on('data', (chunk) => { output += chunk.toString() })
  server.stderr.on('data', (chunk) => { output += chunk.toString() })

  try {
    await waitForServer(`${apiOrigin}/api/health`, 30_000)
    qaLog(`API server ready on ${apiOrigin}`)
  } catch (error) {
    await stopProcessGroup(server)
    throw new Error(`${error.message}\nAPI server output:\n${output}`)
  }

  return async () => {
    await stopProcessGroup(server)
  }
}

async function startServer() {
  if (process.env.QA_URL) {
    await waitForServer(process.env.QA_URL)
    return { url: process.env.QA_URL, apiOrigin: process.env.QA_API_URL ?? process.env.QA_URL, stop: async () => {} }
  }

  const apiPort = process.env.QA_API_PORT ?? String(await findOpenPort())
  const apiOrigin = `http://127.0.0.1:${apiPort}`
  const stopApi = await startApiServer(apiPort, process.env.QA_REUSE_API === '1')
  const port = await findOpenPort()
  const url = `http://127.0.0.1:${port}`
  qaLog(`Starting Vite on ${url} with API proxy port ${apiPort}`)
  const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, BROWSER: 'none', PORT: apiPort, VITE_ARENA_URL: apiOrigin },
  })

  let output = ''
  server.stdout.on('data', (chunk) => { output += chunk.toString() })
  server.stderr.on('data', (chunk) => { output += chunk.toString() })

  try {
    await waitForServer(url)
    qaLog(`Vite ready on ${url}`)
  } catch (error) {
    await stopProcessGroup(server)
    await stopApi()
    throw new Error(`${error.message}\nVite output:\n${output}`)
  }

  return {
    url,
    apiOrigin,
    stop: async () => {
      await stopProcessGroup(server)
      await stopApi()
    },
  }
}

async function authenticate(page, url, apiOrigin) {
  resetLocalhostLoginRateLimits()
  let response = await page.request.post(`${apiOrigin}/api/auth/login`, {
    data: { username: QA_USERNAME, password: QA_PASSWORD },
  })
  if (!response.ok()) {
    const body = await response.text()
    const localToken = createViewportQaSession(QA_USERNAME)
    if (!localToken) {
      throw new Error(`Viewport QA could not sign in as ${QA_USERNAME}: ${response.status()} ${body}`)
    }
    response = await page.request.get(`${apiOrigin}/api/me`, {
      headers: { Authorization: `Bearer ${localToken}` },
    })
    if (!response.ok()) {
      throw new Error(`Viewport QA local passkey session was rejected for ${QA_USERNAME}: ${response.status()} ${await response.text()}`)
    }
    const profileData = await response.json()
    response = {
      ok: () => true,
      json: async () => ({ token: localToken, profile: profileData.profile }),
    }
  }
  const data = await response.json()
  if (!data.token) throw new Error(`Viewport QA login response did not include a token for ${QA_USERNAME}`)

  const requirements = data.profile?.accountReadiness?.requirements ?? []
  if (data.profile?.accountSetupRequired || data.profile?.accountReadiness?.setupRequired) {
    const minimumPasskeys = requirements.some((item) => item.id === 'owner_second_passkey') ? 2 : 1
    const needsPasskey = requirements.some((item) => item.id === 'passkey' || item.id === 'owner_passkey' || item.id === 'owner_second_passkey')
    if (needsPasskey && !ensureViewportQaPasskey(data.profile?.accountId, minimumPasskeys)) {
      throw new Error('Viewport QA account requires a passkey, but no local QA database was available to seed one.')
    }

    const completeResponse = await page.request.post(`${apiOrigin}/api/me/account-upgrade/complete`, {
      headers: { Authorization: `Bearer ${data.token}` },
      data: {
        acceptTerms: true,
        acceptPrivacy: true,
        ageAttestation: 'adult',
        locale: 'en-US',
      },
    })
    const completeData = await completeResponse.json().catch(() => ({}))
    if (!completeResponse.ok() || !completeData.ok) {
      throw new Error(`Viewport QA account upgrade completion failed: ${completeResponse.status()} ${JSON.stringify(completeData)}`)
    }
    if (completeData.recoveryCodes?.length || (completeData.recovery?.activeCount > 0 && !completeData.recovery?.acknowledgedAt)) {
      const acknowledgeResponse = await page.request.post(`${apiOrigin}/api/me/recovery-codes/acknowledge`, {
        headers: { Authorization: `Bearer ${data.token}` },
      })
      const acknowledgeData = await acknowledgeResponse.json().catch(() => ({}))
      if (!acknowledgeResponse.ok() || !acknowledgeData.ok) {
        throw new Error(`Viewport QA recovery code acknowledgement failed: ${acknowledgeResponse.status()} ${JSON.stringify(acknowledgeData)}`)
      }
    }
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.evaluate((token) => {
    window.localStorage.setItem('fractured-arcanum.auth-token', JSON.stringify(token))
    window.localStorage.setItem('fractured-arcanum.first-launch', '1')
  }, data.token)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.screen-panel.active', { timeout: 10_000 })
}

async function ensureAuthenticated(page, url, apiOrigin) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(250)
  const hasActiveScreen = await page.evaluate(() => Boolean(document.querySelector('.screen-panel.active')))
  if (!hasActiveScreen) await authenticate(page, url, apiOrigin)
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

async function main() {
  await rm(OUTPUT_DIR, { recursive: true, force: true })
  await mkdir(OUTPUT_DIR, { recursive: true })
  const server = await startServer()
  const executablePath = findBrowserExecutable()
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const results = []

  try {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await ensureAuthenticated(page, server.url, server.apiOrigin)

      for (const route of ROUTES) {
        await clickPrimaryScreen(page, route.label)
        const contexts = route.subviews?.length ? route.subviews : [route.label]
        for (const subview of contexts) {
          if (route.subviews?.length) await clickSubview(page, subview)
          const label = `${viewport.name}-${route.id}-${subview.toLowerCase().replace(/\s+/g, '-')}`
          const metrics = await collectLayoutMetrics(page, label)
          await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}.png`), fullPage: false })
          results.push({ viewport: viewport.name, route: route.id, subview, failed: hasFailures(metrics), ...metrics })
        }
      }

      await clickPrimaryScreen(page, 'Play')
      const aiButton = page.getByRole('button', { name: /AI Skirmish/i }).first()
      if (await aiButton.count()) {
        const disabled = await aiButton.evaluate((element) => element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true')
        if (!disabled) {
          await aiButton.click()
          await page.waitForTimeout(500)
          const label = `${viewport.name}-battle-ai`
          const metrics = await collectLayoutMetrics(page, label)
          await page.screenshot({ path: path.join(OUTPUT_DIR, `${label}.png`), fullPage: false })
          results.push({ viewport: viewport.name, route: 'battle', subview: 'AI Skirmish', failed: hasFailures(metrics), ...metrics })
          const leaveButton = page.getByRole('button', { name: /^Leave$/i }).first()
          if (await leaveButton.count()) await leaveButton.click()
        }
      }
    }
  } finally {
    await browser.close()
    await server.stop()
  }

  const failures = results.filter((result) => result.failed)
  const warnings = results.filter((result) => result.smallTouchTargets.length > 0)
  await writeFile(path.join(OUTPUT_DIR, 'responsive-layout-report.json'), JSON.stringify({ failures, warnings, results }, null, 2))

  console.log(`Responsive layout QA checked ${results.length} screen states.`)
  console.log(`Screenshots and JSON report written to ${OUTPUT_DIR}`)
  if (warnings.length > 0) console.log(`Touch-target warnings: ${warnings.length}`)
  if (failures.length > 0) {
    console.error(`Layout failures: ${failures.length}`)
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
