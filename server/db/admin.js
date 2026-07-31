/**
 * Admin roles and owner/admin account management.
 *
 * Roles are re-read from the database on every privileged request so a demotion
 * takes effect without invalidating sessions.
 */
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { _deleteAuthChallengesByAccount, _deleteAuthenticatorsByAccount, _getById, _markAccountDeleted, _revokeRecoveryGrantsByAccount, _revokeSessionsByAccount, issueAccountRecoveryGrant, listAccountPasskeys, listAccountRecoveryGrants, recordSecurityEvent, recoveryStatusForAccount, restoreAccount } from './accounts.js'
import { db, prepare, transaction } from './connection.js'
import { _getProfile } from './profiles.js'

// ─── Admin role management ──────────────────────────────────────────────────
// Role is the source of truth for privileged access. Sessions are NOT
// role-stamped; every privileged request re-reads the role so demotion takes
// effect on the next request.

const ROLE_VALUES = new Set(['user', 'admin', 'owner'])
const ROLE_RANK = { user: 0, admin: 1, owner: 2 }

const _getRole = prepare(`SELECT role FROM accounts WHERE id = ?`)
const _setRole = prepare(`UPDATE accounts SET role = ? WHERE id = ?`)
const _findOwnerId = prepare(`SELECT id FROM accounts WHERE role = 'owner' LIMIT 1`)
const _searchAccounts = prepare(`
  SELECT a.id, a.username, a.display_name as displayName, a.role,
         a.created_at as createdAt, a.last_login as lastLogin,
         a.account_status as accountStatus, a.deleted_at as deletedAt,
         a.locked_until as lockedUntil, a.account_setup_required as setupRequired,
         a.password_reset_required as passwordResetRequired,
         a.legacy_migration_completed_at as legacyMigrationCompletedAt,
         (SELECT COUNT(*) FROM account_authenticators k WHERE k.account_id = a.id) AS passkeyCount,
         (SELECT COUNT(*) FROM account_recovery_codes c
            WHERE c.account_id = a.id AND c.used_at IS NULL AND c.revoked_at IS NULL) AS recoveryCodeCount
  FROM accounts a
  WHERE (? = '' OR a.username LIKE ? OR a.display_name LIKE ? OR a.id = ?)
  ORDER BY
    CASE a.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    a.last_login DESC NULLS LAST,
    a.username COLLATE NOCASE ASC
  LIMIT ? OFFSET ?
`)

