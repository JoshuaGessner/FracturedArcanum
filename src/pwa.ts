export type PwaPlatform = 'android' | 'ios' | 'desktop' | 'unknown'
export type PwaBrowser = 'chrome' | 'edge' | 'samsung' | 'safari' | 'firefox' | 'unknown'
export type PwaInstallStatus = 'installed' | 'native' | 'android-manual' | 'desktop-manual' | 'ios-manual' | 'insecure' | 'unsupported'
export type PwaServiceWorkerStatus = 'unsupported' | 'registering' | 'ready' | 'controlling' | 'error'

export type PwaInstallState = {
  status: PwaInstallStatus
  platform: PwaPlatform
  browser: PwaBrowser
  isInstalled: boolean
  canPrompt: boolean
  needsSecureContext: boolean
  serviceWorkerStatus: PwaServiceWorkerStatus
  headline: string
  primaryLabel: string
  note: string
  steps: string[]
  diagnostics: Array<{ label: string; value: string; ok: boolean }>
}


export type PwaInstallStateOptions = {
  hasInstallPrompt: boolean
  serviceWorkerStatus: PwaServiceWorkerStatus
  installedHint?: boolean
  platform?: PwaPlatform
  browser?: PwaBrowser
  standalone?: boolean
  secureContext?: boolean
}

function getNavigator(): Navigator | null {
  return typeof navigator === 'undefined' ? null : navigator
}

function getWindow(): Window | null {
  return typeof window === 'undefined' ? null : window
}

export function detectPwaPlatform(): PwaPlatform {
  const nav = getNavigator()
  if (!nav) return 'unknown'

  const ua = nav.userAgent.toLowerCase()
  const isIpadLikeMac = nav.platform === 'MacIntel' && nav.maxTouchPoints > 1
  if (/iphone|ipad|ipod/.test(ua) || isIpadLikeMac) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'desktop'
}

