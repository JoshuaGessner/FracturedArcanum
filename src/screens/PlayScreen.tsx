import { AI_DIFFICULTY_OPTIONS } from '../constants'
import { formatTimestamp } from '../utils'
import { useApp } from '../useApp'

export function PlayScreen() {
  const {
    activeScreen,
    gameInProgress, game, handleResumeBattle, handleAbandonBattle,
    preferredMode, handleModeChange,
    resolvedAIDifficulty, aiDifficultySetting, seasonRating, handleAIDifficultyChange,
    startMatch, deckReady, handleStartQueue, queueState, openScreen,
    queueSeconds, queueSearchStatus, queuePresence, handleCancelQueue,
    queuedOpponent, handleAcceptQueue,
    toastSeverity, toastMessage,
    liveQueueLabel,
  } = useApp()

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

        <div className="mode-switch">
          <button
            className={preferredMode === 'ai' ? 'primary' : 'ghost'}
            onClick={() => handleModeChange('ai')}
          >
            AI Skirmish
          </button>
          <button
            className={preferredMode === 'duel' ? 'primary' : 'ghost'}
            onClick={() => handleModeChange('duel')}
          >
            Pass &amp; Play
          </button>
        </div>

        {preferredMode === 'ai' && (
          <div className="difficulty-panel">
            <p className="note">AI difficulty: <strong>{resolvedAIDifficulty.charAt(0).toUpperCase() + resolvedAIDifficulty.slice(1)}</strong>{aiDifficultySetting === 'auto' ? ` recommended from your ${seasonRating} rating.` : ' selected manually.'}</p>
            <div className="controls difficulty-row">
              {AI_DIFFICULTY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={aiDifficultySetting === option.id ? 'primary' : 'ghost'}
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
          <div className="queue-searching-block">
            <div className="queue-spinner-row">
              <span className="spinner spinner-lg" aria-hidden="true" />
              <p className="card-text" style={{ margin: 0 }}>
                Searching for a real opponent<span className="thinking-dots" /> <strong style={{ marginLeft: 6 }}>{queueSeconds}s</strong>
              </p>
            </div>
            <div className="live-status-grid">
              <div>
                <strong>#{queueSearchStatus.position}</strong>
                <p className="note">your queue spot</p>
              </div>
              <div>
                <strong>{Math.max(0, queueSearchStatus.connectedPlayers - 1)}</strong>
                <p className="note">other players online</p>
              </div>
            </div>
            <p className="note">Queue size: {queueSearchStatus.queueSize || queuePresence.queueSize} • Rating window: ±{queueSearchStatus.ratingWindow} • Estimated wait: {queueSearchStatus.estimatedWaitSeconds}s</p>
            <p className="note">Ranked only starts with another live player. No bot fallback is used.</p>
            <button className="ghost" onClick={handleCancelQueue}>Cancel Matchmaking</button>
          </div>
        )}

        {queueState === 'found' && queuedOpponent && (
          <div className="opponent-preview">
            <strong>{queuedOpponent.name}</strong>
            <span className="note">
              {queuedOpponent.rank} • {queuedOpponent.style} • {queuedOpponent.ping}ms • Live player
            </span>
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
