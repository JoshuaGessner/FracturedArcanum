import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Every route lives in the module that owns its domain.
 *
 * This is not style policing. When the routes came out of server.js, each
 * module got a name and a purpose — and everything unclaimed was left wherever
 * it happened to land. `trading.js` ended up owning the health check, the
 * live-service settings, the privacy statement, analytics, complaints and
 * three admin routes: thirteen routes, five of them trades. Nothing was broken
 * by it, which is exactly why it survived a full review. A junk drawer never
 * fails a test; it just sends the next reader to the wrong file.
 *
 * So the prefixes each module may register are written down here, and anything
 * else has to be listed in BASELINE with a reason. New strays fail.
 */

const ROUTE_PATTERN = /app\.(get|post|put|patch|delete)\(\s*'([^']+)'/g

/** The domain each module is named for. */
const OWNERSHIP = {
  'account.js': [/^\/api\/auth\//, /^\/api\/me\/(sessions|passkey-device-links)/],
  'profile.js': [/^\/api\/me\b/, /^\/api\/cards\//],
  'shop.js': [/^\/api\/shop\//],
  'trading.js': [/^\/api\/trades/],
  'system.js': [/^\/api\/(health|live-settings|privacy|complaints)$/, /^\/api\/analytics\//],
  'admin.js': [/^\/api\/admin\//],
}

/**
 * Routes known to sit in the wrong module, inherited from the original split.
 *
 * This list is a debt register, not a permission slip: it may shrink and must
 * never grow. Each entry says where the route should end up.
 *
 * `shop.js` is the bad one. Its header claims "cosmetics and card packs" while
 * it also owns quests, the daily reward, match completion, match history, the
 * leaderboard, the collection and the whole social surface — friends and clans
 * included. That is a bigger reorganisation than the one this commit was for,
 * so it is recorded rather than quietly fixed.
 */
const BASELINE = new Set([
  // → system.js (public, unauthenticated, nothing to do with an account)
  'GET /api/legal/current',
  // → account.js (passkey enrolment is authentication, not profile data)
  'POST /api/auth/passkey/register/options',
  'POST /api/auth/passkey/register/verify',
  // → a profile/economy module
  'POST /api/me/border',
  'POST /api/me/theme',
  'POST /api/me/daily',
  'GET /api/me/quests',
  'POST /api/me/quests/:questId/reroll',
  'POST /api/me/quests/claim',
  'POST /api/me/quests/:questId/claim',
  'GET /api/me/collection',
  // → a matches module
  'POST /api/match/complete',
  'GET /api/me/matches',
  'GET /api/leaderboard',
  // → a social module of its own
  'GET /api/social',
  'POST /api/social/friends',
  'DELETE /api/social/friends/:friendAccountId',
  'POST /api/social/clan/create',
  'POST /api/social/clan/join',
  'POST /api/social/clan/leave',
])

async function routesIn(file) {
  const source = await readFile(path.resolve('server/routes', file), 'utf8')
  return [...source.matchAll(ROUTE_PATTERN)].map((match) => ({
    method: match[1].toUpperCase(),
    route: match[2],
    key: `${match[1].toUpperCase()} ${match[2]}`,
  }))
}

describe('route ownership', () => {
  for (const [file, allowed] of Object.entries(OWNERSHIP)) {
    it(`${file} registers no new strays`, async () => {
      const strays = (await routesIn(file))
        .filter(({ route }) => !allowed.some((pattern) => pattern.test(route)))
        .filter(({ key }) => !BASELINE.has(key))
        .map(({ key }) => key)

      expect(
        strays,
        `${file} owns routes outside its domain that are not in BASELINE: ${strays.join(', ')}. `
          + 'Put the route in the module that owns it, or add it to BASELINE with a reason.',
      ).toEqual([])
    })
  }

  /**
   * A debt register only works if it stays honest. An entry left behind after
   * the route moved would slowly turn the list into decoration.
   */
  it('has no stale BASELINE entries', async () => {
    const live = new Set()
    for (const file of Object.keys(OWNERSHIP)) {
      for (const { key } of await routesIn(file)) live.add(key)
    }
    const stale = [...BASELINE].filter((key) => !live.has(key))
    expect(stale, `BASELINE lists routes that no longer exist: ${stale.join(', ')}`).toEqual([])
  })

  it('registers every module in server.js', async () => {
    const source = await readFile(path.resolve('server/server.js'), 'utf8')
    for (const file of Object.keys(OWNERSHIP)) {
      const name = file.replace('.js', '')
      const registrar = `register${name.charAt(0).toUpperCase()}${name.slice(1)}Routes`
      expect(source, `${registrar} is never called`).toContain(`${registrar}(app, routeContext)`)
    }
  })

  /**
   * Two handlers on the same method and path means the second never runs.
   * Express takes the first match silently, so this cannot be found by using
   * the app — only by looking.
   */
  it('has no duplicate method+path across all modules', async () => {
    const seen = new Map()
    const duplicates = []
    for (const file of Object.keys(OWNERSHIP)) {
      for (const { key } of await routesIn(file)) {
        if (seen.has(key)) duplicates.push(`${key} in both ${seen.get(key)} and ${file}`)
        else seen.set(key, file)
      }
    }
    expect(duplicates).toEqual([])
  })
})

describe('the public health endpoint', () => {
  const healthHandler = async () => {
    const source = await readFile(path.resolve('server/routes/system.js'), 'utf8')
    return source.slice(source.indexOf("app.get('/api/health'"), source.indexOf("app.get('/api/live-settings'"))
  }

  /**
   * `/api/health` answered anyone on the internet with queue size, connected
   * players, open complaint count and lifetime unique visitors. It has to stay
   * unauthenticated — the Docker HEALTHCHECK and scripts/update.sh both poll it
   * without credentials — so the fix was to stop it carrying the figures.
   */
  it('publishes no operational figures', async () => {
    const handler = await healthHandler()
    for (const leak of ['queueSize', 'connectedPlayers', 'complaintsOpen', 'uniqueVisitors', 'rankedAvailable']) {
      expect(handler, `/api/health still returns ${leak}`).not.toContain(`${leak}:`)
    }
  })

  /**
   * The load-bearing half. `scripts/update.sh` treats a passing health check as
   * proof the migration opened the schema, which only holds while the handler
   * actually queries. Trimming the body must not quietly demote this to a
   * "process is listening" probe.
   */
  it('still queries the database, so a broken migration cannot pass it', async () => {
    expect(await healthHandler(), 'health no longer touches the database').toContain('getComplaintCounts()')
  })

  it('keeps the detailed figures behind a role check', async () => {
    const source = await readFile(path.resolve('server/routes/admin.js'), 'utf8')
    expect(source).toMatch(/app\.get\('\/api\/admin\/health',\s*requireAdminRole/)
    expect(source).toContain('connectedPlayers')
  })
})
