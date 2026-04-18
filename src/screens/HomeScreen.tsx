import { useApp } from '../useApp'

type NavTile = {
  id: 'play' | 'collection' | 'social' | 'shop' | 'settings'
  icon: string
  label: string
  description: string
}

const NAV_TILES: NavTile[] = [
  { id: 'play', icon: '⚔️', label: 'Play', description: 'Solo skirmish, ranked queue, or pass-and-play.' },
  { id: 'collection', icon: '📚', label: 'Collection', description: 'Build decks and browse every card you own.' },
  { id: 'social', icon: '👥', label: 'Social', description: 'Friends, leaderboard, clans, and trades.' },
  { id: 'shop', icon: '🛒', label: 'Shop', description: 'Open packs and unlock cosmetic flair.' },
  { id: 'settings', icon: '⚙️', label: 'Settings', description: 'Account, preferences, and admin tools.' },
]

export function HomeScreen() {
  const {
    activeScreen,
    gameInProgress, game, handleResumeBattle, handleAbandonBattle,
    record, dailyQuest, winRate, selectedDeckSize,
    serverProfile, rankLabel, runes,
    openScreen,
    toastSeverity, toastMessage,
  } = useApp()

  return (
    <section className={`home-screen screen-panel ${activeScreen === 'home' ? 'active' : 'hidden'}`}>
      <article className="section-card utility-card spotlight-card">
        <div className="arena-title-block">
          <p className="eyebrow">Season of Whispers</p>
          <h2>Welcome, {serverProfile?.displayName ?? serverProfile?.username ?? 'Champion'}</h2>
          <p className="note">Choose your path through the arcanum. Your rank: <strong>{rankLabel}</strong> · {runes} 💎 Runes</p>
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
              className="nav-tile"
              onClick={() => openScreen(tile.id)}
            >
              <span className="nav-tile-icon" aria-hidden="true">{tile.icon}</span>
              <span className="nav-tile-label">{tile.label}</span>
              <span className="nav-tile-description">{tile.description}</span>
            </button>
          ))}
        </div>

        <p className={`toast toast-${toastSeverity} toast-line`}>{toastMessage}</p>
      </article>

      <div className="home-cards">
        <article className="section-card utility-card">
          <div className="section-head">
            <h2>Quests</h2>
            <span className="deck-status ready">Live</span>
          </div>
          <ul className="quest-list">
            <li>{record.wins >= 1 ? '✅' : '⬜'} {dailyQuest}</li>
            <li>{winRate >= 50 ? '✅' : '⬜'} 50% win rate</li>
            <li>{selectedDeckSize >= 14 ? '✅' : '⬜'} Full deck</li>
          </ul>
        </article>
      </div>
    </section>
  )
}
