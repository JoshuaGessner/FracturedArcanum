// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AuthGate, type AuthFormState } from './AuthGate'
import type { AuthScreen } from '../types'

afterEach(cleanup)

const emptyForm: AuthFormState = { username: '', password: '', recoveryCode: '', grantCode: '' }

type AuthGateProps = Parameters<typeof AuthGate>[0]

function renderGate(overrides: Partial<AuthGateProps> = {}) {
  const props: AuthGateProps = {
    screen: 'login' as AuthScreen,
    onScreenChange: vi.fn<AuthGateProps['onScreenChange']>(),
    form: emptyForm,
    onFormChange: vi.fn<AuthGateProps['onFormChange']>(),
    legalAccepted: false,
    onLegalAcceptedChange: vi.fn<AuthGateProps['onLegalAcceptedChange']>(),
    supportDetails: '',
    onSupportDetailsChange: vi.fn<AuthGateProps['onSupportDetailsChange']>(),
    status: '',
    error: '',
    loading: false,
    passkeySupported: true,
    onSubmit: vi.fn<AuthGateProps['onSubmit']>((event) => event.preventDefault()),
    onPasskeySignIn: vi.fn<AuthGateProps['onPasskeySignIn']>(),
    onSubmitSupportTicket: vi.fn<AuthGateProps['onSubmitSupportTicket']>(),
    onArmAutofill: vi.fn<AuthGateProps['onArmAutofill']>(),
    onCancelAutofill: vi.fn<AuthGateProps['onCancelAutofill']>(),
    ...overrides,
  }
  const view = render(<AuthGate {...props} />)
  return { props, view }
}

describe('AuthGate sign-in', () => {
  it('annotates the username field so the browser can offer passkeys from autofill', () => {
    renderGate()
    const field = screen.getByRole('textbox', { name: /username/i })
    // `webauthn` must be the last token, or browsers will not list passkeys.
    expect(field.getAttribute('autocomplete')).toBe('username webauthn')
    expect((field as HTMLInputElement).required).toBe(false)
  })

  it('lets the passkey button sign in without a username', () => {
    const { props } = renderGate()
    const button = screen.getByRole('button', { name: 'Sign in with a passkey' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(props.onPasskeySignIn).toHaveBeenCalledTimes(1)
  })

  it('arms autofill on the sign-in screen and withdraws it on leaving', () => {
    const { props, view } = renderGate()
    expect(props.onArmAutofill).toHaveBeenCalledTimes(1)
    expect(props.onCancelAutofill).not.toHaveBeenCalled()

    view.rerender(<AuthGate {...props} screen="signup" />)
    expect(props.onCancelAutofill).toHaveBeenCalledTimes(1)
    expect(props.onArmAutofill).toHaveBeenCalledTimes(1)
  })

  it('never arms autofill on screens that are not sign-in', () => {
    const { props } = renderGate({ screen: 'signup' })
    expect(props.onArmAutofill).not.toHaveBeenCalled()
    // Signup is creating a passkey, so its field must not invite autofill of one.
    expect(screen.getByRole('textbox', { name: /username/i }).getAttribute('autocomplete')).toBe('username')
  })

  it('keeps every recovery route one tap away behind "Trouble signing in?"', () => {
    const { props } = renderGate()
    expect(screen.getByText('Trouble signing in?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use a support code' }))
    expect(props.onScreenChange).toHaveBeenCalledWith('grant')
    expect(screen.getByRole('button', { name: 'Use a recovery code' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Upgrade an old password account' })).toBeTruthy()
  })

  it('explains an unsupported browser instead of silently disabling the button', () => {
    renderGate({ passkeySupported: false })
    expect(screen.getByRole('alert').textContent).toMatch(/cannot use passkeys/)
    expect((screen.getByRole('button', { name: 'Sign in with a passkey' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('AuthGate other screens', () => {
  it('leads every recovery screen back to sign-in', () => {
    const { props } = renderGate({ screen: 'recover' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(props.onScreenChange).toHaveBeenCalledWith('login')
    // The current screen is not offered as a route to itself.
    expect(screen.queryByRole('button', { name: 'Use a recovery code' })).toBeNull()
  })

  it('does not ask for a username when redeeming a support code', () => {
    renderGate({ screen: 'grant' })
    expect(screen.queryByRole('textbox', { name: /username/i })).toBeNull()
    expect(screen.getByRole('textbox', { name: /code from support/i })).toBeTruthy()
  })

  it('lets a legacy password account upgrade even without passkey support', () => {
    renderGate({ screen: 'legacy', passkeySupported: false })
    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByRole('button', { name: 'Upgrade my account' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
