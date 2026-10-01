import { RankBadge } from './AssetBadge'

type HomeStatusTile = {
  label: string
  value: string
  note: string
  accent?: boolean
}


type HomeStatusRibbonProps = {
  profileName: string
  rankLabel: string
  seasonLabel: string
  streak: number
  streakTier: string
  seasonRating: number
  nextRankTarget: number
  rankProgress: number
  ratingProgressLabel: string
  tiles: HomeStatusTile[]
}

export function HomeStatusRibbon({
  profileName,
  rankLabel,
  seasonLabel,
  streak,
  streakTier,
  seasonRating,
  nextRankTarget,
  rankProgress,
  ratingProgressLabel,
  tiles,
}: HomeStatusRibbonProps) {
  const clampedRankProgress = Math.max(0, Math.min(100, rankProgress))

  return (
    <section className="home-status-ribbon" aria-label="Player status">
      <div className="home-status-ribbon-identity">
        <RankBadge rank={rankLabel} className="home-rank-badge" />
        <div>
          <strong>{profileName}</strong>
          <span>
            {seasonLabel}
            {streak > 0 && <span className={`home-streak-mark streak-${streakTier}`}>{streak} win streak</span>}
          </span>
        </div>
      </div>

      <div className="home-status-ribbon-meter" role="progressbar" aria-label="Season rating progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clampedRankProgress}>
        <div className="home-rating-track" aria-hidden="true">
          <div className="home-rating-fill" style={{ width: `${clampedRankProgress}%` }} />
        </div>
        <strong>{seasonRating} / {nextRankTarget}</strong>
        <span>{ratingProgressLabel}</span>
      </div>

      <div className="home-status-rail" aria-label="Home status summary">
        {tiles.map((tile) => (
          <div className={`home-status-chip ${tile.accent ? 'is-accent' : ''}`.trim()} key={tile.label}>
            <span>{tile.label}</span>
            <strong>{tile.value}</strong>
            <small>{tile.note}</small>
          </div>
        ))}
      </div>
    </section>
  )
}