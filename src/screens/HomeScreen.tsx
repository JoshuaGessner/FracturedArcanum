import {
  CARD_LIBRARY,
} from '../game'
import { AI_DIFFICULTY_OPTIONS, QUICK_EMOTES } from '../constants'
import { formatTimestamp } from '../utils'
import { useApp } from '../useApp'

type ToastSeverity = 'info' | 'success' | 'warning' | 'error'

function inferToastSeverity(text: string): ToastSeverity {
  const lc = text.toLowerCase()
  if (/(error|fail|could not|cannot|denied|invalid|wrong|disconnect|lost|revok|too short|too long|already|forbid|unavailable|not enough)/.test(lc))
    return 'error'
  if (/(warning|caution|expired|reconnect|waiting|slow|delay)/.test(lc)) return 'warning'
  if (/(welcome|claimed|unlocked|equipped|victory|won|saved|added|matched|ready|reconnected|installed|now an admin|server owner)/.test(lc))
    return 'success'
  return 'info'
}

function getCardName(cardId: string): string {
  const card = CARD_LIBRARY.find((entry) => entry.id === cardId)
  return card ? card.name : cardId
}

function getCardIcon(cardId: string): string {
  const card = CARD_LIBRARY.find((entry) => entry.id === cardId)
  return card?.icon ?? '🃏'
}

