/**
 * Shared plumbing for browser-driven QA scripts: boot the app, sign in, find
 * a Chrome.
 *
 * Extracted from verify-responsive-layout.mjs so probe-layout.mjs does not
 * carry a second copy of the auth dance. verify-responsive-layout.mjs still
 * has its own inline copy; migrating it is deliberately a separate step, since
 * a full sweep takes minutes to validate and this file's correctness is easier
 * to establish from the fast probe first.
 *
 * ── About the QA account ──────────────────────────────────────────────────
 * QA_USERNAME ("uxqa") is a real, manually set-up account in the local
 * database, with a real password and two real passkeys. It is shared with
 * hand testing, so this harness treats it as read-mostly:
 *
 *   1. By default it never calls the login endpoint. `accounts` tracks
 *      `failed_login_count` / `locked_until`, so guessing a password on every
 *      run is the one thing that could lock the account out. Instead a session
 *      row is minted directly. Set QA_PASSWORD to opt into the real login path.
 *   2. `resetLocalhostLoginRateLimits()` still runs before any login attempt,
 *      so even the opt-in path cannot rate-limit the account out.
 *   3. `ensureViewportQaPasskey()` only seeds a passkey when the server says
 *      setup is still required. On a set-up account it is a no-op, so runs
 *      never accumulate junk authenticators.
 *   4. Cleanup is limited to sessions this harness itself created, identified
 *      by a marker user-agent hash. Hand-made sessions are left alone.
 *
 * Nothing here deletes an account, an authenticator, or a password.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { resolveDataDir } from '../../server/db/connection.js'

export const QA_USERNAME = process.env.QA_USERNAME ?? 'uxqa'
/**
 * Unset by default, and that is deliberate. `accounts` carries
 * `failed_login_count` and `locked_until`, so a wrong password guessed on every
 * probe run would walk the shared QA account toward a lockout. With no password
 * configured we never call the login endpoint at all and mint a session
 * directly instead. Export QA_PASSWORD only if you want the real login path
 * exercised.
 */
export const QA_PASSWORD = process.env.QA_PASSWORD ?? null

/** Marks sessions this harness created, so it can clean up after itself. */
const PROBE_USER_AGENT = 'viewport-qa'

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * The database this harness signs into.
 *
 * Delegates to the server's own resolver rather than recomputing the path. A
 * local `path.resolve(process.env.DATA_DIR ?? 'data')` worked only because npm
 * runs scripts from the package root, and it was a third independent
 * definition of where the data lives — the second one is exactly how the server
 * came to open an empty database at server/data after the db split.
 */