export function detectPwaBrowser(): PwaBrowser {
  const nav = getNavigator()
  if (!nav) return 'unknown'

  const ua = nav.userAgent.toLowerCase()
  if (/samsungbrowser/.test(ua)) return 'samsung'
  if (/edg\//.test(ua)) return 'edge'
  if (/firefox|fxios/.test(ua)) return 'firefox'
  if (/chrome|crios/.test(ua) && !/edg\//.test(ua)) return 'chrome'
  if (/safari/.test(ua) && !/chrome|crios|android/.test(ua)) return 'safari'
  return 'unknown'
}

export function isPwaStandaloneMode(): boolean {
  const win = getWindow()
  const nav = getNavigator() as (Navigator & { standalone?: boolean }) | null
  if (!win || !nav) return false

  return win.matchMedia?.('(display-mode: standalone)').matches === true
    || win.matchMedia?.('(display-mode: fullscreen)').matches === true
    || win.matchMedia?.('(display-mode: minimal-ui)').matches === true
    || nav.standalone === true
}

export function getInitialServiceWorkerStatus(): PwaServiceWorkerStatus {
  const nav = getNavigator()
  if (!nav || !('serviceWorker' in nav)) return 'unsupported'
  return nav.serviceWorker.controller ? 'controlling' : 'registering'
}

function isSecureInstallContext(): boolean {
  const win = getWindow()
  if (!win) return false
  return win.isSecureContext || ['localhost', '127.0.0.1'].includes(win.location.hostname)
}

function statusCopy(status: PwaInstallStatus, browser: PwaBrowser): Pick<PwaInstallState, 'headline' | 'primaryLabel' | 'note' | 'steps'> {
  switch (status) {
    case 'installed':
      return {
        headline: 'App installed',
        primaryLabel: 'Installed',
        note: 'Fractured Arcanum is already running as an installed app on this device.',
        steps: [],
      }
    case 'native':
      return {
        headline: 'Install Fractured Arcanum',
        primaryLabel: 'Install App',
        note: 'Your browser is ready to install the arena as a standalone app.',
        steps: ['Tap Install App.', 'Confirm the browser install prompt.', 'Launch from your home screen, dock, or app list.'],
      }
    case 'android-manual':
      return {
        headline: 'Install from your browser menu',
        primaryLabel: 'Use browser menu',
        note: browser === 'samsung'
          ? 'Samsung Internet can install the app from its browser menu even when no native prompt appears in-page.'
          : 'Chrome may delay the native install prompt. You can still install from the browser menu when the app is eligible.',
        steps: browser === 'samsung'
          ? ['Open the Samsung Internet menu.', 'Choose Add page to, then Home screen or Apps screen.', 'Launch Fractured Arcanum from the installed icon.']
          : ['Open the Chrome menu.', 'Choose Install app or Add to Home screen.', 'Confirm the install, then launch from your app drawer or home screen.'],
      }
    case 'desktop-manual':
      return {
        headline: 'Install from desktop browser controls',
        primaryLabel: 'Use browser controls',
        note: 'Desktop browsers expose installation from the address bar or app menu when the PWA is eligible.',
        steps: browser === 'safari'
          ? ['Open the Share menu or File menu.', 'Choose Add to Dock when available.', 'Launch Fractured Arcanum from the Dock.']
          : ['Look for the install icon in the address bar.', 'Or open the browser menu and choose Install Fractured Arcanum.', 'Confirm the install and launch from your apps list.'],
      }
    case 'ios-manual':
      return {
        headline: 'Add from Safari',
        primaryLabel: 'Use Share menu',
        note: 'iPhone and iPad do not expose the browser install prompt. Safari installs PWAs through Share.',
        steps: ['Open this page in Safari.', 'Tap Share.', 'Choose Add to Home Screen, then Add.'],
      }
    case 'insecure':
      return {
        headline: 'Open the secure app link',
        primaryLabel: 'HTTPS required',
        note: 'Browsers require HTTPS, or localhost during development, before they will install a PWA.',
        steps: ['Open the production HTTPS URL.', 'Reload once the service worker is active.', 'Use the install button or browser menu.'],
      }
    default:
      return {
        headline: 'Install support is limited here',
        primaryLabel: 'Browser limited',
        note: 'This browser may not support installed web apps. Try Chrome, Edge, Safari, or Samsung Internet for the best install flow.',
        steps: ['Open the app in a PWA-capable browser.', 'Use the install option from the address bar, Share menu, or browser menu.'],
      }
  }
}

export function createPwaInstallState({
  hasInstallPrompt,
  serviceWorkerStatus,
  installedHint = false,
  platform: platformOverride,
  browser: browserOverride,
  standalone: standaloneOverride,
  secureContext,
}: PwaInstallStateOptions): PwaInstallState {
  const platform = platformOverride ?? detectPwaPlatform()
  const browser = browserOverride ?? detectPwaBrowser()
  const standalone = standaloneOverride ?? isPwaStandaloneMode()
  const isInstalled = installedHint || standalone
  const secure = secureContext ?? isSecureInstallContext()

  let status: PwaInstallStatus
  if (isInstalled) {
    status = 'installed'
  } else if (!secure) {
    status = 'insecure'
  } else if (hasInstallPrompt) {
    status = 'native'
  } else if (platform === 'ios') {
    status = 'ios-manual'
  } else if (platform === 'android' && (browser === 'chrome' || browser === 'edge' || browser === 'samsung' || browser === 'unknown')) {
    status = 'android-manual'
  } else if (platform === 'desktop' && browser !== 'firefox') {
    status = 'desktop-manual'
  } else {
    status = 'unsupported'
  }

  const copy = statusCopy(status, browser)
  const serviceWorkerReady = serviceWorkerStatus === 'ready' || serviceWorkerStatus === 'controlling'
  return {
    status,
    platform,
    browser,
    isInstalled,
    canPrompt: status === 'native',
    needsSecureContext: status === 'insecure',
    serviceWorkerStatus,
    ...copy,
    diagnostics: [
      { label: 'Secure context', value: secure ? 'Ready' : 'Needs HTTPS', ok: secure },
      { label: 'Service worker', value: serviceWorkerStatus, ok: serviceWorkerReady },
      { label: 'Native prompt', value: hasInstallPrompt ? 'Captured' : 'Not available yet', ok: hasInstallPrompt || status !== 'native' },
      { label: 'Display mode', value: standalone ? 'Standalone' : 'Browser tab', ok: isInstalled },
      { label: 'Platform', value: platform, ok: platform !== 'unknown' },
      { label: 'Browser', value: browser, ok: browser !== 'unknown' },
    ],
  }
}