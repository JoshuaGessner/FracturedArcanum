// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SettingSwitch } from './SettingSwitch'

afterEach(cleanup)

describe('SettingSwitch', () => {
  it('is a switch named by its setting, with its state in aria-checked', () => {
    render(<SettingSwitch label="Haptics" checked onToggle={() => {}} />)
    const control = screen.getByRole('switch', { name: 'Haptics' })
    expect(control.getAttribute('aria-checked')).toBe('true')
    expect(control.textContent).toContain('On')
  })

  it('calls onToggle when pressed', () => {
    const onToggle = vi.fn()
    render(<SettingSwitch label="Analytics" checked={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Analytics' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('shows a caption in place of On/Off when a parent setting disables it', () => {
    render(<SettingSwitch label="Ambient Loops" checked={false} disabled caption="Audio off" onToggle={() => {}} />)
    const control = screen.getByRole('switch', { name: 'Ambient Loops' }) as HTMLButtonElement
    expect(control.disabled).toBe(true)
    expect(control.textContent).toContain('Audio off')
  })
})
