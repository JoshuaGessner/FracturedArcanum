import type { ServerProfile } from '../types'

type TopBarProps = {
  screenTitle: string
  serverProfile: ServerProfile | null
  /** Shard balance, shown persistently so the shop has context everywhere. */
  shards: number
  onOpenSettings: () => void
  /** Measured by the shell so the scene stage can reserve exact chrome height. */
  ref?: React.Ref<HTMLElement>
}

/**
 * Persistent top chrome.
 *
 * Carries the two things that belong above the fold on every screen in this
 * genre: the soft-currency balance, and the account/settings entry point.
 * Settings used to occupy a bottom-nav slot, which is unusual for a card game
 * and cost the bar a sixth of its width on the smallest phones.
 */
export function TopBar({
  screenTitle,
  serverProfile,
  shards,
  onOpenSettings,
  ref,
}: TopBarProps) {
  const isHome = screenTitle === 'Arena Home'

  const trailing = (
    <div className="topbar-trailing">
      <span className="topbar-currency" aria-label={`${shards} shards`}>
        <span className="topbar-currency-glyph" aria-hidden="true" />
        {shards}
      </span>
      <button
        className="topbar-settings-btn"
        onClick={onOpenSettings}
        aria-label="Settings and account"
      />
    </div>
  )

  if (!isHome) {
    return (
      <header className="topbar topbar-compact-shell" aria-label={screenTitle} ref={ref}>
        <div className="topbar-compact-copy">
          <p className="eyebrow">{screenTitle}</p>
        </div>
        {trailing}
      </header>
    )
  }

  return (
    <header className="topbar topbar-art topbar-home" ref={ref}>
      <div className="brand-block brand-block-home">
        <img className="brand-logo brand-logo-home" src="/fractured-arcanum-crest.svg" alt="Fractured Arcanum home crest" />
        <div className="brand-copy">
          <strong className="brand-wordmark">Fractured Arcanum</strong>
          <span className="username-label">@{serverProfile?.username ?? ''}</span>
        </div>
      </div>
      {trailing}
    </header>
  )
}
