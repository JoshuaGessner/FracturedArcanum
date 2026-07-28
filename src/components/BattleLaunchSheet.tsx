import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AI_DIFFICULTY_DETAILS, AI_DIFFICULTY_OPTIONS } from '../constants'
import { RankBadge } from './AssetBadge'
import { useAppShell, useGame, useProfile, useQueue } from '../contexts'

type BattleLaunchSheetProps = {
  open: boolean
  onClose: () => void
}

/**
 * Mode selection, lifted out of the old Play screen into a bottom sheet.
 *
 * Play and Home had grown into near-duplicates — both rendered deck readiness,
 * season rating, and their own copy of the resume-battle block — while neither
 * gave the player a dominant "start a match" action. Home is now the single
 * hub, and choosing a mode is a transient decision layered over it rather than
 * a separate destination competing for a nav slot.
 *
 * Dismissal is deliberately over-provided: backdrop tap, Escape, an explicit
 * close button, and the drag handle. Riot logged a mobile LoR bug where a panel
 * could only be closed from the control that opened it; that dead end is easy
 * to reproduce with sheets and worth designing against up front.
 */
export function BattleLaunchSheet({ open, onClose }: BattleLaunchSheetProps) {
  const { openScreen } = useAppShell()
  const {
    preferredMode, handleModeChange,
    resolvedAIDifficulty, aiDifficultySetting, handleAIDifficultyChange,
    startMatch,
  } = useGame()
  const { seasonRating, deckReady, selectedDeckSize } = useProfile()
  const {
    handleStartQueue, queueState, queueSeconds, queueSearchStatus, queuePresence,
    handleCancelQueue, queuedOpponent, handleAcceptQueue,
  } = useQueue()

  const panelRef = useRef<HTMLDivElement | null>(null)
  const queueActive = queueState !== 'idle'
  const launchDisabled = !deckReady || queueActive
  const activeAIDetail = AI_DIFFICULTY_DETAILS[resolvedAIDifficulty]
  const queueCount = queueSearchStatus.queueSize || queuePresence.queueSize
  const onlineOpponents = Math.max(0, queueSearchStatus.connectedPlayers - 1)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    // Move focus into the sheet so keyboard and screen-reader users land on
    // the content they just opened rather than staying behind it.
    panelRef.current?.focus()

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  // Portalled to <body> rather than rendered in place. `.screen-panel.active`
  // sets `isolation: isolate`, so a sheet rendered inside a screen is trapped
  // in that screen's stacking context and paints *under* the nav bar no matter
  // how high its own z-index is.
  return createPortal(
    <div className="sheet-scrim" onClick={onClose} data-testid="battle-launch-scrim">
      <div
        className="sheet-panel battle-launch-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Choose your battle"
        tabIndex={-1}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="sheet-handle" onClick={onClose} aria-label="Close battle menu" />

        <header className="sheet-head">
          <div className="sheet-head-copy">
            <span className="eyebrow">The Arena Gate</span>
            <strong>Choose Your Battle</strong>
          </div>
          <RankBadge rank={seasonRating} />
        </header>

        {!deckReady && (
          <div className="sheet-notice warning">
            <span>Your active deck has {selectedDeckSize} cards. Finish it to unlock battle entry.</span>
            <button
              className="secondary mini"
              onClick={() => { onClose(); openScreen('collection') }}
            >
              Deck Forge
            </button>
          </div>
        )}

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
          <>
            <div className="mode-card-grid mode-card-grid-sheet" aria-label="Choose a battle mode">
              <button
                className="mode-card mode-card-ranked"
                onClick={(event) => {
                  event.currentTarget.blur()
                  handleStartQueue()
                }}
                disabled={launchDisabled}
              >
                <span className="mode-card-eyebrow">Live Ladder</span>
                <strong>Ranked Queue</strong>
                <p className="note">Real opponents, season rank.</p>
              </button>
              <button
                className="mode-card mode-card-ai"
                onClick={(event) => {
                  event.currentTarget.blur()
                  handleModeChange('ai')
                  startMatch('ai')
                  // A launched match takes over the screen; leaving the sheet
                  // mounted would strand it over the battlefield.
                  onClose()
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
                  onClose()
                }}
                disabled={launchDisabled}
              >
                <span className="mode-card-eyebrow">Couch Clash</span>
                <strong>Pass &amp; Play</strong>
                <p className="note">Share the device and duel.</p>
              </button>
            </div>

            {preferredMode === 'ai' && (
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
          </>
        )}

        <div className="play-live-strip">
          <span className="play-live-dot" aria-hidden="true" />
          <span className="play-live-label">Live arena</span>
          <span className="play-live-stat">{queuePresence.connectedPlayers} online · {queuePresence.queueSize} queued</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