const _insertAudit = prepare(`
  INSERT INTO admin_audit (id, actor_account_id, target_account_id, action, metadata, ip_hash)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const _listAudit = prepare(`
  SELECT
    a.id,
    a.actor_account_id   as actorAccountId,
    actor.username       as actorUsername,
    actor.display_name   as actorDisplayName,
    a.target_account_id  as targetAccountId,
    target.username      as targetUsername,
    target.display_name  as targetDisplayName,
    a.action,
    a.metadata,
    a.created_at         as createdAt
  FROM admin_audit a
  LEFT JOIN accounts actor  ON actor.id  = a.actor_account_id
  LEFT JOIN accounts target ON target.id = a.target_account_id
  ORDER BY a.created_at DESC
  LIMIT ?
`)

export function getAccountRole(accountId) {
  if (!accountId) return 'user'
  const row = _getRole.get(accountId)
  return row?.role && ROLE_VALUES.has(row.role) ? row.role : 'user'
}

export function hasRoleAtLeast(role, minRole) {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minRole] ?? 0)
}

export function findOwnerAccountId() {
  const row = _findOwnerId.get()
  return row?.id ?? null
}

/**
 * Promote or demote another account. Owner-only. Cannot create or overwrite
 * the owner role — use transferOwnership for that.
 *
 * @param {string} actorAccountId  The account performing the action (must be owner).
 * @param {string} targetAccountId The account whose role is changing.
 * @param {'admin'|'user'} newRole The desired role.
 * @param {{ ipHash?: string | null }} [options]
 */
export function setAccountRole(actorAccountId, targetAccountId, newRole, { ipHash = null } = {}) {
  if (!actorAccountId || !targetAccountId) {
    return { ok: false, status: 400, error: 'Actor and target are required.' }
  }
  if (actorAccountId === targetAccountId) {
    return { ok: false, status: 400, error: 'You cannot change your own role.' }
  }
  if (newRole !== 'admin' && newRole !== 'user') {
    return { ok: false, status: 400, error: 'Role must be "admin" or "user".' }
  }
  const actorRole = getAccountRole(actorAccountId)
  if (actorRole !== 'owner') {
    return { ok: false, status: 403, error: 'Only the owner can change roles.' }
  }
  const targetRow = _getById.get(targetAccountId)
  if (!targetRow) {
    return { ok: false, status: 404, error: 'Target account not found.' }
  }
  if (targetRow.role === 'owner') {
    return { ok: false, status: 403, error: 'The owner role cannot be changed here. Use ownership transfer.' }
  }
  if (targetRow.role === newRole) {
    return { ok: true, role: newRole, unchanged: true, target: sanitizeAdminAccount(targetRow) }
  }

  const previousRole = targetRow.role
  const metadata = JSON.stringify({ previousRole, newRole })
  const auditId = `aud-${randomBytes(10).toString('hex')}`

  const tx = db.transaction(() => {
    _setRole.run(newRole, targetAccountId)
    _insertAudit.run(auditId, actorAccountId, targetAccountId, 'role_change', metadata, ipHash)
  })
  tx()

  return {
    ok: true,
    role: newRole,
    previousRole,
    auditId,
    target: sanitizeAdminAccount({ ...targetRow, role: newRole }),
  }
}

/**
 * Transfer ownership from the current owner to another account.
 * Demotes the current owner to 'admin' and promotes the target to 'owner'
 * atomically. The caller must verify the owner's password before calling.
 *
 * @param {string} currentOwnerId
 * @param {string} targetAccountId
 * @param {{ ipHash?: string | null }} [options]
 */
export function transferOwnership(currentOwnerId, targetAccountId, { ipHash = null } = {}) {
  if (!currentOwnerId || !targetAccountId) {
    return { ok: false, status: 400, error: 'Current owner and target are required.' }
  }
  if (currentOwnerId === targetAccountId) {
    return { ok: false, status: 400, error: 'Target must be a different account.' }
  }
  if (getAccountRole(currentOwnerId) !== 'owner') {
    return { ok: false, status: 403, error: 'Only the current owner can transfer ownership.' }
  }
  const target = _getById.get(targetAccountId)
  if (!target) {
    return { ok: false, status: 404, error: 'Target account not found.' }
  }

  const metadata = JSON.stringify({ previousOwnerId: currentOwnerId, newOwnerId: targetAccountId })
  const auditId = `aud-${randomBytes(10).toString('hex')}`

  // SQLite can't do a swap in a single UPDATE because of the unique partial
  // index; demote first, then promote, inside a transaction.
  const tx = db.transaction(() => {
    _setRole.run('admin', currentOwnerId)
    _setRole.run('owner', targetAccountId)
    _insertAudit.run(auditId, currentOwnerId, targetAccountId, 'ownership_transfer', metadata, ipHash)
  })
  tx()

  return { ok: true, auditId, previousOwnerId: currentOwnerId, newOwnerId: targetAccountId }
}

/**
 * Bootstrap or recover the owner role. Used by the setup flow on first launch
 * and by the ADMIN_KEY-gated recovery endpoint. Refuses to run if an owner
 * already exists (use transferOwnership for that path).
 *
 * @param {string} targetAccountId
 * @param {{ ipHash?: string | null, actorAccountId?: string | null, reason?: string }} [options]
 */
export function assignInitialOwner(targetAccountId, { ipHash = null, actorAccountId = null, reason = 'bootstrap' } = {}) {
  if (!targetAccountId) {
    return { ok: false, status: 400, error: 'Target is required.' }
  }
  const target = _getById.get(targetAccountId)
  if (!target) {
    return { ok: false, status: 404, error: 'Target account not found.' }
  }
  const existingOwner = findOwnerAccountId()
  if (existingOwner && existingOwner !== targetAccountId) {
    return { ok: false, status: 409, error: 'An owner already exists. Use ownership transfer instead.' }
  }

  const auditId = `aud-${randomBytes(10).toString('hex')}`
  const metadata = JSON.stringify({ reason })

  const tx = db.transaction(() => {
    _setRole.run('owner', targetAccountId)
    _insertAudit.run(auditId, actorAccountId, targetAccountId, 'owner_assigned', metadata, ipHash)
  })
  tx()

  return { ok: true, auditId }
}

function sanitizeAdminAccount(row) {
  if (!row) return null
  return {
    accountId: row.id ?? row.accountId,
    username: row.username,
    displayName: row.display_name ?? row.displayName,
    role: row.role,
    createdAt: row.created_at ?? row.createdAt,
    lastLogin: row.last_login ?? row.lastLogin,
  }
}

export function listAccounts({ search = '', limit = 25, offset = 0 } = {}) {
  const normalized = String(search ?? '').trim().toLowerCase().slice(0, 60)
  const like = normalized ? `%${normalized}%` : ''
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25))
  const safeOffset = Math.max(0, Number(offset) || 0)
  const rows = _searchAccounts.all(normalized, like, like, normalized, safeLimit, safeOffset)
  const now = Date.now()
  return rows.map((row) => {
    const lockedUntil = row.lockedUntil ? Date.parse(row.lockedUntil) : 0
    const suspended = Number.isFinite(lockedUntil) && lockedUntil > now
    return {
      accountId: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      createdAt: row.createdAt,
      lastLogin: row.lastLogin,
      accountStatus: row.accountStatus,
      deletedAt: row.deletedAt,
      lockedUntil: row.lockedUntil,
      suspended,
      setupRequired: Number(row.setupRequired) === 1,
      passwordResetRequired: Number(row.passwordResetRequired) === 1,
      passkeyCount: row.passkeyCount,
      recoveryCodeCount: row.recoveryCodeCount,
      // A legacy account has not finished the passkey migration, so it can
      // still sign in with its password.
      legacy: !row.legacyMigrationCompletedAt && row.passkeyCount === 0,
    }
  })
}

// ─── Owner/admin account management ──────────────────────────────────────────
// Every action here is mediated: an operator can reset, suspend, or restore an
// account, but can never read or set a working credential for it. Credential
// re-establishment always goes through a one-time grant the player redeems
// themselves, so an operator cannot sign in as a player.

/**
 * Shared guard for privileged account actions. Admins may act on ordinary
 * users; only the owner may act on an admin; nobody may act on the owner
 * through this path (ownership transfer is its own flow).
 */
function authorizeAccountAction(actorAccountId, targetAccountId, { ownerOnly = false } = {}) {
  if (!actorAccountId || !targetAccountId) {
    return { ok: false, status: 400, error: 'Actor and target are required.' }
  }
  // Checked before the role rules so self-targeting reports why it was refused
  // rather than falling through to a misleading privilege message.
  if (actorAccountId === targetAccountId) {
    return { ok: false, status: 400, error: 'Use your own account settings for this.' }
  }
  const actorRole = getAccountRole(actorAccountId)
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    return { ok: false, status: 403, error: 'Admin access required.' }
  }
  if (ownerOnly && actorRole !== 'owner') {
    return { ok: false, status: 403, error: 'Only the owner can perform this action.' }
  }
  const target = _getById.get(targetAccountId)
  if (!target) return { ok: false, status: 404, error: 'Target account not found.' }
  if (target.role === 'owner') {
    return { ok: false, status: 403, error: 'The owner account cannot be managed here.' }
  }
  if (target.role === 'admin' && actorRole !== 'owner') {
    return { ok: false, status: 403, error: 'Only the owner can manage an admin account.' }
  }
  return { ok: true, actorRole, target }
}

function writeAudit(actorAccountId, targetAccountId, action, metadata, ipHash) {
  const auditId = `aud-${randomBytes(10).toString('hex')}`
  _insertAudit.run(auditId, actorAccountId, targetAccountId, action, JSON.stringify(metadata ?? {}), ipHash ?? null)
  return auditId
}

/**
 * Force a credential reset. Revokes every session and, when `revokePasskeys` is
 * set, every registered passkey, then mints a one-time grant the player uses to
 * attach a new one. The returned code is the only copy — relay it to the player
 * over your support channel and it is gone from memory.
 */
export function adminResetAccountCredentials(actorAccountId, targetAccountId, options = {}) {
  const guard = authorizeAccountAction(actorAccountId, targetAccountId)
  if (!guard.ok) return guard
  const target = guard.target
  if (target.deleted_at || target.account_status === 'deleted') {
    return { ok: false, status: 400, error: 'Restore the account before resetting its credentials.' }
  }

  const revokePasskeys = options.revokePasskeys !== false
  let grant = null
  const tx = db.transaction(() => {
    _revokeSessionsByAccount.run(targetAccountId)
    if (revokePasskeys) _deleteAuthenticatorsByAccount.run(targetAccountId)
    // A legacy password is a live credential; flag it so the account cannot
    // simply be signed back into with a password the operator may have reset.
    db.prepare(`
      UPDATE accounts
      SET password_reset_required = 1, account_setup_required = 1, last_security_event_at = datetime('now')
      WHERE id = ?
    `).run(targetAccountId)
    recordSecurityEvent(targetAccountId, 'admin_credential_reset', {
      metadata: { actorAccountId, revokePasskeys },
    })
  })
  tx()

  grant = issueAccountRecoveryGrant(targetAccountId, {
    issuedByAccountId: actorAccountId,
    channel: options.channel ?? 'manual',
    ttlMs: options.ttlMs,
    note: String(options.note ?? 'Admin credential reset'),
    metadata: { actorAccountId },
  })
  if (!grant.ok) return grant

  const auditId = writeAudit(actorAccountId, targetAccountId, 'credential_reset', {
    revokePasskeys,
    grantId: grant.grantId,
    channel: grant.channel,
  }, options.ipHash)

  return {
    ok: true,
    auditId,
    username: target.username,
    // Surfaced exactly once; never stored in plaintext and never retrievable again.
    grantCode: grant.code,
    grantId: grant.grantId,
    expiresAt: grant.expiresAt,
    revokedPasskeys: revokePasskeys,
  }
}

/** Issue a recovery grant without revoking anything — the gentler rescue. */
export function adminIssueRecoveryGrant(actorAccountId, targetAccountId, options = {}) {
  const guard = authorizeAccountAction(actorAccountId, targetAccountId)
  if (!guard.ok) return guard

  const grant = issueAccountRecoveryGrant(targetAccountId, {
    issuedByAccountId: actorAccountId,
    channel: options.channel ?? 'manual',
    ttlMs: options.ttlMs,
    note: String(options.note ?? 'Support-issued recovery grant'),
    metadata: { actorAccountId },
  })
  if (!grant.ok) return grant

  const auditId = writeAudit(actorAccountId, targetAccountId, 'recovery_grant_issued', {
    grantId: grant.grantId,
    channel: grant.channel,
  }, options.ipHash)

  return {
    ok: true,
    auditId,
    username: guard.target.username,
    grantCode: grant.code,
    grantId: grant.grantId,
    expiresAt: grant.expiresAt,
  }
}

/** Suspend an account for a bounded window. Sessions are revoked immediately. */
export function adminSuspendAccount(actorAccountId, targetAccountId, options = {}) {
  const guard = authorizeAccountAction(actorAccountId, targetAccountId)
  if (!guard.ok) return guard

  const hours = Math.min(24 * 365, Math.max(1, Number(options.hours) || 24))
  const reason = String(options.reason ?? '').slice(0, 200)
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE accounts
      SET locked_until = datetime('now', ?), last_security_event_at = datetime('now')
      WHERE id = ?
    `).run(`+${hours} hours`, targetAccountId)
    _revokeSessionsByAccount.run(targetAccountId)
    recordSecurityEvent(targetAccountId, 'admin_account_suspended', {
      metadata: { actorAccountId, hours, reason },
    })
  })
  tx()

  const auditId = writeAudit(actorAccountId, targetAccountId, 'account_suspended', { hours, reason }, options.ipHash)
  const refreshed = _getById.get(targetAccountId)
  return { ok: true, auditId, username: refreshed.username, lockedUntil: refreshed.locked_until }
}

