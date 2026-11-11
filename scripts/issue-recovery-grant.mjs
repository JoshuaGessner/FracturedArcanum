#!/usr/bin/env node
// Issue a one-time recovery code for a player, from the server itself.
//
// The owner console is the normal place to do this. This is the fallback for
// when the console is unreachable — the owner is the one locked out, the web
// app is down, or you are already on the box. It does exactly what the
// console's "Issue recovery code" button does, and never touches the player's
// collection, rating, or match history.
//
//   node scripts/issue-recovery-grant.mjs --username someplayer
//   node scripts/issue-recovery-grant.mjs --username someplayer --hours 24
//   node scripts/issue-recovery-grant.mjs --account-id acct-0123abcd --reset
//   node scripts/issue-recovery-grant.mjs --username someplayer --status
//
// Safe to run while the service is up: one short write transaction under WAL.

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
  console.log(`Issue a one-time recovery code for a Fractured Arcanum account.

Options:
  --username <name>     Target account by username.
  --account-id <id>     Target account by id.
  --hours <1|8|24>      How long the code stays valid (default 1).
  --reset               Also revoke every passkey, session, and legacy password
                        now. Use only if you believe the account is compromised.
  --status              Show the account's sign-in state and recent codes; issue nothing.
  --yes                 Skip the confirmation prompt.
  --help                Show this help.

Reads DATA_DIR the same way the server does; set it if the DB is not at ./data.`)
  process.exit(0)
}

const db = await import('../server/db.js')

const username = option('username').toLowerCase()
const accountIdOption = option('account-id')
const account = accountIdOption
  ? db.getAccountById(accountIdOption)
  : db.default.prepare('SELECT * FROM accounts WHERE username = ?').get(username)

if (!account) {
  console.error(`No account matches ${username || accountIdOption || '(nothing given)'}.`)
  process.exit(1)
}

const detail = db.getAdminAccountDetail(account.id)
console.log(`\n@${detail.username} (${detail.accountId})`)
console.log(`  status          ${detail.accountStatus}${detail.suspended ? ', suspended' : ''}`)
console.log(`  passkeys        ${detail.passkeys.length}`)
console.log(`  sign-in reset   ${detail.passwordResetRequired ? 'yes, waiting on a recovery code' : 'no'}`)
if (detail.profile) {
  const { shards, seasonRating, wins, losses } = detail.profile
  console.log(`  progress        ${shards} shards · ${seasonRating} rating · ${wins}W/${losses}L`)
}
for (const grant of detail.recoveryGrants.slice(0, 3)) {
  console.log(`  code            ${grant.status}, issued ${grant.createdAt} UTC${grant.note ? ` (${grant.note})` : ''}`)
}

if (flag('status')) process.exit(0)

if (detail.deletedAt || detail.accountStatus === 'deleted') {
  console.error('\nThis account is deleted. Restore it first: node scripts/restore-account.mjs --username <name>')
  process.exit(1)
}

const hours = Number(option('hours') || 1)
if (!db.RECOVERY_GRANT_TTL_HOURS.includes(hours)) {
  console.error(`--hours must be one of ${db.RECOVERY_GRANT_TTL_HOURS.join(', ')}.`)
  process.exit(1)
}
const reset = flag('reset')

if (!flag('yes')) {
  const rl = createInterface({ input: stdin, output: stdout })
  const action = reset
    ? `REVOKE every passkey, session, and password for @${detail.username}, then issue a ${hours}h code`
    : `Issue a ${hours}h recovery code for @${detail.username} (any earlier unused code is cancelled)`
  const answer = await rl.question(`\n${action}? [y/N] `)
  rl.close()
  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Aborted.')
    process.exit(0)
  }
}

// The CLI acts with the operator's shell access rather than an account, so it
// uses the same functions as the console minus the role check, and records
// itself as the source in the security log.
const ttlMs = hours * 60 * 60 * 1000
const metadata = { source: 'issue-recovery-grant-cli' }
const outcome = reset
  ? db.resetCredentialsWithGrant(account.id, { ttlMs, note: 'CLI credential reset', metadata })
  : db.issueAccountRecoveryGrant(account.id, { ttlMs, note: 'CLI-issued recovery code', metadata })

if (!outcome.ok) {
  console.error(`\nFailed: ${outcome.error}`)
  process.exit(1)
}
const result = reset ? { ...outcome.grant, username: outcome.username } : outcome

console.log(`
Recovery code for @${result.username}:

    ${result.code}

Valid for ${hours} hour${hours === 1 ? '' : 's'} (until ${result.expiresAt}), single use.
This is the only time it is shown. If you lose it, run this again.

Send the player:
  1. Open the game and go to the sign-in screen.
  2. Tap "No codes left?" then "Use a support code".
  3. Enter the code and create a new passkey.
  4. Save the new recovery codes they are shown.
`)
process.exit(0)
