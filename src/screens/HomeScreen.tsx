import { useEffect, useState } from 'react'
import { RankBadge } from '../components/AssetBadge'
import { SceneHeaderPanel, type SceneHeaderTile } from '../components/SceneHeaderPanel'
import { useAppShell, useGame, useProfile } from '../contexts'
import { getStreakTier } from '../utils'

export function HomeScreen() {
  const { activeScreen, dailyQuest, justClaimedDaily, seasonName, seasonEnd } = useAppShell()
  const { gameInProgress, game, handleResumeBattle, handleAbandonBattle, isRankedBattle } = useGame()
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
  const deckReadyLabel = selectedDeckSize >= 14 ? 'Forge stocked' : 'Needs cards'
  const rewardVaultLabel = canClaimDailyReward ? 'Ready to Claim' : nextRewardLabel
  const profileName = serverProfile?.displayName ?? serverProfile?.username ?? 'Champion'
  const homeTiles: SceneHeaderTile[] = [
    {
      kicker: 'League',
      value: rankLabel,
      note: `${record.wins}W ${record.losses}L · ${winRate}%`,
    },
    {
      kicker: 'Deck',
      value: `${selectedDeckSize}/14`,
      note: deckReadyLabel,
    },
    {
      kicker: 'Vault',
      value: rewardVaultLabel,
      note: dailyQuest,
      accent: canClaimDailyReward,
    },
  ]

  return (
    <section className={`home-screen screen-panel ${activeScreen === 'home' ? 'active' : 'hidden'}`}>
      <article className="section-card utility-card spotlight-card">
        <SceneHeaderPanel
          className="home-scene-header"
          visual={<RankBadge rank={rankLabel} />}
          title={`Welcome, ${profileName}`}
          note={`${seasonName}${seasonCountdown ? ` · ${seasonCountdown}` : ''}`}
          badges={(
            <>
              <span className="badge">{runes} Shards</span>
              <span className={`badge streak-badge streak-${streakTier}`}>🔥{record.streak}</span>
            </>
          )}
          tiles={homeTiles}
        >
          {gameInProgress && (
            <div className="game-resume-block">
              <p className="note">Battle in progress vs <strong>{game.enemy.name}</strong> · Turn {game.turnNumber}</p>
              <div className="controls">
                <button className="primary" onClick={handleResumeBattle}>{isRankedBattle ? 'Rejoin Battle' : 'Resume Battle'}</button>
                <button className="ghost" onClick={handleAbandonBattle}>Abandon</button>
              </div>
            </div>
          )}
        </SceneHeaderPanel>

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
