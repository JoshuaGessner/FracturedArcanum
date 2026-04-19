import type { ServerProfile } from '../types'

type TopBarProps = {
  screenTitle: string
  serverProfile: ServerProfile | null
}

export function TopBar({
  screenTitle,
  serverProfile,
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
      <div className="brand-block brand-block-home">
        <img className="brand-logo brand-logo-home" src="/fractured-arcanum-crest.svg" alt="Fractured Arcanum home crest" />
        <div className="brand-copy">
          <strong className="brand-wordmark">Fractured Arcanum</strong>
          <span className="username-label">@{serverProfile?.username ?? ''}</span>
        </div>
      </div>
    </header>
  )
}
