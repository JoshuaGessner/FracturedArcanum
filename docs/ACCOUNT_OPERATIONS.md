# Account Operations Runbook

How to inspect, rescue, and manage player accounts. Written for the owner.

## Ground rules

1. **An operator can never read or set a working credential.** There is no
   "set their password" action and no way to read a passkey. Every rescue path
   ends with the player performing their own WebAuthn ceremony.
2. **Deletion is soft and reversible.** `account_status = 'deleted'` hides the
   account, but `player_profiles`, `owned_cards`, `match_log`, and the economy
   ledger are never purged. Everything is recoverable.
3. **Every privileged action is audited.** Actor, target, action, IP hash, and
   timestamp land in `admin_audit`. Assume you will have to explain any action.

## The legacy expiry sweeper (read this first)

`expireLegacyMigrationAccounts` soft-deletes active accounts that have not
registered a passkey within `LEGACY_MIGRATION_WINDOW_DAYS` (30) of their clock
starting. It has no undo from the player's side: login, recovery, and upgrade
all reject a deleted account, and the username stays claimed.

**It is disabled by default.** It runs only when `LEGACY_MIGRATION_EXPIRY=1` is
set in the environment, and never at import time.

Do not enable it unless you have decided that deleting dormant legacy accounts
is what you want, and you have told those players first. If you do enable it,
audit the blast radius before restarting:

```sql
SELECT COUNT(*) FROM accounts
WHERE account_status = 'active' AND deleted_at IS NULL
  AND legacy_migration_completed_at IS NULL
  AND id NOT IN (SELECT DISTINCT account_id FROM account_authenticators);
```

## Auditing the database

Docker: `docker compose exec fractured-arcanum sqlite3 /app/data/fractured-arcanum.db`
Node: `sqlite3 data/fractured-arcanum.db`

```sql
-- Account status breakdown
SELECT account_status, COUNT(*) FROM accounts GROUP BY account_status;

-- Accounts the sweeper deleted (not the player)
SELECT COUNT(*) FROM accounts WHERE id IN
  (SELECT account_id FROM security_events WHERE event_type = 'legacy_migration_expired');

-- Unfinished signups holding usernames (reaped automatically after 30 min)
SELECT username, created_at FROM accounts WHERE account_status = 'pending_passkey';

-- What a deleted account still holds
SELECT a.username, p.shards, p.season_rating, p.wins, p.losses
FROM accounts a JOIN player_profiles p ON p.account_id = a.id
WHERE a.account_status = 'deleted';
```

## Restoring deleted accounts

From the server, with the service stopped (or accepting WAL concurrency):

```bash
node scripts/restore-account.mjs --list
node scripts/restore-account.mjs --list --reason legacy_migration_expired
node scripts/restore-account.mjs --username someplayer
node scripts/restore-account.mjs --all-expired --dry-run
node scripts/restore-account.mjs --all-expired --yes
```

`--all-expired` targets only sweeper casualties. It never touches an account the
player deleted themselves — that is a deliberate act you should not silently
reverse.

A restored account keeps all its data and gets a fresh 30-day migration window
so the sweeper cannot immediately re-take it. The CLI reports how each player
gets back in:

| Next step | Meaning |
|---|---|
| `sign_in_with_passkey` | Their passkey survived; nothing more to do. |
| `sign_in_with_legacy_password` | Legacy account; their old password still works. |
| `needs_recovery_grant` | Passkey-only and their passkey was dropped on deletion. Issue a grant. |

## Recovery grants

A grant is a single-use, one-hour credential that lets its holder attach a new
passkey to one account. It is the last-resort path for a player who lost both
their device and their recovery codes.

**Issuing.** From the owner console, or:

```
POST /api/admin/users/:accountId/recovery-grant     # rescue, changes nothing else
POST /api/admin/users/:accountId/reset-credentials  # also revokes passkeys + sessions
```

Both require recent passkey reauth on your own session.

**The code is shown exactly once.** It is hashed at rest and cannot be read back
from the database, the API, or the audit log. If you lose it, issue another —
issuing revokes any earlier unconsumed grant, so only one is ever live.

**Relaying it.** Send it over whatever support channel you already use. Verify
the person is the account holder first; a grant is full account access. Prefer
`recovery-grant` over `reset-credentials` unless you believe the account is
compromised — the gentler action leaves their existing passkeys working.

**Redeeming.** The player enters the code, which identifies its own account (no
username needed), then registers a new passkey. The grant is consumed only when
that passkey verifies, so an abandoned attempt does not burn it.

## Suspension

```
POST /api/admin/users/:accountId/suspend     { hours, reason }
POST /api/admin/users/:accountId/unsuspend
```

Sets `locked_until`, revokes sessions, and disconnects live sockets. A suspended
account fails the readiness check, so it cannot play. Default 24 hours, max one
year. Admins may suspend users; only the owner may suspend an admin.

## Deletion and restore (owner only)

```
POST /api/admin/users/:accountId/delete    { confirmUsername, reason }
POST /api/admin/users/:accountId/restore
```

Delete requires typing the exact username. It is a soft delete — data is
retained and `restore` brings the player back whole.

There is deliberately **no hard-delete endpoint**. Permanent erasure (a GDPR
request, say) should be a considered, manual, out-of-band operation, not a
button next to the reversible one.

## Permission model

| Action | Admin | Owner |
|---|---|---|
| Inspect a user | yes | yes |
| Inspect an admin | no | yes |
| Reset credentials / issue grant (user) | yes | yes |
| Reset credentials / issue grant (admin) | no | yes |
| Suspend / unsuspend (user) | yes | yes |
| Delete / restore | no | yes |
| Change roles, transfer ownership | no | yes |
| Anything targeting the owner | no | no |

Nobody may act on their own account through these paths; use normal account
settings. The owner account can only be changed through ownership transfer.

## Adding email later

The account schema already carries `email`, `email_normalized`,
`email_verified_at`, and an unused `email_tokens` table. The grant system was
built channel-agnostic for this: `account_recovery_grants.channel` accepts
`'email'` alongside `'manual'`, with `delivery_hint` for the masked address.

To add it: verify addresses at signup, then issue grants with `channel: 'email'`
and send the code from the transport layer. Redemption, expiry, single-use
semantics, and the audit trail all work unchanged.
