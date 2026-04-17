import type { ConfirmRequest } from '../types'

type ConfirmModalProps = {
  request: ConfirmRequest | null
  textInput: string
  onTextInputChange: (value: string) => void
  onClose: (ok: boolean) => void
}

export function ConfirmModal({ request, textInput, onTextInputChange, onClose }: ConfirmModalProps) {
  if (!request) return null
  const requireText = request.requireText
  const disabled = requireText
    ? textInput.trim().toLowerCase() !== requireText.toLowerCase()
    : false
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose(false)
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <h3 id="confirm-title">{request.title}</h3>
          <button type="button" className="modal-close" onClick={() => onClose(false)} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{request.body}</div>
        {requireText && (
          <label className="form-field">
            <span>{request.requireTextLabel ?? `Type "${requireText}" to confirm`}</span>
            <input
              className="text-input"
              autoFocus
              value={textInput}
              onChange={(event) => onTextInputChange(event.target.value)}
            />
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={() => onClose(false)}>
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={request.danger ? 'btn-danger' : 'primary'}
            disabled={disabled}
            onClick={() => onClose(true)}
          >
            {request.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
