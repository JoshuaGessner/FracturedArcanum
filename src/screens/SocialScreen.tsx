import { useState } from 'react'
import { CARD_LIBRARY } from '../game'
import { RankBadge } from '../components/AssetBadge'
import { useAppShell, useProfile, useQueue, useSocial } from '../contexts'

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

export function SocialScreen() {
  const { activeScreen } = useAppShell()
  const { serverProfile, rankLabel, totalGames, winRate, runes, collection } = useProfile()
  const { leaderboardEntries } = useQueue()
  const {
    friends, friendUsernameInput, setFriendUsernameInput, handleAddFriend, socialLoading,
    onlineFriendIds, outgoingChallenge, incomingChallenge, handleChallengeFriend, handleRemoveFriend,
    challengeStatus, handleAcceptChallenge, handleDeclineChallenge, handleCancelOutgoingChallenge,
    clan, handleLeaveClan, clanForm, setClanForm, handleCreateClan, handleJoinClan, socialStatus,
    tradeForm, setTradeForm, handleProposeTrade, tradeSubmitting,
    tradePickerDraft, setTradePickerDraft, addTradeChip, removeTradeChip,
    formatCountdown, tradeStatus, trades, handleTradeAction,
  } = useSocial()

  const [socialSubview, setSocialSubview] = useState<'hub' | 'friends' | 'clan' | 'trades' | 'rankings'>('hub')

  const profileName = serverProfile?.displayName ?? serverProfile?.username ?? 'Player'
  const onlineFriends = friends.filter((friend) => onlineFriendIds.has(friend.accountId)).length
  const pendingTrades = trades.filter((trade) => trade.status === 'pending').length
  const socialViewLabel = socialSubview === 'friends'
    ? 'Friends'
    : socialSubview === 'clan'
      ? 'Clan Hall'
      : socialSubview === 'trades'
        ? 'Trade Post'
        : socialSubview === 'rankings'
          ? 'Rankings'
          : 'Social'

  return (
    <section className={`home-screen social-screen screen-panel ${activeScreen === 'social' ? 'active' : 'hidden'}`}>
      <div className="home-cards">
        <article className="section-card social-command-card">
          <div className="social-hero">
            <RankBadge rank={rankLabel} />
            <strong>{profileName}</strong>
            <span className="badge">@{serverProfile?.username ?? 'guest'}</span>
            <span className="badge">{onlineFriends} online</span>
            <span className="badge">{pendingTrades} trades</span>
            <span className="badge">{clan ? clan.tag : 'Solo'}</span>
            <span className="badge">{totalGames}G · {winRate}%W · {runes}R</span>
          </div>

          <div className="settings-subnav">
            <span className="badge">{socialViewLabel}</span>
            {socialSubview !== 'hub' && (
              <button className="ghost mini" onClick={() => setSocialSubview('hub')}>
                Back
              </button>
            )}
          </div>

          {socialSubview === 'hub' && (
            <>
              <div className="section-head compact">
                <h3>Social Hub</h3>
                <span className="badge">{friends.length} friend{friends.length === 1 ? '' : 's'}</span>
              </div>

              <div className="settings-hub-grid social-hub-grid">
                <button className="settings-hub-tile" onClick={() => setSocialSubview('friends')}>
                  <strong>Friends</strong>
                  <span>Current friends, online presence, and challenge flow.</span>
                </button>
                <button className="settings-hub-tile" onClick={() => setSocialSubview('rankings')}>
                  <strong>Rankings</strong>
                  <span>Season ladder standings and top competitors.</span>
                </button>
                <button className="settings-hub-tile" onClick={() => setSocialSubview('clan')}>
                  <strong>Clan Hall</strong>
                  <span>Create, join, and manage your alliance in one place.</span>
                </button>
                <button className="settings-hub-tile" onClick={() => setSocialSubview('trades')}>
                  <strong>Trade Post</strong>
                  <span>Send and review offers without crowding the hub.</span>
                </button>
              </div>

              <div className="social-list social-primary-list">
                {friends.slice(0, 6).map((friend) => {
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
                          Challenge
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
                {incomingChallenge && (
                  <div className="challenge-banner incoming">
                    <span>
                      <strong>{incomingChallenge.fromName}</strong> is challenging you to an unranked duel.
                    </span>
                    <div className="controls">
                      <button className="primary mini" onClick={handleAcceptChallenge}>Accept</button>
                      <button className="ghost mini" onClick={handleDeclineChallenge}>Decline</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </article>

        {socialSubview === 'friends' && (
          <article className="section-card utility-card">
            <div className="section-head compact">
              <h3>Friends & Challenges</h3>
              <span className="badge">{friends.length} total</span>
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
              {friends.map((friend) => {
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
                      <button className="primary mini" disabled={!canChallenge} onClick={() => handleChallengeFriend(friend)}>
                        Challenge
                      </button>
                      <button className="ghost mini" disabled={socialLoading} onClick={() => void handleRemoveFriend(friend.accountId, friend.displayName)}>
                        Remove
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
        )}

        {socialSubview === 'rankings' && (
          <article className="section-card utility-card">
            <div className="section-head compact">
              <h3>Top Ladder</h3>
              <span className="badge">Top 5</span>
            </div>
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
                    <RankBadge rank={entry.season_rating} className="rank-badge-inline" />
                  </div>
                )
              })}
              {!leaderboardEntries.length && <p className="note">No ladder data yet. Win ranked matches to claim the top spot.</p>}
            </div>
          </article>
        )}

        {socialSubview === 'clan' && (
          <article className="section-card utility-card social-clan-block">
            <div className="section-head compact">
              <h3>Clan Hall</h3>
              <span className="badge">{clan ? clan.tag : 'Solo'}</span>
            </div>

            {clan ? (
              <>
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
              </>
            ) : (
              <>
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
              </>
            )}
            {socialStatus && <p className="note toast-line">{socialStatus}</p>}
          </article>
        )}

        {socialSubview === 'trades' && (
          <article className="section-card utility-card social-trade-block">
            <div className="section-head compact">
              <h3>Trade Post</h3>
              <span className="badge">Friends</span>
            </div>

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
          </article>
        )}
      </div>
    </section>
  )
}
