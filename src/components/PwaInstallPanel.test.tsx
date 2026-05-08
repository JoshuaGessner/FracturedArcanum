// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaInstallPanel } from './PwaInstallPanel'
import { createPwaInstallState } from '../pwa'

afterEach(() => cleanup())

describe('PwaInstallPanel', () => {
  it('renders a native install action when the prompt is available', () => {
    const onInstall = vi.fn()
    const installState = createPwaInstallState({
      hasInstallPrompt: true,
      serviceWorkerStatus: 'ready',
      platform: 'android',
      browser: 'chrome',
      secureContext: true,
      standalone: false,
    })

    render(<PwaInstallPanel installState={installState} onInstall={onInstall} />)

    fireEvent.click(screen.getByRole('button', { name: /install app/i }))
    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it('renders Android manual steps when the native prompt is absent', () => {
    const installState = createPwaInstallState({
      hasInstallPrompt: false,
      serviceWorkerStatus: 'ready',
      platform: 'android',
      browser: 'chrome',
      secureContext: true,
      standalone: false,
    })

    render(<PwaInstallPanel installState={installState} onInstall={vi.fn()} showDiagnostics />)

    expect(screen.getByText('Install from your browser menu')).toBeTruthy()
    expect(screen.getByText('Open the Chrome menu.')).toBeTruthy()
    expect(screen.getByText('Install status')).toBeTruthy()
  })

  it('hides itself by default after the app is installed', () => {
    const installState = createPwaInstallState({
      hasInstallPrompt: false,
      serviceWorkerStatus: 'ready',
      platform: 'desktop',
      browser: 'edge',
      secureContext: true,
      installedHint: true,
      standalone: false,
    })

    const { container } = render(<PwaInstallPanel installState={installState} onInstall={vi.fn()} />)

    expect(container.textContent).toBe('')
  })
})