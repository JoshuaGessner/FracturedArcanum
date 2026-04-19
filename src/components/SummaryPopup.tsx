export type SummaryPopupAction = {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
}

export type SummaryPopupProps = {
  visible: boolean
  ariaLabel: string
  eyebrow?: string
  title: string
  note?: string
  tone?: 'victory' | 'defeat' | 'draw' | 'neutral'
  statusBadge?: string
  highlights?: string[]
  actions: SummaryPopupAction[]
}

export function SummaryPopup({
  visible,
  ariaLabel,
  eyebrow = 'Summary',
  title,
  note,
  tone = 'neutral',
  statusBadge,
  highlights = [],
  actions,
}: SummaryPopupProps) {
  if (!visible) return null

  return (
    <section
      className="summary-popup-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      data-scene-swipe-opt-out="true"
    >
      <div className={["summary-popup-card", 'section-card', `summary-popup-${tone}`].join(' ')}>
        <div className="summary-popup-head">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          {statusBadge && (
            <span className={`deck-status ${tone === 'victory' ? 'ready' : tone === 'neutral' ? '' : 'warning'}`.trim()}>
              {statusBadge}
            </span>
          )}
        </div>

        {note && <p className="note summary-popup-note">{note}</p>}

        {highlights.length > 0 && (
          <div className="badges summary-popup-highlights">
            {highlights.map((highlight) => (
              <span key={highlight} className="badge">
                {highlight}
              </span>
            ))}
          </div>
        )}

        <div className="controls summary-popup-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.variant ?? 'ghost'}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
