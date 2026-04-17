import type { ToastEntry } from '../types'

type ToastStackProps = {
  toasts: ToastEntry[]
}

export function ToastStack({ toasts }: ToastStackProps) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((entry) => (
        <div key={entry.id} className={`toast toast-${entry.severity}`}>
          {entry.message}
        </div>
      ))}
    </div>
  )
}
