import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PwaInstallPanel } from '../components/PwaInstallPanel'
import { formatTimestamp, getComplaintSeverityTone } from '../utils'
import { useAppShell, useProfile } from '../contexts'
import { feedback } from '../feedback'

type AdminSubview = 'overview' | 'traffic' | 'complaints' | 'roles' | 'audit'

type SettingsToggleRowProps = {
  label: string
  action: ReactNode
  note?: string
}

function SettingsToggleRow({ label, action, note }: SettingsToggleRowProps) {
  return (
    <div className="settings-toggle-row">
      <span>{label}</span>
      {note && <span className="mini-text settings-install-hint">{note}</span>}
      {action}
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
    transferForm, setTransferForm, transferStatus, handleTransferOwnership,
    adminAudit, adminAuditFilter, setAdminAuditFilter,
    adminAuditExpandedId, setAdminAuditExpandedId, refreshAdminAudit,
    inferToastSeverity, setToastMessage,
    startOnboardingTour,
    gesturesEnabled, setGesturesEnabled,
    hapticsEnabled, setHapticsEnabled,
    settingsSubview, openSettingsSubview, resetSettingsSubview,
    installState, handleInstallApp, handleLogout,
  } = useAppShell()
  const { isAdminRole, isOwnerRole, accountRole, serverProfile } = useProfile()

  const [adminSubview, setAdminSubview] = useState<AdminSubview>('overview')
  const adminAutoLoadRef = useRef(false)

  const playerDisplayName = serverProfile?.displayName ?? serverProfile?.username ?? 'Guest'
  const visitorSuffix = (visitorId || 'guest').slice(-6).toUpperCase()
  const complaintTone = getComplaintSeverityTone(complaintForm.severity)
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
  const settingsViewLabel = settingsSubview === 'preferences'
    ? 'Preferences'
    : settingsSubview === 'support'
      ? 'Support Desk'
      : settingsSubview === 'admin'
        ? 'Admin Console'
        : 'Settings'

  useEffect(() => {
    if (settingsSubview !== 'admin') {
      adminAutoLoadRef.current = false
      return
    }
    if (!isAdminRole || adminOverview || adminLoading || adminAutoLoadRef.current) return

    adminAutoLoadRef.current = true
    void refreshAdminOverview()
  }, [adminLoading, adminOverview, isAdminRole, refreshAdminOverview, settingsSubview])

  const handleOpenSettingsSubview = (view: 'preferences' | 'support' | 'admin') => {
    feedback('tap', soundEnabled, hapticsEnabled)
    openSettingsSubview(view)
  }

  const renderToolbar = (right?: ReactNode) => (
    <div className="settings-section-toolbar">
      {settingsSubview === 'hub' ? (
        <span className="badge">{settingsViewLabel}</span>
      ) : (
        <button className="ghost mini" onClick={resetSettingsSubview}>Back</button>
      )}
      <div>
        <strong>{settingsViewLabel}</strong>
        <span>{settingsSubview === 'hub' ? 'Command center' : 'Settings panel'}</span>
      </div>
      {right ?? <span className="badge">{roleLabel}</span>}
    </div>
  )

  const renderHub = () => (
    <div className="settings-hub-surface">
      <button className="settings-hub-tile settings-hub-tile-preferences" onClick={() => handleOpenSettingsSubview('preferences')}>
        <span className="settings-hub-tile-kicker">Comfort</span>
        <strong>Preferences</strong>
        <span>{soundEnabled ? 'Sound on' : 'Sound off'} · {gesturesEnabled ? 'Swipe on' : 'Swipe off'} · {hapticsEnabled ? 'Haptics on' : 'Haptics off'}</span>
      </button>
      <button className="settings-hub-tile settings-hub-tile-support" onClick={() => handleOpenSettingsSubview('support')}>
        <span className="settings-hub-tile-kicker">Help</span>
        <strong>Support Desk</strong>
        <span>{complaintStatus || `Priority set to ${complaintForm.severity}`}</span>
      </button>
      <div className="settings-hub-tile settings-hub-tile-install">
        <span className="settings-hub-tile-kicker">Device</span>
        <strong>{installPathLabel}</strong>
        <span>{installState.primaryLabel}</span>
        <button className="ghost mini" onClick={() => handleOpenSettingsSubview('preferences')}>Manage</button>
      </div>
      {isAdminRole && (
        <button className="settings-hub-tile settings-hub-tile-admin" onClick={() => handleOpenSettingsSubview('admin')}>
          <span className="settings-hub-tile-kicker">Operations</span>
          <strong>{isOwnerRole ? 'Owner Console' : 'Admin Console'}</strong>
          <span>{adminOverview ? `${adminOverview.totals.complaintsOpen} open tickets` : 'Live ops, roles, audit, and reports'}</span>
        </button>
      )}
    </div>
  )

  const renderPreferences = () => (
    <div className="settings-section-panel settings-preferences-panel" data-scene-swipe-opt-out="true">
      {renderToolbar(<span className="badge">{installPathLabel}</span>)}
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
      </div>
      <PwaInstallPanel installState={installState} onInstall={handleInstallApp} showInstalled showDiagnostics />
      <SettingsToggleRow label="Log Out" action={<button className="ghost mini" onClick={handleLogout}>Sign Out</button>} />
    </div>
  )

  const renderSupport = () => (
    <div className="settings-section-panel settings-support-panel" data-scene-swipe-opt-out="true">
      {renderToolbar(<span className={`support-seal ${complaintTone}`}>{complaintForm.severity}</span>)}
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
        <div className="controls">
          <button className="primary" type="submit">Send Report</button>
        </div>
      </form>
    </div>
  )

  const renderAdminNav = () => (
    <div className="settings-admin-nav" role="tablist" aria-label="Admin sections">
      {(['overview', 'traffic', 'complaints', 'roles', 'audit'] as AdminSubview[]).map((view) => (
        <button
          key={view}
          className={adminSubview === view ? 'active' : ''}
          onClick={() => setAdminSubview(view)}
          role="tab"
          aria-selected={adminSubview === view}
        >
          {view === 'roles' ? 'Roles' : view.charAt(0).toUpperCase() + view.slice(1)}
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
          <button className={settingsSubview === 'hub' ? 'active' : ''} onClick={resetSettingsSubview}>Overview</button>
          <button className={settingsSubview === 'preferences' ? 'active' : ''} onClick={() => handleOpenSettingsSubview('preferences')}>Preferences</button>
          <button className={settingsSubview === 'support' ? 'active' : ''} onClick={() => handleOpenSettingsSubview('support')}>Support</button>
          {isAdminRole && (
            <button className={settingsSubview === 'admin' ? 'active' : ''} onClick={() => handleOpenSettingsSubview('admin')}>Admin</button>
          )}
        </nav>

        {settingsSubview === 'hub' && (
          <div className="settings-section-panel">
            {renderToolbar(<span className="badge">{backendOnline ? 'Online' : 'Fallback'}</span>)}
            {renderHub()}
          </div>
        )}
        {settingsSubview === 'preferences' && renderPreferences()}
        {settingsSubview === 'support' && renderSupport()}
        {settingsSubview === 'admin' && (
          <div className="settings-section-panel admin-console scribe-console" data-scene-swipe-opt-out="true">
            {renderToolbar(
              <button className="secondary mini" onClick={() => void refreshAdminOverview()}>
                {adminLoading ? 'Loading' : adminOverview ? 'Refresh' : 'Load'}
              </button>,
            )}
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

            {adminSubview === 'overview' && (
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
                  <span className="badge">Resolved {adminOverview.totals.complaintsResolved}</span>
                </div>
                <div className="ticket-list">
                  {adminOverview.complaints.length === 0 ? (
                    <p className="note">No complaints have been submitted yet.</p>
                  ) : (
                    adminOverview.complaints.slice(0, 10).map((complaint) => (
                      <div className="ticket-card" key={complaint.id}>
                        <div className="slot-head">
                          <strong>{complaint.summary}</strong>
                          <span className={`queue-pill ${complaint.status === 'resolved' ? 'found' : complaint.status === 'investigating' ? 'searching' : 'idle'}`}>
                            {complaint.status}
                          </span>
                        </div>
                        <p className="mini-text">{complaint.details}</p>
                        <div className="badges">
                          <span className="badge">{complaint.id}</span>
                          <span className="badge">{complaint.category}</span>
                          <span className="badge">{complaint.severity}</span>
                          <span className="badge">{formatTimestamp(complaint.createdAt)}</span>
                        </div>
                        <div className="controls">
                          <button className="ghost" onClick={() => void handleUpdateComplaintStatus(complaint.id, 'investigating')}>
                            Investigating
                          </button>
                          <button className="primary" onClick={() => void handleUpdateComplaintStatus(complaint.id, 'resolved')}>
                            Resolve
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
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
