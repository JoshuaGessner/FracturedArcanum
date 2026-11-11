// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RecoveryCodeModal } from './RecoveryCodeModal'
import type { IssuedGrant } from '../types'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const grant: IssuedGrant = {
  username: 'lostplayer',
  grantCode: 'FAR-AAAAA-BBBBB-CCCCC-DDDDD',
  expiresAt: '2026-10-03T00:00:00.000Z',
  ttlHours: 8,
  revokedPasskeys: true,
}

describe('RecoveryCodeModal', () => {
  it('renders nothing until a code has been issued', () => {
    render(<RecoveryCodeModal grant={null} onNotice={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the code, its lifetime, and what happened to the account in a dialog on <body>', () => {
    render(<RecoveryCodeModal grant={grant} onNotice={() => {}} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Recovery code for @lostplayer' })
    expect(dialog.closest('body')).toBe(document.body)
    expect(screen.getByLabelText('Recovery code').textContent).toBe(grant.grantCode)
    expect(dialog.textContent).toContain('8 hours')
    expect(dialog.textContent).toContain('Old passkeys and password no longer work')
  })

  it('does not close on a backdrop click or Escape, only on the explicit button', () => {
    const onClose = vi.fn()
    render(<RecoveryCodeModal grant={grant} onNotice={() => {}} onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog.parentElement as HTMLElement)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'I have saved it' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('copies the code alone, or a ready-to-send message that names the redeem buttons', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const onNotice = vi.fn()
    render(<RecoveryCodeModal grant={grant} onNotice={onNotice} onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(grant.grantCode))

    fireEvent.click(screen.getByRole('button', { name: 'Copy message for player' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    const message = writeText.mock.calls[1][0] as string
    expect(message).toContain(grant.grantCode)
    expect(message).toContain('Use a support code')
    expect(onNotice).toHaveBeenCalledWith('Message for the player copied.')
  })

  it('tells the operator to copy by hand when the clipboard is blocked', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    const onNotice = vi.fn()
    render(<RecoveryCodeModal grant={grant} onNotice={onNotice} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith(expect.stringMatching(/copy it by hand/)))
  })
})
