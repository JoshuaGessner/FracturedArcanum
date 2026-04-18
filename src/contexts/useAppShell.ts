import { useAppShellContext, type AppShellContextValue } from '../AppShellContext'

/**
 * App-shell concerns: auth, setup, navigation, toasts, confirm dialog,
 * install prompt, service worker, sound, analytics, complaints, admin
 * console state, live-service info, plus derived/handlers consumed by
 * other slice hooks.
 */
export type { AppShellContextValue }

export function useAppShell(): AppShellContextValue {
  return useAppShellContext()
}
