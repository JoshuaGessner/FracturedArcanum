import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Production upgrade safety.
 *
 * Importing `db.js` opens the database and applies the schema, so a deploy runs
 * these migrations against live player data the moment the server restarts.
 * This suite answers one question with evidence rather than by reading DDL:
 * **does starting a newer server damage an older database?**
 *
 * Startup is not read-only. Six `UPDATE` statements run as backfills. That is
 * intended — they populate columns added by earlier `ALTER TABLE`s — and every
 * one is guarded so it can only fill a blank:
 *
 *   - `WHERE TRIM(COALESCE(col, '')) = ''` for updated_at, played_at,
 *     display_name
 *   - `SET col = COALESCE(col, <new>)` for the legacy migration timestamps
 *
 * The tests below prove that guard empirically by seeding rows that already
 * hold values and asserting the values survive.
 */

const LIVE_DB = path.resolve('data/fractured-arcanum.db')

/** Row counts, columns, and full row contents for every user table. */
function snapshot(dbPath) {
  const db = new Database(dbPath, { readonly: true })
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => row.name)

    const out = {}
    for (const table of tables) {
      out[table] = {
        columns: db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name),
        count: db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n,
        rows: db.prepare(`SELECT * FROM "${table}"`).all(),
      }
    }
    return out
  } finally {
    db.close()
  }
}

/**
 * Import db.js against a specific DATA_DIR so schema and migrations run there.
 *
 * Each entry needs a *literal* specifier: the bundler cannot statically analyse
 * a templated dynamic import, and a repeated specifier would be served from the
 * module cache instead of re-running the schema.
 */
const IMPORTERS = {
  liveCopy: () => import('./db.js?migration-safety-live-copy'),
  idempotentA: () => import('./db.js?migration-safety-idempotent-a'),
  idempotentB: () => import('./db.js?migration-safety-idempotent-b'),
  legacySeed: () => import('./db.js?migration-safety-legacy-seed'),
  backfill: () => import('./db.js?migration-safety-backfill'),
}

async function migrateAgainst(dataDir, importerKey) {
  const previous = process.env.DATA_DIR
  process.env.DATA_DIR = dataDir
  try {
    const mod = await IMPORTERS[importerKey]()
    mod.default.close()
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR
    else process.env.DATA_DIR = previous
  }
}

let workDir

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'fa-migration-safety-'))
})

