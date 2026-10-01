import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * scripts/sqlite-snapshot.cjs is the updater's copy of record for the
 * database. It has to produce one self-contained, integrity-checked file from
 * a live WAL database, and it has to fail loudly — the updater relies on a
 * non-zero exit to stop before touching any code.
 */
const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'sqlite-snapshot.cjs')

let workDir = null
afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true })
  workDir = null
})

function liveDatabase(rows) {
  workDir = mkdtempSync(path.join(tmpdir(), 'fa-snapshot-'))
  const source = path.join(workDir, 'fractured-arcanum.db')
  const db = new Database(source)
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE accounts (id TEXT PRIMARY KEY)')
  const insert = db.prepare('INSERT INTO accounts VALUES (?)')
  for (let index = 0; index < rows; index += 1) insert.run(`acct-${index}`)
  // Left open on purpose: the rows above still sit in the -wal file, which
  // is exactly the state a running server leaves the database in.
  return { source, db }
}

describe('sqlite-snapshot', () => {
  it('copies a live WAL database into one consistent file', () => {
    const { source, db } = liveDatabase(25)
    const destination = path.join(workDir, 'snapshot.db')
    const result = spawnSync(process.execPath, [SCRIPT, source, destination], { encoding: 'utf8' })
    db.close()

    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/25 account/)
    expect(existsSync(`${destination}-wal`)).toBe(false)
    const copy = new Database(destination, { readonly: true })
    expect(copy.prepare('SELECT count(*) AS n FROM accounts').get().n).toBe(25)
    expect(copy.pragma('journal_mode', { simple: true })).toBe('delete')
    copy.close()
  })

  it('exits non-zero when there is no database to copy', () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'fa-snapshot-'))
    const result = spawnSync(process.execPath, [SCRIPT, path.join(workDir, 'missing.db'), path.join(workDir, 'out.db')], { encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/no database/)
  })
})