export function adminUnsuspendAccount(actorAccountId, targetAccountId, options = {}) {
  const guard = authorizeAccountAction(actorAccountId, targetAccountId)
  if (!guard.ok) return guard

  db.prepare(`
    UPDATE accounts
    SET locked_until = NULL, failed_login_count = 0, last_security_event_at = datetime('now')
    WHERE id = ?
  `).run(targetAccountId)
  recordSecurityEvent(targetAccountId, 'admin_account_unsuspended', { metadata: { actorAccountId } })

  const auditId = writeAudit(actorAccountId, targetAccountId, 'account_unsuspended', {}, options.ipHash)
  return { ok: true, auditId, username: guard.target.username }
}

/**
 * Soft-delete an account on the player's behalf. Reversible via
 * `adminRestoreAccount`; player data is retained untouched.
 */
export function adminDeleteAccount(actorAccountId, targetAccountId, options = {}) {
  const guard = authorizeAccountAction(actorAccountId, targetAccountId, { ownerOnly: true })
  if (!guard.ok) return guard
  if (guard.target.deleted_at) {
    return { ok: false, status: 400, error: 'Account is already deleted.' }
  }

  const reason = String(options.reason ?? '').slice(0, 200)
  const tx = db.transaction(() => {
    _markAccountDeleted.run(targetAccountId)
    _revokeSessionsByAccount.run(targetAccountId)
    _revokeRecoveryGrantsByAccount.run(targetAccountId)
    _deleteAuthChallengesByAccount.run(targetAccountId)
    db.prepare(`
      UPDATE trades SET status = 'cancelled', updated_at = datetime('now')
      WHERE status = 'pending' AND (from_account_id = ? OR to_account_id = ?)
    `).run(targetAccountId, targetAccountId)
    recordSecurityEvent(targetAccountId, 'admin_account_deleted', {
      metadata: { actorAccountId, reason },
    })
  })
  tx()

  const auditId = writeAudit(actorAccountId, targetAccountId, 'account_deleted', { reason }, options.ipHash)
  return { ok: true, auditId, username: guard.target.username }
}

