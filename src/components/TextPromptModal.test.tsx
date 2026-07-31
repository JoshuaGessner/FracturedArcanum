// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TextPromptModal } from './TextPromptModal'

// Mirrors TextPromptModal's internal request type, which it does not export.
type TextPromptRequest = {
  title: string
  label: string
  confirmLabel?: string
  placeholder?: string
  maxLength?: number
}

const base: TextPromptRequest = { title: 'Rename deck', label: 'Deck name' }

function setup(request: TextPromptRequest | null, value = '') {
  const onClose = vi.fn()
  const onChange = vi.fn()
  const view = render(
    <TextPromptModal request={request} value={value} onChange={onChange} onClose={onClose} />,
  )
  return { onClose, onChange, ...view }
}

// This project runs vitest without globals, so @testing-library/react cannot
// register its own afterEach hook. Without an explicit cleanup, every render
// accumulates in document.body and `screen` queries match across tests.
afterEach(cleanup)

describe('TextPromptModal', () => {
  it('renders nothing without a request', () => {
    const { container } = setup(null)
    expect(container.innerHTML).toBe('')
  })

  it('renders the title and label with dialog semantics', () => {
    const { container } = setup(base)
    expect(screen.getByText('Rename deck')).toBeTruthy()
    expect(screen.getByText('Deck name')).toBeTruthy()
    const backdrop = container.querySelector('.modal-backdrop')!
    expect(backdrop.getAttribute('role')).toBe('dialog')
    expect(backdrop.getAttribute('aria-modal')).toBe('true')
  })

  it('disables save for empty or whitespace-only input', () => {
    setup(base, '')
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true)

    cleanup()
    setup(base, '   ')
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables save once there is real content', () => {
    setup(base, 'Aggro')
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('defaults the limit to 30 characters and surfaces it', () => {
    setup(base, 'ok')
    expect(screen.getByText('Use 1–30 characters.')).toBeTruthy()
    expect(screen.getByRole('textbox').getAttribute('maxlength')).toBe('30')
  })

  it('honours a custom maxLength', () => {
    setup({ ...base, maxLength: 8 }, 'ok')
    expect(screen.getByText('Use 1–8 characters.')).toBeTruthy()
    expect(screen.getByRole('textbox').getAttribute('maxlength')).toBe('8')
  })

  it('disables save when the trimmed value exceeds the limit', () => {
    // maxLength on the input caps typing, but a value can still arrive from
    // state, so the guard has to hold independently.
    setup({ ...base, maxLength: 4 }, 'toolong')
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('reports typing upward', () => {
    const { onChange } = setup(base, '')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Tempo' } })
    expect(onChange).toHaveBeenCalledWith('Tempo')
  })

  it('saves on click and cancels on Cancel', () => {
    const { onClose } = setup(base, 'Aggro')
    fireEvent.click(screen.getByText('Save'))
    expect(onClose).toHaveBeenCalledWith(true)

    onClose.mockClear()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('submits on Enter only when the value is valid', () => {
    const { onClose, container } = setup(base, '')
    fireEvent.keyDown(container.querySelector('.modal-backdrop')!, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()

    cleanup()
    const valid = setup(base, 'Aggro')
    fireEvent.keyDown(
      valid.container.querySelector('.modal-backdrop')!,
      { key: 'Enter' },
    )
    expect(valid.onClose).toHaveBeenCalledWith(true)
  })

  it('closes on Escape and on a backdrop click, but not inside the modal', () => {
    const { onClose, container } = setup(base, 'Aggro')
    fireEvent.keyDown(container.querySelector('.modal-backdrop')!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledWith(false)

    onClose.mockClear()
    fireEvent.click(container.querySelector('.modal')!)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(container.querySelector('.modal-backdrop')!)
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('uses a custom confirm label and placeholder when supplied', () => {
    setup({ ...base, confirmLabel: 'Rename', placeholder: 'e.g. Tempo Burn' }, 'x')
    expect(screen.getByText('Rename')).toBeTruthy()
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('e.g. Tempo Burn')
  })
})
