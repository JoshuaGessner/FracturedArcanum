// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AdminAccountDetailPanel } from './AdminAccountDetailPanel'
import type { AdminAccountDetail } from '../types'

afterEach(cleanup)

function account(overrides: Partial<AdminAccountDetail> = {}): AdminAccountDetail {
  return {
    accountId: 'acct-1',
    username: 'lostplayer',
    displayName: 'Lost Player',
    role: 'user',
    accountStatus: 'active',
    createdAt: '2026-07-01 10:00:00',
    lastLogin: '2026-09-30 18:00:00',
    deletedAt: null,
    lockedUntil: null,
    suspended: false,
    setupRequired: false,
    passwordResetRequired: false,
    legacyMigration: { startedAt: null, deadlineAt: null, completedAt: null },
    passkeys: [],
    recovery: { activeCount: 0, acknowledgedAt: null, generatedAt: null },
    recoveryGrants: [],
    securityEvents: [],
    profile: { shards: 4200, seasonRating: 1480, wins: 37, losses: 12 },
    ...overrides,
  }
}

function renderPanel(overrides: Partial<AdminAccountDetail> = {}, error = '') {
  const handlers = {
    onGrantTtlChange: vi.fn(),
    onIssueCode: vi.fn(),
    onResetCredentials: vi.fn(),
    onSuspend: vi.fn(),
    onUnsuspend: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  }
  render(
    <AdminAccountDetailPanel
      account={account(overrides)}
      isOwner
      error={error}
      grantTtlHours={1}
      {...handlers}
    />,
  )
  return handlers
}

describe('AdminAccountDetailPanel', () => {
  it('says plainly when a reset account has no live code to get back in with', () => {
    renderPanel({ passwordResetRequired: true })
    expect(screen.getByText(/no recovery code is live/i)).toBeTruthy()
  })

  it('shows action errors beside the buttons that caused them', () => {
    renderPanel({}, 'Passkey confirmation is required for this action.')
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Passkey confirmation')
    const actions = screen.getByRole('button', { name: 'Reset credentials' }).parentElement as HTMLElement
    // The error follows the action row directly, not the top of the console.
    expect(actions.nextElementSibling).toBe(alert)
  })

  it('offers the server-accepted code lifetimes and reports the choice', () => {
    const handlers = renderPanel()
    const group = screen.getByRole('group', { name: 'Recovery code lifetime' })
    const options = Array.from(group.querySelectorAll('button')).map((button) => button.textContent)
    expect(options).toEqual(['1 hour', '8 hours', '24 hours'])
    expect(screen.getByRole('button', { name: '1 hour' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '24 hours' }))
    expect(handlers.onGrantTtlChange).toHaveBeenCalledWith(24)
  })

  it('wires each rescue action to its own handler', () => {
    const handlers = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Issue recovery code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset credentials' }))
    expect(handlers.onIssueCode).toHaveBeenCalledTimes(1)
    expect(handlers.onResetCredentials).toHaveBeenCalledTimes(1)
  })
})