export function adminRestoreAccount(actorAccountId, targetAccountId, options = {}) {
  const guard = authorizeAccountAction(actorAccountId, targetAccountId, { ownerOnly: true })
  if (!guard.ok) return guard

  const restored = restoreAccount(targetAccountId, { metadata: { actorAccountId, source: 'admin_console' } })
  if (!restored.ok) return restored

  const auditId = writeAudit(actorAccountId, targetAccountId, 'account_restored', {
    nextStep: restored.nextStep,
  }, options.ipHash)
  return { ...restored, auditId }
}

/**
 * Full account detail for the owner console: status, auth factors, grant
 * history, and recent security events. Contains no credential material.
 */
export function getAdminAccountDetail(accountId) {
  const account = _getById.get(accountId)
  if (!account) return null
  const profile = _getProfile.get(accountId)
  const lockedUntil = account.locked_until ? Date.parse(account.locked_until) : 0

  return {
    accountId: account.id,
    username: account.username,
    displayName: account.display_name,
    role: account.role,
    accountStatus: account.account_status,
    createdAt: account.created_at,
    lastLogin: account.last_login,
    deletedAt: account.deleted_at,
    lockedUntil: account.locked_until,
    suspended: Number.isFinite(lockedUntil) && lockedUntil > Date.now(),
    setupRequired: Number(account.account_setup_required) === 1,
    passwordResetRequired: Number(account.password_reset_required) === 1,
    legacyMigration: {
      startedAt: account.legacy_migration_started_at,
      deadlineAt: account.legacy_migration_deadline_at,
      completedAt: account.legacy_migration_completed_at,
    },
    passkeys: listAccountPasskeys(accountId),
    recovery: recoveryStatusForAccount(accountId),
    recoveryGrants: listAccountRecoveryGrants(accountId),
    securityEvents: db.prepare(`
      SELECT event_type as eventType, created_at as createdAt, metadata
      FROM security_events WHERE account_id = ? ORDER BY created_at DESC LIMIT 20
    `).all(accountId),
    profile: profile ? {
      shards: profile.shards,
      seasonRating: profile.season_rating,
      wins: profile.wins,
      losses: profile.losses,
    } : null,
  }
}

