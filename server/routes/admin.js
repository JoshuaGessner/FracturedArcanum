/**
 * Role management and owner/admin account operations.
 *
 * Registered by server.js, which owns the Express app, the Socket.IO server,
 * and every shared helper this module reads off `ctx`.
 *
 * ADMIN_KEY is read through `ctx` rather than destructured: it is
 * reassigned at runtime, and a destructured copy would freeze the value
 * captured when routes were registered.
 */
import express from 'express'
import rateLimit from 'express-rate-limit'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { adminDeleteAccount, adminIssueRecoveryGrant, adminResetAccountCredentials, adminRestoreAccount, adminSuspendAccount, adminUnsuspendAccount, assignInitialOwner, findOwnerAccountId, getAccountById, getAdminAccountDetail, hashIp, listAccounts, listAudit, listDeletedAccounts, recordAudit, setAccountRole, transferOwnership } from '../db.js'

export function registerAdminRoutes(app, ctx) {
  const {
    DIST_DIR,
    clientIp,
    disconnectAccountSockets,
    io,
    loadServerConfig,
    pushActivity,
    requireAdminRole,
    requireOwnerRecoveryKey,
    requireOwnerRole,
    requireRecentPasskeyAuth,
    saveServerConfig,
  } = ctx

// ─── Role management (admin + owner) ────────────────────────────────────────

const adminWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: false,
  legacyHeaders: false,
})
const ownerTransferLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: false,
  legacyHeaders: false,
})

// Any admin-or-owner may list accounts (for moderation search / audit UI).
app.get('/api/admin/users', requireAdminRole, (request, response) => {
  const users = listAccounts({
    search: String(request.query?.search ?? ''),
    limit: Number(request.query?.limit ?? 25),
    offset: Number(request.query?.offset ?? 0),
  })
  response.json({ ok: true, users })
})

// Only the owner can promote/demote admins.
app.post('/api/admin/users/:accountId/role', requireOwnerRole, requireRecentPasskeyAuth, adminWriteLimiter, (request, response) => {
  const targetAccountId = String(request.params?.accountId ?? '')
  const newRole = String(request.body?.role ?? '')
  const result = setAccountRole(request.accountId, targetAccountId, newRole, {
    ipHash: hashIp(clientIp(request)),
  })
  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }

  pushActivity('admin_role_change', {
    route: 'admin',
    anonymousUser: request.accountId,
    meta: { targetAccountId, newRole, previousRole: result.previousRole },
  })

  // Notify the affected user (if online) so their UI refreshes privileges.
  try {
    io.sockets.sockets.forEach((socket) => {
      if (socket.data?.accountId === targetAccountId) {
        socket.emit('server:role_changed', { role: newRole })
      }
    })
  } catch { /* non-fatal */ }

  response.json(result)
})

// Owner-only, rate-limited (3/hour), recent-passkey gated ownership transfer.
app.post('/api/admin/owner/transfer', requireOwnerRole, requireRecentPasskeyAuth, ownerTransferLimiter, (request, response) => {
  const targetAccountId = String(request.body?.targetAccountId ?? '')
  const result = transferOwnership(request.accountId, targetAccountId, {
    ipHash: hashIp(clientIp(request)),
  })
  if (!result.ok) {
    response.status(result.status ?? 400).json({ ok: false, error: result.error })
    return
  }

  // Persist the new owner in server config for future recovery reference.
  try {
    const config = loadServerConfig() ?? {}
    config.adminAccountId = targetAccountId
    saveServerConfig(config)
  } catch (err) {
    console.warn('Failed to persist new owner in server config:', err?.message ?? err)
  }

  pushActivity('admin_owner_transfer', {
    route: 'admin',
    anonymousUser: request.accountId,
    meta: { previousOwnerId: request.accountId, newOwnerId: targetAccountId },
  })

  try {
    io.sockets.sockets.forEach((socket) => {
      if (socket.data?.accountId === request.accountId) {
        socket.emit('server:role_changed', { role: 'admin' })
      } else if (socket.data?.accountId === targetAccountId) {
        socket.emit('server:role_changed', { role: 'owner' })
      }
    })
  } catch { /* non-fatal */ }

  response.json(result)
})

// ─── Owner/admin account management ──────────────────────────────────────────
// Destructive and credential-affecting actions all require recent passkey
// reauth on the operator's own session, are rate limited, and write an
// admin_audit row. No endpoint here ever returns a credential for an account:
// the one-time grant code is a single-use token the player must redeem
// themselves through a WebAuthn ceremony.

app.get('/api/admin/users/:accountId', requireAdminRole, (request, response) => {
  const detail = getAdminAccountDetail(String(request.params?.accountId ?? ''))
  if (!detail) {
    response.status(404).json({ ok: false, error: 'Account not found.' })
    return
  }
  // Admins may inspect users; only the owner may inspect another admin.
  if (detail.role !== 'user' && request.role !== 'owner') {
    response.status(403).json({ ok: false, error: 'Only the owner can inspect privileged accounts.' })
    return
  }
  response.json({ ok: true, account: detail })
})

app.get('/api/admin/users/deleted/list', requireAdminRole, (request, response) => {
  response.json({
    ok: true,
    accounts: listDeletedAccounts({
      limit: Number(request.query?.limit ?? 100),
      reason: String(request.query?.reason ?? ''),
    }),
  })
})

