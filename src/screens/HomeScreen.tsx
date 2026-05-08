import { useEffect, useState } from 'react'
import { RankBadge } from '../components/AssetBadge'
import { SceneHeaderPanel, type SceneHeaderTile } from '../components/SceneHeaderPanel'
import { useAppShell, useGame, useProfile } from '../contexts'
import { getStreakTier } from '../utils'

const HOME_DECK_GOAL = 14

export function HomeScreen() {
  const { activeScreen, dailyQuest, justClaimedDaily, seasonName, seasonEnd } = useAppShell()
  const { gameInProgress, game, handleResumeBattle, handleAbandonBattle, isRankedBattle } = useGame()
  const {
    record, winRate, selectedDeckSize, serverProfile, rankLabel, shards,
    canClaimDailyReward, nextRewardLabel, seasonRating, rankProgress, nextRankTarget,
  } = useProfile()

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
    { complete: selectedDeckSize >= HOME_DECK_GOAL, label: 'Full deck' },
    { complete: canClaimDailyReward, label: `Daily reward • ${nextRewardLabel}` },
  ]
  const questsDone = questItems.filter(q => q.complete).length
  const nextQuestLabel = questItems.find(item => !item.complete)?.label ?? 'All quests complete'
  const deckCardsNeeded = Math.max(0, HOME_DECK_GOAL - selectedDeckSize)
  const deckSurplus = Math.max(0, selectedDeckSize - HOME_DECK_GOAL)
  const deckReadyLabel = selectedDeckSize >= HOME_DECK_GOAL ? 'Ready' : 'Needs Cards'
  const deckDetailLabel = selectedDeckSize >= HOME_DECK_GOAL
    ? deckSurplus > 0 ? `${deckSurplus} over minimum` : 'Minimum met'
    : `${deckCardsNeeded} ${deckCardsNeeded === 1 ? 'card' : 'cards'} needed`
  const rewardVaultLabel = canClaimDailyReward ? 'Ready to Claim' : nextRewardLabel
  const ratingToNext = Math.max(0, nextRankTarget - seasonRating)
  const clampedRankProgress = Math.max(0, Math.min(100, rankProgress))
  const ratingProgressLabel = ratingToNext > 0 ? `${ratingToNext} rating to next league` : `${rankLabel} tier secured`
  const questRewardLabel = canClaimDailyReward ? 'Reward Ready' : nextRewardLabel
  const profileName = serverProfile?.displayName ?? serverProfile?.username ?? 'Champion'
  const homeTiles: SceneHeaderTile[] = [
    {
      kicker: 'League',
      value: `${rankLabel} League`,
      note: `${record.wins}W ${record.losses}L · ${winRate}% wins`,
    },
    {
      kicker: 'Deck',
      value: deckReadyLabel,
      note: `${selectedDeckSize}/${HOME_DECK_GOAL} cards · ${deckDetailLabel}`,
    },
    {
      kicker: 'Vault',
      value: rewardVaultLabel,
      note: canClaimDailyReward ? 'Daily reward available' : `Next: ${dailyQuest}`,
      accent: canClaimDailyReward,
    },
    {
      kicker: 'Quests',
      value: `${questsDone}/${questItems.length} Complete`,
      note: nextQuestLabel,
      accent: questsDone === questItems.length,
    },
  ]

  return (
    <section className={`home-screen screen-panel ${activeScreen === 'home' ? 'active' : 'hidden'}`}>
      <article className="section-card utility-card spotlight-card home-command-card">
        <SceneHeaderPanel
          className="home-scene-header"
          visual={<RankBadge rank={rankLabel} />}
          title={`Welcome, ${profileName}`}
          note={`${seasonName}${seasonCountdown ? ` · ${seasonCountdown}` : ''}`}
          badges={(
            <>
              <span className="badge">{shards} Shards</span>
              <span className={`badge streak-badge streak-${streakTier}`}>{record.streak} Streak</span>
            </>
          )}
          tiles={homeTiles}
        >
          <div className="home-rating-meter" role="progressbar" aria-label="Season rating progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clampedRankProgress}>
            <div className="home-rating-copy">
              <span className="scene-status-kicker">Season Rating</span>
              <strong>{seasonRating} / {nextRankTarget}</strong>
              <span className="mini-text">{ratingProgressLabel}</span>
            </div>
            <div className="home-rating-track" aria-hidden="true">
              <div className="home-rating-fill" style={{ width: `${clampedRankProgress}%` }} />
            </div>
            <span className="home-rating-percent">{clampedRankProgress}%</span>
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
        </SceneHeaderPanel>

        <div className={`quest-summary ${canClaimDailyReward ? 'claim-ready' : ''} ${justClaimedDaily ? 'just-claimed' : ''}`}>
          <div className="quest-pips" role="img" aria-label={`${questsDone} of ${questItems.length} quests complete`}>
            {questItems.map((item, i) => (
              <span key={i} className={`quest-pip ${item.complete ? 'complete' : 'pending'}`} title={item.label} />
            ))}
          </div>
          <span className="quest-count">{questsDone}/{questItems.length} Quests Complete</span>
          <span className="quest-next">Next: {nextQuestLabel}</span>
          <span className={`quest-reward-hint ${canClaimDailyReward ? 'ready' : ''}`}>
            {questRewardLabel}
          </span>
        </div>
      </article>
    </section>
  )
}
