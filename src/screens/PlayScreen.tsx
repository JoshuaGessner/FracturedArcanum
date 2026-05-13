import { AI_DIFFICULTY_DETAILS, AI_DIFFICULTY_OPTIONS } from '../constants'
import { RankBadge } from '../components/AssetBadge'
import { SceneHeaderPanel, type SceneHeaderTile } from '../components/SceneHeaderPanel'
import { useAppShell, useGame, useProfile, useQueue } from '../contexts'

export function PlayScreen() {
  const { activeScreen, openScreen } = useAppShell()
  const {
    gameInProgress, game, handleResumeBattle, handleAbandonBattle,
    preferredMode, handleModeChange, isRankedBattle,
    resolvedAIDifficulty, aiDifficultySetting, handleAIDifficultyChange,
    startMatch,
  } = useGame()
  const { seasonRating, deckReady, selectedDeckSize } = useProfile()
  const {
    handleStartQueue, queueState, queueSeconds, queueSearchStatus, queuePresence,
    handleCancelQueue, queuedOpponent, handleAcceptQueue, liveQueueLabel,
  } = useQueue()
  const launchDisabled = !deckReady || queueState !== 'idle'
  const queueActive = queueState !== 'idle'
  const entryHint = queueState === 'searching'
    ? 'Ranked matchmaking is already searching. Cancel it below to switch modes.'
    : deckReady
      ? 'Tap a battle type to launch immediately.'
      : `Your active deck has ${selectedDeckSize} cards. Finish it in Deck Forge to unlock battle entry.`
  const readinessLabel = deckReady ? 'Forge stocked' : 'Deck Incomplete'
  const queueOpenLabel = queueState === 'searching' ? 'Searching now' : 'Stand by'
  const playTiles: SceneHeaderTile[] = [
    {
      kicker: 'Season Rating',
      value: `${seasonRating}`,
      note: 'Current ladder footing',
    },
    {
      kicker: 'Deck Ready',
      value: readinessLabel,
      note: `${selectedDeckSize} cards prepared`,
      accent: deckReady,
    },
    {
      kicker: 'Queue Open',
      value: queueOpenLabel,
      note: `${queuePresence.connectedPlayers} online · ${queuePresence.queueSize} queued`,
    },
  ]
  const activeAIDetail = AI_DIFFICULTY_DETAILS[resolvedAIDifficulty]
  const queueCount = queueSearchStatus.queueSize || queuePresence.queueSize
  const onlineOpponents = Math.max(0, queueSearchStatus.connectedPlayers - 1)

  return (
    <section className={`home-screen play-screen screen-panel ${activeScreen === 'play' ? 'active' : 'hidden'}`}>
      <article className={`section-card utility-card spotlight-card play-command-card play-queue-${queueState}`}>
        <SceneHeaderPanel
          className="play-scene-header play-readiness-panel-compact"
          visual={<RankBadge rank={seasonRating} />}
          title="Choose Your Battle"
          note="The Arena Gate"
          badges={<span className={`deck-status ${deckReady ? 'ready' : 'warning'}`}>{deckReady ? 'Ready' : 'Needs cards'}</span>}
          tiles={playTiles}
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

        <div className="mode-card-grid play-mode-grid-compact" aria-label="Choose a battle mode">
          <button
            className="mode-card mode-card-ai"
            onClick={(event) => {
              event.currentTarget.blur()
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
            className="mode-card mode-card-duel"
            onClick={(event) => {
              event.currentTarget.blur()
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
            className={`mode-card mode-card-ranked ${queueActive ? 'active' : ''}`}
            onClick={(event) => {
              event.currentTarget.blur()
              handleStartQueue()
            }}
            disabled={launchDisabled}
            data-tour-id="queue-button"
          >
            <span className="mode-card-eyebrow">Live Ladder</span>
            <strong>Ranked Queue</strong>
            <p className="note">Real opponents, season rank.</p>
          </button>
        </div>

        {preferredMode === 'ai' && queueState === 'idle' && (
          <div className="difficulty-panel play-ai-settings">
            <div className="difficulty-strip-head">
              <span className="subview-label">AI Difficulty</span>
              <strong>{activeAIDetail.title}</strong>
            </div>
            <div className="difficulty-chip-row">
              {AI_DIFFICULTY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`difficulty-chip ${aiDifficultySetting === option.id ? 'active' : ''}`}
                  onClick={(event) => {
                    event.currentTarget.blur()
                    handleAIDifficultyChange(option.id)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`play-queue-stage ${deckReady ? 'ready' : 'warning'} ${queueActive ? 'is-active' : ''}`} aria-live="polite">
          {queueState === 'searching' ? (
            <div className="queue-search-portal">
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
                    <strong>{onlineOpponents}</strong>
                    <p className="note">online</p>
                  </div>
                </div>
                <p className="note">Queue {queueCount} · ±{queueSearchStatus.ratingWindow} rating · ~{queueSearchStatus.estimatedWaitSeconds}s wait</p>
                <button className="ghost queue-leave-btn" onClick={handleCancelQueue}>Leave Queue</button>
              </div>
            </div>
          ) : queueState === 'found' && queuedOpponent ? (
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
          ) : (
            <div className="play-entry-hint">
              <div>
                <span className="subview-label">Arena Gate</span>
                <strong>{entryHint}</strong>
              </div>
              <button className="secondary mini" onClick={() => openScreen('collection')}>Deck Forge</button>
            </div>
          )}
        </div>

        <div className="play-live-strip">
          <span className="play-live-dot" aria-hidden="true" />
          <span className="play-live-label">{liveQueueLabel}</span>
          <span className="play-live-stat">{queuePresence.connectedPlayers} online · {queuePresence.queueSize} queued</span>
        </div>
      </article>
    </section>
  )
}
