import { AI_DIFFICULTY_OPTIONS } from '../constants'
import { RankBadge } from '../components/AssetBadge'
import { useAppShell, useGame, useProfile, useQueue } from '../contexts'

export function PlayScreen() {
  const { activeScreen, openScreen } = useAppShell()
  const {
    gameInProgress, game, handleResumeBattle, handleAbandonBattle,
    preferredMode, handleModeChange,
    resolvedAIDifficulty, aiDifficultySetting, handleAIDifficultyChange,
    startMatch,
  } = useGame()
  const { seasonRating, deckReady, selectedDeckSize } = useProfile()
  const {
    handleStartQueue, queueState, queueSeconds, queueSearchStatus, queuePresence,
    handleCancelQueue, queuedOpponent, handleAcceptQueue, liveQueueLabel,
  } = useQueue()
  const launchDisabled = !deckReady || queueState !== 'idle'
  const entryHint = queueState === 'searching'
    ? 'Ranked matchmaking is already searching. Cancel it below to switch modes.'
    : deckReady
      ? 'Tap a battle type to launch immediately.'
      : `Your active deck has ${selectedDeckSize} cards. Finish it in Deck Forge to unlock battle entry.`

  return (
    <section className={`home-screen play-screen screen-panel ${activeScreen === 'play' ? 'active' : 'hidden'}`}>
      <article className="section-card utility-card spotlight-card">
        <div className="arena-title-block play-hero">
          <p className="eyebrow">The Arena Gate</p>
          <h2>Choose Your Battle</h2>
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

        <div className="mode-card-grid" aria-label="Choose a battle mode">
          <button
            className={`mode-card mode-card-ai ${preferredMode === 'ai' ? 'active' : ''}`}
            onClick={() => {
              handleModeChange('ai')
              startMatch('ai')
            }}
            disabled={launchDisabled}
          >
            <span className="mode-card-eyebrow">Solo Arena</span>
            <strong>AI Skirmish</strong>
            <p className="note">Adaptive rivals, no queue.</p>
          </button>
          <button
            className={`mode-card mode-card-duel ${preferredMode === 'duel' ? 'active' : ''}`}
            onClick={() => {
              handleModeChange('duel')
              startMatch('duel')
            }}
            disabled={launchDisabled}
          >
            <span className="mode-card-eyebrow">Couch Clash</span>
            <strong>Pass &amp; Play</strong>
            <p className="note">Share the device and duel.</p>
          </button>
          <button
            className={`mode-card mode-card-ranked ${queueState !== 'idle' ? 'active' : ''}`}
            onClick={handleStartQueue}
            disabled={launchDisabled}
            data-tour-id="queue-button"
          >
            <span className="mode-card-eyebrow">Live Ladder</span>
            <strong>Ranked Queue</strong>
            <p className="note">Real opponents, season rank.</p>
          </button>
        </div>

        {preferredMode === 'ai' && (
          <div className="difficulty-panel">
            <p className="note">AI difficulty: <strong>{resolvedAIDifficulty.charAt(0).toUpperCase() + resolvedAIDifficulty.slice(1)}</strong>{aiDifficultySetting === 'auto' ? ` (auto from ${seasonRating} rating)` : ''}</p>
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

        <div className={`play-entry-hint ${deckReady ? 'ready' : 'warning'}`}>
          <strong>{entryHint}</strong>
        </div>

        <div className="play-action-row">
          <button className="secondary" onClick={() => openScreen('collection')}>Deck Forge</button>
          <button className="ghost" onClick={() => openScreen('home')}>Back Home</button>
        </div>

        {queueState === 'searching' && (
          <div className="queue-search-portal" aria-live="polite">
            <div className="queue-portal-ring" aria-hidden="true">
              <div className="queue-portal-core">{queueSeconds}s</div>
            </div>
            <div className="queue-portal-copy">
              <h3>Searching the live ladder</h3>
              <div className="live-status-grid">
                <div>
                  <strong>#{queueSearchStatus.position}</strong>
                  <p className="note">queue spot</p>
                </div>
                <div>
                  <strong>{Math.max(0, queueSearchStatus.connectedPlayers - 1)}</strong>
                  <p className="note">online</p>
                </div>
              </div>
              <p className="note">Queue {queueSearchStatus.queueSize || queuePresence.queueSize} · ±{queueSearchStatus.ratingWindow} rating · ~{queueSearchStatus.estimatedWaitSeconds}s wait</p>
              <button className="ghost" onClick={handleCancelQueue}>Cancel</button>
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
                <span className="note">{queuedOpponent.rank} · {queuedOpponent.style} · {queuedOpponent.ping}ms</span>
              </div>
            </div>
            <div className="controls">
              <button className="primary" onClick={handleAcceptQueue} disabled>Starting Live Match…</button>
            </div>
          </div>
        )}

        <div className="play-live-strip">
          <span className="play-live-dot" aria-hidden="true" />
          <span className="play-live-label">{liveQueueLabel}</span>
          <span className="play-live-stat">{queuePresence.connectedPlayers} online · {queuePresence.queueSize} queued</span>
        </div>
      </article>
    </section>
  )
}
