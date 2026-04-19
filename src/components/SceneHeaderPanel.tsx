import type { ReactNode } from 'react'

export type SceneHeaderTile = {
  kicker: string
  value: string
  note: string
  accent?: boolean
}

type SceneHeaderShortcut = {
  label: string
  description: string
  onClick: () => void
}

type SceneHeaderPanelProps = {
  className?: string
  visual?: ReactNode
  title: string
  note: string
  badges?: ReactNode
  tiles: SceneHeaderTile[]
  viewLabel?: string
  onBack?: () => void
  shortcuts?: SceneHeaderShortcut[]
  children?: ReactNode
}

export function SceneHeaderPanel({
  className = '',
  visual,
  title,
  note,
  badges,
  tiles,
  viewLabel,
  onBack,
  shortcuts,
  children,
}: SceneHeaderPanelProps) {
  return (
    <div className={`scene-header-panel ${className}`.trim()}>
      <div className={`scene-header-top ${visual ? 'has-visual' : ''}`.trim()}>
        {visual ? <div className="scene-header-visual">{visual}</div> : null}
        <div className="scene-header-copy">
          <div className="scene-header-copy-main">
            <strong>{title}</strong>
            <span className="note">{note}</span>
          </div>
          {badges ? <div className="badges scene-header-badges">{badges}</div> : null}
        </div>
      </div>

      <div className="scene-status-grid scene-status-grid-compact">
        {tiles.map((tile) => (
          <div className={`scene-status-tile ${tile.accent ? 'is-accent' : ''}`.trim()} key={tile.kicker}>
            <span className="scene-status-kicker">{tile.kicker}</span>
            <strong>{tile.value}</strong>
            <span className="mini-text">{tile.note}</span>
          </div>
        ))}
      </div>

      {(viewLabel || onBack) && (
        <div className="settings-subnav scene-header-subnav">
          {viewLabel ? <span className="badge">{viewLabel}</span> : <span />}
          {onBack ? (
            <button className="ghost mini" onClick={onBack}>
              Back
            </button>
          ) : null}
        </div>
      )}

      {shortcuts && shortcuts.length > 0 ? (
        <div className="settings-hub-grid scene-header-shortcuts">
          {shortcuts.map((shortcut) => (
            <button className="settings-hub-tile" key={shortcut.label} onClick={shortcut.onClick}>
              <strong>{shortcut.label}</strong>
              <span>{shortcut.description}</span>
            </button>
          ))}
        </div>
      ) : null}

      {children}
    </div>
  )
}
