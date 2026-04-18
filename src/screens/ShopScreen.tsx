import { useState } from 'react'
import { CARD_LIBRARY, RARITY_COLORS } from '../game'
import { CARD_BORDER_OFFERS, THEME_OFFERS } from '../constants'
import { PackArt, RarityBadge } from '../components/AssetBadge'
import { PackCeremonyOverlay } from '../components/PackCeremonyOverlay'
import { buildPackSummarySequence } from '../components/RewardCinemaSequence'
import { cardArtPath, handleCardArtError } from '../utils'
import { useAppShell, useGame, useProfile } from '../contexts'

const RARITY_REFUND = { common: 5, rare: 10, epic: 25, legendary: 100 } as const

export function ShopScreen() {
  const { activeScreen, loggedIn, soundEnabled, hapticsEnabled, presentRewardCinema, lastPackRefund, setLastPackRefund } = useAppShell()
  const {
    runes, totalOwnedCards, nextRewardLabel, canClaimDailyReward, handleClaimDailyReward,
    ownedThemes, selectedTheme, handleEquipTheme,
    ownedCardBorders, selectedCardBorder, handlePurchaseBorder,
    packOffers, packOpening, openedPackCards, handleOpenPack,
    setOpenedPackCards, prevCollectionSnapshot, setPrevCollectionSnapshot,
    collection, savedDecks, pendingBreakdown, setPendingBreakdown, handleBreakdownCard,
  } = useProfile()
  const { startMatch } = useGame()

  // Tracks which pack the player is currently opening so the ceremony overlay
  // can stage that pack's art and so "Open Another" can re-fire the same
  // offer after `packOpening` clears.
  const [activeCeremonyPackId, setActiveCeremonyPackId] = useState<string | null>(null)

  const ceremonyPack = activeCeremonyPackId
    ? packOffers.find((offer) => offer.id === activeCeremonyPackId) ?? null
    : null
  const ceremonyVisible = openedPackCards.length > 0 && ceremonyPack !== null

  const handleClickOpenPack = (packId: string) => {
    setActiveCeremonyPackId(packId)
    void handleOpenPack(packId)
  }

  const handleCeremonyClose = () => {
    const finisherCards = openedPackCards
    const finisherPackId = ceremonyPack?.id ?? activeCeremonyPackId
    const finisherRefund = lastPackRefund
    setOpenedPackCards([])
    setPrevCollectionSnapshot(null)
    setActiveCeremonyPackId(null)
    setLastPackRefund(0)
    if (finisherPackId && finisherCards.length > 0) {
      presentRewardCinema(
        buildPackSummarySequence({
          packId: finisherPackId,
          cards: finisherCards,
          shardsRefunded: finisherRefund,
        }),
      )
    }
  }

  const handleCeremonyOpenAnother = () => {
    if (!ceremonyPack) return
    void handleOpenPack(ceremonyPack.id)
  }

  return (
    <>
    <section className={`vault-grid shop-screen screen-panel ${activeScreen === 'shop' ? 'active' : 'hidden'}`}>
      <article className={`section-card utility-card reward-vault-card ${canClaimDailyReward ? 'claim-ready' : ''}`}>
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
          <span className={`badge ${canClaimDailyReward ? 'new-card-badge' : ''}`}>Claim {canClaimDailyReward ? 'Ready' : 'Tomorrow'}</span>
        </div>

        {canClaimDailyReward && (
          <div className="daily-claim-banner">
            A fresh stipend is waiting in the vault — collect it before your next queue.
          </div>
        )}

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
            <div className={`theme-offer-card pack-offer-card pack-offer-${pack.id}`} key={pack.id}>
              <PackArt packId={pack.id} label={`${pack.id} pack artwork`} />
              <strong>{pack.id[0].toUpperCase() + pack.id.slice(1)} Pack</strong>
              <p className="mini-text">{pack.cardCount} random cards with rarity protection.</p>
              <div className="badges">
                <span className="badge">{pack.cost} Shards</span>
              </div>
              <button className="primary" onClick={() => handleClickOpenPack(pack.id)} disabled={packOpening === pack.id || runes < pack.cost}>
                {packOpening === pack.id ? (
                  <><span className="spinner spinner-inline" aria-hidden="true" />Opening…</>
                ) : (
                  'Open Pack'
                )}
              </button>
            </div>
          ))}
        </div>

        {openedPackCards.length > 0 && !ceremonyVisible && (
          <div className="pack-reveal-stage">
            <div className="section-head compact">
              <div>
                <h3>Latest Pack Reveal</h3>
                <p className="note">New cards shimmer brighter. Duplicates are converted into Shards automatically.</p>
              </div>
            </div>
            <div className="pack-reveal-grid">
              {openedPackCards.map((card, index) => {
                const cardMeta = CARD_LIBRARY.find((entry) => entry.id === card.id)
                return (
                  <article
                    className={`pack-reveal-card rarity-${card.rarity}`}
                    key={`${card.id}-${index}`}
                    style={{ '--rarity-color': RARITY_COLORS[card.rarity as keyof typeof RARITY_COLORS] ?? '#9ca3af' } as React.CSSProperties}
                  >
                    <div className={`pack-reveal-glow pack-reveal-glow-${card.rarity}`} aria-hidden="true" />
                    <div className="card-art-shell thumb pack-reveal-art-shell">
                      <img
                        className="card-illustration"
                        src={cardArtPath(card.id)}
                        alt={`${cardMeta?.name ?? card.id} illustration`}
                        loading="lazy"
                        onError={handleCardArtError}
                      />
                    </div>
                    <div className="pack-reveal-meta">
                      <RarityBadge rarity={card.rarity} />
                      <strong>{cardMeta?.icon} {cardMeta?.name ?? card.id}</strong>
                      <span className="note">{card.duplicate ? 'Duplicate converted into Shards.' : 'Added to your library.'}</span>
                    </div>
                    <span className={`badge ${card.duplicate ? '' : 'new-card-badge'}`}>{card.duplicate ? 'Duplicate' : 'New'}</span>
                  </article>
                )
              })}
            </div>
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
                    <RarityBadge rarity={entry.meta.rarity} className="badge-with-art" />
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
    {ceremonyVisible && ceremonyPack && (
      <PackCeremonyOverlay
        key={`${ceremonyPack.id}-${openedPackCards.length}-${openedPackCards[0]?.id ?? ''}`}
        cards={openedPackCards}
        packId={ceremonyPack.id}
        packCost={ceremonyPack.cost}
        runes={runes}
        prevCollection={prevCollectionSnapshot ?? collection}
        soundEnabled={soundEnabled}
        hapticsEnabled={hapticsEnabled}
        packOpening={packOpening}
        onOpenAnother={handleCeremonyOpenAnother}
        onClose={handleCeremonyClose}
      />
    )}
    </>
  )
}
