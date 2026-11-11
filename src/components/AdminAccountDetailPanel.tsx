import { useEffect, useRef } from 'react'
import { GRANT_TTL_OPTIONS } from '../constants'
import type { AdminAccountDetail, GrantTtlHours } from '../types'
import { formatTimestamp } from '../utils'

type AdminAccountDetailPanelProps = {
  account: AdminAccountDetail
  isOwner: boolean
  /** Failure from one of this panel's actions; rendered beside the buttons. */
  error: string
  grantTtlHours: GrantTtlHours
  onGrantTtlChange: (hours: GrantTtlHours) => void
  onIssueCode: () => void
  onResetCredentials: () => void
  onSuspend: () => void
  onUnsuspend: () => void
  onDelete: () => void
  onClose: () => void
}

/** Plain-language sign-in state, so an operator can tell a stuck account at a glance. */
function describeSignIn(account: AdminAccountDetail): string {
  const activeGrant = account.recoveryGrants.find((grant) => grant.status === 'active')
  if (account.passwordResetRequired) {
    return activeGrant
      ? 'Reset. Waiting for the player to use their recovery code.'
      : 'Reset, and no recovery code is live. Issue one so the player can get back in.'
  }
  if (account.passkeys.length === 0) {
    return activeGrant ? 'No passkey yet. A recovery code is waiting.' : 'No passkey. Issue a recovery code.'
  }
  return `${account.passkeys.length} passkey${account.passkeys.length === 1 ? '' : 's'}`
}

/**
 * One account in the operator console: what it holds, how its owner signs in,
 * and the rescue actions.
 *
 * Opening an account scrolls this panel into view. It renders below the search
 * results, and on a phone that is below the fold: "Manage" looked like it did
 * nothing, and errors from these buttons rendered at the top of the console
 * where nobody was looking. Both now land where the operator's attention is.
 */
export function AdminAccountDetailPanel({
  account,
  isOwner,
  error,
  grantTtlHours,
  onGrantTtlChange,
  onIssueCode,
  onResetCredentials,
  onSuspend,
  onUnsuspend,
  onDelete,
  onClose,
}: AdminAccountDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    panelRef.current?.scrollIntoView?.({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [account.accountId])

  return (
    <div className="admin-account-detail" ref={panelRef}>
      <div className="section-head log-heading">
        <h3>@{account.username}</h3>
        <button className="ghost" onClick={onClose}>Close</button>
      </div>

      <dl className="admin-account-facts">
        <div><dt>Status</dt><dd>{account.suspended ? 'Suspended' : account.accountStatus}</dd></div>
        <div><dt>Sign-in</dt><dd>{describeSignIn(account)}</dd></div>
        <div><dt>Recovery codes</dt><dd>{account.recovery.activeCount} saved by player</dd></div>
        <div><dt>Last login</dt><dd>{account.lastLogin ? formatTimestamp(account.lastLogin) : 'Never'}</dd></div>
        {account.profile && (
          <div>
            <dt>Progress</dt>
            <dd>
              {account.profile.shards} shards · {account.profile.seasonRating} rating
              {' · '}{account.profile.wins}W/{account.profile.losses}L
            </dd>
          </div>
        )}
      </dl>

      <p className="mini-text">
        You can restore access to this account but never read or set its credentials. A recovery
        code lets the player attach a new passkey themselves. Their collection, rating, and history
        are never touched by any action here.
      </p>

      <div className="admin-grant-ttl" role="group" aria-label="Recovery code lifetime">
        <span className="mini-text">Code lifetime</span>
        {GRANT_TTL_OPTIONS.map((option) => (
          <button
            key={option.hours}
            type="button"
            className={grantTtlHours === option.hours ? 'active' : ''}
            aria-pressed={grantTtlHours === option.hours}
            onClick={() => onGrantTtlChange(option.hours)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="controls admin-account-actions">
        <button className="secondary" onClick={onIssueCode}>Issue recovery code</button>
        <button className="ghost" onClick={onResetCredentials}>Reset credentials</button>
        {account.suspended ? (
          <button className="primary" onClick={onUnsuspend}>Lift suspension</button>
        ) : (
          <button className="ghost" onClick={onSuspend}>Suspend 24h</button>
        )}
        {isOwner && !account.deletedAt && (
          <button className="danger" onClick={onDelete}>Delete account</button>
        )}
      </div>

      {error && <p className="note toast-line error" role="alert">{error}</p>}

      {account.recoveryGrants.length > 0 && (
        <>
          <h4>Recovery codes issued</h4>
          <ul className="mini-list">
            {account.recoveryGrants.slice(0, 5).map((grant) => (
              <li key={grant.grantId} className="mini-text">
                {grant.status} · issued {formatTimestamp(grant.createdAt)}
                {grant.status === 'active' ? ` · expires ${formatTimestamp(grant.expiresAt)}` : ''}
                {grant.note ? ` · ${grant.note}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {account.securityEvents.length > 0 && (
        <>
          <h4>Recent security events</h4>
          <ul className="mini-list">
            {account.securityEvents.slice(0, 8).map((event, index) => (
              <li key={`${event.eventType}-${index}`} className="mini-text">
                {event.eventType.replace(/_/g, ' ')} · {formatTimestamp(event.createdAt)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
