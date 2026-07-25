import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PwaInstallPanel } from '../components/PwaInstallPanel'
import { formatTimestamp } from '../utils'
import { useAppShell, useProfile } from '../contexts'
import { feedback } from '../feedback'
import type { AdminComplaint, AdminUser, PasskeySummary } from '../types'

type AdminSubview = 'liveOps' | 'traffic' | 'complaints' | 'recovery' | 'accounts' | 'roles' | 'audit'

type TicketAction = {
  label: string
  status: string
  variant: 'ghost' | 'primary'
}

const ADMIN_SUBVIEWS: AdminSubview[] = ['liveOps', 'traffic', 'complaints', 'recovery', 'accounts', 'roles', 'audit']

function getPasskeyPortabilityLabel(passkey: PasskeySummary): string {
  if (passkey.backedUp || passkey.deviceType === 'multiDevice') return 'Synced'
  if (passkey.deviceType === 'singleDevice') return 'Device-bound'
  return 'Unknown sync'
}

function shouldWarnAboutSingleDevicePasskey(passkeys: PasskeySummary[]): boolean {
  return passkeys.length === 1 && (!passkeys[0].backedUp || passkeys[0].deviceType === 'singleDevice')
}

const COMPLAINT_ACTIONS: TicketAction[] = [
  { label: 'Investigating', status: 'investigating', variant: 'ghost' },
  { label: 'Resolve', status: 'resolved', variant: 'primary' },
]

const RECOVERY_ACTIONS: TicketAction[] = [
  { label: 'Review', status: 'investigating', variant: 'ghost' },
  { label: 'Request Info', status: 'needs_info', variant: 'ghost' },
  { label: 'Close Request', status: 'resolved', variant: 'primary' },
]

function getAdminSubviewLabel(view: AdminSubview) {
  if (view === 'liveOps') return 'Live Ops'
  if (view === 'roles') return 'Roles'
  if (view === 'recovery') return 'Recovery'
  return view.charAt(0).toUpperCase() + view.slice(1)
}

function getTicketStatusClass(status: string) {
  if (status === 'resolved') return 'found'
  if (status === 'investigating') return 'searching'
  return 'idle'
}

function formatTicketStatus(status: string) {
  return status.replace(/_/g, ' ')
}

type SettingsToggleRowProps = {
  label: string
  action: ReactNode
  note?: string
  tone?: 'default' | 'danger'
}

function SettingsToggleRow({ label, action, note, tone = 'default' }: SettingsToggleRowProps) {
  return (
    <div className={`settings-toggle-row${note ? '' : ' settings-toggle-row-compact'}${tone === 'danger' ? ' settings-toggle-row-danger' : ''}`}>
      <div className="settings-toggle-copy">
        <span className="settings-toggle-label">{label}</span>
        {note && <span className="mini-text settings-install-hint settings-toggle-note">{note}</span>}
      </div>
      <div className="settings-toggle-action">{action}</div>
    </div>
  )
}

