import { CARD_LIBRARY } from '../game'
import { RankBadge } from '../components/AssetBadge'
import { cardArtPath, formatTimestamp, getComplaintSeverityTone, handleCardArtError } from '../utils'
import { useAppShell, useProfile } from '../contexts'
import { feedback } from '../feedback'

export function SettingsScreen() {
  const {
    activeScreen,
    soundEnabled, setSoundEnabled,
    ambientEnabled, setAmbientEnabled,
    analyticsConsent, setAnalyticsConsent,
    visitorId, featuredMode, backendOnline,
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
  } = useAppShell()
  const { isAdminRole, isOwnerRole, accountRole, serverProfile } = useProfile()

  const playerDisplayName = serverProfile?.displayName ?? serverProfile?.username ?? 'Guest'
  const visitorSuffix = (visitorId || 'guest').slice(-6).toUpperCase()
  const complaintTone = getComplaintSeverityTone(complaintForm.severity)
  const roleInsignia = isOwnerRole ? 'Diamond' : isAdminRole ? 'Gold' : 'Bronze'

  return (
    <section className={`ops-grid settings-screen screen-panel ${activeScreen === 'settings' ? 'active' : 'hidden'}`}>
      <article className="section-card hero-card spotlight-card settings-hero-card">
        <div className="profile-showcase">
          <div className="profile-medal">
            <RankBadge rank={roleInsignia} />
          </div>
          <div className="hero-copy">
            <p className="eyebrow">The scribe's desk</p>
            <h2>{playerDisplayName}</h2>
            <p className="note">
              Tune your device preferences, review privacy posture, and monitor live service status from a single control desk.
            </p>
          </div>
        </div>

        <div className="insight-grid settings-status-grid">
          <div className="stat-tile">
            <span className="mini-text">Role</span>
            <strong>{accountRole === 'owner' ? 'Owner' : accountRole === 'admin' ? 'Admin' : 'Player'}</strong>
          </div>
          <div className="stat-tile">
            <span className="mini-text">Live service</span>
            <strong>{backendOnline ? 'Online' : 'Fallback'}</strong>
          </div>
          <div className="stat-tile">
            <span className="mini-text">Featured mode</span>
            <strong>{featuredMode}</strong>
          </div>
          <div className="stat-tile">
            <span className="mini-text">Visitor key</span>
            <strong>{visitorSuffix}</strong>
          </div>
        </div>

        <div className="badges">
          <span className="badge">@{serverProfile?.username ?? 'guest'}</span>
          <span className="badge">{soundEnabled ? 'Sound ready' : 'Sound muted'}</span>
          <span className={`deck-status ${analyticsConsent ? 'ready' : 'warning'}`}>
            {analyticsConsent ? 'Anonymous analytics on' : 'Analytics paused'}
          </span>
        </div>

        <div className="preference-grid">
          <div className="preference-tile">
            <div className="section-head">
              <div>
                <h3>Soundscape</h3>
                <p className="note">Keep arena cues, reward stings, and battle feedback enabled on this device.</p>
              </div>
              <span className={`deck-status ${soundEnabled ? 'ready' : 'warning'}`}>{soundEnabled ? 'Enabled' : 'Muted'}</span>
            </div>
            <div className="controls">
              <button
                className={soundEnabled ? 'secondary' : 'primary'}
                onClick={() => {
                  const nextValue = !soundEnabled
                  setSoundEnabled(nextValue)
                  setToastMessage(nextValue ? 'Arena sound enabled on this device.' : 'Arena sound muted on this device.')
                }}
              >
                {soundEnabled ? 'Mute Arena Audio' : 'Enable Arena Audio'}
              </button>
            </div>
          </div>

          <div className="preference-tile">
            <div className="section-head">
              <div>
                <h3>Ambient atmosphere</h3>
                <p className="note">Subtle scene-by-scene background beds — wind, distant crowd, parchment hum, war drum. Off by default; needs Arena Audio enabled.</p>
              </div>
              <span className={`deck-status ${ambientEnabled && soundEnabled ? 'ready' : 'warning'}`}>
                {!soundEnabled ? 'Audio muted' : ambientEnabled ? 'Playing' : 'Silent'}
              </span>
            </div>
            <div className="controls">
              <button
                className={ambientEnabled ? 'secondary' : 'primary'}
                disabled={!soundEnabled}
                onClick={() => {
                  const nextValue = !ambientEnabled
                  setAmbientEnabled(nextValue)
                  setToastMessage(nextValue ? 'Ambient scene loops enabled.' : 'Ambient scene loops disabled.')
                }}
              >
                {ambientEnabled ? 'Disable Ambient Loops' : 'Enable Ambient Loops'}
              </button>
            </div>
          </div>

          <div className="preference-tile">
            <div className="section-head">
              <div>
                <h3>Privacy and traffic</h3>
                <p className="note">Anonymous-only analytics help monitor traffic, stability, and queue flow.</p>
              </div>
              <span className={`deck-status ${analyticsConsent ? 'ready' : 'warning'}`}>
                {analyticsConsent ? 'Tracking active' : 'Tracking paused'}
              </span>
            </div>
            <div className="controls">
              <button
                className={analyticsConsent ? 'secondary' : 'primary'}
                onClick={() => {
                  const nextValue = !analyticsConsent
                  setAnalyticsConsent(nextValue)
                  setToastMessage(
                    nextValue
                      ? 'Anonymous traffic tracking enabled for quality monitoring.'
                      : 'Anonymous traffic tracking paused on this device.',
                  )
                }}
              >
                {analyticsConsent ? 'Pause Anonymous Analytics' : 'Enable Anonymous Analytics'}
              </button>
            </div>
          </div>

          <div className="preference-tile">
            <div className="section-head">
              <div>
                <h3>Onboarding tour</h3>
                <p className="note">Replay the 5-step spotlight walkthrough that introduces every scene of the arena.</p>
              </div>
              <span className="deck-status ready">Available</span>
            </div>
            <div className="controls">
              <button
                className="primary"
                onClick={() => {
                  feedback('tap', soundEnabled)
                  startOnboardingTour()
                }}
              >
                Replay onboarding tour
              </button>
            </div>
          </div>

          <div className="preference-tile">
            <div className="section-head">
              <div>
                <h3>Swipe between scenes</h3>
                <p className="note">Drag horizontally on touch devices to switch primary scenes. Battle is unaffected.</p>
              </div>
              <span className={`deck-status ${gesturesEnabled ? 'ready' : 'warning'}`}>
                {gesturesEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="controls">
              <button
                className={gesturesEnabled ? 'secondary' : 'primary'}
                onClick={() => {
                  const nextValue = !gesturesEnabled
                  feedback('tap', soundEnabled)
                  setGesturesEnabled(nextValue)
                  setToastMessage(
                    nextValue
                      ? 'Swipe between scenes enabled.'
                      : 'Swipe between scenes disabled.',
                  )
                }}
              >
                {gesturesEnabled ? 'Disable Scene Swipe' : 'Enable Scene Swipe'}
              </button>
            </div>
          </div>
        </div>

        <p className="note">
          Stored data is limited to a random guest id, aggregate traffic counters, match events,
          and any complaint tickets you explicitly submit.
        </p>

        <div className="asset-preview-row">
          {CARD_LIBRARY.slice(0, 4).map((card) => (
            <img
              key={card.id}
              className="asset-preview-thumb"
              src={cardArtPath(card.id)}
              alt={`${card.name} artwork`}
              loading="lazy"
              onError={handleCardArtError}
            />
          ))}
        </div>

        <p className="note toast-line">{complaintStatus}</p>
      </article>

      <article className="section-card utility-card complaint-desk-card">
        <div className="section-head">
          <div>
            <h2>Player Complaint Desk</h2>
            <p className="note">Submit gameplay bugs, fairness issues, or live service complaints.</p>
          </div>
          <div className="badges">
            <span className="badge">Support</span>
            <span className={`support-seal ${complaintTone}`}>{complaintForm.severity}</span>
          </div>
        </div>

        <p className="note">Include the mode, result, and reproduction steps so the ops team can resolve issues quickly.</p>

        <div className="rune-divider" aria-hidden="true" />

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
            <button className="primary" type="submit">
              Send Report
            </button>
          </div>
        </form>
      </article>

      <article className="section-card admin-console scribe-console">
        <img
          className="admin-banner-art"
          src="/generated/ui/admin-ops-banner.svg"
          alt="Arena operations banner"
        />

        <div className="section-head">
          <div>
            <h2>Admin Operations Console</h2>
            <p className="note">
              {isAdminRole
                ? 'Monitor traffic, review complaints, and control live service messaging.'
                : 'This console is only available to owner and admin accounts.'}
            </p>
          </div>
          <span className={`badge role-badge role-${accountRole}`}>
            {accountRole === 'owner' ? 'Owner' : accountRole === 'admin' ? 'Admin' : 'Player'}
          </span>
        </div>

        {isAdminRole ? (
          <div className="admin-auth-row">
            <button className="secondary" onClick={() => void refreshAdminOverview()}>
              {adminLoading ? 'Loading…' : adminOverview ? 'Refresh Console' : 'Open Console'}
            </button>
          </div>
        ) : (
          <p className="note toast-line">
            Your account does not have admin privileges. Contact the server owner if you believe this is a mistake.
          </p>
        )}

        {adminError && <p className="note toast-line">{adminError}</p>}

        {adminOverview && (
          <>
            <div className="rune-divider" aria-hidden="true" />

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

            <div className="admin-columns">
              <div className="admin-panel-block">
                <h3>Traffic by Section</h3>
                <ul className="stats-list">
                  {adminOverview.traffic.pages.slice(0, 5).map((entry) => (
                    <li key={entry.route}>
                      <span>{entry.route}</span>
                      <strong>{entry.views}</strong>
                    </li>
                  ))}
                </ul>

                <h3>Device Mix</h3>
                <ul className="stats-list">
                  {adminOverview.traffic.devices.slice(0, 4).map((entry) => (
                    <li key={entry.label}>
                      <span>{entry.label}</span>
                      <strong>{entry.count}</strong>
                    </li>
                  ))}
                </ul>

                <h3>Traffic by Day</h3>
                <ul className="stats-list">
                  {adminOverview.traffic.daily.slice(-5).reverse().map((entry) => (
                    <li key={entry.day}>
                      <span>{entry.day}</span>
                      <strong>{entry.views}</strong>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="admin-panel-block">
                <h3>Live Ops Controls</h3>
                <div className="form-stack">
                  <label className="form-field">
                    <span>Message of the day</span>
                    <input
                      className="text-input"
                      value={adminSettings.motd}
                      onChange={(event) =>
                        setAdminSettings((current) => ({ ...current, motd: event.target.value }))
                      }
                    />
                  </label>

                  <label className="form-field">
                    <span>Daily quest</span>
                    <input
                      className="text-input"
                      value={adminSettings.quest}
                      onChange={(event) =>
                        setAdminSettings((current) => ({ ...current, quest: event.target.value }))
                      }
                    />
                  </label>

                  <label className="form-field">
                    <span>Featured mode</span>
                    <input
                      className="text-input"
                      value={adminSettings.featuredMode}
                      onChange={(event) =>
                        setAdminSettings((current) => ({
                          ...current,
                          featuredMode: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="checkbox-row maintenance-toggle">
                    <input
                      type="checkbox"
                      checked={adminSettings.maintenanceMode}
                      onChange={(event) =>
                        setAdminSettings((current) => ({
                          ...current,
                          maintenanceMode: event.target.checked,
                        }))
                      }
                    />
                    <span>Maintenance mode</span>
                  </label>

                  <button className="primary" onClick={() => void handleSaveAdminSettings()}>
                    Save Live Settings
                  </button>
                </div>
              </div>
            </div>

            <div className="admin-panel-block">
              <div className="section-head log-heading">
                <h3>Recent Player Complaints</h3>
                <span className="badge">Resolved {adminOverview.totals.complaintsResolved}</span>
              </div>

              <div className="ticket-list">
                {adminOverview.complaints.length === 0 ? (
                  <p className="note">No complaints have been submitted yet.</p>
                ) : (
                  adminOverview.complaints.slice(0, 5).map((complaint) => (
                    <div className="ticket-card" key={complaint.id}>
                      <div className="slot-head">
                        <strong>{complaint.summary}</strong>
                        <span
                          className={`queue-pill ${
                            complaint.status === 'resolved'
                              ? 'found'
                              : complaint.status === 'investigating'
                                ? 'searching'
                                : 'idle'
                          }`}
                        >
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
                        <button
                          className="ghost"
                          onClick={() => void handleUpdateComplaintStatus(complaint.id, 'investigating')}
                        >
                          Investigating
                        </button>
                        <button
                          className="primary"
                          onClick={() => void handleUpdateComplaintStatus(complaint.id, 'resolved')}
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {isOwnerRole && (
              <div className="admin-panel-block admin-role-block">
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
                              <span className="mini-text">
                                {isSelf ? 'You' : 'Cannot modify the owner'}
                              </span>
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
              </div>
            )}

            {isAdminRole && (
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
                            {hasMeta && (
                              <span className="mini-text" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                            )}
                            {expanded && hasMeta && (
                              <pre className="audit-meta">{JSON.stringify(entry.metadata, null, 2)}</pre>
                            )}
                          </li>
                        )
                      })
                  )}
                </ul>
              </div>
            )}
          </>
        )}
      </article>
    </section>
  )
}
