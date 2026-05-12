import { useEffect, useState } from 'react'
import { HomeQuestBoard } from '../components/HomeQuestBoard'
import { HomeStatusRibbon } from '../components/HomeStatusRibbon'
import { QuestLedgerPanel } from '../components/QuestLedgerPanel'
import { useAppShell, useGame, useProfile } from '../contexts'
import { getStreakTier } from '../utils'

const HOME_DECK_GOAL = 14

export function HomeScreen() {
  const { activeScreen, dailyQuest, seasonName, seasonEnd } = useAppShell()
  const { gameInProgress, game, handleResumeBattle, handleAbandonBattle, isRankedBattle } = useGame()
  const {
    record, winRate, selectedDeckSize, serverProfile, rankLabel, shards,
    canClaimDailyReward, nextRewardLabel, seasonRating, rankProgress, nextRankTarget,
    questOverview, handleClaimQuestReward,
  } = useProfile()

  const streakTier = getStreakTier(record.streak)
  const [seasonCountdown, setSeasonCountdown] = useState<string | null>(null)
  const [homeSubview, setHomeSubview] = useState<'command' | 'quests'>('command')

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

  const quests = questOverview?.quests ?? []
  const questItems = quests.length > 0
    ? quests.slice(0, 4).map((quest) => ({ complete: quest.completed, label: quest.title }))
    : [
        { complete: record.wins >= 1, label: dailyQuest },
        { complete: winRate >= 50, label: '50% win rate' },
        { complete: selectedDeckSize >= HOME_DECK_GOAL, label: 'Full deck' },
        { complete: canClaimDailyReward, label: `Daily reward • ${nextRewardLabel}` },
      ]
  const questsDone = questOverview?.summary.completed ?? questItems.filter(q => q.complete).length
  const questTotal = questOverview?.summary.total ?? questItems.length
  const readyQuestRewards = questOverview?.summary.claimable ?? 0
  const deckCardsNeeded = Math.max(0, HOME_DECK_GOAL - selectedDeckSize)
  const deckSurplus = Math.max(0, selectedDeckSize - HOME_DECK_GOAL)
  const deckDetailLabel = selectedDeckSize >= HOME_DECK_GOAL
    ? deckSurplus > 0 ? `${deckSurplus} over minimum` : 'Minimum met'
    : `${deckCardsNeeded} ${deckCardsNeeded === 1 ? 'card' : 'cards'} needed`
  const rewardVaultLabel = canClaimDailyReward ? 'Ready to Claim' : nextRewardLabel
  const ratingToNext = Math.max(0, nextRankTarget - seasonRating)
  const clampedRankProgress = Math.max(0, Math.min(100, rankProgress))
  const ratingProgressLabel = ratingToNext > 0 ? `${ratingToNext} rating to next league` : `${rankLabel} tier secured`
  const questRewardLabel = readyQuestRewards > 0
    ? `${readyQuestRewards} Quest ${readyQuestRewards === 1 ? 'Reward' : 'Rewards'} Ready`
    : canClaimDailyReward ? 'Daily Reward Ready' : nextRewardLabel
  const profileName = serverProfile?.displayName ?? serverProfile?.username ?? 'Champion'
  const seasonLabel = `${seasonName}${seasonCountdown ? ` · ${seasonCountdown}` : ''}`
  const homeStatusCards = [
    {
      label: 'League',
      value: rankLabel,
      note: `${record.wins}W ${record.losses}L · ${winRate}%`,
    },
    {
      label: 'Deck',
      value: `${selectedDeckSize}/${HOME_DECK_GOAL}`,
      note: selectedDeckSize >= HOME_DECK_GOAL ? 'Forge stocked' : deckDetailLabel,
    },
    {
      label: 'Vault',
      value: rewardVaultLabel,
      note: canClaimDailyReward ? 'Daily reward available' : dailyQuest,
      accent: canClaimDailyReward,
    },
  ]

  return (
    <section className={`home-screen screen-panel ${activeScreen === 'home' ? 'active' : 'hidden'}`}>
      <article className={`section-card utility-card spotlight-card home-command-card home-final-card home-view-${homeSubview}`}>
        {homeSubview === 'command' ? <>
        <div className="home-command-layout">
          <HomeStatusRibbon
            profileName={profileName}
            rankLabel={rankLabel}
            seasonLabel={seasonLabel}
            shards={shards}
            streak={record.streak}
            streakTier={streakTier}
            seasonRating={seasonRating}
            nextRankTarget={nextRankTarget}
            rankProgress={clampedRankProgress}
            ratingProgressLabel={ratingProgressLabel}
            tiles={homeStatusCards}
          />

          <HomeQuestBoard
            overview={questOverview}
            fallbackItems={questItems}
            questsDone={questsDone}
            questTotal={questTotal}
            readyQuestRewards={readyQuestRewards}
            questRewardLabel={questRewardLabel}
            onOpenLedger={() => setHomeSubview('quests')}
          />

          {gameInProgress && (
            <div className="game-resume-block">
              <p className="note">Battle in progress vs <strong>{game.enemy.name}</strong> · Turn {game.turnNumber}</p>
              <div className="controls">
                <button className="primary" onClick={handleResumeBattle}>{isRankedBattle ? 'Rejoin Battle' : 'Resume Battle'}</button>
                <button className="ghost" onClick={handleAbandonBattle}>Abandon</button>
              </div>
            </div>
          )}
        </div>
        </> : (
          <QuestLedgerPanel
            overview={questOverview}
            onBack={() => setHomeSubview('command')}
            onClaimQuest={handleClaimQuestReward}
          />
        )}
      </article>
    </section>
  )
}
