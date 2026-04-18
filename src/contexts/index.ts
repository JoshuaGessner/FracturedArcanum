/**
 * Phase 1A — context split (facade phase).
 *
 * These hooks expose typed *slices* of the existing monolithic AppContext.
 * They currently just call `useApp()` and let TypeScript narrow the return
 * value. The runtime is unchanged.
 *
 * Future sessions will replace each facade with a real Provider that owns
 * its own state. Screens that consume the slice hooks will keep working
 * unchanged through that migration, because the public hook API is stable.
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
