/**
 * Phase 1 complete — provider-backed slice hooks.
 *
 * These hooks are the stable public API for screens. Each slice now composes
 * the relevant real provider state (Game/Profile/Social/Queue) with the slim
 * AppShellContext for cross-cutting handlers, navigation, toasts, auth, and
 * admin concerns.
 */

export type { GameContextValue } from './useGame'
export { useGame } from './useGame'

export type { ProfileContextValue } from './useProfile'
export { useProfile } from './useProfile'

export type { SocialContextValue } from './useSocial'
export { useSocial } from './useSocial'

export type { QueueContextValue } from './useQueue'
export { useQueue } from './useQueue'

export type { AppShellContextValue } from './useAppShell'
export { useAppShell } from './useAppShell'
