import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { authFetch } from '../utils'
import { ARENA_URL } from '../constants'
import type {
  AdminAccountDetail,
  AdminAuditEntry,
  AdminDeletedAccount,
  AdminOverview,
  AdminUser,
  ComplaintFormState,
  ConfirmOptions,
  IssuedGrant,
  ServerProfile,
} from '../types'

/**
 * Options accepted by AppShell's text-prompt dialog.
 *
 * Declared structurally rather than imported: the shell's own
 * `TextPromptRequest` is a local type inside `AppShell`, and exporting it just
 * for this hook would widen a private contract. Only the caller's half of the
 * shape is needed here — `resolve` belongs to the dialog.
 */
type TextPromptOptions = {
  title: string
  label: string
  confirmLabel?: string
  placeholder?: string
  initialValue?: string
  maxLength?: number
}

/**
 * Owner/admin operations console: overview, user roles, audit log, account
 * management, ownership transfer, and issue reports.
 *
 * Extracted from `AppShell`, which had grown past 5,000 lines. This cluster was
 * the cleanest seam available: every identifier it owns was referenced exactly
 * once outside its handler region — in the `appCtx` literal — so the hook can
 * own the state outright and `AppShell` simply spreads what it returns.
 *
 * The hook owns its own state rather than taking setters as parameters. That is
 * what keeps the dependency list down to the handful of genuinely cross-cutting
 * values below, instead of the ~25 setters the handlers touch.
 */
export type AdminConsoleDeps = {
  authToken: string
  isAdminRole: boolean
  isOwnerRole: boolean
  serverProfile: ServerProfile | null
  setServerProfile: Dispatch<SetStateAction<ServerProfile | null>>
  /** Privileged actions re-prompt for a passkey; returns false if declined. */
  ensureRecentPasskeyAuth: () => Promise<boolean>
  askConfirm: (options: ConfirmOptions) => Promise<boolean>
  askTextPrompt: (options: TextPromptOptions) => Promise<string | null>
  setToastMessage: (message: string) => void
  /** Per-session analytics id, sent with issue reports. */
  sessionId: string
  visitorId: string
  /**
   * Live-service banner state, owned by AppShell and written here when an
   * operator saves settings so the change shows immediately without a refetch.
   */
  setMotd: Dispatch<SetStateAction<string>>
  setDailyQuest: Dispatch<SetStateAction<string>>
  setFeaturedMode: Dispatch<SetStateAction<string>>
  setMaintenanceMode: Dispatch<SetStateAction<boolean>>
}

