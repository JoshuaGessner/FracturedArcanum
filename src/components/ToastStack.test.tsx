// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToastStack } from './ToastStack'
import type { ToastEntry } from '../types'

describe('ToastStack', () => {
  it('renders nothing when toasts array is empty', () => {
    const { container } = render(<ToastStack toasts={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders toasts with correct severity classes', () => {
    const toasts: ToastEntry[] = [
      { id: '1', message: 'Hello', severity: 'info' },
      { id: '2', message: 'Warning', severity: 'warning' },
    ]
    render(<ToastStack toasts={toasts} />)
    expect(screen.getByText('Hello').className).toContain('toast-info')
    expect(screen.getByText('Warning').className).toContain('toast-warning')
  })

  it('applies role="alert" only to error toasts', () => {
    const toasts: ToastEntry[] = [
      { id: '1', message: 'All good', severity: 'success' },
      { id: '2', message: 'Something broke', severity: 'error' },
    ]
    render(<ToastStack toasts={toasts} />)
    const good = screen.getByText('All good')
    const broken = screen.getByText('Something broke')
    expect(good.getAttribute('role')).toBeNull()
    expect(broken.getAttribute('role')).toBe('alert')
  })

  it('wraps toasts in a live region', () => {
    const toasts: ToastEntry[] = [{ id: '1', message: 'Hi', severity: 'info' }]
    const { container } = render(<ToastStack toasts={toasts} />)
    const wrapper = container.querySelector('.toast-stack')!
    expect(wrapper.getAttribute('role')).toBe('status')
    expect(wrapper.getAttribute('aria-live')).toBe('polite')
  })
})
