type SettingSwitchProps = {
  /** The setting's name — the switch's accessible name. */
  label: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
  /** Replaces the On/Off caption, e.g. "Audio off" when a parent setting disables this one. */
  caption?: string
}

/**
 * A real switch for a binary preference: a brass track with a sliding
 * thumb, announced as a switch with its checked state, instead of a button
 * whose label flips between "On" and "Off" and leaves a screen reader to
 * guess which one is the current state.
 */
export function SettingSwitch({ label, checked, onToggle, disabled = false, caption }: SettingSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`setting-switch${checked ? ' is-on' : ''}`}
      onClick={onToggle}
      disabled={disabled}
    >
      <span className="setting-switch-caption" aria-hidden="true">{caption ?? (checked ? 'On' : 'Off')}</span>
      <span className="setting-switch-track" aria-hidden="true">
        <span className="setting-switch-thumb" />
      </span>
    </button>
  )
}