function databasePath() {
  return path.join(resolveDataDir(), 'fractured-arcanum.db')
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

/**
 * Clear only the localhost login rate-limit rows. This is what keeps a tight
 * fix/verify loop from locking the shared QA account out.
 */
export function resetLocalhostLoginRateLimits() {
  const dbPath = databasePath()
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

/** No-op unless the account genuinely still needs a passkey to finish setup. */
export function ensureViewportQaPasskey(accountId, minCount = 1) {
  const dbPath = databasePath()
  if (!existsSync(dbPath)) return false

  const database = new Database(dbPath)
  try {
    const existing = database
      .prepare('SELECT COUNT(*) as cnt FROM account_authenticators WHERE account_id = ?')
      .get(accountId)
    const existingCount = Number(existing?.cnt ?? 0)
    if (existingCount >= minCount) return true

    const insertPasskey = database.prepare(`
      INSERT INTO account_authenticators (
        id, account_id, credential_id, credential_public_key, counter, transports, backed_up, device_type, name
      ) VALUES (?, ?, ?, ?, 0, ?, 1, 'qaDevice', 'Viewport QA Passkey')
    `)
    for (let index = existingCount; index < minCount; index += 1) {
      const suffix = createHash('sha256')
        .update(`viewport-qa-passkey:${accountId}:${index}`)
        .digest('hex')
        .slice(0, 16)
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

/**
 * Mint a session row directly, for when password login is unavailable (the
 * account is passkey-only, or the password has rotated). Additive only.
 */
export function createViewportQaSession(username) {
  const dbPath = databasePath()
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
    const probeUaHash = hashUserAgent(PROBE_USER_AGENT)
    const tx = database.transaction(() => {
      // Retire stale sessions a previous QA run created. Two constraints make
      // this safe, and the age cutoff is what keeps the table from growing
      // without bound:
      //   - the marker user-agent hash, so hand-made browser sessions are never
      //     touched;
      //   - an age cutoff rather than the 7-day expiry, so a QA run in another
      //     process does not have its live session deleted out from under it.
      //     (Without any guard, two overlapping runs log each other out
      //     mid-run and both wedge waiting for a shell that never
      //     authenticates. Waiting for full expiry instead let ~90 rows pile
      //     up over a single afternoon of iteration.)
      // A run lasts minutes, so an hour is far outside any live window.
      database.prepare(`
        DELETE FROM sessions
        WHERE account_id = ?
          AND user_agent_hash = ?
          AND last_seen_at < datetime('now', '-1 hour')
      `).run(account.id, probeUaHash)
      database.prepare('INSERT INTO session_families (id, account_id) VALUES (?, ?)')
        .run(familyId, account.id)
      database.prepare(`
        INSERT INTO sessions (token, account_id, expires_at, ip_hash, token_hash, family_id, user_agent_hash, last_seen_at, auth_method, last_passkey_reauth_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'passkey', datetime('now'))
      `).run(
        sessionId,
        account.id,
        expiresAt,
        hashIp('127.0.0.1'),
        hashSessionToken(token),
        familyId,
        probeUaHash,
      )
      database.prepare("UPDATE accounts SET last_login = datetime('now') WHERE id = ?").run(account.id)
    })
    tx()
    return token
  } finally {
    database.close()
  }
}

export function findBrowserExecutable() {
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

async function stopProcessGroup(child) {
  if (!child.pid) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await sleep(300)
}

async function runOneShot(command, args, label, timeoutMs = 60_000) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${label} timed out\n${output}`))
    }, timeoutMs)
    child.on('error', (error) => { clearTimeout(timeout); reject(error) })
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

async function startApiServer(apiPort, { preferExisting, log }) {
  const apiOrigin = `http://127.0.0.1:${apiPort}`
  if (preferExisting) {
    try {
      await waitForServer(`${apiOrigin}/api/health`, 2_000)
      log(`Reusing API server already listening on ${apiOrigin}`)
      return async () => {}
    } catch {
      // Fall through and start an isolated API server on the requested port.
    }
  }

  await runOneShot('npm', ['run', 'build:engine'], 'Building engine')
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
    log(`API server ready on ${apiOrigin}`)
  } catch (error) {
    await stopProcessGroup(server)
    throw new Error(`${error.message}\nAPI server output:\n${output}`)
  }
  return async () => { await stopProcessGroup(server) }
}

/**
 * Boot Vite plus the API and return their origins. Set QA_URL to point at an
 * already-running instance instead — that is the fast path for a tight loop.
 */
export async function startApp({ log = () => {} } = {}) {
  if (process.env.QA_URL) {
    await waitForServer(process.env.QA_URL)
    log(`Using existing app at ${process.env.QA_URL}`)
    return {
      url: process.env.QA_URL,
      apiOrigin: process.env.QA_API_URL ?? process.env.QA_URL,
      stop: async () => {},
    }
  }

  const apiPort = process.env.QA_API_PORT ?? String(await findOpenPort())
  const apiOrigin = `http://127.0.0.1:${apiPort}`
  const stopApi = await startApiServer(apiPort, {
    preferExisting: process.env.QA_REUSE_API === '1',
    log,
  })

  const port = await findOpenPort()
  const url = `http://127.0.0.1:${port}`
  const server = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: { ...process.env, BROWSER: 'none', PORT: apiPort, VITE_ARENA_URL: apiOrigin },
    },
  )
  let output = ''
  server.stdout.on('data', (chunk) => { output += chunk.toString() })
  server.stderr.on('data', (chunk) => { output += chunk.toString() })

  try {
    await waitForServer(url)
    log(`Vite ready on ${url}`)
  } catch (error) {
    await stopProcessGroup(server)
    await stopApi()
    throw new Error(`${error.message}\nVite output:\n${output}`)
  }

  const stop = async () => { await stopProcessGroup(server); await stopApi() }

  // Vite and the API are spawned detached so they can be killed as a group.
  // The flip side is that if this process dies without running its `finally`
  // — Ctrl-C, an outer timeout, SIGKILL of the npm wrapper — they survive as
  // orphans. Several orphaned pairs contending on the same SQLite file will
  // slow every later run to the point of looking hung, which is a genuinely
  // confusing failure to debug. Reap them on the signals we can catch.
  let stopped = false
  const stopOnce = async () => {
    if (stopped) return
    stopped = true
    await stop()
  }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, () => {
      stopOnce().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143))
    })
  }
  process.once('exit', () => {
    // Best-effort synchronous kill; async work cannot run on 'exit'.
    if (!stopped && server.pid) {
      try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ }
    }
  })

  return { url, apiOrigin, stop: stopOnce }
}

