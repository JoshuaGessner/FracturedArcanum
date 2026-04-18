/**
 * Phase 3U — Tactile Micro-Feedback System
 *
 * Single source of truth for the sound + haptic fingerprint of every
 * interactive control in the app. Screens and the AppShell call
 * `feedback(kind, soundEnabled)` instead of pairing `playSound(...)` with
 * `pulseFeedback(...)` ad-hoc, so future tuning happens in one place.
 *
 * Cinematic moments (battle intro, card slam, attack lunge, pack reveal,
 * win/lose, transition curtain, etc.) deliberately stay on direct
 * `playSound(...)` calls — they have unique sonic shapes that should not
 * be flattened into a generic UI fingerprint.
 */
import { playSound, type SoundName } from './audio'
import { pulseFeedback } from './utils'

export type FeedbackKind =
  | 'tap'
  | 'confirm'
  | 'cancel'
  | 'error'
  | 'nav'
  | 'select'
  | 'equip'
  | 'claim'
  | 'purchase'
  | 'inspect'

type FeedbackProfile = {
  /** Sound to play, or `null` to skip the audio cue (haptic-only). */
  sound: SoundName | null
  /** Vibration duration in ms. `0` skips the haptic cue. */
  haptic: number
}

/**
 * Mapping from semantic interaction kind to sound + haptic pairing.
 * Kept as a const record so the table is the single source of truth.
 */
export const FEEDBACK_TABLE: Record<FeedbackKind, FeedbackProfile> = {
  tap: { sound: 'tap', haptic: 8 },
  confirm: { sound: 'match', haptic: 18 },
  cancel: { sound: 'tap', haptic: 6 },
  error: { sound: 'error', haptic: 30 },
  nav: { sound: 'navigate', haptic: 10 },
  select: { sound: 'tap', haptic: 6 },
  equip: { sound: 'tap', haptic: 10 },
  claim: { sound: 'win', haptic: 18 },
  purchase: { sound: 'summon', haptic: 14 },
  inspect: { sound: null, haptic: 12 },
}

/**
 * Trigger the canonical feedback fingerprint for an interactive control.
 *
 * Audio honours the global `soundEnabled` flag. Haptics honour the
 * `hapticsEnabled` flag (defaults to `true` for backward compat) plus
 * the platform `navigator.vibrate` capability via {@link pulseFeedback}.
 */
export function feedback(kind: FeedbackKind, soundEnabled: boolean, hapticsEnabled = true): void {
  const profile = FEEDBACK_TABLE[kind]
  if (profile.sound) {
    playSound(profile.sound, soundEnabled)
  }
  if (profile.haptic > 0 && hapticsEnabled) {
    pulseFeedback(profile.haptic)
  }
}
