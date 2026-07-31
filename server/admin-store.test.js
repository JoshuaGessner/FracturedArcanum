import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildAdminOverview, flushAdminStore, adminStore } from './admin-store.js'

/**
 * The admin store was pulled out of server.js so it could own its own debounce
 * timer. Two things about that move are easy to get wrong quietly, so both are
 * pinned here.
 */
describe('admin store extraction', () => {
  /**
   * `buildAdminOverview` used to read `io.engine.clientsCount` and
   * `waitingPlayers.length` directly. Those are now parameters, which means a
   * caller that forgets them gets zeros instead of a crash — a silent wrong
   * answer on the operations dashboard.
   */
  it('reports the live counts it is given', () => {
    const overview = buildAdminOverview({ queueSize: 3, connectedPlayers: 7 })
    const json = JSON.stringify(overview)
    expect(json).toContain('"queueSize":3')
    expect(json).toContain('"connectedPlayers":7')
  })

  it('defaults to zero rather than throwing when counts are omitted', () => {
    const json = JSON.stringify(buildAdminOverview())
    expect(json).toContain('"queueSize":0')
    expect(json).toContain('"connectedPlayers":0')
  })

  /**
   * The regression this guards: server.js passes `buildAdminOverview` to route
   * modules through its context object. Handing over the bare function would
   * compile, run, and serve zeros forever. It must be bound to the live values.
   */
  it('server.js binds the live counts into the route context', async () => {
    const source = await readFile(path.resolve('server/server.js'), 'utf8')
    expect(source).toMatch(/buildAdminOverview:\s*\(\)\s*=>\s*buildAdminOverview\(\{/)
    expect(source).toMatch(/queueSize:\s*waitingPlayers\.length/)
    expect(source).toMatch(/connectedPlayers:\s*io\.engine\.clientsCount/)
  })

  /**
   * Shutdown must not reach for the debounce handle, which now lives inside
   * this module.
   */
  it('server.js flushes through the module instead of touching the timer', async () => {
    const source = await readFile(path.resolve('server/server.js'), 'utf8')
    expect(source).toMatch(/flushAdminStore\(\)/)
    expect(source).not.toMatch(/clearTimeout\(_saveTimer\)/)
  })

  it('exposes a flush that is safe to call with nothing pending', () => {
    expect(() => flushAdminStore()).not.toThrow()
    expect(adminStore.updatedAt).toBeTruthy()
  })

  /**
   * Every export must actually run.
   *
   * When code is lifted out of a large module it keeps compiling while quietly
   * referencing bindings that stayed behind — they are only free variables
   * until something calls them. This extraction shipped three such holes:
   * `PORT` in buildAdminOverview, and `createHash` in all three analytics
   * functions, which are called on ordinary player traffic. Nothing caught
   * them, because "it imports cleanly" is not the same as "it works".
   *
   * Calling everything is cheap and catches the whole class.
   */
  it('every exported function runs without a missing binding', async () => {
    const mod = await import('./admin-store.js')
    const args = {
      ensureVisitor: ['v-test', 's-test', '/home', 'home'],
      trackAnalyticsEvent: [{ type: 'test', visitorId: 'v-test', sessionId: 's-test' }],
      pushActivity: ['test', {}],
      anonymizeVisitorId: ['v-test'],
    }

    const failures = []
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value !== 'function') continue
      try {
        value(...(args[name] ?? []))
      } catch (error) {
        failures.push(`${name}: ${error.message}`)
      }
    }
    expect(failures, `exports threw: ${failures.join(' | ')}`).toEqual([])
  })
})
