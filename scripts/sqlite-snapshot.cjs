#!/usr/bin/env node
/**
 * Consistent SQLite snapshot for the updater.
 *
 *   node scripts/sqlite-snapshot.cjs <source.db> <destination.db>
 *
 * A tar of a live WAL-mode database can capture the main file and the -wal
 * file at different moments, which restores as a corrupt or silently older
 * database. The updater pauses the service first when it can, but it cannot
 * always find one to pause (a bare `node server` in tmux, an unrecognised
 * process manager). SQLite's online backup API copies a consistent image no
 * matter what the server is doing, so this runs on every update as the copy
 * of record, and the tarball of data/ stays as the belt to these braces.
 *
 * Exits non-zero, with the reason, if the copy fails its integrity check, so
 * the updater stops before touching the code rather than after.
 */
const { existsSync } = require('node:fs')
const path = require('node:path')

const [source, destination] = process.argv.slice(2)
if (!source || !destination) {
  console.error('usage: node scripts/sqlite-snapshot.cjs <source.db> <destination.db>')
  process.exit(64)
}
if (!existsSync(source)) {
  console.error(`sqlite-snapshot: no database at ${source}`)
  process.exit(66)
}

let Database
try {
  Database = require(path.resolve(__dirname, '../node_modules/better-sqlite3'))
} catch (error) {
  console.error(`sqlite-snapshot: better-sqlite3 is not installed (${error.message})`)
  process.exit(69)
}

async function main() {
  const live = new Database(source, { readonly: true, fileMustExist: true })
  try {
    await live.backup(destination)
  } finally {
    live.close()
  }

  // The copy inherits WAL mode from the source. Fold it into one
  // self-contained file, so the backup is a single .db with no -wal/-shm
  // sidecars that a restore could separate from it.
  const writable = new Database(destination, { fileMustExist: true })
  try {
    writable.pragma('journal_mode = DELETE')
  } finally {
    writable.close()
  }

  const copy = new Database(destination, { readonly: true, fileMustExist: true })
  try {
    const result = copy.pragma('integrity_check', { simple: true })
    if (result !== 'ok') {
      console.error(`sqlite-snapshot: integrity check failed on the copy: ${result}`)
      process.exit(65)
    }
    const accounts = copy.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'accounts'").get().n
      ? copy.prepare('SELECT count(*) AS n FROM accounts').get().n
      : 0
    console.log(`sqlite-snapshot: ${destination} ok (${accounts} account(s))`)
  } finally {
    copy.close()
  }
}

main().catch((error) => {
  console.error(`sqlite-snapshot: ${error.message}`)
  process.exit(70)
})