export function HomeScreen() {
  const {
    activeScreen,
    gameInProgress, game, handleResumeBattle, handleAbandonBattle,
    preferredMode, handleModeChange,
    resolvedAIDifficulty, aiDifficultySetting, seasonRating, handleAIDifficultyChange,
    startMatch, deckReady, handleStartQueue, queueState, openScreen,
    queueSeconds, queueSearchStatus, queuePresence, handleCancelQueue,
    queuedOpponent, handleAcceptQueue,
    toastSeverity, toastMessage,
    record, dailyQuest, winRate, selectedDeckSize,
    serverProfile, rankLabel, totalGames, runes, liveQueueLabel, leaderboardEntries,
    friends, friendUsernameInput, setFriendUsernameInput, handleAddFriend, socialLoading,
    onlineFriendIds, outgoingChallenge, incomingChallenge, handleChallengeFriend, handleRemoveFriend,
    challengeStatus, handleCancelOutgoingChallenge,
    clan, handleLeaveClan, clanForm, setClanForm, handleCreateClan, handleJoinClan, socialStatus,
    tradeForm, setTradeForm, handleProposeTrade, tradeSubmitting,
    tradePickerDraft, setTradePickerDraft, addTradeChip, removeTradeChip,
    collection, formatCountdown, tradeStatus, trades, handleTradeAction,
    handleSendEmote,
  } = useApp()

  return (
    <section className={`home-screen screen-panel ${activeScreen === 'home' ? 'active' : 'hidden'}`}>
      <article className="section-card utility-card spotlight-card">
        <div className="arena-title-block">
          <p className="eyebrow">Season of Whispers</p>
          <h2>The Arena Awaits</h2>
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

        <>
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
          <button className="ghost" onClick={() => openScreen('deck')}>
            Deck Forge
          </button>
        </div>
        </>

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
            <h2>Quests</h2>
            <span className="deck-status ready">Live</span>
          </div>
          <ul className="quest-list">
            <li>{record.wins >= 1 ? '✅' : '⬜'} {dailyQuest}</li>
            <li>{winRate >= 50 ? '✅' : '⬜'} 50% win rate</li>
            <li>{selectedDeckSize >= 14 ? '✅' : '⬜'} Full deck</li>
          </ul>
        </article>

        <article className="section-card utility-card">
          <div className="section-head">
            <h2>Profile</h2>
            <span className="badge">{serverProfile?.username ?? 'Guest'}</span>
          </div>
          <div className="badges">
            <span className="badge">@{serverProfile?.username ?? 'guest'}</span>
            <span className="badge">{serverProfile?.displayName ?? serverProfile?.username ?? 'Player'}</span>
            <span className="badge">{rankLabel}</span>
            <span className="badge">{totalGames} games</span>
            <span className="badge">{winRate}% WR</span>
            <span className="badge">{runes} 💎</span>
          </div>
        </article>

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

        <article className="section-card utility-card">
          <div className="section-head">
            <h2>Leaderboard</h2>
            <span className="badge">Top 5</span>
          </div>
          <p className="note">Online ranked matches update the live ladder automatically.</p>
          <div className="leaderboard-list">
            {leaderboardEntries.slice(0, 5).map((entry, index) => {
              const entryGames = Math.max(1, entry.wins + entry.losses)
              const entryWinRate = Math.round((entry.wins / entryGames) * 100)
              return (
                <div className="leaderboard-row" key={`${entry.account_id}-${index}`}>
                  <span className="badge">#{index + 1}</span>
                  <div className="leaderboard-meta">
                    <strong>{entry.display_name}</strong>
                    <span className="note">{entry.season_rating} rating • {entryWinRate}% WR</span>
                  </div>
                </div>
              )
            })}
            {!leaderboardEntries.length && <p className="note">No ladder data yet. Win ranked matches to claim the top spot.</p>}
          </div>
        </article>

        <article className="section-card utility-card">
          <div className="section-head">
            <h2>Social Hub</h2>
            <span className="badge">{friends.length} friend{friends.length === 1 ? '' : 's'}</span>
          </div>

          <form className="social-inline-form" onSubmit={(event) => void handleAddFriend(event)}>
            <input
              className="text-input"
              value={friendUsernameInput}
              maxLength={20}
              placeholder="Friend username"
              onChange={(event) => setFriendUsernameInput(event.target.value)}
            />
            <button className="secondary" disabled={socialLoading}>Add Friend</button>
          </form>

          <div className="social-list">
            {friends.slice(0, 8).map((friend) => {
              const online = onlineFriendIds.has(friend.accountId)
              const canChallenge = online && !outgoingChallenge && !incomingChallenge
              return (
                <div className="social-row" key={friend.accountId}>
                  <div className="leaderboard-meta">
                    <strong>
                      <span
                        className={`presence-dot ${online ? 'online' : 'offline'}`}
                        role="img"
                        aria-label={online ? 'online' : 'offline'}
                        title={online ? 'Online' : 'Offline'}
                      />
                      {friend.displayName}
                    </strong>
                    <span className="note">@{friend.username}</span>
                  </div>
                  <div className="controls">
                    <button
                      className="primary mini"
                      disabled={!canChallenge}
                      title={online ? 'Challenge to an unranked duel' : 'Friend is offline'}
                      onClick={() => handleChallengeFriend(friend)}
                    >
                      ⚔ Challenge
                    </button>
                    <button className="ghost mini" disabled={socialLoading} onClick={() => void handleRemoveFriend(friend.accountId, friend.displayName)}>
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
            {!friends.length && <p className="note">No friends yet. Add players by username to build your roster.</p>}
            {challengeStatus && <p className="note toast-line">{challengeStatus}</p>}
            {outgoingChallenge && (
              <div className="challenge-banner outgoing">
                <span>
                  Waiting for <strong>{outgoingChallenge.toName}</strong>…
                </span>
                <button className="ghost mini" onClick={handleCancelOutgoingChallenge}>Cancel</button>
              </div>
            )}
          </div>

          {clan ? (
            <div className="social-clan-block">
              <div className="section-head">
                <strong>[{clan.tag}] {clan.name}</strong>
                <button className="ghost mini" disabled={socialLoading} onClick={() => void handleLeaveClan()}>
                  Leave
                </button>
              </div>
              <div className="badges">
                <span className="badge">Invite {clan.inviteCode}</span>
                <span className="badge">{clan.members.length} members</span>
              </div>
              <div className="social-list">
                {clan.members.map((member) => (
                  <div className="social-row" key={member.accountId}>
                    <div className="leaderboard-meta">
                      <strong>{member.displayName} {member.isYou ? '(You)' : ''}</strong>
                      <span className="note">@{member.username} • {member.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="social-clan-block">
              <form className="form-stack" onSubmit={(event) => void handleCreateClan(event)}>
                <label className="form-field">
                  <span>Create clan</span>
                  <div className="social-inline-form">
                    <input
                      className="text-input"
                      value={clanForm.name}
                      maxLength={32}
                      placeholder="Clan name"
                      onChange={(event) => setClanForm((current) => ({ ...current, name: event.target.value }))}
                    />
                    <input
                      className="text-input clan-tag-field"
                      value={clanForm.tag}
                      maxLength={6}
                      placeholder="TAG"
                      onChange={(event) => setClanForm((current) => ({ ...current, tag: event.target.value.toUpperCase() }))}
                    />
                    <button className="secondary" disabled={socialLoading}>Create</button>
                  </div>
                </label>
              </form>

              <form className="social-inline-form" onSubmit={(event) => void handleJoinClan(event)}>
                <input
                  className="text-input"
                  value={clanForm.inviteCode}
                  maxLength={12}
                  placeholder="Invite code (CLN-XXXXXXXX)"
                  onChange={(event) => setClanForm((current) => ({ ...current, inviteCode: event.target.value.toUpperCase() }))}
                />
                <button className="ghost" disabled={socialLoading}>Join Clan</button>
              </form>
            </div>
          )}

          <p className="note toast-line">{socialStatus}</p>

          {/* ─── Card trading (friends only) ──────────────────── */}
          <div className="social-trade-block">
            <div className="section-head">
              <h3>Card Trades</h3>
              <span className="badge">Friends Only</span>
            </div>
            <p className="note">
              Pick a friend, then add cards to each side of the trade. Up to 6 distinct cards per side, max 3 copies of any card. Trades expire 7 days after they're sent.
            </p>

            <form className="form-stack" onSubmit={handleProposeTrade}>
              <label className="form-field">
                <span>Trade with</span>
                <select
                  className="text-input"
                  value={tradeForm.toAccountId}
                  onChange={(event) => setTradeForm((f) => ({ ...f, toAccountId: event.target.value }))}
                >
                  <option value="">Choose a friend…</option>
                  {friends.map((friend) => (
                    <option key={friend.accountId} value={friend.accountId}>
                      {friend.displayName} (@{friend.username}){onlineFriendIds.has(friend.accountId) ? ' • online' : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="trade-card-picker">
                <div className="trade-picker-row">
                  <select
                    className="text-input"
                    value={tradePickerDraft.cardId}
                    onChange={(event) => setTradePickerDraft((d) => ({ ...d, cardId: event.target.value }))}
                  >
                    <option value="">Choose a card…</option>
                    {CARD_LIBRARY.map((card) => {
                      const owned = collection[card.id] ?? 0
                      const isYourSide = tradePickerDraft.side === 'offer'
                      return (
                        <option key={card.id} value={card.id} disabled={isYourSide && owned === 0}>
                          {card.icon} {card.name} • {card.rarity}{isYourSide ? ` (own ${owned})` : ''}
                        </option>
                      )
                    })}
                  </select>
                  <select
                    className="text-input"
                    value={tradePickerDraft.side}
                    onChange={(event) => setTradePickerDraft((d) => ({ ...d, side: event.target.value as 'offer' | 'request' }))}
                    aria-label="Trade side"
                  >
                    <option value="offer">You give</option>
                    <option value="request">You receive</option>
                  </select>
                  <input
                    className="text-input"
                    type="number"
                    min={1}
                    max={3}
                    value={tradePickerDraft.qty}
                    onChange={(event) => setTradePickerDraft((d) => ({ ...d, qty: Math.max(1, Math.min(3, Number(event.target.value) || 1)) }))}
                    aria-label="Quantity"
                    style={{ width: '4.5rem' }}
                  />
                </div>
                <div className="row-2">
                  <button type="button" className="ghost mini" disabled={!tradePickerDraft.cardId} onClick={addTradeChip}>
                    ＋ Add to {tradePickerDraft.side === 'offer' ? 'your offer' : 'your request'}
                  </button>
                </div>

                <div className="stack-2">
                  <div>
                    <span className="mini-text">You give:</span>
                    <div className="trade-chip-list">
                      {tradeForm.offer.map((item) => (
                        <span className="trade-chip" key={item.cardId}>
                          <span className="chip-icon">{getCardIcon(item.cardId)}</span>
                          {getCardName(item.cardId)}
                          <span className="chip-qty">×{item.qty}</span>
                          <button type="button" onClick={() => removeTradeChip('offer', item.cardId)} aria-label={`Remove ${getCardName(item.cardId)}`}>✕</button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="mini-text">You receive:</span>
                    <div className="trade-chip-list">
                      {tradeForm.request.map((item) => (
                        <span className="trade-chip" key={item.cardId}>
                          <span className="chip-icon">{getCardIcon(item.cardId)}</span>
                          {getCardName(item.cardId)}
                          <span className="chip-qty">×{item.qty}</span>
                          <button type="button" onClick={() => removeTradeChip('request', item.cardId)} aria-label={`Remove ${getCardName(item.cardId)}`}>✕</button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="row-2">
                <button className="secondary" type="submit" disabled={tradeSubmitting || !tradeForm.toAccountId || !tradeForm.offer.length || !tradeForm.request.length}>
                  {tradeSubmitting ? <><span className="spinner spinner-inline" />Sending…</> : 'Propose Trade'}
                </button>
              </div>
            </form>
            {tradeStatus && <p className={`toast toast-${inferToastSeverity(tradeStatus)} toast-line`}>{tradeStatus}</p>}

            <ul className="trade-list">
              {trades.length === 0 ? (
                <li className="note">No trades yet.</li>
              ) : (
                trades.map((trade) => {
                  const youArePromoter = trade.fromAccountId === (serverProfile?.accountId ?? '')
                  const pending = trade.status === 'pending'
                  const counterpartyId = youArePromoter ? trade.toAccountId : trade.fromAccountId
                  const counterparty = friends.find((f) => f.accountId === counterpartyId)
                  const counterpartyName = counterparty?.displayName ?? counterparty?.username ?? 'friend'
                  const expiresMs = Date.parse(trade.expiresAt)
                  return (
                    <li className="trade-row" key={trade.id}>
                      <div className="trade-identity">
                        <strong>{youArePromoter ? `You → ${counterpartyName}` : `${counterpartyName} → You`}</strong>
                        <span className={`badge trade-status-${trade.status}`}>{trade.status}</span>
                      </div>
                      <div className="mini-text">
                        <strong>Offer:</strong>{' '}
                        {trade.offer.map((item, index) => (
                          <span key={item.cardId}>
                            {index > 0 ? ', ' : ''}{getCardIcon(item.cardId)} {getCardName(item.cardId)} ×{item.qty}
                          </span>
                        ))}
                        {' · '}
                        <strong>Request:</strong>{' '}
                        {trade.request.map((item, index) => (
                          <span key={item.cardId}>
                            {index > 0 ? ', ' : ''}{getCardIcon(item.cardId)} {getCardName(item.cardId)} ×{item.qty}
                          </span>
                        ))}
                      </div>
                      {pending && Number.isFinite(expiresMs) && (
                        <div className="trade-expiry">
                          Expires in <strong>{formatCountdown(expiresMs)}</strong>
                        </div>
                      )}
                      {pending && (
                        <div className="controls">
                          {youArePromoter ? (
                            <button className="ghost mini" onClick={() => void handleTradeAction(trade.id, 'cancel')}>
                              Cancel
                            </button>
                          ) : (
                            <>
                              <button className="primary mini" onClick={() => void handleTradeAction(trade.id, 'accept')}>
                                Accept
                              </button>
                              <button className="ghost mini" onClick={() => void handleTradeAction(trade.id, 'reject')}>
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })
              )}
            </ul>
          </div>
        </article>
      </div>

      <div className="controls emote-row">
        {QUICK_EMOTES.map((emote) => (
          <button className="ghost emote-chip" key={emote} onClick={() => handleSendEmote(emote)}>
            {emote}
          </button>
        ))}
      </div>
    </section>
  )
}
