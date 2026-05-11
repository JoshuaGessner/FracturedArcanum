import type { PwaInstallState } from '../pwa'

type PwaInstallPanelProps = {
  installState: PwaInstallState
  onInstall: () => void | Promise<void>
  compact?: boolean
  showInstalled?: boolean
  showDiagnostics?: boolean
}


export function PwaInstallPanel({
  installState,
  onInstall,
  compact = false,
  showInstalled = false,
  showDiagnostics = false,
}: PwaInstallPanelProps) {
  if (installState.isInstalled && !showInstalled) return null

  const canInstallNatively = installState.canPrompt
  const panelClass = [
    'pwa-install-panel',
    compact ? 'compact' : '',
    `pwa-install-${installState.status}`,
  ].filter(Boolean).join(' ')

  return (
    <section className={panelClass} aria-label="App installation">
      <div className="pwa-install-copy">
        <p className="eyebrow">Install App</p>
        <strong>{installState.headline}</strong>
        <span className="mini-text">{installState.note}</span>
      </div>

      {canInstallNatively ? (
        <button className="primary pwa-install-action" onClick={() => void onInstall()}>
          {installState.primaryLabel}
        </button>
      ) : (
        <div className="pwa-install-manual" aria-label="Installation steps">
          {installState.steps.map((step, index) => (
            <span key={step} className="pwa-install-step">
              <strong>{index + 1}</strong>
              {step}
            </span>
          ))}
          {installState.status === 'ios-manual' && (
            <span className="mini-text pwa-install-ios-session-note">
              After adding to your home screen, you will need to sign in again — the installed app and Safari keep separate sessions.
            </span>
          )}
        </div>
      )}

      {showDiagnostics && (
        <details className="pwa-install-diagnostics">
          <summary>Install status</summary>
          <div className="pwa-install-diagnostic-grid">
            {installState.diagnostics.map((item) => (
              <span className={item.ok ? 'ready' : 'warning'} key={item.label}>
                <strong>{item.label}</strong>
                {item.value}
              </span>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}