export function SettingsScreen() {
  const {
    activeScreen,
    soundEnabled, setSoundEnabled,
    ambientEnabled, setAmbientEnabled,
    analyticsConsent, setAnalyticsConsent,
    visitorId, backendOnline,
    complaintForm, setComplaintForm, complaintStatus, handleSubmitComplaint,
    adminLoading, adminOverview, adminError, refreshAdminOverview,
    adminSettings, setAdminSettings, handleSaveAdminSettings, handleUpdateComplaintStatus,
    adminUserSearch, setAdminUserSearch, adminUsers, adminUsersLoading, refreshAdminUsers,
    handleSetUserRole,
    adminAccountDetail, adminAccountLoading, openAdminAccount, closeAdminAccount,
    adminDeletedAccounts, adminDeletedLoading, refreshDeletedAccounts,
    issuedGrant, setIssuedGrant,
    handleAdminIssueRecoveryGrant, handleAdminSuspendAccount, handleAdminUnsuspendAccount,
    handleAdminDeleteAccount, handleAdminRestoreAccount,
    transferForm, setTransferForm, transferStatus, handleTransferOwnership,
    adminAudit, adminAuditFilter, setAdminAuditFilter,
    adminAuditExpandedId, setAdminAuditExpandedId, refreshAdminAudit,
    inferToastSeverity, setToastMessage,
    startOnboardingTour,
    gesturesEnabled, setGesturesEnabled,
    hapticsEnabled, setHapticsEnabled,
    settingsSubview, openSettingsSubview,
    passkeys, passkeySupported, passkeyLoading, passkeyStatus,
    passkeyDeviceLink, handleRegisterPasskey, handleDeletePasskey,
    handleCreatePasskeyDeviceLink, handleCopyPasskeyDeviceLink, clearPasskeyDeviceLink,
    accountSessions, accountActionStatus, accountActionLoading,
    recoveryStatus, refreshRecoveryStatus, handleGenerateRecoveryCodes,
    refreshAccountSessions, handleLogoutAllSessions, handleExportAccountData, handleDeleteAccount,
    installState, handleInstallApp, handleLogout,
  } = useAppShell()
  const { isAdminRole, isOwnerRole, accountRole, serverProfile } = useProfile()

  const [adminSubview, setAdminSubview] = useState<AdminSubview>('liveOps')
  const [deletePassword, setDeletePassword] = useState('')
  const adminAutoLoadRef = useRef(false)

  const playerDisplayName = serverProfile?.displayName ?? serverProfile?.username ?? 'Guest'
  const visitorSuffix = (visitorId || 'guest').slice(-6).toUpperCase()
  const installPathLabel = installState.status === 'native'
    ? 'Quick install'
    : installState.status === 'installed'
      ? 'Installed'
      : installState.status === 'ios-manual'
        ? 'Manual setup'
        : installState.status === 'insecure'
          ? 'HTTPS needed'
          : 'Manual setup'
  const networkLabel = backendOnline ? 'Stable' : 'Fallback'
  const roleLabel = accountRole === 'owner' ? 'Owner' : accountRole === 'admin' ? 'Admin' : 'Player'
  const accountRecoveryRequests = adminOverview?.complaints.filter((complaint) => complaint.category === 'account_recovery') ?? []
  const playerComplaints = adminOverview?.complaints.filter((complaint) => complaint.category !== 'account_recovery') ?? []
  const openRecoveryRequests = accountRecoveryRequests.filter((complaint) => complaint.status !== 'resolved')

  useEffect(() => {
    if (settingsSubview !== 'admin') {
      adminAutoLoadRef.current = false
      return
    }
    if (!isAdminRole || adminOverview || adminLoading || adminAutoLoadRef.current) return

    adminAutoLoadRef.current = true
    void refreshAdminOverview()
  }, [adminLoading, adminOverview, isAdminRole, refreshAdminOverview, settingsSubview])

  const handleOpenSettingsSubview = (view: 'preferences' | 'account' | 'support' | 'admin') => {
    feedback('tap', soundEnabled, hapticsEnabled)
    openSettingsSubview(view)
  }

  const renderPreferences = () => (
    <div className="settings-section-panel settings-preferences-panel" data-scene-swipe-opt-out="true">
      <div className="settings-toggle-list">
        <SettingsToggleRow
          label="Arena Audio"
          action={(
            <button
              className={`ghost mini ${soundEnabled ? '' : 'muted'}`}
              onClick={() => {
                const nextValue = !soundEnabled
                setSoundEnabled(nextValue)
                setToastMessage(nextValue ? 'Arena sound enabled.' : 'Arena sound muted.')
              }}
            >
              {soundEnabled ? 'On' : 'Off'}
            </button>
          )}
        />
        <SettingsToggleRow
          label="Ambient Loops"
          action={(
            <button
              className={`ghost mini ${ambientEnabled && soundEnabled ? '' : 'muted'}`}
              disabled={!soundEnabled}
              onClick={() => {
                const nextValue = !ambientEnabled
                setAmbientEnabled(nextValue)
                setToastMessage(nextValue ? 'Ambient loops enabled.' : 'Ambient loops disabled.')
              }}
            >
              {!soundEnabled ? 'Audio off' : ambientEnabled ? 'On' : 'Off'}
            </button>
          )}
        />
        <SettingsToggleRow
          label="Analytics"
          action={(
            <button
              className={`ghost mini ${analyticsConsent ? '' : 'muted'}`}
              onClick={() => {
                const nextValue = !analyticsConsent
                setAnalyticsConsent(nextValue)
                setToastMessage(nextValue ? 'Anonymous tracking enabled.' : 'Anonymous tracking paused.')
              }}
            >
              {analyticsConsent ? 'On' : 'Off'}
            </button>
          )}
        />
        <SettingsToggleRow
          label="Scene Swipe"
          action={(
            <button
              className={`ghost mini ${gesturesEnabled ? '' : 'muted'}`}
              onClick={() => {
                const nextValue = !gesturesEnabled
                feedback('tap', soundEnabled, hapticsEnabled)
                setGesturesEnabled(nextValue)
                setToastMessage(nextValue ? 'Scene swipe enabled.' : 'Scene swipe disabled.')
              }}
            >
              {gesturesEnabled ? 'On' : 'Off'}
            </button>
          )}
        />
        <SettingsToggleRow
          label="Haptics"
          action={(
            <button
              className={`ghost mini ${hapticsEnabled ? '' : 'muted'}`}
              onClick={() => {
                const nextValue = !hapticsEnabled
                feedback('tap', soundEnabled, nextValue)
                setHapticsEnabled(nextValue)
                setToastMessage(nextValue ? 'Haptics enabled.' : 'Haptics disabled.')
              }}
            >
              {hapticsEnabled ? 'On' : 'Off'}
            </button>
          )}
        />
        <SettingsToggleRow
          label="Onboarding Tour"
          action={(
            <button
              className="ghost mini"
              onClick={() => {
                feedback('tap', soundEnabled, hapticsEnabled)
                startOnboardingTour()
              }}
            >
              Replay
            </button>
          )}
        />
        <SettingsToggleRow label="Install App" note={installState.primaryLabel} action={<span className="badge">{installPathLabel}</span>} />
        <SettingsToggleRow
          label="Passkeys"
          note={passkeySupported ? `${passkeys.length} registered` : 'Browser unsupported'}
          action={(
            <button className="ghost mini" disabled={!passkeySupported || passkeyLoading} onClick={() => void handleRegisterPasskey()}>
              {passkeyLoading ? 'Working' : 'Add'}
            </button>
          )}
        />
      </div>
      <div className="settings-passkey-list">
        {passkeyStatus && <p className="note toast-line">{passkeyStatus}</p>}
        {passkeys.length === 0 ? (
          <p className="mini-text">No passkeys registered.</p>
        ) : (
          passkeys.map((passkey) => (
            <div className="settings-passkey-row" key={passkey.id}>
              <div>
                <strong>{passkey.name || 'Passkey'}</strong>
                <span className="mini-text">
                  {getPasskeyPortabilityLabel(passkey)} - {passkey.lastUsedAt ? `Last used ${formatTimestamp(passkey.lastUsedAt)}` : `Added ${formatTimestamp(passkey.createdAt)}`}
                </span>
              </div>
              <button className="ghost mini" disabled={passkeyLoading || passkeys.length <= 1} onClick={() => void handleDeletePasskey(passkey.id)}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>
      <PwaInstallPanel installState={installState} onInstall={handleInstallApp} showInstalled showDiagnostics />
      <SettingsToggleRow label="Log Out" tone="danger" action={<button className="ghost mini" onClick={handleLogout}>Sign Out</button>} />
    </div>
  )

  const renderAccount = () => {
    const readiness = serverProfile?.accountReadiness
    return (
      <div className="settings-section-panel settings-account-panel" data-scene-swipe-opt-out="true">
        <div className="settings-account-grid">
          <section className="settings-account-block">
            <div className="section-head log-heading">
              <h3>Account Standard</h3>
              <span className="badge">{readiness?.setupRequired ? 'Action needed' : 'Ready'}</span>
            </div>
            <div className="settings-account-facts">
              <span>Username</span>
              <strong>{serverProfile?.username || 'Not set'}</strong>
              <span>Passkeys</span>
              <strong>{readiness?.passkeyCount ?? passkeys.length}</strong>
              <span>Terms</span>
              <strong>{readiness?.legal.termsVersion ?? 'Current'}</strong>
              <span>Privacy</span>
              <strong>{readiness?.legal.privacyVersion ?? 'Current'}</strong>
            </div>
          </section>

          <section className="settings-account-block">
            <div className="section-head log-heading">
              <h3>Passkeys</h3>
              <button className="ghost mini" disabled={!passkeySupported || passkeyLoading} onClick={() => void handleRegisterPasskey()}>
                {passkeyLoading ? 'Working' : 'Add'}
              </button>
            </div>
            {passkeyStatus && <p className="note toast-line">{passkeyStatus}</p>}
            {shouldWarnAboutSingleDevicePasskey(passkeys) && (
              <p className="mini-text warning-line">Only one device-bound passkey is registered. Add another device or keep recovery codes saved.</p>
            )}
            <div className="settings-passkey-list">
              {passkeys.length === 0 ? (
                <p className="mini-text">No passkeys registered.</p>
              ) : (
                passkeys.map((passkey) => (
                  <div className="settings-passkey-row" key={passkey.id}>
                    <div>
                      <strong>{passkey.name || 'Passkey'}</strong>
                      <span className="mini-text">
                        {getPasskeyPortabilityLabel(passkey)} - {passkey.lastUsedAt ? `Last used ${formatTimestamp(passkey.lastUsedAt)}` : `Added ${formatTimestamp(passkey.createdAt)}`}
                      </span>
                    </div>
                    <button className="ghost mini" disabled={passkeyLoading || passkeys.length <= 1} onClick={() => void handleDeletePasskey(passkey.id)}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="controls passkey-device-link-actions">
              <button className="ghost mini" disabled={accountActionLoading || !passkeySupported || passkeys.length < 1} onClick={() => void handleCreatePasskeyDeviceLink()}>
                Link Another Device
              </button>
              {passkeyDeviceLink && (
                <button className="ghost mini" disabled={accountActionLoading} onClick={clearPasskeyDeviceLink}>
                  Clear Link
                </button>
              )}
            </div>
            {passkeyDeviceLink && (
              <div className="passkey-device-link-box">
                <label className="form-field">
                  <span>Device Link</span>
                  <input className="text-input" readOnly value={passkeyDeviceLink.linkUrl} onFocus={(event) => event.currentTarget.select()} />
                </label>
                <div className="controls">
                  <button className="ghost mini" onClick={() => void handleCopyPasskeyDeviceLink()}>Copy Link</button>
                </div>
                <p className="mini-text">Open this link on the phone or computer you want to add. It expires {passkeyDeviceLink.expiresAt ? formatTimestamp(passkeyDeviceLink.expiresAt) : 'soon'}.</p>
              </div>
            )}
          </section>

          <section className="settings-account-block">
            <div className="section-head log-heading">
              <h3>Sessions</h3>
              <button className="ghost mini" disabled={accountActionLoading} onClick={() => void refreshAccountSessions()}>Refresh</button>
            </div>
            <div className="settings-session-list">
              {accountSessions.length === 0 ? (
                <p className="mini-text">No active session metadata loaded.</p>
              ) : (
                accountSessions.slice(0, 5).map((session) => (
                  <div className="settings-session-row" key={session.id}>
                    <strong>{session.authMethod || 'session'}</strong>
                    <span className="mini-text">{session.lastSeenAt ? `Seen ${formatTimestamp(session.lastSeenAt)}` : `Created ${formatTimestamp(session.createdAt)}`}</span>
                  </div>
                ))
              )}
            </div>
            <button className="btn-danger mini" disabled={accountActionLoading} onClick={() => void handleLogoutAllSessions()}>
              Log Out All Sessions
            </button>
          </section>

          <section className="settings-account-block">
            <div className="section-head log-heading">
              <h3>Recovery Codes</h3>
              <button className="ghost mini" disabled={accountActionLoading} onClick={() => void refreshRecoveryStatus()}>Refresh</button>
            </div>
            <div className="settings-account-facts">
              <span>Active Codes</span>
              <strong>{recoveryStatus?.activeCount ?? 0}</strong>
              <span>Saved</span>
              <strong>{recoveryStatus?.acknowledgedAt ? formatTimestamp(recoveryStatus.acknowledgedAt) : 'Not confirmed'}</strong>
              <span>Generated</span>
              <strong>{recoveryStatus?.generatedAt ? formatTimestamp(recoveryStatus.generatedAt) : 'None'}</strong>
            </div>
            <p className="mini-text">Generating a new batch revokes the old codes after passkey confirmation.</p>
            <button className="ghost mini" disabled={accountActionLoading || !passkeySupported} onClick={() => void handleGenerateRecoveryCodes()}>
              {recoveryStatus?.activeCount ? 'Regenerate Codes' : 'Generate Codes'}
            </button>
          </section>

          <section className="settings-account-block">
            <div className="section-head log-heading">
              <h3>Data Rights</h3>
              <button className="ghost mini" disabled={accountActionLoading} onClick={() => void handleExportAccountData()}>Export</button>
            </div>
            <label className="form-field">
              <span>Legacy password if no passkey exists</span>
              <input
                className="text-input"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </label>
            <button
              className="btn-danger mini"
              disabled={accountActionLoading}
              onClick={() => void handleDeleteAccount(deletePassword)}
            >
              Delete Account
            </button>
            {accountActionStatus && <p className={`toast toast-${inferToastSeverity(accountActionStatus)} toast-line`}>{accountActionStatus}</p>}
          </section>
        </div>
      </div>
    )
  }

  const renderSupport = () => (
    <div className="settings-section-panel settings-support-panel" data-scene-swipe-opt-out="true">
      {complaintStatus && <p className="note toast-line">{complaintStatus}</p>}
      <form className="complaint-form" onSubmit={(event) => void handleSubmitComplaint(event)}>
        <div className="form-row split-fields">
          <label className="form-field">
            <span>Category</span>
            <select
              className="text-input"
              value={complaintForm.category}
              onChange={(event) =>
                setComplaintForm((current) => ({ ...current, category: event.target.value }))
              }
            >
              <option value="gameplay">Gameplay</option>
              <option value="matchmaking">Matchmaking</option>
              <option value="balance">Balance</option>
              <option value="performance">Performance</option>
              <option value="moderation">Moderation</option>
              <option value="account_recovery">Account Recovery</option>
            </select>
          </label>
          <label className="form-field">
            <span>Priority</span>
            <select
              className="text-input"
              value={complaintForm.severity}
              onChange={(event) =>
                setComplaintForm((current) => ({ ...current, severity: event.target.value }))
              }
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
        </div>
        <label className="form-field">
          <span>Summary</span>
          <input
            className="text-input"
            value={complaintForm.summary}
            maxLength={120}
            placeholder="Short description of the issue"
            onChange={(event) =>
              setComplaintForm((current) => ({ ...current, summary: event.target.value }))
            }
          />
        </label>
        <label className="form-field">
          <span>Details</span>
          <textarea
            className="text-input text-area"
            value={complaintForm.details}
            rows={4}
            placeholder="What happened, and how can it be reproduced?"
            onChange={(event) =>
              setComplaintForm((current) => ({ ...current, details: event.target.value }))
            }
          />
        </label>
        {complaintForm.category === 'account_recovery' && (
          <p className="mini-text">If every passkey and recovery code is lost, include username, approximate account age, devices, browsers, and recent activity. Recovery is reviewed by admins and is not guaranteed.</p>
        )}
        <div className="controls">
          <button className="primary" type="submit">Send Report</button>
        </div>
      </form>
    </div>
  )

  const renderTicketCard = (complaint: AdminComplaint, actions: TicketAction[], className = '') => (
    <div className={`ticket-card ${className}`.trim()} key={complaint.id}>
      <div className="slot-head ticket-card-head">
        <strong>{complaint.summary}</strong>
        <span className={`queue-pill ${getTicketStatusClass(complaint.status)}`}>
          {formatTicketStatus(complaint.status)}
        </span>
      </div>
      <p className="mini-text ticket-detail-text">{complaint.details}</p>
      <div className="badges ticket-badges">
        <span className="badge">{complaint.id}</span>
        <span className="badge">{formatTicketStatus(complaint.category)}</span>
        <span className="badge">{complaint.severity}</span>
        <span className="badge">{formatTimestamp(complaint.createdAt)}</span>
      </div>
      {complaint.updates.length > 0 && (
        <div className="ticket-updates">
          {complaint.updates.slice(-3).map((update) => (
            <p className="mini-text" key={`${complaint.id}-${update.at}`}>
              <strong>{formatTimestamp(update.at)}:</strong> {update.note}
            </p>
          ))}
        </div>
      )}
      <div className="controls ticket-actions">
        {actions.map((action) => (
          <button
            className={action.variant}
            key={`${complaint.id}-${action.status}`}
            onClick={() => void handleUpdateComplaintStatus(complaint.id, action.status)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )

  const renderAdminNav = () => (
    <div className="settings-admin-nav" role="tablist" aria-label="Admin sections">
      {ADMIN_SUBVIEWS.map((view) => (
        <button
          key={view}
          className={adminSubview === view ? 'active' : ''}
          onClick={() => setAdminSubview(view)}
          role="tab"
          aria-selected={adminSubview === view}
        >
          {getAdminSubviewLabel(view)}
        </button>
      ))}
    </div>
  )

  return (
    <section className={`settings-screen screen-panel ${activeScreen === 'settings' ? 'active' : 'hidden'}`}>
      <article className={`section-card settings-command-card settings-view-${settingsSubview}`}>
        <div className="settings-command-ledger">
          <div className="settings-command-title">
            <span className="settings-command-kicker">Command Desk</span>
            <strong>{playerDisplayName}</strong>
          </div>
          <div className="settings-status-strip" aria-label="Settings status">
            <span className={`settings-status-chip role-badge role-${accountRole}`}>{roleLabel}</span>
            <span className="settings-status-chip">{networkLabel}</span>
            <span className="settings-status-chip">{installPathLabel}</span>
            <span className="settings-status-chip">{visitorSuffix}</span>
          </div>
        </div>

        <nav className="settings-nav-strip" aria-label="Settings sections">
          <button className={settingsSubview === 'preferences' ? 'active' : ''} onClick={() => handleOpenSettingsSubview('preferences')}>Preferences</button>
          <button className={settingsSubview === 'account' ? 'active' : ''} onClick={() => handleOpenSettingsSubview('account')}>Account</button>
          <button className={settingsSubview === 'support' ? 'active' : ''} onClick={() => handleOpenSettingsSubview('support')}>Support</button>
          {isAdminRole && (
            <button className={settingsSubview === 'admin' ? 'active' : ''} onClick={() => handleOpenSettingsSubview('admin')}>Admin</button>
          )}
        </nav>

        {settingsSubview === 'preferences' && renderPreferences()}
        {settingsSubview === 'account' && renderAccount()}
        {settingsSubview === 'support' && renderSupport()}
        {settingsSubview === 'admin' && (
          <div className="settings-section-panel admin-console scribe-console" data-scene-swipe-opt-out="true">
            <div className="admin-console-head">
              <span className="mini-text">Admin Console</span>
              <button className="secondary mini" onClick={() => void refreshAdminOverview()}>
                {adminLoading ? 'Loading' : adminOverview ? 'Refresh' : 'Load'}
              </button>
            </div>
            {!isAdminRole && (
              <p className="note toast-line">
                Your account does not have admin privileges. Sign out and back in if this owner account was just promoted.
              </p>
            )}
            {adminError && <p className="note toast-line">{adminError}</p>}
            {isAdminRole && adminLoading && !adminOverview && <p className="note toast-line">Loading admin console</p>}

            {adminOverview && (
          <>
            {renderAdminNav()}

            {adminSubview === 'liveOps' && (
              <>
                <div className="insight-grid">
                  <div className="stat-tile">
                    <strong>{adminOverview.totals.uniqueVisitors}</strong>
                    <span>Unique Guests</span>
                  </div>
                  <div className="stat-tile">
                    <strong>{adminOverview.totals.pageViews}</strong>
                    <span>Page Views</span>
                  </div>
                  <div className="stat-tile">
                    <strong>{adminOverview.totals.matchesCompleted}</strong>
                    <span>Completed Matches</span>
                  </div>
                  <div className="stat-tile">
                    <strong>{adminOverview.totals.complaintsOpen}</strong>
                    <span>Open Complaints</span>
                  </div>
                </div>

                <div className="admin-panel-block">
                  <h3>Live Ops Controls</h3>
                  <div className="form-stack">
                    <label className="form-field">
                      <span>Message of the day</span>
                      <input
                        className="text-input"
                        value={adminSettings.motd}
                        onChange={(event) => setAdminSettings((current) => ({ ...current, motd: event.target.value }))}
                      />
                    </label>
                    <label className="form-field">
                      <span>Daily quest</span>
                      <input
                        className="text-input"
                        value={adminSettings.quest}
                        onChange={(event) => setAdminSettings((current) => ({ ...current, quest: event.target.value }))}
                      />
                    </label>
                    <label className="form-field">
                      <span>Featured mode</span>
                      <input
                        className="text-input"
                        value={adminSettings.featuredMode}
                        onChange={(event) => setAdminSettings((current) => ({ ...current, featuredMode: event.target.value }))}
                      />
                    </label>
                    <label className="checkbox-row maintenance-toggle">
                      <input
                        type="checkbox"
                        checked={adminSettings.maintenanceMode}
                        onChange={(event) => setAdminSettings((current) => ({ ...current, maintenanceMode: event.target.checked }))}
                      />
                      <span>Maintenance mode</span>
                    </label>
                    <button className="primary" onClick={() => void handleSaveAdminSettings()}>
                      Save Live Settings
                    </button>
                  </div>
                </div>
              </>
            )}

            {adminSubview === 'traffic' && (
              <div className="admin-panel-block">
                <h3>Traffic by Section</h3>
                <ul className="stats-list">
                  {adminOverview.traffic.pages.slice(0, 8).map((entry) => (
                    <li key={entry.route}>
                      <span>{entry.route}</span>
                      <strong>{entry.views}</strong>
                    </li>
                  ))}
                </ul>

                <h3>Viewport Mix</h3>
                <ul className="stats-list">
                  {adminOverview.traffic.devices.slice(0, 6).map((entry) => (
                    <li key={entry.label}>
                      <span>{entry.label}</span>
                      <strong>{entry.count}</strong>
                    </li>
                  ))}
                </ul>

                <h3>Traffic by Day</h3>
                <ul className="stats-list">
                  {adminOverview.traffic.daily.slice(-7).reverse().map((entry) => (
                    <li key={entry.day}>
                      <span>{entry.day}</span>
                      <strong>{entry.views}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {adminSubview === 'complaints' && (
              <div className="admin-panel-block">
                <div className="section-head log-heading">
                  <h3>Recent Player Complaints</h3>
                  <span className="badge">Open {playerComplaints.filter((complaint) => complaint.status !== 'resolved').length}</span>
                </div>
                <div className="ticket-list">
                  {playerComplaints.length === 0 ? (
                    <p className="note">No complaints have been submitted yet.</p>
                  ) : (
                    playerComplaints.slice(0, 10).map((complaint) => renderTicketCard(complaint, COMPLAINT_ACTIONS))
                  )}
                </div>
              </div>
            )}

            {adminSubview === 'recovery' && (
              <div className="admin-panel-block recovery-panel-block">
                <div className="section-head log-heading">
                  <h3>Account Recovery Requests</h3>
                  <span className="badge">Open {openRecoveryRequests.length}</span>
                </div>
                <div className="recovery-request-summary">
                  <div className="stat-tile">
                    <strong>{accountRecoveryRequests.length}</strong>
                    <span>Total Requests</span>
                  </div>
                  <div className="stat-tile">
                    <strong>{openRecoveryRequests.length}</strong>
                    <span>Needs Response</span>
                  </div>
                  <div className="stat-tile">
                    <strong>{accountRecoveryRequests.filter((complaint) => complaint.status === 'needs_info').length}</strong>
                    <span>Needs Info</span>
                  </div>
                </div>
                <div className="ticket-list recovery-ticket-list">
                  {accountRecoveryRequests.length === 0 ? (
                    <p className="note">No account recovery requests are waiting.</p>
                  ) : (
                    accountRecoveryRequests.slice(0, 10).map((complaint) => renderTicketCard(complaint, RECOVERY_ACTIONS, 'recovery-ticket-card'))
                  )}
                </div>
              </div>
            )}

            {adminSubview === 'accounts' && (
              <div className="admin-panel-block admin-accounts-block">
                <div className="section-head log-heading">
                  <h3>Player Accounts</h3>
                  <span className="badge">{isOwnerRole ? 'Owner' : 'Admin'}</span>
                </div>

                {issuedGrant && (
                  <div className="admin-grant-callout" role="status">
                    <h4>Recovery code for @{issuedGrant.username}</h4>
                    <code className="admin-grant-code">{issuedGrant.grantCode}</code>
                    <p className="mini-text">
                      Shown once — it cannot be retrieved again. Give it only to someone you have
                      confirmed is the account holder. Expires {formatTimestamp(issuedGrant.expiresAt)}.
                      {issuedGrant.revokedPasskeys ? ' Their old passkeys and sessions were revoked.' : ''}
                    </p>
                    <div className="controls">
                      <button
                        className="secondary"
                        onClick={() => {
                          void navigator.clipboard?.writeText(issuedGrant.grantCode)
                          setToastMessage('Recovery code copied.')
                        }}
                      >
                        Copy code
                      </button>
                      <button className="ghost" onClick={() => setIssuedGrant(null)}>Dismiss</button>
                    </div>
                  </div>
                )}

                <div className="admin-auth-row">
                  <input
                    className="text-input"
                    value={adminUserSearch}
                    placeholder="Search by username, name, or id"
                    onChange={(event) => setAdminUserSearch(event.target.value)}
                  />
                  <button className="secondary" onClick={() => void refreshAdminUsers(adminUserSearch)}>
                    {adminUsersLoading ? 'Loading…' : 'Search'}
                  </button>
                </div>

                {adminError && <p className="note toast-line error">{adminError}</p>}

                <ul className="role-list">
                  {adminUsers.length === 0 ? (
                    <li className="note">No accounts loaded. Search to list accounts.</li>
                  ) : (
                    adminUsers.map((user: AdminUser) => (
                      <li className="role-row" key={user.accountId}>
                        <div className="role-identity">
                          <strong>{user.displayName || user.username}</strong>
                          <span className="mini-text">@{user.username}</span>
                          {user.suspended && <span className="badge role-badge">Suspended</span>}
                          {user.deletedAt && <span className="badge role-badge">Deleted</span>}
                          {user.legacy && <span className="badge role-badge">Legacy</span>}
                          <span className="mini-text">
                            {user.passkeyCount ?? 0} passkey{(user.passkeyCount ?? 0) === 1 ? '' : 's'}
                            {' · '}
                            {user.recoveryCodeCount ?? 0} codes
                          </span>
                        </div>
                        <div className="controls">
                          {user.role === 'owner' ? (
                            <span className="mini-text">Owner accounts are managed via transfer</span>
                          ) : (
                            <button className="ghost" onClick={() => void openAdminAccount(user.accountId)}>
                              Manage
                            </button>
                          )}
                        </div>
                      </li>
                    ))
                  )}
                </ul>

                {adminAccountLoading && <p className="note toast-line">Loading account…</p>}

                {adminAccountDetail && (
                  <div className="admin-account-detail">
                    <div className="section-head log-heading">
                      <h3>@{adminAccountDetail.username}</h3>
                      <button className="ghost" onClick={closeAdminAccount}>Close</button>
                    </div>

                    <dl className="admin-account-facts">
                      <div><dt>Status</dt><dd>{adminAccountDetail.suspended ? 'Suspended' : adminAccountDetail.accountStatus}</dd></div>
                      <div><dt>Passkeys</dt><dd>{adminAccountDetail.passkeys.length}</dd></div>
                      <div><dt>Recovery codes</dt><dd>{adminAccountDetail.recovery.activeCount}</dd></div>
                      <div><dt>Last login</dt><dd>{adminAccountDetail.lastLogin ? formatTimestamp(adminAccountDetail.lastLogin) : 'Never'}</dd></div>
                      {adminAccountDetail.profile && (
                        <div>
                          <dt>Progress</dt>
                          <dd>
                            {adminAccountDetail.profile.shards} shards · {adminAccountDetail.profile.seasonRating} rating
                            {' · '}{adminAccountDetail.profile.wins}W/{adminAccountDetail.profile.losses}L
                          </dd>
                        </div>
                      )}
                    </dl>

                    <p className="mini-text">
                      You can restore access to this account but never read or set its credentials.
                      A recovery code lets the player attach a new passkey themselves.
                    </p>

                    <div className="controls admin-account-actions">
                      <button className="secondary" onClick={() => void handleAdminIssueRecoveryGrant(adminAccountDetail, false)}>
                        Issue recovery code
                      </button>
                      <button className="ghost" onClick={() => void handleAdminIssueRecoveryGrant(adminAccountDetail, true)}>
                        Reset credentials
                      </button>
                      {adminAccountDetail.suspended ? (
                        <button className="primary" onClick={() => void handleAdminUnsuspendAccount(adminAccountDetail)}>
                          Lift suspension
                        </button>
                      ) : (
                        <button className="ghost" onClick={() => void handleAdminSuspendAccount(adminAccountDetail)}>
                          Suspend 24h
                        </button>
                      )}
                      {isOwnerRole && !adminAccountDetail.deletedAt && (
                        <button className="danger" onClick={() => void handleAdminDeleteAccount(adminAccountDetail)}>
                          Delete account
                        </button>
                      )}
                    </div>

                    {adminAccountDetail.recoveryGrants.length > 0 && (
                      <>
                        <h4>Recovery codes issued</h4>
                        <ul className="mini-list">
                          {adminAccountDetail.recoveryGrants.slice(0, 5).map((grant) => (
                            <li key={grant.grantId} className="mini-text">
                              {grant.status} · issued {formatTimestamp(grant.createdAt)}
                              {grant.note ? ` · ${grant.note}` : ''}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {adminAccountDetail.securityEvents.length > 0 && (
                      <>
                        <h4>Recent security events</h4>
                        <ul className="mini-list">
                          {adminAccountDetail.securityEvents.slice(0, 8).map((event: { eventType: string; createdAt: string }, index: number) => (
                            <li key={`${event.eventType}-${index}`} className="mini-text">
                              {event.eventType.replace(/_/g, ' ')} · {formatTimestamp(event.createdAt)}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                <div className="section-head log-heading">
                  <h3>Deleted Accounts</h3>
                  <button className="secondary" onClick={() => void refreshDeletedAccounts()}>
                    {adminDeletedLoading ? 'Loading…' : 'Load'}
                  </button>
                </div>
                <p className="mini-text">
                  Deleting never erases player data. Anything listed here can be restored with its
                  collection, rating, and match history intact.
                </p>
                <ul className="role-list">
                  {adminDeletedAccounts.length === 0 ? (
                    <li className="note">No deleted accounts loaded.</li>
                  ) : (
                    adminDeletedAccounts.map((account) => (
                      <li className="role-row" key={account.accountId}>
                        <div className="role-identity">
                          <strong>{account.displayName || account.username}</strong>
                          <span className="mini-text">@{account.username}</span>
                          {/* Distinguishes a sweeper casualty from a player who chose to leave. */}
                          <span className="badge role-badge">
                            {account.reason === 'legacy_migration_expired' ? 'Expired by sweeper' : 'Deleted'}
                          </span>
                          <span className="mini-text">
                            {account.shards} shards · {account.seasonRating} rating
                            {' · '}{account.wins}W/{account.losses}L
                          </span>
                        </div>
                        <div className="controls">
                          {isOwnerRole ? (
                            <button
                              className="primary"
                              onClick={() => void handleAdminRestoreAccount(account.accountId, account.username)}
                            >
                              Restore
                            </button>
                          ) : (
                            <span className="mini-text">Owner only</span>
                          )}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}

            {adminSubview === 'roles' && (
              <div className="admin-panel-block admin-role-block">
                {isOwnerRole ? (
                  <>
                    <div className="section-head log-heading">
                      <h3>Account Roles</h3>
                      <span className="badge">Owner</span>
                    </div>
                    <div className="admin-auth-row">
                      <input
                        className="text-input"
                        value={adminUserSearch}
                        placeholder="Search users by username, name, or id"
                        onChange={(event) => setAdminUserSearch(event.target.value)}
                      />
                      <button className="secondary" onClick={() => void refreshAdminUsers(adminUserSearch)}>
                        {adminUsersLoading ? 'Loading…' : 'Search'}
                      </button>
                    </div>
                    <ul className="role-list">
                      {adminUsers.length === 0 ? (
                        <li className="note">No users loaded. Click search to list accounts.</li>
                      ) : (
                        adminUsers.map((user) => {
                          const isSelf = user.accountId === (serverProfile?.accountId ?? '')
                          const isRoleOwner = user.role === 'owner'
                          return (
                            <li className="role-row" key={user.accountId}>
                              <div className="role-identity">
                                <strong>{user.displayName || user.username}</strong>
                                <span className="mini-text">@{user.username}</span>
                                <span className={`badge role-badge role-${user.role}`}>
                                  {user.role === 'owner' ? 'Owner' : user.role === 'admin' ? 'Admin' : 'Player'}
                                </span>
                              </div>
                              <div className="controls">
                                {isRoleOwner || isSelf ? (
                                  <span className="mini-text">{isSelf ? 'You' : 'Cannot modify the owner'}</span>
                                ) : user.role === 'admin' ? (
                                  <button className="ghost" onClick={() => void handleSetUserRole(user, 'user')}>
                                    Demote to Player
                                  </button>
                                ) : (
                                  <button className="primary" onClick={() => void handleSetUserRole(user, 'admin')}>
                                    Promote to Admin
                                  </button>
                                )}
                              </div>
                            </li>
                          )
                        })
                      )}
                    </ul>
                    <div className="section-head log-heading">
                      <h3>Transfer Ownership</h3>
                      <span className="badge">Irreversible</span>
                    </div>
                    <form className="form-stack" onSubmit={handleTransferOwnership}>
                      <label className="form-field">
                        <span>New owner</span>
                        <select
                          className="text-input"
                          value={transferForm.targetAccountId}
                          onChange={(event) => setTransferForm((f) => ({ ...f, targetAccountId: event.target.value }))}
                        >
                          <option value="">Choose an admin from the list above…</option>
                          {adminUsers
                            .filter((user) => user.accountId !== (serverProfile?.accountId ?? ''))
                            .map((user) => (
                              <option key={user.accountId} value={user.accountId}>
                                @{user.username}{user.displayName ? ` (${user.displayName})` : ''}{user.role === 'admin' ? ' • admin' : ''}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="form-field">
                        <span>Confirm your password</span>
                        <input
                          className="text-input"
                          type="password"
                          autoComplete="current-password"
                          value={transferForm.password}
                          onChange={(event) => setTransferForm((f) => ({ ...f, password: event.target.value }))}
                        />
                      </label>
                      {transferStatus && <p className={`toast toast-${inferToastSeverity(transferStatus)} toast-line`}>{transferStatus}</p>}
                      <div className="controls">
                        <button className="btn-danger" type="submit" disabled={!transferForm.targetAccountId || !transferForm.password}>
                          Transfer ownership
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <p className="note">Only the server owner can manage roles and ownership transfer.</p>
                )}
              </div>
            )}

            {adminSubview === 'audit' && (
              <div className="admin-panel-block">
                <div className="section-head log-heading">
                  <h3>Admin Audit Log</h3>
                  <button className="ghost" onClick={() => void refreshAdminAudit()}>Refresh</button>
                </div>
                <div className="audit-toolbar">
                  <label className="mini-text">
                    Filter:&nbsp;
                    <select value={adminAuditFilter} onChange={(event) => setAdminAuditFilter(event.target.value)}>
                      <option value="all">All actions</option>
                      {Array.from(new Set(adminAudit.map((entry) => entry.action))).sort().map((action) => (
                        <option key={action} value={action}>{action}</option>
                      ))}
                    </select>
                  </label>
                  <span className="mini-text">{adminAudit.length} total entries</span>
                </div>
                <ul className="audit-list">
                  {adminAudit.length === 0 ? (
                    <li className="note">No audit entries yet.</li>
                  ) : (
                    adminAudit
                      .filter((entry) => adminAuditFilter === 'all' || entry.action === adminAuditFilter)
                      .slice(0, 20)
                      .map((entry) => {
                        const expanded = adminAuditExpandedId === entry.id
                        const hasMeta = entry.metadata && Object.keys(entry.metadata).length > 0
                        return (
                          <li
                            key={entry.id}
                            className="audit-row"
                            onClick={() => setAdminAuditExpandedId(expanded ? null : entry.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                setAdminAuditExpandedId(expanded ? null : entry.id)
                              }
                            }}
                            aria-expanded={expanded}
                          >
                            <span className="badge">{entry.action}</span>
                            <span className="mini-text">
                              {entry.actor ? `@${entry.actor.username}` : 'system'}
                              {entry.target ? ` → @${entry.target.username}` : ''}
                            </span>
                            <span className="mini-text">{formatTimestamp(entry.createdAt)}</span>
                            {hasMeta && <span className="mini-text" aria-hidden="true">{expanded ? '▾' : '▸'}</span>}
                            {expanded && hasMeta && <pre className="audit-meta">{JSON.stringify(entry.metadata, null, 2)}</pre>}
                          </li>
                        )
                      })
                  )}
                </ul>
              </div>
            )}
          </>
        )}
          </div>
        )}
      </article>
    </section>
  )
}