/**
 * @param {string|null} actorAccountId
 * @param {string|null} targetAccountId
 * @param {string} action
 * @param {Record<string, unknown>} [metadata]
 * @param {string|null} [ipHash]
 */
export function recordAudit(actorAccountId, targetAccountId, action, metadata = {}, ipHash = null) {
  const safeAction = String(action ?? '').slice(0, 60) || 'unknown'
  const safeMeta = JSON.stringify(metadata ?? {}).slice(0, 2000)
  const id = `aud-${randomBytes(10).toString('hex')}`
  _insertAudit.run(id, actorAccountId ?? null, targetAccountId ?? null, safeAction, safeMeta, ipHash ?? null)
  return id
}

export function listAudit({ limit = 50 } = {}) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50))
  const rows = _listAudit.all(safeLimit)
  return rows.map((row) => {
    let metadata = {}
    try { metadata = JSON.parse(row.metadata) } catch { /* ignore */ }
    return {
      id: row.id,
      action: row.action,
      actor: row.actorAccountId
        ? { accountId: row.actorAccountId, username: row.actorUsername, displayName: row.actorDisplayName }
        : null,
      target: row.targetAccountId
        ? { accountId: row.targetAccountId, username: row.targetUsername, displayName: row.targetDisplayName }
        : null,
      metadata,
      createdAt: row.createdAt,
    }
  })
}

// Helper for the server.js setup endpoint: returns a narrow subset of account
// columns, used by the password-confirmation flow for ownership transfer.
// We intentionally avoid `SELECT *` to ensure the password hash is only
// surfaced through this named accessor.
const _getAccountFull = prepare(
  `SELECT id, username, display_name, password_hash, role FROM accounts WHERE id = ?`,
)
export function getAccountById(accountId) {
  if (!accountId) return null
  return _getAccountFull.get(accountId) ?? null
}