async function authenticate(page, url, apiOrigin) {
  // Default path: no password configured, so never touch the login endpoint.
  // See the QA-account notes at the top of this file.
  let response = null
  let loginFailure = 'password login skipped (QA_PASSWORD not set)'

  if (QA_PASSWORD) {
    resetLocalhostLoginRateLimits()
    response = await page.request.post(`${apiOrigin}/api/auth/login`, {
      data: { username: QA_USERNAME, password: QA_PASSWORD },
    })
    if (!response.ok()) loginFailure = `${response.status()} ${await response.text()}`
  }

  if (!response?.ok()) {
    const localToken = createViewportQaSession(QA_USERNAME)
    if (!localToken) {
      throw new Error(
        `QA could not sign in as ${QA_USERNAME}: ${loginFailure}. `
        + 'No active account with that username was found in the local database — '
        + 'set QA_USERNAME to match.',
      )
    }
    const meResponse = await page.request.get(`${apiOrigin}/api/me`, {
      headers: { Authorization: `Bearer ${localToken}` },
    })
    if (!meResponse.ok()) {
      throw new Error(
        `QA local passkey session was rejected for ${QA_USERNAME}: ${meResponse.status()} ${await meResponse.text()}`,
      )
    }
    const profileData = await meResponse.json()
    response = { ok: () => true, json: async () => ({ token: localToken, profile: profileData.profile }) }
  }

  const data = await response.json()
  if (!data.token) throw new Error(`QA login response did not include a token for ${QA_USERNAME}`)

  const requirements = data.profile?.accountReadiness?.requirements ?? []
  if (data.profile?.accountSetupRequired || data.profile?.accountReadiness?.setupRequired) {
    const minimumPasskeys = requirements.some((item) => item.id === 'owner_second_passkey') ? 2 : 1
    const needsPasskey = requirements.some(
      (item) => item.id === 'passkey' || item.id === 'owner_passkey' || item.id === 'owner_second_passkey',
    )
    if (needsPasskey && !ensureViewportQaPasskey(data.profile?.accountId, minimumPasskeys)) {
      throw new Error('QA account requires a passkey, but no local QA database was available to seed one.')
    }

    const completeResponse = await page.request.post(`${apiOrigin}/api/me/account-upgrade/complete`, {
      headers: { Authorization: `Bearer ${data.token}` },
      data: { acceptTerms: true, acceptPrivacy: true, ageAttestation: 'adult', locale: 'en-US' },
    })
    const completeData = await completeResponse.json().catch(() => ({}))
    if (!completeResponse.ok() || !completeData.ok) {
      throw new Error(
        `QA account upgrade completion failed: ${completeResponse.status()} ${JSON.stringify(completeData)}`,
      )
    }
    if (
      completeData.recoveryCodes?.length
      || (completeData.recovery?.activeCount > 0 && !completeData.recovery?.acknowledgedAt)
    ) {
      const ackResponse = await page.request.post(`${apiOrigin}/api/me/recovery-codes/acknowledge`, {
        headers: { Authorization: `Bearer ${data.token}` },
      })
      const ackData = await ackResponse.json().catch(() => ({}))
      if (!ackResponse.ok() || !ackData.ok) {
        throw new Error(
          `QA recovery code acknowledgement failed: ${ackResponse.status()} ${JSON.stringify(ackData)}`,
        )
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

/** Navigate to the app, signing in only if the shell is not already up. */
export async function ensureAuthenticated(page, url, apiOrigin) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const active = await page
    .waitForSelector('.screen-panel.active', { timeout: 2_000 })
    .catch(() => null)
  if (!active) await authenticate(page, url, apiOrigin)
}
