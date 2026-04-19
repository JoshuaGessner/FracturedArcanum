import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Missing #root element')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let refreshing = false

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) {
        return
      }

      refreshing = true
      window.location.reload()
    })

    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        const requestUpdate = () => void registration.update()

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing

          if (!newWorker) {
            return
          }

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // A new version is ready — notify the app so it can show a prompt
              window.dispatchEvent(
                new CustomEvent('sw-update-available', { detail: { registration } }),
              )
            }
          })
        })

        requestUpdate()
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            requestUpdate()
          }
        })
      })
  })
}
