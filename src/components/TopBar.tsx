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
  const isHome = screenTitle === 'Arena Home'

  if (!isHome) {
    return (
      <header className="topbar topbar-compact-shell" aria-label={screenTitle}>
        <div className="topbar-compact-copy">
          <p className="eyebrow">{screenTitle}</p>
        </div>
      </header>
    )
  }

  return (
    <header className="topbar topbar-art topbar-home">
      <div className="brand-block">
        <img className="brand-logo brand-logo-home" src="/fractured-arcanum-crest.svg" alt="Fractured Arcanum home crest" />
      </div>

      <div className="top-actions">
        <span className="username-label">@{serverProfile?.username ?? ''}</span>
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
