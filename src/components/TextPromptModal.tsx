import { useEffect, useRef } from 'react'

type TextPromptRequest = {
  title: string
  label: string
  confirmLabel?: string
  placeholder?: string
}

type TextPromptModalProps = {
  request: TextPromptRequest | null
  value: string
  onChange: (value: string) => void
  onClose: (ok: boolean) => void
}

export function TextPromptModal({ request, value, onChange, onClose }: TextPromptModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!request) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [request])

  if (!request) return null

  const disabled = value.trim().length === 0 || value.trim().length > 30

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="text-prompt-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose(false)
        if (event.key === 'Enter' && !disabled) onClose(true)
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <h3 id="text-prompt-title">{request.title}</h3>
          <button type="button" className="modal-close" onClick={() => onClose(false)} aria-label="Close">
            ✕
          </button>
        </div>
        <label className="form-field">
          <span>{request.label}</span>
          <input
            ref={inputRef}
            className="text-input"
            value={value}
            maxLength={30}
            placeholder={request.placeholder ?? ''}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        <p className="note">Use 1–30 characters.</p>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={disabled} onClick={() => onClose(true)}>
            {request.confirmLabel ?? 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