app.post(
  '/api/admin/users/:accountId/reset-credentials',
  requireAdminRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const result = adminResetAccountCredentials(request.accountId, String(request.params?.accountId ?? ''), {
      revokePasskeys: request.body?.revokePasskeys !== false,
      note: request.body?.note,
      ttlMs: Number(request.body?.ttlMs) || undefined,
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    disconnectAccountSockets(String(request.params?.accountId ?? ''), 'credentials_reset')
    response.json(result)
  },
)

app.post(
  '/api/admin/users/:accountId/recovery-grant',
  requireAdminRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const result = adminIssueRecoveryGrant(request.accountId, String(request.params?.accountId ?? ''), {
      note: request.body?.note,
      ttlMs: Number(request.body?.ttlMs) || undefined,
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    response.json(result)
  },
)

app.post(
  '/api/admin/users/:accountId/suspend',
  requireAdminRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const targetAccountId = String(request.params?.accountId ?? '')
    const result = adminSuspendAccount(request.accountId, targetAccountId, {
      hours: request.body?.hours,
      reason: request.body?.reason,
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    disconnectAccountSockets(targetAccountId, 'account_suspended')
    response.json(result)
  },
)

app.post(
  '/api/admin/users/:accountId/unsuspend',
  requireAdminRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const result = adminUnsuspendAccount(request.accountId, String(request.params?.accountId ?? ''), {
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    response.json(result)
  },
)

app.post(
  '/api/admin/users/:accountId/delete',
  requireOwnerRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const targetAccountId = String(request.params?.accountId ?? '')
    // Typed confirmation guards against a misclick on an irreversible-feeling
    // action; the username is the thing the operator must have looked at.
    const detail = getAdminAccountDetail(targetAccountId)
    if (!detail) {
      response.status(404).json({ ok: false, error: 'Account not found.' })
      return
    }
    if (String(request.body?.confirmUsername ?? '').toLowerCase() !== detail.username.toLowerCase()) {
      response.status(400).json({ ok: false, error: 'Type the exact username to confirm deletion.' })
      return
    }
    const result = adminDeleteAccount(request.accountId, targetAccountId, {
      reason: request.body?.reason,
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    disconnectAccountSockets(targetAccountId, 'account_deleted')
    response.json(result)
  },
)

app.post(
  '/api/admin/users/:accountId/restore',
  requireOwnerRole,
  requireRecentPasskeyAuth,
  adminWriteLimiter,
  (request, response) => {
    const result = adminRestoreAccount(request.accountId, String(request.params?.accountId ?? ''), {
      ipHash: hashIp(clientIp(request)),
    })
    if (!result.ok) {
      response.status(result.status ?? 400).json(result)
      return
    }
    response.json(result)
  },
)

app.get('/api/admin/audit', requireAdminRole, (request, response) => {
  const limit = Number(request.query?.limit ?? 50)
  response.json({ ok: true, audit: listAudit({ limit }) })
})

// Break-glass: recover owner access by promoting any account via ctx.ADMIN_KEY.
// Intended for operators who have filesystem access to the server's config
// file (where the recovery key is stored). Rate-limited and audit-logged.
const ownerRecoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: false,
  legacyHeaders: false,
})

app.post('/api/admin/owner/recover', ownerRecoveryLimiter, requireOwnerRecoveryKey, (request, response) => {
  const targetAccountId = String(request.body?.targetAccountId ?? '')
  if (!targetAccountId) {
    response.status(400).json({ ok: false, error: 'targetAccountId is required.' })
    return
  }
  const target = getAccountById(targetAccountId)
  if (!target) {
    response.status(404).json({ ok: false, error: 'Target account not found.' })
    return
  }

  const existingOwner = findOwnerAccountId()
  const ipHash = hashIp(clientIp(request))

  // If someone else is currently the owner, demote them first — the recovery
  // key is explicitly documented as override-capable.
  let previousOwnerId = null
  if (existingOwner && existingOwner !== targetAccountId) {
    previousOwnerId = existingOwner
    const transfer = transferOwnership(existingOwner, targetAccountId, { ipHash })
    if (!transfer.ok) {
      response.status(transfer.status ?? 400).json({ ok: false, error: transfer.error })
      return
    }
  } else {
    const result = assignInitialOwner(targetAccountId, { ipHash, reason: 'recovery' })
    if (!result.ok) {
      response.status(result.status ?? 400).json({ ok: false, error: result.error })
      return
    }
  }

  recordAudit(null, targetAccountId, 'owner_recovered', { previousOwnerId }, ipHash)

  try {
    const config = loadServerConfig() ?? {}
    config.adminAccountId = targetAccountId
    saveServerConfig(config)
  } catch (err) {
    console.warn('Failed to persist recovered owner in server config:', err?.message ?? err)
  }

  response.json({ ok: true, newOwnerId: targetAccountId, previousOwnerId })
})

if (existsSync(DIST_DIR)) {
  app.use(
    express.static(DIST_DIR, {
      etag: true,
      lastModified: true,
      setHeaders: (response, filePath) => {
        if (
          filePath.endsWith('index.html') ||
          filePath.endsWith('sw.js') ||
          filePath.endsWith('manifest.webmanifest')
        ) {
          response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          response.setHeader('Pragma', 'no-cache')
          response.setHeader('Expires', '0')
          return
        }

        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          return
        }

        if (filePath.includes(`${path.sep}generated${path.sep}`)) {
          response.setHeader('Cache-Control', 'public, max-age=3600')
          return
        }

        response.setHeader('Cache-Control', 'public, max-age=300')
      },
    }),
  )

  app.get(/^(?!\/api).*/, (_request, response) => {
    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

}
