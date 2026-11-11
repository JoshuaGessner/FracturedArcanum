import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { IssuedGrant } from '../types'
import { buildRecoveryCodeMessage, formatTimestamp } from '../utils'

type RecoveryCodeModalProps = {
  grant: IssuedGrant | null
  /** Reports a copy result to the shell's toast line. */
  onNotice: (message: string) => void
  onClose: () => void
}

/**
 * The one and only display of an operator-issued recovery code.
 *
 * The code used to render inline at the top of the Accounts panel, while the
 * buttons that issue it sit at the bottom of the same scrolling panel — so an
 * operator who reset a player's credentials saw a toast and nothing else, and
 * the player was locked out with a code nobody could read. A dialog cannot be
 * scrolled away from.
 *
 * Dismissal is deliberately *under*-provided, the inverse of the battle sheet:
 * no backdrop tap and no Escape, only the explicit button. The code is hashed
 * at rest, so closing this by accident means issuing a new one.
 */
export function RecoveryCodeModal({ grant, onNotice, onClose }: RecoveryCodeModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState<'code' | 'message' | null>(null)

  useEffect(() => {
    if (grant) dialogRef.current?.focus()
  }, [grant])

  if (!grant) return null

  const { grantCode } = grant
  const expiresLabel = grant.expiresAt ? formatTimestamp(grant.expiresAt) : `in ${grant.ttlHours}h`
  const lifetime = `${grant.ttlHours} hour${grant.ttlHours === 1 ? '' : 's'}`

  async function handleCopy(kind: 'code' | 'message') {
    const text = kind === 'code' ? grantCode : buildRecoveryCodeMessage(grantCode, expiresLabel)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      onNotice(kind === 'code' ? 'Recovery code copied.' : 'Message for the player copied.')
    } catch {
      onNotice('Copy is blocked here. Select the code and copy it by hand.')
    }
  }

  function handleClose() {
    setCopied(null)
    onClose()
  }

  // Portalled for the same reason as BattleLaunchSheet: the settings panel sits
  // inside an isolated stacking context and its own scroll container.
  return createPortal(
    <div className="modal-backdrop recovery-code-backdrop">
      <div
        ref={dialogRef}
        className="modal recovery-code-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-code-title"
        aria-describedby="recovery-code-summary"
        tabIndex={-1}
      >
        <div className="modal-head">
          <h3 id="recovery-code-title">Recovery code for @{grant.username}</h3>
        </div>

        <div className="modal-body">
          <p id="recovery-code-summary">
            This is the only time this code is shown. Send it to the player now, or copy it somewhere
            safe before you close this.
          </p>

          <output className="recovery-code-value" aria-label="Recovery code">{grantCode}</output>

          <dl className="recovery-code-facts">
            <div><dt>Valid for</dt><dd>{lifetime}, until {expiresLabel}</dd></div>
            <div><dt>Uses</dt><dd>One. Issuing another code cancels this one.</dd></div>
            <div>
              <dt>Account now</dt>
              <dd>
                {grant.revokedPasskeys
                  ? 'Signed out everywhere. Old passkeys and password no longer work.'
                  : 'Unchanged until the code is used.'}
              </dd>
            </div>
          </dl>

          <ol className="recovery-code-steps">
            <li>Open the game and go to the sign-in screen.</li>
            <li>Tap <strong>No codes left?</strong> then <strong>Use a support code</strong>.</li>
            <li>Enter this code and create a new passkey.</li>
            <li>Save the fresh recovery codes they are shown.</li>
          </ol>

          <p className="mini-text">
            Only send this to someone you have confirmed is the account holder. It grants full access
            to the account.
          </p>
        </div>

        <div className="modal-actions recovery-code-actions">
          <button type="button" className="secondary" onClick={() => void handleCopy('code')}>
            {copied === 'code' ? 'Code copied' : 'Copy code'}
          </button>
          <button type="button" className="secondary" onClick={() => void handleCopy('message')}>
            {copied === 'message' ? 'Message copied' : 'Copy message for player'}
          </button>
          <button type="button" className="primary" onClick={handleClose}>
            {copied ? 'Done' : 'I have saved it'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
