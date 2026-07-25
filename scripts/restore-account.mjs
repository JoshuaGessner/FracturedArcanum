#!/usr/bin/env node
// Triage and restore soft-deleted player accounts.
//
// Deleting an account never purges its profile, collection, rating, or match
// history — only the `accounts` row is flagged. This tool lists what was lost
// and puts it back. Runs against the same DATA_DIR the server uses, so stop the
// service (or accept WAL concurrency) before restoring in bulk.
//
//   node scripts/restore-account.mjs --list
//   node scripts/restore-account.mjs --list --reason legacy_migration_expired
//   node scripts/restore-account.mjs --username someplayer
//   node scripts/restore-account.mjs --account-id acct-0123abcd
//   node scripts/restore-account.mjs --all-expired --dry-run
//   node scripts/restore-account.mjs --all-expired --yes

import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const args = process.argv.slice(2)

function flag(name) {
  return args.includes(`--${name}`)
}

function option(name) {
  const index = args.indexOf(`--${name}`)
  return index !== -1 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : ''
}

if (flag('help') || args.length === 0) {
  console.log(`Restore soft-deleted Fractured Arcanum accounts.

Options:
  --list                    Show deleted accounts and the value attached to them.
  --reason <reason>         Filter --list by delete reason
                            (legacy_migration_expired | account_deleted).
  --username <name>         Restore one account by username.
  --account-id <id>         Restore one account by id.
  --all-expired             Restore every account the legacy sweeper deleted.
                            Never touches accounts the player deleted themselves.
  --dry-run                 Print what would change without writing.
  --yes                     Skip the confirmation prompt.
  --limit <n>               Row cap for --list (default 100).
  --help                    Show this help.

Reads DATA_DIR the same way the server does; set it if the DB is not at ./data.`)
  process.exit(0)
}

const dryRun = flag('dry-run')
const db = await import('../server/db.js')

function formatRow(row) {
  const value = `${row.shards} shards · ${row.seasonRating} rating · ${row.wins}W/${row.losses}L`
  return `  ${row.username.padEnd(20)} ${String(row.reason).padEnd(26)} ${row.deletedAt ?? '?'}  ${value}`
}

if (flag('list')) {
  const rows = db.listDeletedAccounts({
    limit: Number(option('limit')) || 100,
    reason: option('reason'),
  })
  if (rows.length === 0) {
    console.log('No deleted accounts found.')
    process.exit(0)
  }
  console.log(`\n${rows.length} deleted account(s):\n`)
  console.log(`  ${'USERNAME'.padEnd(20)} ${'REASON'.padEnd(26)} DELETED AT           VALUE`)
  for (const row of rows) console.log(formatRow(row))

  const sweeperTaken = rows.filter((row) => row.reason === 'legacy_migration_expired')
  if (sweeperTaken.length > 0) {
    console.log(`\n${sweeperTaken.length} of these were taken by the legacy migration sweeper, not by the player.`)
    console.log('Restore them all with: node scripts/restore-account.mjs --all-expired')
  }
  process.exit(0)
}

const targets = []
const username = option('username')
const accountId = option('account-id')

if (username || accountId) {
  const match = db.listDeletedAccounts({ limit: 500 }).find((row) => (
    (username && row.username.toLowerCase() === username.toLowerCase())
    || (accountId && row.accountId === accountId)
  ))
  if (!match) {
    console.error(`No deleted account matches ${username || accountId}.`)
    console.error('Run --list to see what is restorable.')
    process.exit(1)
  }
  targets.push(match)
} else if (flag('all-expired')) {
  targets.push(...db.listDeletedAccounts({ limit: 500, reason: 'legacy_migration_expired' }))
} else {
  console.error('Nothing to do. Pass --list, --username, --account-id, or --all-expired.')
  process.exit(1)
}

if (targets.length === 0) {
  console.log('No matching accounts to restore.')
  process.exit(0)
}

console.log(`\n${dryRun ? 'Would restore' : 'About to restore'} ${targets.length} account(s):\n`)
for (const row of targets) console.log(formatRow(row))

if (dryRun) {
  console.log('\nDry run — nothing was written.')
  process.exit(0)
}

if (!flag('yes')) {
  const rl = createInterface({ input: stdin, output: stdout })
  const answer = await rl.question(`\nRestore ${targets.length} account(s)? [y/N] `)
  rl.close()
  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Aborted.')
    process.exit(0)
  }
}

let restored = 0
const followUp = []
for (const row of targets) {
  const result = db.restoreAccount(row.accountId, {
    metadata: { source: 'restore-account-cli', reason: row.reason },
  })
  if (!result.ok) {
    console.error(`  FAILED ${row.username}: ${result.error}`)
    continue
  }
  restored += 1
  followUp.push({ username: result.username, nextStep: result.nextStep })
}

console.log(`\nRestored ${restored}/${targets.length} account(s).`)

const needsGrant = followUp.filter((row) => row.nextStep === 'needs_recovery_grant')
const needsPassword = followUp.filter((row) => row.nextStep === 'sign_in_with_legacy_password')
const canSignIn = followUp.filter((row) => row.nextStep === 'sign_in_with_passkey')

if (canSignIn.length > 0) {
  console.log(`\n${canSignIn.length} can sign in with an existing passkey right away.`)
}
if (needsPassword.length > 0) {
  console.log(`\n${needsPassword.length} still have a legacy password and can sign in with it:`)
  for (const row of needsPassword) console.log(`  ${row.username}`)
}
if (needsGrant.length > 0) {
  console.log(`\n${needsGrant.length} lost their only passkey on deletion and need a recovery grant:`)
  for (const row of needsGrant) console.log(`  ${row.username}`)
  console.log('Issue one from the owner console, or with scripts/issue-recovery-grant.mjs.')
}

process.exit(restored === targets.length ? 0 : 1)
