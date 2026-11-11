import { useEffect, useEffectEvent, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { AUTH_RECOVERY_ROUTES } from '../constants'
import type { AuthScreen } from '../types'

export type AuthFormState = { username: string; password: string; recoveryCode: string; grantCode: string }

type AuthGateProps = {
  screen: AuthScreen
  onScreenChange: (screen: AuthScreen) => void
  form: AuthFormState
  onFormChange: Dispatch<SetStateAction<AuthFormState>>
  /** Terms, privacy, and age acceptance, which signup asks for as one box. */
  legalAccepted: boolean
  onLegalAcceptedChange: (accepted: boolean) => void
  supportDetails: string
  onSupportDetailsChange: (details: string) => void
  status: string
  error: string
  loading: boolean
  passkeySupported: boolean
  onSubmit: (event: FormEvent) => void
  onPasskeySignIn: () => void
  onSubmitSupportTicket: () => void
  /** Arm passkey autofill on the username field while sign-in is showing. */
  onArmAutofill: () => void
  onCancelAutofill: () => void
}

const SUBMIT_LABELS: Record<Exclude<AuthScreen, 'login'>, string> = {
  signup: 'Create account with a passkey',
  recover: 'Recover with code',
  grant: 'Restore my account',
  legacy: 'Upgrade my account',
}

const SCREEN_TITLES: Record<AuthScreen, string> = {
  login: 'Sign in',
  signup: 'Create your account',
  recover: 'Recover with a code',
  grant: 'Use a support code',
  legacy: 'Upgrade an old account',
}

/**
 * The signed-out screen.
 *
 * Built to the pattern Google, Apple, GitHub and the FIDO Alliance's passkey
 * guidance converge on. Sign-in has one job and needs nothing typed:
 *
 * - The username field carries `autocomplete="username webauthn"`, so focusing
 *   it lists this device's passkeys in the browser's own suggestions (armed by
 *   `onArmAutofill`). Picking one signs in.
 * - "Sign in with a passkey" opens the device's passkey sheet directly. The
 *   username is optional; typing one narrows the sheet to that account.
 * - Recovery paths sit behind "Trouble signing in?" rather than as five equal
 *   links competing with the primary action.
 *
 * The old screen asked for a username first and refused the button until one
 * was typed, which is the step passkeys exist to remove.
 */
export function AuthGate({
  screen,
  onScreenChange,
  form,
  onFormChange,
  legalAccepted,
  onLegalAcceptedChange,
  supportDetails,
  onSupportDetailsChange,
  status,
  error,
  loading,
  passkeySupported,
  onSubmit,
  onPasskeySignIn,
  onSubmitSupportTicket,
  onArmAutofill,
  onCancelAutofill,
}: AuthGateProps) {
  const armAutofill = useEffectEvent(onArmAutofill)
  const cancelAutofill = useEffectEvent(onCancelAutofill)

  // Autofill can only be pending while the sign-in form is on screen: the
  // request needs the annotated input to exist, and leaving for signup or
  // recovery must not leave a stray request behind.
  useEffect(() => {
    if (screen !== 'login') return undefined
    armAutofill()
    return () => cancelAutofill()
  }, [screen])

  const isRecoveryScreen = AUTH_RECOVERY_ROUTES.some((route) => route.screen === screen)
  const needsPasskeys = screen !== 'legacy'

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <img className="auth-app-icon" src="/fractured-arcanum-icon-512.svg" alt="Fractured Arcanum app icon" />
        <h1>Fractured Arcanum</h1>
        <p className="auth-tagline">Cosmic horror card battles await</p>
        <h2 className="auth-screen-title">{SCREEN_TITLES[screen]}</h2>

        <form className="auth-form" onSubmit={onSubmit}>
          {renderUsernameField()}
          {renderScreenFields()}

          {needsPasskeys && !passkeySupported && (
            <p className="auth-error" role="alert">
              This browser cannot use passkeys. Open the game in an up-to-date Chrome, Safari, Edge,
              or Firefox{screen === 'login' ? ', or use a recovery option below' : ''}.
            </p>
          )}
          {status && <p className="auth-note" role="status">{status}</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}

          {screen === 'login' ? (
            <>
              <button
                className="primary"
                type="button"
                disabled={loading || !passkeySupported}
                onClick={onPasskeySignIn}
              >
                {loading ? 'Signing in...' : 'Sign in with a passkey'}
              </button>
              <p className="auth-note">
                Your device lists the passkeys you saved for Fractured Arcanum. No password needed.
              </p>
            </>
          ) : (
            <button
              className="primary"
              type="submit"
              disabled={loading || (needsPasskeys && !passkeySupported)}
            >
              {loading ? 'Please wait...' : SUBMIT_LABELS[screen]}
            </button>
          )}
        </form>

        {renderFooter()}
      </div>
    </div>
  )

  function renderUsernameField() {
    // A support code carries its own account, so asking for a username would
    // only be one more thing to remember.
    if (screen === 'grant') return null
    const signingIn = screen === 'login'
    return (
      <label>
        {screen === 'signup' ? 'Choose a username' : signingIn ? 'Username (optional)' : 'Username'}
        <input
          type="text"
          name="username"
          placeholder={signingIn ? 'Tap to choose a passkey' : '3-20 chars, letters/numbers/_'}
          maxLength={20}
          // `webauthn` must be the last token: it is what lets the browser list
          // passkeys here. Only sign-in carries it; signup is creating one.
          autoComplete={signingIn ? 'username webauthn' : 'username'}
          autoCapitalize="none"
          spellCheck={false}
          required={!signingIn}
          value={form.username}
          onChange={(event) => onFormChange((current) => ({ ...current, username: event.target.value }))}
        />
      </label>
    )
  }

  function renderScreenFields() {
    switch (screen) {
      case 'legacy':
        return (
          <label>
            Old password
            <input
              type="password"
              placeholder="The password you used before passkeys"
              minLength={8}
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(event) => onFormChange((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
        )
      case 'recover':
        return (
          <>
            <label>
              Recovery code
              <input
                type="text"
                placeholder="FA-XXXX-XXXX-XXXX"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                required
                value={form.recoveryCode}
                onChange={(event) => onFormChange((current) => ({ ...current, recoveryCode: event.target.value }))}
              />
            </label>
            <p className="auth-note">
              You will create a new passkey on this device, and your old passkeys and sessions will
              be signed out. To add a phone while you are still signed in elsewhere, use Settings on
              that device instead.
            </p>
            <details className="auth-help">
              <summary>No recovery codes?</summary>
              <p className="auth-note">
                Send a support ticket with your username and details only you would know. An admin
                can send you a one-time support code.
              </p>
              <label>
                Support details
                <textarea
                  className="text-input text-area"
                  rows={3}
                  placeholder="Your username, roughly when you last played, cards or rating you remember."
                  value={supportDetails}
                  onChange={(event) => onSupportDetailsChange(event.target.value)}
                />
              </label>
              <button className="ghost" type="button" disabled={loading} onClick={onSubmitSupportTicket}>
                Send support ticket
              </button>
            </details>
          </>
        )
      case 'grant':
        return (
          <>
            <label>
              Code from support
              <input
                type="text"
                placeholder="FAR-XXXXX-XXXXX-XXXXX-XXXXX"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                required
                value={form.grantCode}
                onChange={(event) => onFormChange((current) => ({ ...current, grantCode: event.target.value }))}
              />
            </label>
            <p className="auth-note">
              The code finds your account on its own. You will create a new passkey on this device,
              and any old passkeys and sessions will be replaced.
            </p>
          </>
        )
      case 'signup':
        return (
          <>
            <label className="legal-check">
              <input
                type="checkbox"
                required
                checked={legalAccepted}
                onChange={(event) => onLegalAcceptedChange(event.target.checked)}
              />
              <span>
                I accept the Terms of Service and Privacy Policy and confirm I meet the age
                requirement or have guardian consent.
              </span>
            </label>
            <p className="auth-note">
              Your device saves a passkey instead of a password. Most password managers sync it to
              your other devices; you can also add more devices later in Settings.
            </p>
          </>
        )
      default:
        return null
    }
  }

  function renderFooter() {
    const go = (next: AuthScreen) => () => onScreenChange(next)
    if (screen === 'signup') {
      return (
        <div className="auth-switch">
          <span className="auth-switch-line">
            <span>Already have an account?</span>
            <button className="link" type="button" onClick={go('login')}>Sign in</button>
          </span>
        </div>
      )
    }
    const recoveryLinks = AUTH_RECOVERY_ROUTES.filter((route) => route.screen !== screen).map((route) => (
      <li key={route.screen}>
        <button className="link" type="button" onClick={go(route.screen)}>{route.label}</button>
        <span>{route.hint}</span>
      </li>
    ))
    if (isRecoveryScreen) {
      return (
        <div className="auth-switch">
          <span className="auth-switch-line">
            <button className="link" type="button" onClick={go('login')}>Back to sign in</button>
          </span>
          <ul className="auth-route-list">{recoveryLinks}</ul>
        </div>
      )
    }
    return (
      <div className="auth-switch">
        <span className="auth-switch-line">
          <span>New here?</span>
          <button className="link" type="button" onClick={go('signup')}>Create an account</button>
        </span>
        <details className="auth-help">
          <summary>Trouble signing in?</summary>
          <ul className="auth-route-list">{recoveryLinks}</ul>
        </details>
      </div>
    )
  }
}
