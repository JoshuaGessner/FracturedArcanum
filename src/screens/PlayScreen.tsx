import { AI_DIFFICULTY_OPTIONS } from '../constants'
import { formatTimestamp } from '../utils'
import { RankBadge } from '../components/AssetBadge'
import { useAppShell, useGame, useProfile, useQueue } from '../contexts'

export function PlayScreen() {
  const { activeScreen, openScreen, toastSeverity, toastMessage } = useAppShell()
  const {
    gameInProgress, game, handleResumeBattle, handleAbandonBattle,
    preferredMode, handleModeChange,
    resolvedAIDifficulty, aiDifficultySetting, handleAIDifficultyChange,
    startMatch,
  } = useGame()
  const { seasonRating, deckReady } = useProfile()
  const {
    handleStartQueue, queueState, queueSeconds, queueSearchStatus, queuePresence,
    handleCancelQueue, queuedOpponent, handleAcceptQueue, liveQueueLabel,
  } = useQueue()

  return (
    <section className={`home-screen play-screen screen-panel ${activeScreen === 'play' ? 'active' : 'hidden'}`}>
      <article className="section-card utility-card spotlight-card">
        <div className="arena-title-block">
          <p className="eyebrow">The Arena Gate</p>
          <h2>Choose Your Battle</h2>
          <p className="note">Queue online for live browser-vs-browser battles, or start AI and local matches instantly.</p>
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

        <div className="mode-card-grid" aria-label="Choose a battle mode">
          <button
            className={`mode-card mode-card-ai ${preferredMode === 'ai' ? 'active' : ''}`}
            onClick={() => handleModeChange('ai')}
          >
            <span className="mode-card-eyebrow">Solo Arena</span>
            <strong>AI Skirmish</strong>
            <p className="note">Tune your deck against adaptive rivals with no queue time.</p>
          </button>
          <button
            className={`mode-card mode-card-duel ${preferredMode === 'duel' ? 'active' : ''}`}
            onClick={() => handleModeChange('duel')}
          >
            <span className="mode-card-eyebrow">Couch Clash</span>
            <strong>Pass &amp; Play</strong>
            <p className="note">Hand the device across the table and duel instantly.</p>
          </button>
          <button
            className={`mode-card mode-card-ranked ${queueState !== 'idle' ? 'active' : ''}`}
            onClick={handleStartQueue}
            disabled={!deckReady || queueState !== 'idle'}
          >
            <span className="mode-card-eyebrow">Live Ladder</span>
            <strong>Ranked Queue</strong>
            <p className="note">Face real opponents and push your season rank higher.</p>
          </button>
        </div>

        {preferredMode === 'ai' && (
          <div className="difficulty-panel">
            <p className="note">AI difficulty: <strong>{resolvedAIDifficulty.charAt(0).toUpperCase() + resolvedAIDifficulty.slice(1)}</strong>{aiDifficultySetting === 'auto' ? ` recommended from your ${seasonRating} rating.` : ' selected manually.'}</p>
            <div className="difficulty-chip-row">
              {AI_DIFFICULTY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`difficulty-chip ${aiDifficultySetting === option.id ? 'active' : ''}`}
                  onClick={() => handleAIDifficultyChange(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="controls">
          <button className="primary" onClick={() => startMatch()} disabled={!deckReady}>
            {gameInProgress ? 'Start Fresh Battle' : 'Enter Arena'}
          </button>
          <button className="secondary" onClick={handleStartQueue} disabled={!deckReady || queueState !== 'idle'}>
            Play Online (Ranked)
          </button>
          <button className="ghost" onClick={() => openScreen('collection')}>
            Deck Forge
          </button>
        </div>

        {queueState === 'searching' && (
          <div className="queue-search-portal" aria-live="polite">
            <div className="queue-portal-ring" aria-hidden="true">
              <div className="queue-portal-core">{queueSeconds}s</div>
            </div>
            <div className="queue-portal-copy">
              <h3>Searching the live ladder</h3>
              <p className="note">The arena portal is scanning for a fair real-player matchup.</p>
              <div className="live-status-grid">
                <div>
                  <strong>#{queueSearchStatus.position}</strong>
                  <p className="note">queue spot</p>
                </div>
                <div>
                  <strong>{Math.max(0, queueSearchStatus.connectedPlayers - 1)}</strong>
                  <p className="note">other players online</p>
                </div>
              </div>
              <p className="note">Queue size: {queueSearchStatus.queueSize || queuePresence.queueSize} • Rating window: ±{queueSearchStatus.ratingWindow} • Estimated wait: {queueSearchStatus.estimatedWaitSeconds}s</p>
              <button className="ghost" onClick={handleCancelQueue}>Cancel Matchmaking</button>
            </div>
          </div>
        )}

        {queueState === 'found' && queuedOpponent && (
          <div className="queue-found-banner">
            <img className="vs-sigil-art" src="/generated/ui/overlay-vs.svg" alt="Versus match found" />
            <div className="versus-grid">
              <div className="versus-side">
                <span className="eyebrow">You</span>
                <RankBadge rank={seasonRating} />
              </div>
              <div className="versus-side">
                <span className="eyebrow">Opponent</span>
                <strong>{queuedOpponent.name}</strong>
                <span className="note">{queuedOpponent.rank} • {queuedOpponent.style} • {queuedOpponent.ping}ms</span>
              </div>
            </div>
            <div className="controls">
              <button className="primary" onClick={handleAcceptQueue} disabled>Starting Live Match…</button>
            </div>
          </div>
        )}

        <p className={`toast toast-${toastSeverity} toast-line`}>{toastMessage}</p>
      </article>

      <div className="home-cards">
        <article className="section-card utility-card">
          <div className="section-head">
            <h2>Live Arena</h2>
            <span className="deck-status ready">{liveQueueLabel}</span>
          </div>
          <div className="live-status-grid">
            <div>
              <strong>{queuePresence.connectedPlayers}</strong>
              <p className="note">players online</p>
            </div>
            <div>
              <strong>{queuePresence.queueSize}</strong>
              <p className="note">currently queued</p>
            </div>
          </div>
          <p className="note">{queuePresence.updatedAt ? `Live updated ${formatTimestamp(queuePresence.updatedAt)}.` : 'Waiting for live service data.'}</p>
        </article>
      </div>
    </section>
  )
}
