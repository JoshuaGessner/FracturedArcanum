import { useApp } from '../useApp'
import type { AppContextValue } from '../AppContext'

/**
 * App-shell concerns: auth, setup, navigation, toasts, confirm dialog,
 * install prompt, service worker, sound, analytics, complaints, admin
 * console state, live-service info.
 *
 * See REFACTOR_PLAN.md Phase 1A — `src/contexts/AppContext.tsx`.
 *
 * Admin state currently lives here; it may be split into a dedicated
 * `useAdmin()` hook in a later phase if SettingsScreen ever needs to be
 * decomposed.
 */
export type AppShellContextValue = Pick<
  AppContextValue,
  // ─── Auth / setup ────────────────────────────────────────
  | 'authToken'
  | 'setAuthToken'
  | 'authScreen'
  | 'setAuthScreen'
  | 'authForm'
  | 'setAuthForm'
  | 'authError'
  | 'authLoading'
  | 'loggedIn'
  | 'setupRequired'
  | 'setupForm'
  | 'setSetupForm'
  | 'setupError'
  | 'setupLoading'
  | 'handleSetup'
  | 'handleAuth'
  | 'handleLogout'
  // ─── Navigation / shell ──────────────────────────────────
  | 'activeScreen'
  | 'openScreen'
  | 'screenTitle'
  | 'toastMessage'
  | 'toastSeverity'
  | 'toastStack'
  | 'setToastMessage'
  | 'inferToastSeverity'
  | 'confirmRequest'
  | 'confirmTextInput'
  | 'setConfirmTextInput'
  | 'askConfirm'
  | 'closeConfirm'
  // ─── PWA ─────────────────────────────────────────────────
  | 'installPromptEvent'
  | 'handleInstallApp'
  | 'swUpdateAvailable'
  | 'handleAcceptUpdate'
  | 'handleDismissUpdate'
  // ─── Preferences ─────────────────────────────────────────
  | 'soundEnabled'
  | 'setSoundEnabled'
  | 'analyticsConsent'
  | 'setAnalyticsConsent'
  | 'visitorId'
  // ─── Live-service info ───────────────────────────────────
  | 'backendOnline'
  | 'dailyQuest'
  | 'featuredMode'
  // ─── Complaints ──────────────────────────────────────────
  | 'complaintForm'
  | 'setComplaintForm'
  | 'complaintStatus'
  | 'handleSubmitComplaint'
  // ─── Admin console ───────────────────────────────────────
  | 'adminOverview'
  | 'adminLoading'
  | 'adminError'
  | 'adminUsers'
  | 'adminUsersLoading'
  | 'adminUserSearch'
  | 'setAdminUserSearch'
  | 'adminAudit'
  | 'adminAuditFilter'
  | 'setAdminAuditFilter'
  | 'adminAuditExpandedId'
  | 'setAdminAuditExpandedId'
  | 'adminSettings'
  | 'setAdminSettings'
  | 'transferForm'
  | 'setTransferForm'
  | 'transferStatus'
  | 'refreshAdminOverview'
  | 'refreshAdminUsers'
  | 'refreshAdminAudit'
  | 'handleSetUserRole'
  | 'handleTransferOwnership'
  | 'handleSaveAdminSettings'
  | 'handleUpdateComplaintStatus'
>

export function useAppShell(): AppShellContextValue {
  return useApp()
}
