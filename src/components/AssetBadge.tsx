import { EFFECT_LABELS, INTERFACE_GLYPHS, TRIBE_SIGILS, UI_ASSETS } from '../constants'
import { getEffectIconPath, getPackArtPath, getRankAssetPath, getRarityGemPath, getRankLabel } from '../utils'

type EffectBadgeProps = {
  effect: string
  compact?: boolean
  iconOnly?: boolean
  className?: string
}

export function EffectBadge({ effect, compact = false, iconOnly = false, className = '' }: EffectBadgeProps) {
  const icon = getEffectIconPath(effect)
  const label = EFFECT_LABELS[effect] ?? effect
  return (
    <span
      className={['effect-badge', compact ? 'small' : '', iconOnly ? 'icon-only' : '', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`${label} effect`}
      title={label}
    >
      {icon && <img className="effect-icon" src={icon} alt="" aria-hidden="true" />}
      {!iconOnly && <span>{label}</span>}
    </span>
  )
}

type RarityBadgeProps = {
  rarity: string
  iconOnly?: boolean
  className?: string
}

/**
 * The gem is rarity's primary channel — the one signal a purchased card frame
 * can never override — so it needs to survive without its text label on the
 * cramped surfaces (battle hand, board units). Each rarity has its own gem
 * silhouette, not just its own fill, so `iconOnly` still reads at 12px and in
 * greyscale. See the gem block in scripts/generate-brand-assets.mjs.
 */
export function RarityBadge({ rarity, iconOnly = false, className = '' }: RarityBadgeProps) {
  const label = `${rarity} rarity`
  return (
    <span
      className={['rarity-gem', iconOnly ? 'icon-only' : '', className].filter(Boolean).join(' ')}
      {...(iconOnly ? { role: 'img', 'aria-label': label, title: label } : {})}
    >
      <img className="rarity-gem-icon" src={getRarityGemPath(rarity)} alt="" aria-hidden="true" />
      {!iconOnly && <span>{rarity}</span>}
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

type GlyphProps = {
  src: string
  label?: string
  className?: string
}

/**
 * A single-ink line glyph painted through a CSS mask, so it takes the colour
 * of the text around it. Decorative unless a label is given.
 */
export function Glyph({ src, label, className = '' }: GlyphProps) {
  const style = { '--glyph-src': `url("${src}")` } as React.CSSProperties
  return label
    ? <span className={['glyph', className].filter(Boolean).join(' ')} style={style} role="img" aria-label={label} title={label} />
    : <span className={['glyph', className].filter(Boolean).join(' ')} style={style} aria-hidden="true" />
}

type InterfaceGlyphProps = {
  name: keyof typeof INTERFACE_GLYPHS
  label?: string
  className?: string
}

export function InterfaceGlyph({ name, label, className = '' }: InterfaceGlyphProps) {
  return <Glyph src={INTERFACE_GLYPHS[name]} label={label} className={className} />
}

type TribeSigilProps = {
  tribe: string
  /** Announce the tribe to screen readers. Off where the name is already read out. */
  labelled?: boolean
  className?: string
}

/** The engraved tribe mark that stands beside a card name. */
export function TribeSigil({ tribe, labelled = false, className = '' }: TribeSigilProps) {
  const known = tribe in TRIBE_SIGILS ? tribe as keyof typeof TRIBE_SIGILS : 'none'
  const label = known === 'none' ? 'Unaligned' : `${known[0].toUpperCase()}${known.slice(1)}`
  return (
    <Glyph
      src={TRIBE_SIGILS[known]}
      label={labelled ? label : undefined}
      className={['tribe-sigil', `tribe-sigil-${known}`, className].filter(Boolean).join(' ')}
    />
  )
}
