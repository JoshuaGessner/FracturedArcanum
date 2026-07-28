import type { QuestCadence } from './types'

/**
 * Client-side quest presentation constants.
 *
 * The quest catalog itself is server-owned (`server/quest-definitions.js`) and
 * arrives with every `/api/me/quests` response, so the client does not carry a
 * copy. It used to: a byte-for-byte duplicate of all fourteen definitions plus
 * lookup helpers, none of it imported anywhere, and nothing keeping it in step
 * with the server it shadowed.
 */
export const QUEST_CADENCE_LABELS: Record<QuestCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  milestone: 'Milestones',
  skirmish: 'Skirmish',
}
