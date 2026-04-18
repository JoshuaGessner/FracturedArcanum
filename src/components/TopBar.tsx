import type { ServerProfile, InstallPromptEvent } from '../types'

type TopBarProps = {
  screenTitle: string
  serverProfile: ServerProfile | null
  soundEnabled: boolean
  onToggleSound: () => void
  installPromptEvent: InstallPromptEvent | null
  onInstallApp: () => void
  onLogout: () => void
}

export function TopBar({
  screenTitle,
  serverProfile,
  soundEnabled,
  onToggleSound,
  installPromptEvent,
  onInstallApp,
  onLogout,
}: TopBarProps) {
  return (
    <header className="topbar topbar-art">
      <div className="brand-block">
        <img className="brand-logo" src="/fractured-arcanum-logo.svg" alt="Fractured Arcanum" />
        <div>
          <p className="eyebrow">{screenTitle}</p>
          <h1>Fractured Arcanum</h1>
        </div>
      </div>

      <div className="top-actions">
        <span className="username-label">{serverProfile?.username ?? ''}</span>
        <button className="ghost top-action-toggle" onClick={onToggleSound}>
          {soundEnabled ? 'Sound On' : 'Sound Off'}
        </button>
        {installPromptEvent && (
          <button className="ghost" onClick={onInstallApp}>
            Install
          </button>
        )}
        <button className="ghost" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}