export function useAdminConsole({
  authToken,
  isAdminRole,
  isOwnerRole,
  serverProfile,
  setServerProfile,
  ensureRecentPasskeyAuth,
  askConfirm,
  askTextPrompt,
  setToastMessage,
  sessionId,
  visitorId,
  setMotd,
  setDailyQuest,
  setFeaturedMode,
  setMaintenanceMode,
}: AdminConsoleDeps) {
  const [complaintForm, setComplaintForm] = useState<ComplaintFormState>({
    category: 'gameplay',
    severity: 'normal',
    summary: '',
    details: '',
  })
  const [complaintStatus, setComplaintStatus] = useState('No issue reports submitted in this session.')
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [adminUsersLoading, setAdminUsersLoading] = useState(false)
  const [adminUserSearch, setAdminUserSearch] = useState('')
  const [adminAudit, setAdminAudit] = useState<AdminAuditEntry[]>([])
  const [adminAuditFilter, setAdminAuditFilter] = useState<string>('all')
  const [adminAuditExpandedId, setAdminAuditExpandedId] = useState<string | null>(null)
  const [adminAccountDetail, setAdminAccountDetail] = useState<AdminAccountDetail | null>(null)
  const [adminAccountLoading, setAdminAccountLoading] = useState(false)
  const [adminDeletedAccounts, setAdminDeletedAccounts] = useState<AdminDeletedAccount[]>([])
  const [adminDeletedLoading, setAdminDeletedLoading] = useState(false)
  // Shown once after issuing; the code cannot be retrieved again.
  const [issuedGrant, setIssuedGrant] = useState<IssuedGrant | null>(null)
  const [transferForm, setTransferForm] = useState({ targetAccountId: '', password: '' })
  const [transferStatus, setTransferStatus] = useState('')
  const [adminSettings, setAdminSettings] = useState({
    motd: 'Queue up for ranked arena play.',
    quest: 'Win 1 ranked arena match',
    featuredMode: 'Ranked Blitz',
    maintenanceMode: false,
  })

  async function refreshAdminOverview() {
    if (!authToken) {
      setAdminError('Sign in with your owner or admin account to open the operations console.')
      return
    }
    if (!isAdminRole) {
      setAdminError('Your account does not have admin privileges.')
      return
    }

    setAdminLoading(true)

    try {
      const response = await authFetch('/api/admin/overview', authToken)

      if (!response.ok) {
        throw new Error('Admin access denied')
      }

      const data = (await response.json()) as AdminOverview
      setAdminOverview(data)
      setAdminSettings(data.settings)
      setAdminError('')
      // Also refresh users + audit for owner UI
      if (isOwnerRole) {
        void refreshAdminUsers()
        void refreshAdminAudit()
      }
    } catch {
      setAdminOverview(null)
      setAdminError('Admin access failed. Your session may have expired.')
    } finally {
      setAdminLoading(false)
    }
  }

  async function refreshAdminUsers(searchTerm = adminUserSearch) {
    if (!authToken || !isAdminRole) return
    setAdminUsersLoading(true)
    try {
      const q = searchTerm.trim()
      const path = q ? `/api/admin/users?search=${encodeURIComponent(q)}` : '/api/admin/users'
      const response = await authFetch(path, authToken)
      if (!response.ok) throw new Error('users fetch failed')
      const data = (await response.json()) as { ok: boolean; users: AdminUser[] }
      setAdminUsers(data.users ?? [])
    } catch {
      // non-fatal
    } finally {
      setAdminUsersLoading(false)
    }
  }

  async function refreshAdminAudit() {
    if (!authToken || !isAdminRole) return
    try {
      const response = await authFetch('/api/admin/audit', authToken)
      if (!response.ok) return
      const data = (await response.json()) as { ok: boolean; audit: AdminAuditEntry[] }
      setAdminAudit(data.audit ?? [])
    } catch { /* non-fatal */ }
  }

  async function handleSetUserRole(target: AdminUser, newRole: 'admin' | 'user') {
    if (!authToken || !isOwnerRole) return
    if (target.accountId === (serverProfile?.accountId ?? '')) {
      setAdminError('You cannot change your own role.')
      return
    }
    const niceName = target.displayName || target.username
    const promoting = newRole === 'admin'
    const ok = await askConfirm({
      title: promoting ? 'Promote to admin?' : 'Demote to player?',
      body: (
        <>
          {promoting ? (
            <p>
              <strong>@{target.username}</strong> will gain access to the Ops console — including
              live service controls, user moderation, and the audit log.
            </p>
          ) : (
            <p>
              <strong>@{target.username}</strong> will immediately lose access to the Ops
              console.
            </p>
          )}
          <p className="mini-text">You can reverse this at any time.</p>
        </>
      ),
      confirmLabel: promoting ? 'Promote' : 'Demote',
      danger: !promoting,
    })
    if (!ok) return
    try {
      const response = await authFetch(
        `/api/admin/users/${encodeURIComponent(target.accountId)}/role`,
        authToken,
        { method: 'POST', body: { role: newRole } },
      )
      const data = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setAdminError(data.error ?? 'Role change failed.')
        return
      }
      setAdminError('')
      setToastMessage(`${niceName} is now ${promoting ? 'an admin' : 'a regular user'}.`)
      await refreshAdminUsers()
      await refreshAdminAudit()
    } catch {
      setAdminError('Could not change that role right now.')
    }
  }

  // ─── Account management (owner/admin console) ──────────────────────────────
  // Every action here goes through an endpoint that requires recent passkey
  // reauth and writes an audit row. Nothing here can read a credential: the
  // only thing an operator ever receives is a one-time grant code the player
  // must redeem themselves.

  async function openAdminAccount(accountId: string) {
    if (!authToken || !isAdminRole) return
    setAdminAccountLoading(true)
    setAdminError('')
    try {
      const response = await authFetch(`/api/admin/users/${encodeURIComponent(accountId)}`, authToken)
      const data = (await response.json()) as { ok: boolean; account?: AdminAccountDetail; error?: string }
      if (!response.ok || !data.ok || !data.account) {
        setAdminError(data.error ?? 'Could not load that account.')
        return
      }
      setAdminAccountDetail(data.account)
    } catch {
      setAdminError('Could not load that account right now.')
    } finally {
      setAdminAccountLoading(false)
    }
  }

  function closeAdminAccount() {
    setAdminAccountDetail(null)
    setAdminError('')
  }

  async function refreshDeletedAccounts() {
    if (!authToken || !isAdminRole) return
    setAdminDeletedLoading(true)
    try {
      const response = await authFetch('/api/admin/users/deleted/list', authToken)
      const data = (await response.json()) as { ok: boolean; accounts?: AdminDeletedAccount[] }
      if (data.ok) setAdminDeletedAccounts(data.accounts ?? [])
    } catch { /* non-fatal */ } finally {
      setAdminDeletedLoading(false)
    }
  }

  /**
   * Shared POST wrapper for the account-management endpoints.
   *
   * Every one of them sits behind `requireRecentPasskeyAuth` (a 10-minute
   * window), so a first attempt routinely comes back asking for confirmation.
   * Running the reauth ceremony and retrying once keeps that a single passkey
   * prompt instead of a dead-end error the operator cannot act on.
   */
  async function postAdminAccountAction(
    accountId: string,
    action: string,
    body: Record<string, unknown> = {},
  ): Promise<{ ok: boolean; error?: string } & Record<string, unknown>> {
    if (!authToken) return { ok: false, error: 'Not signed in.' }

    const send = async () => {
      const response = await authFetch(
        `/api/admin/users/${encodeURIComponent(accountId)}/${action}`,
        authToken,
        { method: 'POST', body },
      )
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean; error?: string; passkeyReauthRequired?: boolean
      }
      return { response, data }
    }

    try {
      let attempt = await send()

      if (!attempt.response.ok && attempt.data.passkeyReauthRequired) {
        if (!await ensureRecentPasskeyAuth()) {
          return { ok: false, error: 'Passkey confirmation is required for this action.' }
        }
        attempt = await send()
      }

      if (!attempt.response.ok || attempt.data.ok !== true) {
        return { ok: false, error: attempt.data.error ?? 'That action could not be completed.' }
      }
      return attempt.data as { ok: boolean } & Record<string, unknown>
    } catch {
      return { ok: false, error: 'Could not reach the server.' }
    }
  }

  async function afterAdminAccountAction(accountId: string) {
    await Promise.all([refreshAdminUsers(), refreshAdminAudit()])
    if (adminAccountDetail?.accountId === accountId) await openAdminAccount(accountId)
  }

  async function handleAdminIssueRecoveryGrant(target: AdminUser | AdminAccountDetail, resetCredentials: boolean) {
    if (!authToken || !isAdminRole) return
    const name = target.displayName || target.username
    const ok = await askConfirm({
      title: resetCredentials ? 'Reset credentials?' : 'Issue a recovery code?',
      body: (
        <>
          {resetCredentials ? (
            <p>
              Every passkey and session for <strong>@{target.username}</strong> will be revoked. They
              will need the one-time code below to get back in.
            </p>
          ) : (
            <p>
              <strong>@{target.username}</strong> gets a one-time code to attach a new passkey.
              Their existing passkeys keep working.
            </p>
          )}
          <p className="mini-text">
            The code is shown once and cannot be recovered afterwards. Only give it to someone you
            have confirmed is the account holder — it grants full access to the account.
          </p>
        </>
      ),
      confirmLabel: resetCredentials ? 'Reset and issue code' : 'Issue code',
      danger: resetCredentials,
    })
    if (!ok) return

    const result = await postAdminAccountAction(
      target.accountId,
      resetCredentials ? 'reset-credentials' : 'recovery-grant',
      { note: resetCredentials ? 'Admin credential reset' : 'Support-issued recovery grant' },
    )
    if (!result.ok) {
      setAdminError(result.error ?? 'Could not issue a recovery code.')
      return
    }
    setAdminError('')
    setIssuedGrant({
      username: String(result.username ?? target.username),
      grantCode: String(result.grantCode ?? ''),
      expiresAt: String(result.expiresAt ?? ''),
      revokedPasskeys: Boolean(result.revokedPasskeys),
    })
    setToastMessage(`Recovery code issued for ${name}.`)
    await afterAdminAccountAction(target.accountId)
  }

  async function handleAdminSuspendAccount(target: AdminUser | AdminAccountDetail) {
    if (!authToken || !isAdminRole) return
    const reason = await askTextPrompt({
      title: `Suspend @${target.username}?`,
      label: 'Reason (recorded in the audit log)',
      placeholder: 'e.g. confirmed cheating',
      confirmLabel: 'Suspend for 24h',
      maxLength: 200,
    })
    if (reason === null) return

    const result = await postAdminAccountAction(target.accountId, 'suspend', { hours: 24, reason })
    if (!result.ok) {
      setAdminError(result.error ?? 'Could not suspend that account.')
      return
    }
    setAdminError('')
    setToastMessage(`@${target.username} is suspended for 24 hours.`)
    await afterAdminAccountAction(target.accountId)
  }

  async function handleAdminUnsuspendAccount(target: AdminUser | AdminAccountDetail) {
    if (!authToken || !isAdminRole) return
    const result = await postAdminAccountAction(target.accountId, 'unsuspend')
    if (!result.ok) {
      setAdminError(result.error ?? 'Could not lift that suspension.')
      return
    }
    setAdminError('')
    setToastMessage(`@${target.username} can play again.`)
    await afterAdminAccountAction(target.accountId)
  }

  async function handleAdminDeleteAccount(target: AdminUser | AdminAccountDetail) {
    if (!authToken || !isOwnerRole) return
    // The server requires the typed username too; asking here means the
    // operator reads the name before the action rather than after.
    const ok = await askConfirm({
      title: `Delete @${target.username}?`,
      body: (
        <>
          <p>
            <strong>@{target.username}</strong> will lose access immediately. Their collection,
            rating, and match history are kept, and you can restore the account later.
          </p>
          <p className="mini-text">Type the username to confirm.</p>
        </>
      ),
      confirmLabel: 'Delete account',
      danger: true,
      requireText: target.username,
      requireTextLabel: 'Confirm username',
    })
    if (!ok) return

    const result = await postAdminAccountAction(target.accountId, 'delete', { confirmUsername: target.username })
    if (!result.ok) {
      setAdminError(result.error ?? 'Could not delete that account.')
      return
    }
    setAdminError('')
    setToastMessage(`@${target.username} was deleted. You can restore them from Accounts.`)
    closeAdminAccount()
    await Promise.all([refreshAdminUsers(), refreshAdminAudit(), refreshDeletedAccounts()])
  }

  async function handleAdminRestoreAccount(accountId: string, username: string) {
    if (!authToken || !isOwnerRole) return
    const result = await postAdminAccountAction(accountId, 'restore')
    if (!result.ok) {
      setAdminError(result.error ?? 'Could not restore that account.')
      return
    }
    setAdminError('')
    // Tell the operator what the player has to do next, since a restored
    // passkey-only account still needs a grant before they can sign in.
    const nextStep = String(result.nextStep ?? '')
    setToastMessage(
      nextStep === 'needs_recovery_grant'
        ? `@${username} is restored but needs a recovery code to sign in.`
        : nextStep === 'sign_in_with_legacy_password'
          ? `@${username} is restored and can sign in with their old password.`
          : `@${username} is restored and can sign in with their passkey.`,
    )
    await Promise.all([refreshAdminUsers(), refreshAdminAudit(), refreshDeletedAccounts()])
  }

  async function handleTransferOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authToken || !isOwnerRole) return
    const targetAccountId = transferForm.targetAccountId.trim()
    const password = transferForm.password
    if (!targetAccountId || !password) {
      setTransferStatus('Choose a target account and confirm your password.')
      return
    }
    if (targetAccountId === (serverProfile?.accountId ?? '')) {
      setTransferStatus('Target must be a different account.')
      return
    }
    const target = adminUsers.find((user) => user.accountId === targetAccountId)
    const targetUsername = target?.username ?? ''
    if (!targetUsername) {
      setTransferStatus('Search for the target account in the list above before transferring.')
      return
    }
    const ok = await askConfirm({
      title: 'Transfer server ownership',
      body: (
        <>
          <p>
            Ownership will be transferred to <strong>@{targetUsername}</strong>
            {target?.displayName ? <> ({target.displayName})</> : null}.
          </p>
          <p>
            You will be demoted to <strong>admin</strong>. Only the new owner can promote you back —
            this action cannot be reversed without their cooperation or filesystem-level recovery.
          </p>
        </>
      ),
      confirmLabel: 'Transfer ownership',
      danger: true,
      requireText: targetUsername,
      requireTextLabel: `Type @${targetUsername} to confirm`,
    })
    if (!ok) return
    try {
      const response = await authFetch('/api/admin/owner/transfer', authToken, {
        method: 'POST',
        body: { targetAccountId, password },
      })
      const data = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setTransferStatus(data.error ?? 'Ownership transfer failed.')
        return
      }
      setTransferStatus(`Ownership transferred to @${targetUsername}. You are now an admin on this server.`)
      setTransferForm({ targetAccountId: '', password: '' })
      setServerProfile((profile) => (profile ? { ...profile, role: 'admin' } : profile))
      await refreshAdminUsers()
      await refreshAdminAudit()
      await refreshAdminOverview()
    } catch {
      setTransferStatus('Could not reach the server. Try again.')
    }
  }

  async function handleSubmitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!complaintForm.summary.trim() || !complaintForm.details.trim()) {
      setComplaintStatus('Add both a short summary and clear details before sending the report.')
      return
    }

    try {
      const response = await fetch(`${ARENA_URL}/api/complaints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          visitorId,
          sessionId,
          page: 'arena',
          ...complaintForm,
        }),
      })

      const data = (await response.json()) as { ok?: boolean; complaintId?: string; message?: string }

      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? 'Complaint submission failed')
      }

      setComplaintStatus(`Report ${data.complaintId} submitted for review.`)
      setToastMessage(`Support ticket ${data.complaintId} created.`)
      setComplaintForm({
        category: 'gameplay',
        severity: 'normal',
        summary: '',
        details: '',
      })
    } catch {
      setComplaintStatus('The report could not be submitted right now. Please try again.')
    }
  }

  async function handleSaveAdminSettings() {
    if (!authToken || !isAdminRole) {
      setAdminError('Sign in with an admin account to save live settings.')
      return
    }

    try {
      const response = await authFetch('/api/admin/settings', authToken, {
        method: 'POST',
        body: adminSettings,
      })

      if (!response.ok) {
        throw new Error('Save failed')
      }

      setMotd(adminSettings.motd)
      setDailyQuest(adminSettings.quest)
      setFeaturedMode(adminSettings.featuredMode)
      setMaintenanceMode(adminSettings.maintenanceMode)
      setToastMessage('Admin live settings updated.')
      await refreshAdminOverview()
    } catch {
      setAdminError('The live settings could not be saved.')
    }
  }

  async function handleUpdateComplaintStatus(id: string, status: string) {
    if (!authToken || !isAdminRole) {
      setAdminError('Sign in with an admin account to update tickets.')
      return
    }

    const responseNote = await askTextPrompt({
      title: status === 'resolved' ? 'Resolve Ticket' : 'Respond To Ticket',
      label: 'Response note',
      placeholder: status === 'resolved' ? 'Resolution details' : 'Request details or recovery guidance',
      confirmLabel: status === 'resolved' ? 'Resolve' : 'Send Response',
      maxLength: 320,
    })
    if (!responseNote) return

    try {
      const response = await authFetch(`/api/admin/complaints/${id}`, authToken, {
        method: 'POST',
        body: {
          status,
          note: responseNote,
        },
      })

      if (!response.ok) {
        throw new Error('Update failed')
      }

      setToastMessage(`Complaint ${id} updated to ${status}.`)
      await refreshAdminOverview()
    } catch {
      setAdminError('The complaint status could not be updated.')
    }
  }


  return {
    complaintForm,
    setComplaintForm,
    complaintStatus,
    handleSubmitComplaint,
    adminOverview,
    adminLoading,
    adminError,
    adminUsers,
    adminUsersLoading,
    adminUserSearch,
    setAdminUserSearch,
    adminAudit,
    adminAuditFilter,
    setAdminAuditFilter,
    adminAuditExpandedId,
    setAdminAuditExpandedId,
    adminSettings,
    setAdminSettings,
    transferForm,
    setTransferForm,
    transferStatus,
    refreshAdminOverview,
    refreshAdminUsers,
    refreshAdminAudit,
    handleSetUserRole,
    handleTransferOwnership,
    handleSaveAdminSettings,
    handleUpdateComplaintStatus,
    adminAccountDetail,
    adminAccountLoading,
    openAdminAccount,
    closeAdminAccount,
    adminDeletedAccounts,
    adminDeletedLoading,
    refreshDeletedAccounts,
    issuedGrant,
    setIssuedGrant,
    handleAdminIssueRecoveryGrant,
    handleAdminSuspendAccount,
    handleAdminUnsuspendAccount,
    handleAdminDeleteAccount,
    handleAdminRestoreAccount,
  }
}