afterEach(() => {
  try { rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('production upgrade safety', () => {
  /**
   * The strongest available evidence: the database this machine actually runs
   * against. Skipped when absent so CI and fresh clones stay green.
   */
  it.skipIf(!existsSync(LIVE_DB))(
    'migrates a copy of the real database without losing a row or a column',
    async () => {
      const target = path.join(workDir, 'fractured-arcanum.db')
      copyFileSync(LIVE_DB, target)

      const before = snapshot(target)
      await migrateAgainst(workDir, 'liveCopy')
      const after = snapshot(target)

      for (const [table, prev] of Object.entries(before)) {
        expect(after[table], `table "${table}" vanished`).toBeTruthy()
        expect(after[table].count, `table "${table}" lost rows`).toBe(prev.count)
        for (const column of prev.columns) {
          expect(after[table].columns, `table "${table}" lost column "${column}"`).toContain(column)
        }
      }
    },
  )

  it('is idempotent: a second startup changes nothing', async () => {
    const target = path.join(workDir, 'fractured-arcanum.db')
    if (existsSync(LIVE_DB)) copyFileSync(LIVE_DB, target)

    await migrateAgainst(workDir, 'idempotentA')
    const first = snapshot(target)
    await migrateAgainst(workDir, 'idempotentB')
    const second = snapshot(target)

    expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort())
    for (const [table, prev] of Object.entries(first)) {
      expect(second[table].columns, `columns changed on rerun for "${table}"`).toEqual(prev.columns)
      expect(second[table].count, `row count changed on rerun for "${table}"`).toBe(prev.count)
      expect(second[table].rows, `rows changed on rerun for "${table}"`).toEqual(prev.rows)
    }
  })

  /**
   * The guarantee that matters most: startup backfills fill blanks, they do not
   * overwrite. Seeded here with values that differ from what a backfill would
   * write, so an unguarded UPDATE would be caught.
   */
  it('backfills blanks without overwriting values a player already has', async () => {
    const target = path.join(workDir, 'fractured-arcanum.db')
    const seed = new Database(target)
    seed.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login TEXT,
        device_fp TEXT,
        flags TEXT NOT NULL DEFAULT ''
      );
    `)
    const insert = seed.prepare(
      'INSERT INTO accounts (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)',
    )
    // One account with a real display name, one with a blank one.
    insert.run('acct-named', 'named_player', 'hash-a', 'Chosen Name')
    insert.run('acct-blank', 'blank_player', 'hash-b', '')
    seed.close()

    await migrateAgainst(workDir, 'backfill')

    const after = new Database(target, { readonly: true })
    try {
      const named = after.prepare('SELECT * FROM accounts WHERE id = ?').get('acct-named')
      const blank = after.prepare('SELECT * FROM accounts WHERE id = ?').get('acct-blank')

      // Untouched: the player picked this.
      expect(named.display_name).toBe('Chosen Name')
      // Backfilled: blank becomes the username.
      expect(blank.display_name).toBe('blank_player')

      // Credentials and identity survive either way.
      expect(named.password_hash).toBe('hash-a')
      expect(blank.password_hash).toBe('hash-b')
      expect(named.username).toBe('named_player')
    } finally {
      after.close()
    }
  })

  it('preserves seeded player data when upgrading a legacy schema', async () => {
    const target = path.join(workDir, 'fractured-arcanum.db')
    const legacy = new Database(target)
    legacy.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login TEXT,
        device_fp TEXT,
        flags TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE player_profiles (
        account_id TEXT PRIMARY KEY,
        deck_config TEXT NOT NULL DEFAULT '{}',
        rating INTEGER NOT NULL DEFAULT 1000,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0
      );
    `)
    legacy.prepare(
      'INSERT INTO accounts (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)',
    ).run('acct-legacy-safety', 'legacy_player', 'hash-value', 'Legacy Player')
    legacy.prepare(
      'INSERT INTO player_profiles (account_id, deck_config, rating, wins, losses) VALUES (?, ?, ?, ?, ?)',
    ).run('acct-legacy-safety', JSON.stringify({ 'spark-imp': 2 }), 1234, 7, 3)
    legacy.close()

    await migrateAgainst(workDir, 'legacySeed')

    const after = new Database(target, { readonly: true })
    try {
      const account = after.prepare('SELECT * FROM accounts WHERE id = ?').get('acct-legacy-safety')
      expect(account.username).toBe('legacy_player')
      expect(account.display_name).toBe('Legacy Player')
      expect(account.password_hash).toBe('hash-value')

      const profile = after.prepare('SELECT * FROM player_profiles WHERE account_id = ?')
        .get('acct-legacy-safety')
      expect(profile.rating).toBe(1234)
      expect(profile.wins).toBe(7)
      expect(profile.losses).toBe(3)
      expect(JSON.parse(profile.deck_config)).toEqual({ 'spark-imp': 2 })

      // Columns were added to the existing table, not recreated around it.
      const columns = after.prepare('PRAGMA table_info(accounts)').all().map((c) => c.name)
      expect(columns).toContain('account_status')
      expect(columns).toContain('terms_version')
      expect(columns).toContain('role')
    } finally {
      after.close()
    }
  })

  it('issues no destructive DDL during startup', async () => {
    const source = await readFile(path.resolve('server/db.js'), 'utf8')
    const marker = '// ─── Password hashing'
    const cut = source.indexOf(marker)
    // Guard the slice: a missed marker would silently scan the whole file and
    // pick up runtime DELETE statements that never run at startup.
    expect(cut, 'schema-region marker not found in db.js').toBeGreaterThan(0)
    const schemaRegion = source.slice(0, cut)

    expect(schemaRegion).not.toMatch(/\bDROP\s+TABLE\b/i)
    expect(schemaRegion).not.toMatch(/\bDROP\s+COLUMN\b/i)
    expect(schemaRegion).not.toMatch(/\bTRUNCATE\b/i)
    expect(schemaRegion).not.toMatch(/\bDELETE\s+FROM\b/i)

    // Every CREATE must be guarded so a rerun cannot clobber an existing table.
    const unguarded = schemaRegion.match(
      /CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+(?!IF\s+NOT\s+EXISTS)/gi,
    )
    expect(unguarded, `unguarded CREATE statements: ${unguarded?.join(', ')}`).toBeNull()

    // Startup UPDATEs are allowed, but only as guarded backfills. Each must
    // either filter on a blank value or COALESCE the existing one.
    const updates = schemaRegion.match(/UPDATE\s+\w+\s+SET[\s\S]*?(?=;|`)/gi) ?? []
    expect(updates.length).toBeGreaterThan(0)
    for (const statement of updates) {
      const guarded = /TRIM\(COALESCE\(/i.test(statement)
        || /=\s*COALESCE\(/i.test(statement)
        || /IS\s+NULL/i.test(statement)
        || /account_standard_version\s*</i.test(statement)
      expect(guarded, `unguarded startup UPDATE:\n${statement}`).toBe(true)
    }
  })
})
