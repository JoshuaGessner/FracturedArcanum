import { CARD_LIBRARY, RARITY_COLORS } from '../game'
import { CARD_BORDER_OFFERS, THEME_OFFERS } from '../constants'
import { useApp } from '../useApp'

const RARITY_REFUND = { common: 5, rare: 10, epic: 25, legendary: 100 } as const

export function ShopScreen() {
  const {
    activeScreen,
    loggedIn,
    runes,
    totalOwnedCards,
    nextRewardLabel,
    canClaimDailyReward,
    handleClaimDailyReward,
    startMatch,
    ownedThemes,
    selectedTheme,
    handleEquipTheme,
    ownedCardBorders,
    selectedCardBorder,
    handlePurchaseBorder,
    packOffers,
    packOpening,
    openedPackCards,
    handleOpenPack,
    collection,
    savedDecks,
    pendingBreakdown,
    setPendingBreakdown,
    handleBreakdownCard,
  } = useApp()

  return (
    <section className={`vault-grid screen-panel ${activeScreen === 'shop' ? 'active' : 'hidden'}`}>
      <article className="section-card utility-card">
        <div className="section-head">
          <div>
            <h2>Reward Vault</h2>
            <p className="note">Claim daily rewards, earn Shards, and build your card library over time.</p>
          </div>
          <span className="deck-status ready">Balance {runes}</span>
        </div>

        <img className="reward-art vault-hero" src="/generated/ui/reward-chest.svg" alt="Vault reward chest" />

        <div className="badges">
          <span className="badge">Next Reward {nextRewardLabel}</span>
          <span className="badge">Claim {canClaimDailyReward ? 'Ready' : 'Tomorrow'}</span>
        </div>

        <div className="controls">
          <button className="primary" onClick={handleClaimDailyReward} disabled={!canClaimDailyReward}>
            Claim Daily +50
          </button>
          <button className="ghost" onClick={() => startMatch('ai')}>
            Earn More in Battle
          </button>
        </div>
      </article>

      <article className="section-card utility-card">
        <div className="section-head">
          <div>
            <h2>Cosmetic Themes</h2>
            <p className="note">Unlock or equip visual themes for the app shell and profile framing.</p>
          </div>
          <span className="badge">Cosmetics Only</span>
        </div>

        <div className="theme-grid">
          {THEME_OFFERS.map((theme) => {
            const owned = ownedThemes.includes(theme.id)
            const equipped = selectedTheme === theme.id

            return (
              <div className="theme-offer-card" key={theme.id}>
                <div className={`theme-swatch ${theme.id}`}></div>
                <strong>{theme.name}</strong>
                <p className="mini-text">{theme.note}</p>
                <div className="badges">
                  <span className="badge">{owned ? 'Owned' : `${theme.cost} Shards`}</span>
                  {equipped && <span className="badge">Equipped</span>}
                </div>
                <button className={owned ? 'secondary' : 'primary'} onClick={() => handleEquipTheme(theme.id, theme.cost)}>
                  {equipped ? 'Equipped' : owned ? 'Equip Theme' : 'Unlock Theme'}
                </button>
              </div>
            )
          })}
        </div>
      </article>

      <article className="section-card utility-card">
        <div className="section-head">
          <div>
            <h2>Card Borders</h2>
            <p className="note">Equip a cosmetic frame for every card you draw, in your deck builder, hand, and on the battlefield.</p>
          </div>
          <span className="badge">Cosmetics Only</span>
        </div>

        <div className="theme-grid">
          {CARD_BORDER_OFFERS.map((border) => {
            const owned = ownedCardBorders.includes(border.id)
            const equipped = selectedCardBorder === border.id
            const canAfford = runes >= border.cost
            return (
              <div className="theme-offer-card" key={border.id}>
                <div className={`border-preview border-${border.id}`} aria-hidden="true">
                  <span className="border-preview-icon">⚔</span>
                </div>
                <strong>{border.name}</strong>
                <p className="mini-text">{border.description}</p>
                <div className="badges">
                  <span className="badge">{owned ? 'Owned' : `${border.cost} Shards`}</span>
                  {equipped && <span className="badge">Equipped</span>}
                </div>
                <button
                  className={owned ? 'secondary' : 'primary'}
                  onClick={() => handlePurchaseBorder(border.id, border.cost)}
                  disabled={!loggedIn || (!owned && !canAfford)}
                >
                  {equipped ? 'Equipped' : owned ? 'Equip Border' : 'Unlock Border'}
                </button>
              </div>
            )
          })}
        </div>
      </article>

      <article className="section-card utility-card">
        <div className="section-head">
          <div>
            <h2>Card Packs & Collection</h2>
            <p className="note">New accounts start with a starter library. Open packs with Shards to unlock more cards by rarity.</p>
          </div>
          <span className="badge">Owned {totalOwnedCards}</span>
        </div>

        <div className="theme-grid">
          {packOffers.map((pack) => (
            <div className="theme-offer-card" key={pack.id}>
              <strong>{pack.id[0].toUpperCase() + pack.id.slice(1)} Pack</strong>
              <p className="mini-text">{pack.cardCount} random cards with rarity protection.</p>
              <div className="badges">
                <span className="badge">{pack.cost} Shards</span>
              </div>
              <button className="primary" onClick={() => void handleOpenPack(pack.id)} disabled={packOpening === pack.id || runes < pack.cost}>
                {packOpening === pack.id ? (
                  <><span className="spinner spinner-inline" aria-hidden="true" />Opening…</>
                ) : (
                  'Open Pack'
                )}
              </button>
            </div>
          ))}
        </div>

        {openedPackCards.length > 0 && (
          <div className="leaderboard-list">
            {openedPackCards.map((card, index) => {
              const cardMeta = CARD_LIBRARY.find((entry) => entry.id === card.id)
              return (
                <div className="leaderboard-row" key={`${card.id}-${index}`}>
                  <span className="badge">{card.rarity}</span>
                  <div className="leaderboard-meta">
                    <strong>{cardMeta?.icon} {cardMeta?.name ?? card.id}</strong>
                    <span className="note">{card.duplicate ? 'Duplicate converted into Shards.' : 'Added to your library.'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </article>

      <article className="section-card utility-card">
        <div className="section-head">
          <div>
            <h2>Break Down Excess Cards</h2>
            <p className="note">
              Reduce duplicate copies into Shards. Refunds are based on rarity (Common 5 · Rare 10 · Epic 25 · Legendary 100).
              Cards required by any saved deck are protected.
            </p>
          </div>
          <span className="badge">Owned {totalOwnedCards}</span>
        </div>

        {(() => {
          const breakable = Object.entries(collection)
            .map(([cardId, owned]) => {
              const meta = CARD_LIBRARY.find((c) => c.id === cardId)
              if (!meta) return null
              let deckMin = 0
              for (const deck of savedDecks) {
                const n = deck.deckConfig?.[cardId] ?? 0
                if (n > deckMin) deckMin = n
              }
              const extra = owned - deckMin
              return { cardId, meta, owned, deckMin, extra }
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry.extra > 0)
            .sort((a, b) => {
              const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 } as const
              const ra = rarityOrder[a.meta.rarity]
              const rb = rarityOrder[b.meta.rarity]
              if (ra !== rb) return ra - rb
              return b.extra - a.extra
            })

          if (breakable.length === 0) {
            return (
              <p className="note">
                No excess cards to break down right now. Open more packs to collect duplicates, or rebuild
                your saved decks to free up copies.
              </p>
            )
          }

          return (
            <div className="leaderboard-list">
              {breakable.map((entry) => {
                const refundPer = RARITY_REFUND[entry.meta.rarity]
                return (
                  <div className="leaderboard-row" key={entry.cardId}>
                    <span className="badge" style={{ color: RARITY_COLORS[entry.meta.rarity] }}>
                      {entry.meta.rarity}
                    </span>
                    <div className="leaderboard-meta">
                      <strong>{entry.meta.icon} {entry.meta.name}</strong>
                      <span className="note">
                        Owned {entry.owned} · In decks {entry.deckMin} · Excess {entry.extra} · {refundPer} Shards each
                      </span>
                    </div>
                    <div className="controls">
                      <button
                        className="ghost mini"
                        onClick={() => setPendingBreakdown({ cardId: entry.cardId, qty: 1 })}
                      >
                        Break 1
                      </button>
                      {entry.extra > 1 && (
                        <button
                          className="ghost mini"
                          onClick={() => setPendingBreakdown({ cardId: entry.cardId, qty: entry.extra })}
                        >
                          Break All ({entry.extra})
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {pendingBreakdown && (() => {
          const meta = CARD_LIBRARY.find((c) => c.id === pendingBreakdown.cardId)
          const refundPer = meta ? RARITY_REFUND[meta.rarity] : 0
          const total = refundPer * pendingBreakdown.qty
          return (
            <div className="leaderboard-list" style={{ marginTop: '0.75rem' }}>
              <div className="leaderboard-row">
                <div className="leaderboard-meta">
                  <strong>Confirm: break down {pendingBreakdown.qty}× {meta?.icon} {meta?.name}</strong>
                  <span className="note">You will receive {total} Shards. This cannot be undone.</span>
                </div>
                <div className="controls">
                  <button
                    className="primary mini"
                    onClick={() => handleBreakdownCard(pendingBreakdown.cardId, pendingBreakdown.qty)}
                  >
                    Confirm
                  </button>
                  <button className="ghost mini" onClick={() => setPendingBreakdown(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </article>
    </section>
  )
}
