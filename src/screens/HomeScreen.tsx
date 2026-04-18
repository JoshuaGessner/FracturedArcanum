import { RankBadge } from '../components/AssetBadge'
import { useAppShell, useGame, useProfile } from '../contexts'
import { getStreakTier } from '../utils'

type NavTile = {
  id: 'play' | 'collection' | 'social' | 'shop' | 'settings'
  label: string
  description: string
}

const NAV_TILES: NavTile[] = [
  { id: 'play', label: 'Play', description: 'Solo skirmish, ranked queue, or pass-and-play.' },
  { id: 'collection', label: 'Collection', description: 'Build decks and browse every card you own.' },
  { id: 'social', label: 'Social', description: 'Friends, leaderboard, clans, and trades.' },
  { id: 'shop', label: 'Shop', description: 'Open packs and unlock cosmetic flair.' },
  { id: 'settings', label: 'Settings', description: 'Account, preferences, and admin tools.' },
]

export function HomeScreen() {
  const { activeScreen, openScreen, toastSeverity, toastMessage, dailyQuest } = useAppShell()
  const { gameInProgress, game, handleResumeBattle, handleAbandonBattle } = useGame()
  const { record, winRate, selectedDeckSize, serverProfile, rankLabel, runes, canClaimDailyReward, nextRewardLabel } = useProfile()

  const streakTier = getStreakTier(record.streak)
  const questItems = [
    { complete: record.wins >= 1, label: dailyQuest },
    { complete: winRate >= 50, label: '50% win rate' },
    { complete: selectedDeckSize >= 14, label: 'Full deck' },
    { complete: canClaimDailyReward, label: `Daily vault reward • ${nextRewardLabel}` },
  ]

  return (
    <section className={`home-screen screen-panel ${activeScreen === 'home' ? 'active' : 'hidden'}`}>
      <article className="section-card utility-card spotlight-card">
        <div className="arena-title-block">
          <p className="eyebrow">Season of Whispers</p>
          <h2>Welcome, {serverProfile?.displayName ?? serverProfile?.username ?? 'Champion'}</h2>
          <p className="note">Choose your path through the arcanum with a fully skinned, swap-friendly UI layer.</p>
          <div className="badges">
            <RankBadge rank={rankLabel} />
            <span className="badge">{runes} Runes</span>
            <span className={`badge streak-badge streak-${streakTier}`}>Win Streak {record.streak}</span>
          </div>
        </div>

        {gameInProgress && (
          <div className="game-resume-block">
            <p className="note">You have a battle in progress vs <strong>{game.enemy.name}</strong> (Turn {game.turnNumber})</p>
            <div className="controls">
              <button className="primary" onClick={handleResumeBattle}>Resume Battle</button>
              <button className="ghost" onClick={handleAbandonBattle}>Abandon &amp; Reset</button>
            </div>
          </div>
        )}

        <div className="controls nav-tile-row">
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

        {toastMessage && (
          <p className={`toast toast-${toastSeverity} toast-line`}>{toastMessage}</p>
        )}
      </article>

      <div className="home-cards">
        <article className={`section-card utility-card ${canClaimDailyReward ? 'claim-ready' : ''}`}>
          <div className="section-head">
            <h2>Quests</h2>
            <span className={`deck-status ${canClaimDailyReward ? 'ready' : 'warning'}`}>{canClaimDailyReward ? 'Reward Ready' : 'Live'}</span>
          </div>
          <ul className="quest-list">
            {questItems.map((item) => (
              <li className="quest-item" key={item.label}>
                <span className={`quest-check ${item.complete ? 'complete' : 'pending'}`} aria-hidden="true" />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
          <div className="controls">
            <button className={canClaimDailyReward ? 'primary' : 'ghost'} onClick={() => openScreen('shop')}>
              {canClaimDailyReward ? 'Collect Reward' : 'Open Shop'}
            </button>
          </div>
        </article>
      </div>
    </section>
  )
}
