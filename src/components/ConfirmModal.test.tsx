// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConfirmModal } from './ConfirmModal'
import type { ConfirmRequest } from '../types'

const base: ConfirmRequest = { title: 'Delete deck', body: 'This cannot be undone.' }

function setup(request: ConfirmRequest | null, textInput = '') {
  const onClose = vi.fn()
  const onTextInputChange = vi.fn()
  const view = render(
    <ConfirmModal
      request={request}
      textInput={textInput}
      onTextInputChange={onTextInputChange}
      onClose={onClose}
    />,
  )
  return { onClose, onTextInputChange, ...view }
}

// This project runs vitest without globals, so @testing-library/react cannot
// register its own afterEach hook. Without an explicit cleanup, every render
// accumulates in document.body and `screen` queries match across tests.
afterEach(cleanup)

describe('ConfirmModal', () => {
  it('renders nothing without a request', () => {
    const { container } = setup(null)
    expect(container.innerHTML).toBe('')
  })

  it('renders the title and body, and exposes dialog semantics', () => {
    const { container } = setup(base)
    expect(screen.getByText('Delete deck')).toBeTruthy()
    expect(screen.getByText('This cannot be undone.')).toBeTruthy()
    const backdrop = container.querySelector('.modal-backdrop')!
    expect(backdrop.getAttribute('role')).toBe('dialog')
    expect(backdrop.getAttribute('aria-modal')).toBe('true')
    expect(backdrop.getAttribute('aria-labelledby')).toBe('confirm-title')
  })

  it('uses default action labels and overrides them when supplied', () => {
    setup(base)
    expect(screen.getByText('Confirm')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()

    cleanup()
    setup({ ...base, confirmLabel: 'Delete it', cancelLabel: 'Keep' })
    expect(screen.getByText('Delete it')).toBeTruthy()
    expect(screen.getByText('Keep')).toBeTruthy()
  })

  it('confirms with true and cancels with false', () => {
    const { onClose } = setup(base)
    fireEvent.click(screen.getByText('Confirm'))
    expect(onClose).toHaveBeenCalledWith(true)

    onClose.mockClear()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('closes on the X button and on Escape', () => {
    const { onClose } = setup(base)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledWith(false)

    onClose.mockClear()
    fireEvent.keyDown(document.querySelector('.modal-backdrop')!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('closes on a backdrop click but not on a click inside the modal', () => {
    const { onClose, container } = setup(base)
    fireEvent.click(container.querySelector('.modal')!)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(container.querySelector('.modal-backdrop')!)
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('marks a danger confirm so it is visually distinct', () => {
    setup({ ...base, danger: true })
    expect(screen.getByText('Confirm').className).toContain('btn-danger')

    cleanup()
    setup(base)
    expect(screen.getByText('Confirm').className).toContain('primary')
  })

  describe('type-to-confirm', () => {
    it('disables confirm until the typed text matches', () => {
      setup({ ...base, requireText: 'DELETE' }, '')
      expect((screen.getByText('Confirm') as HTMLButtonElement).disabled).toBe(true)
    })

    it('matches case-insensitively and ignores surrounding whitespace', () => {
      setup({ ...base, requireText: 'DELETE' }, '  delete  ')
      expect((screen.getByText('Confirm') as HTMLButtonElement).disabled).toBe(false)
    })

    it('stays disabled for a near miss', () => {
      setup({ ...base, requireText: 'DELETE' }, 'delet')
      expect((screen.getByText('Confirm') as HTMLButtonElement).disabled).toBe(true)
    })

    it('reports typing upward', () => {
      const { onTextInputChange } = setup({ ...base, requireText: 'DELETE' }, '')
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'DEL' } })
      expect(onTextInputChange).toHaveBeenCalledWith('DEL')
    })

    it('shows a default prompt, and a custom one when given', () => {
      setup({ ...base, requireText: 'DELETE' })
      expect(screen.getByText('Type "DELETE" to confirm')).toBeTruthy()

      cleanup()
      setup({ ...base, requireText: 'DELETE', requireTextLabel: 'Enter the deck name' })
      expect(screen.getByText('Enter the deck name')).toBeTruthy()
    })

    it('shows no text field when confirmation is not gated', () => {
      setup(base)
      expect(screen.queryByRole('textbox')).toBeNull()
    })
  })
})
