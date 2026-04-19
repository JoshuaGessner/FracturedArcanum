import { useEffect, useState } from 'react'
import { RankBadge } from '../components/AssetBadge'
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
              <button className="primary" onClick={handleResumeBattle}>{isRankedBattle ? 'Rejoin Battle' : 'Resume Battle'}</button>
              <button className="ghost" onClick={handleAbandonBattle}>Abandon</button>
            </div>
          </div>
        )}

        <div className="scene-status-panel" aria-label="War table status">
          <div className="section-head compact">
            <h3>War Table Status</h3>
            <span className="badge">{questsDone}/{questItems.length} ready</span>
          </div>
          <div className="scene-status-grid">
            <div className="scene-status-tile">
              <span className="scene-status-kicker">League Standing</span>
              <strong>{rankLabel}</strong>
              <span className="mini-text">{record.wins}W · {record.losses}L · {winRate}% WR</span>
            </div>
            <div className="scene-status-tile">
              <span className="scene-status-kicker">Deck Ready</span>
              <strong>{selectedDeckSize} Cards</strong>
              <span className="mini-text">{deckReadyLabel}</span>
            </div>
            <div className={`scene-status-tile ${canClaimDailyReward ? 'is-accent' : ''}`}>
              <span className="scene-status-kicker">Reward Vault</span>
              <strong>{rewardVaultLabel}</strong>
              <span className="mini-text">Daily Quest · {dailyQuest}</span>
            </div>
          </div>
        </div>

        <div className="home-focus-strip" aria-label="Current arena focus">
          <span className="badge">Daily Quest · {dailyQuest}</span>
          <span className="badge">Deck Size {selectedDeckSize}</span>
          <span className="badge">Win Rate {winRate}%</span>
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
