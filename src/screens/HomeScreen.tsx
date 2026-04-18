import { useEffect, useState } from 'react'
import { RankBadge } from '../components/AssetBadge'
import { useAppShell, useGame, useProfile } from '../contexts'
import { getStreakTier } from '../utils'

type NavTile = {
  id: 'play' | 'collection' | 'social' | 'shop' | 'settings'
  label: string
  description: string
}

const NAV_TILES: NavTile[] = [
  { id: 'play', label: 'Play', description: 'Solo, ranked, or pass-and-play.' },
  { id: 'collection', label: 'Collection', description: 'Build decks and browse cards.' },
  { id: 'social', label: 'Social', description: 'Friends, clans, and trades.' },
  { id: 'shop', label: 'Shop', description: 'Packs and cosmetic flair.' },
  { id: 'settings', label: 'Settings', description: 'Account and preferences.' },
]

export function HomeScreen() {
  const { activeScreen, openScreen, dailyQuest, justClaimedDaily, seasonName, seasonEnd } = useAppShell()
  const { gameInProgress, game, handleResumeBattle, handleAbandonBattle } = useGame()
  const { record, winRate, selectedDeckSize, serverProfile, rankLabel, runes, canClaimDailyReward, nextRewardLabel } = useProfile()

  const streakTier = getStreakTier(record.streak)
  const [seasonCountdown, setSeasonCountdown] = useState<string | null>(null)

  useEffect(() => {
    const updateCountdown = () => {
      if (!seasonEnd) {
        setSeasonCountdown(null)
        return
      }

      const ms = new Date(seasonEnd).getTime() - Date.now()
      if (ms <= 0) {
        setSeasonCountdown('Season ended')
        return
      }

      const days = Math.floor(ms / 86_400_000)
      if (days > 0) {
        setSeasonCountdown(`${days}d left`)
        return
      }

      const hours = Math.max(1, Math.floor(ms / 3_600_000))
      setSeasonCountdown(`${hours}h left`)
    }

    const timeoutId = window.setTimeout(updateCountdown, 0)
    const intervalId = seasonEnd ? window.setInterval(updateCountdown, 60_000) : null
    return () => {
      window.clearTimeout(timeoutId)
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [seasonEnd])

  const questItems = [
    { complete: record.wins >= 1, label: dailyQuest },
    { complete: winRate >= 50, label: '50% win rate' },
    { complete: selectedDeckSize >= 14, label: 'Full deck' },
    { complete: canClaimDailyReward, label: `Daily reward • ${nextRewardLabel}` },
  ]
  const questsDone = questItems.filter(q => q.complete).length

  return (
    <section className={`home-screen screen-panel ${activeScreen === 'home' ? 'active' : 'hidden'}`}>
      <article className="section-card utility-card spotlight-card">
        <div className="arena-title-block home-hero">
          <p className="eyebrow">{seasonName}{seasonCountdown && <span className="season-countdown"> · {seasonCountdown}</span>}</p>
          <h2>Welcome, {serverProfile?.displayName ?? serverProfile?.username ?? 'Champion'}</h2>
          <div className="badges">
            <RankBadge rank={rankLabel} />
            <span className="badge">{runes} Runes</span>
            <span className={`badge streak-badge streak-${streakTier}`}>Streak {record.streak}</span>
          </div>
        </div>

        {gameInProgress && (
          <div className="game-resume-block">
            <p className="note">Battle in progress vs <strong>{game.enemy.name}</strong> · Turn {game.turnNumber}</p>
            <div className="controls">
              <button className="primary" onClick={handleResumeBattle}>Resume Battle</button>
              <button className="ghost" onClick={handleAbandonBattle}>Abandon</button>
            </div>
          </div>
        )}

        <div className="controls nav-tile-row" data-tour-id="home-tiles">
          {NAV_TILES.map((tile) => (
            <button
              key={tile.id}
              className={`nav-tile nav-tile-${tile.id} ${tile.id === 'shop' && canClaimDailyReward ? 'nav-tile-alert' : ''}`}
              data-tile={tile.id}
              onClick={() => openScreen(tile.id)}
            >
              {tile.id === 'shop' && canClaimDailyReward && <span className="nav-tile-notice" aria-hidden="true" />}
              <span className="nav-tile-label">{tile.label}</span>
              <span className="nav-tile-description">{tile.description}</span>
            </button>
          ))}
        </div>

        <div className={`quest-summary ${canClaimDailyReward ? 'claim-ready' : ''} ${justClaimedDaily ? 'just-claimed' : ''}`}>
          <div className="quest-pips" role="img" aria-label={`${questsDone} of ${questItems.length} quests complete`}>
            {questItems.map((item, i) => (
              <span key={i} className={`quest-pip ${item.complete ? 'complete' : 'pending'}`} title={item.label} />
            ))}
          </div>
          <span className="quest-count">{questsDone}/{questItems.length} Quests</span>
          <span className={`quest-reward-hint ${canClaimDailyReward ? 'ready' : ''}`}>
            {canClaimDailyReward ? 'Reward Ready' : nextRewardLabel}
          </span>
        </div>
      </article>
    </section>
  )
}
