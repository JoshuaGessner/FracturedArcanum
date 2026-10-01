import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled, OFL-licensed type: Cinzel for display, Inter for body. Latin
// subsets only for Cinzel; Inter's stylesheet scopes each subset by
// unicode-range, so browsers fetch only what they render.
import '@fontsource/cinzel/latin-600.css'
import '@fontsource/cinzel/latin-700.css'
import '@fontsource-variable/inter/wght.css'
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
      window.dispatchEvent(new CustomEvent('sw-controller-change'))
      if (refreshing) {
        return
      }

      refreshing = true
      window.location.reload()
    })

    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        window.dispatchEvent(new CustomEvent('sw-registration-success', { detail: { registration } }))
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
      .catch((error: unknown) => {
        window.dispatchEvent(new CustomEvent('sw-registration-error', { detail: { error } }))
      })

    void navigator.serviceWorker.ready.then((registration) => {
      window.dispatchEvent(new CustomEvent('sw-ready', { detail: { registration } }))
    })
  })
}
