import { EFFECT_LABELS, UI_ASSETS } from '../constants'
import { getEffectIconPath, getPackArtPath, getRankAssetPath, getRarityGemPath, getRankLabel } from '../utils'

type EffectBadgeProps = {
  effect: string
  compact?: boolean
  className?: string
}

export function EffectBadge({ effect, compact = false, className = '' }: EffectBadgeProps) {
  const icon = getEffectIconPath(effect)
  return (
    <span className={['effect-badge', compact ? 'small' : '', className].filter(Boolean).join(' ')}>
      {icon && <img className="effect-icon" src={icon} alt="" aria-hidden="true" />}
      <span>{EFFECT_LABELS[effect] ?? effect}</span>
    </span>
  )
}

type RarityBadgeProps = {
  rarity: string
  className?: string
}

export function RarityBadge({ rarity, className = '' }: RarityBadgeProps) {
  return (
    <span className={['rarity-gem', className].filter(Boolean).join(' ')}>
      <img className="rarity-gem-icon" src={getRarityGemPath(rarity)} alt="" aria-hidden="true" />
      <span>{rarity}</span>
    </span>
  )
}

type RankBadgeProps = {
  rank: string | number
  className?: string
}

export function RankBadge({ rank, className = '' }: RankBadgeProps) {
  const label = typeof rank === 'number' ? getRankLabel(rank) : rank
  return (
    <span className={['rank-badge-art', className].filter(Boolean).join(' ')}>
      <img src={getRankAssetPath(rank)} alt="" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

type PackArtProps = {
  packId: string
  label: string
  className?: string
}

export function PackArt({ packId, label, className = '' }: PackArtProps) {
  return <img className={['pack-offer-art', className].filter(Boolean).join(' ')} src={getPackArtPath(packId)} alt={label} loading="lazy" />
}

type StatIconProps = {
  kind: keyof typeof UI_ASSETS.stats
  className?: string
}

export function StatIcon({ kind, className = '' }: StatIconProps) {
  return <img className={['stat-icon', className].filter(Boolean).join(' ')} src={UI_ASSETS.stats[kind]} alt="" aria-hidden="true" />
}
