import { describe, expect, it } from 'vitest'
import { createPwaInstallState } from './pwa'

describe('createPwaInstallState', () => {
  it('uses Android manual guidance when Chrome has no native prompt yet', () => {
    const state = createPwaInstallState({
      hasInstallPrompt: false,
      serviceWorkerStatus: 'ready',
      platform: 'android',
      browser: 'chrome',
      secureContext: true,
      standalone: false,
    })

    expect(state.status).toBe('android-manual')
    expect(state.canPrompt).toBe(false)
    expect(state.steps.join(' ')).toContain('Chrome menu')
  })

  it('prefers the native prompt whenever beforeinstallprompt is captured', () => {
    const state = createPwaInstallState({
      hasInstallPrompt: true,
      serviceWorkerStatus: 'ready',
      platform: 'android',
      browser: 'chrome',
      secureContext: true,
      standalone: false,
    })

    expect(state.status).toBe('native')
    expect(state.canPrompt).toBe(true)
    expect(state.primaryLabel).toBe('Install App')
  })

  it('uses iOS Share menu guidance instead of native prompt assumptions', () => {
    const state = createPwaInstallState({
      hasInstallPrompt: false,
      serviceWorkerStatus: 'ready',
      platform: 'ios',
      browser: 'safari',
      secureContext: true,
      standalone: false,
    })

    expect(state.status).toBe('ios-manual')
    expect(state.steps).toEqual(['Open this page in Safari.', 'Tap Share.', 'Choose Add to Home Screen, then Add.'])
  })

  it('suppresses install guidance when the app is already installed', () => {
    const state = createPwaInstallState({
      hasInstallPrompt: false,
      serviceWorkerStatus: 'controlling',
      platform: 'desktop',
      browser: 'edge',
      secureContext: true,
      installedHint: true,
      standalone: false,
    })

    expect(state.status).toBe('installed')
    expect(state.isInstalled).toBe(true)
  })

  it('blocks install flow when the context is not secure', () => {
    const state = createPwaInstallState({
      hasInstallPrompt: true,
      serviceWorkerStatus: 'ready',
      platform: 'android',
      browser: 'chrome',
      secureContext: false,
      standalone: false,
    })

    expect(state.status).toBe('insecure')
    expect(state.needsSecureContext).toBe(true)
  })

  it('uses desktop manual guidance when a desktop browser has no native prompt event', () => {
    const state = createPwaInstallState({
      hasInstallPrompt: false,
      serviceWorkerStatus: 'ready',
      platform: 'desktop',
      browser: 'edge',
      secureContext: true,
      standalone: false,
    })

    expect(state.status).toBe('desktop-manual')
    expect(state.steps.join(' ')).toContain('address bar')
  })
})