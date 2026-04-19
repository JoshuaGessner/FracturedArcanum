/**
 * Phase 3W — Reward Cinema sequence builders.
 *
 * Pure helpers that translate domain inputs (battle victory, daily claim,
 * pack opening, rank-up) into the `RewardBeat[]` schema consumed by
 * {@link RewardCinemaOverlay}. Lives in its own module so that the
 * overlay component file only exports React components (react-refresh).
 */
import type { GameMode } from '../game'
import type { BattleKind, OpenedPackCard } from '../types'
import { UI_ASSETS } from '../constants'
import { getPackArtPath, getRankAssetPath, getStreakTier } from '../utils'
import type { SoundName } from '../audio'

export type RewardBeatKind = 'banner' | 'count' | 'shower' | 'card'

export type RewardBeat = {
  /** Stable identifier for React keys + tests. */
  id: string
  /** Visual archetype (banner unfurl, count-up tile, ember shower, icon card). */
  kind: RewardBeatKind
  /** Headline shown above the visual. */
  label: string
  /** Optional supporting copy under the visual. */
  caption?: string
  /** Foreground asset (icon, banner, rank insignia). */
  iconAsset?: string
  /** Numeric value for `kind: 'count'` beats. */
  value?: number
  /** Suffix label that follows the count (e.g. "Shards"). */
  valueLabel?: string
  /** Optional sound to play when the beat lands. */
  sound?: SoundName
}

export type BattleVictoryInput = {
  rankLabel: string
  streak: number
  isRanked: boolean
  battleKind: BattleKind
  mode: GameMode
  shards?: number
  ratingDelta?: number
}

export function buildBattleVictorySequence(input: BattleVictoryInput): RewardBeat[] {
  const shards = input.shards ?? (input.battleKind === 'local' ? 0 : 50)
  const streakTier = getStreakTier(input.streak)
  const beats: RewardBeat[] = [
    {
      id: 'battle-banner',
      kind: 'banner',
      iconAsset: UI_ASSETS.overlays.victory,
      label:
        input.isRanked
          ? 'Ranked Victory Secured'
          : input.battleKind === 'local'
            ? 'Casual Duel Won'
            : 'Skirmish Conquered',
      caption: 'Season of Whispers · momentum is yours',
      sound: 'win',
    },
  ]

  if (shards > 0) {
    beats.push({
      id: 'battle-shards',
      kind: 'count',
      iconAsset: UI_ASSETS.tiles.shop,
      label: 'Shards Earned',
      value: shards,
      valueLabel: 'Shards',
      sound: 'questComplete',
    })
  }

  if (input.isRanked && typeof input.ratingDelta === 'number' && input.ratingDelta !== 0) {
    beats.push({
      id: 'battle-rating',
      kind: 'count',
      iconAsset: getRankAssetPath(input.rankLabel),
      label: 'Ladder Rating',
      value: Math.abs(input.ratingDelta),
      valueLabel: input.ratingDelta >= 0 ? 'Rating Gained' : 'Rating Lost',
    })
  }

  beats.push({
    id: 'battle-summary',
    kind: 'card',
    iconAsset: getRankAssetPath(input.rankLabel),
    label: `${input.rankLabel} Standing`,
    caption:
      streakTier === 'inferno'
        ? `Inferno streak active · ${input.streak} wins in a row`
        : streakTier === 'ember'
          ? `Burning streak · ${input.streak} consecutive wins`
          : input.streak > 0
            ? `Steady streak · ${input.streak} ${input.streak === 1 ? 'win' : 'wins'} this run`
            : 'Lock in another battle to build a streak.',
  })

  return beats
}

export type DailyClaimInput = {
  shards: number
  totalEarned?: number
}

export function buildDailyClaimSequence(input: DailyClaimInput): RewardBeat[] {
  const beats: RewardBeat[] = [
    {
      id: 'daily-banner',
      kind: 'banner',
      iconAsset: UI_ASSETS.overlays.victory,
      label: 'Daily Stipend Claimed',
      caption: 'The vault refreshes again at the next dawn.',
      sound: 'questComplete',
    },
    {
      id: 'daily-shards',
      kind: 'count',
      iconAsset: UI_ASSETS.tiles.shop,
      label: 'Shards Added',
      value: Math.max(0, input.shards),
      valueLabel: 'Shards',
      sound: 'win',
    },
  ]

  if (typeof input.totalEarned === 'number' && input.totalEarned > 0) {
    beats.push({
      id: 'daily-total',
      kind: 'card',
      iconAsset: UI_ASSETS.overlays.ribbonNew,
      label: 'Vault Lifetime',
      caption: `${input.totalEarned.toLocaleString()} Shards earned across the season.`,
    })
  }

  return beats
}

export type PackSummaryInput = {
  packId: string
  cards: OpenedPackCard[]
  shardsRefunded?: number
}

export function buildPackSummarySequence(input: PackSummaryInput): RewardBeat[] {
  const total = input.cards.length
  const newCount = input.cards.filter((card) => !card.duplicate).length
  const duplicateCount = total - newCount
  const refund = Math.max(0, input.shardsRefunded ?? 0)

  const beats: RewardBeat[] = [
    {
      id: 'pack-banner',
      kind: 'banner',
      iconAsset: getPackArtPath(input.packId),
      label: `${input.packId[0].toUpperCase()}${input.packId.slice(1)} Pack Revealed`,
      caption: `${total} ${total === 1 ? 'card' : 'cards'} catalogued in your library.`,
      sound: 'cardReveal',
    },
    {
      id: 'pack-new',
      kind: 'count',
      iconAsset: UI_ASSETS.overlays.ribbonNew,
      label: 'New Cards Added',
      value: newCount,
      valueLabel: newCount === 1 ? 'Discovery' : 'Discoveries',
      sound: newCount > 0 ? 'firstTime' : undefined,
    },
  ]

  beats.push({
    id: 'pack-summary',
    kind: 'card',
    iconAsset: getPackArtPath(input.packId),
    label: duplicateCount > 0 ? 'Collection Updated' : 'Fresh Pulls Catalogued',
    caption:
      duplicateCount > 0
        ? `${duplicateCount} ${duplicateCount === 1 ? 'duplicate was' : 'duplicates were'} recycled into vault credit.`
        : 'Every reveal from this pack was a fresh addition to your archive.',
  })

  if (duplicateCount > 0 && refund > 0) {
    beats.push({
      id: 'pack-credit',
      kind: 'count',
      iconAsset: UI_ASSETS.tiles.shop,
      label: 'Vault Credit',
      value: refund,
      valueLabel: 'Refunded',
    })
  }

  return beats
}

export type RankUpInput = {
  newRankLabel: string
  previousRankLabel: string
}

export function buildRankUpSequence(input: RankUpInput): RewardBeat[] {
  return [
    {
      id: 'rankup-banner',
      kind: 'banner',
      iconAsset: UI_ASSETS.overlays.victory,
      label: 'Promotion Earned',
      caption: `${input.previousRankLabel} → ${input.newRankLabel} League`,
      sound: 'rankUp',
    },
    {
      id: 'rankup-insignia',
      kind: 'shower',
      iconAsset: getRankAssetPath(input.newRankLabel),
      label: `${input.newRankLabel} League Reached`,
      caption: 'Your insignia upgrades. The crew salutes.',
      sound: 'legendaryReveal',
    },
  ]
}
