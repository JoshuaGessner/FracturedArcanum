import { useState } from 'react'
import { CARD_LIBRARY, RARITY_COLORS } from '../game'
import { CARD_BORDER_OFFERS, THEME_OFFERS } from '../constants'
import { PackArt, RarityBadge } from '../components/AssetBadge'
import { PackCeremonyOverlay } from '../components/PackCeremonyOverlay'
import { SceneHeaderPanel, type SceneHeaderTile } from '../components/SceneHeaderPanel'
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
  const [activeCeremonyPackId, setActiveCeremonyPackId] = useState<string | null>(null)
  const [shopSubview, setShopSubview] = useState<'hub' | 'vault' | 'packs' | 'themes' | 'borders' | 'breakdown'>('hub')

  const ceremonyPack = activeCeremonyPackId
    ? packOffers.find((offer) => offer.id === activeCeremonyPackId) ?? null
    : null
  const ceremonyVisible = openedPackCards.length > 0 && ceremonyPack !== null

  const viewLabel = shopSubview === 'vault'
    ? 'Reward Vault'
    : shopSubview === 'packs'
      ? 'Card Packs'
      : shopSubview === 'themes'
        ? 'Themes'
        : shopSubview === 'borders'
          ? 'Borders'
          : shopSubview === 'breakdown'
            ? 'Breakdown'
            : 'Shop'
  const vaultSignalLabel = canClaimDailyReward ? 'Ready to claim' : 'Charging'
  const packStashLabel = `${packOffers.length} seals`
  const bazaarTiles: SceneHeaderTile[] = [
    {
      kicker: 'Shard Cache',
      value: `${runes}`,
      note: 'Spend on packs, themes, and borders',
    },
    {
      kicker: 'Daily Vault',
      value: vaultSignalLabel,
      note: `Next payout · ${nextRewardLabel}`,
      accent: canClaimDailyReward,
    },
    {
      kicker: 'Pack Stash',
      value: packStashLabel,
      note: `${totalOwnedCards} cards currently logged`,
    },
  ]
  const shopShortcuts = [
    {
      label: 'Reward Vault',
      description: 'Daily reward progress, shard balance, and quick earn options.',
      onClick: () => setShopSubview('vault'),
    },
    {
      label: 'Card Packs',
      description: 'Open standard and premium packs without crowding the screen.',
      onClick: () => setShopSubview('packs'),
    },
    {
      label: 'Themes',
      description: 'Change your arena mood and visual style.',
      onClick: () => setShopSubview('themes'),
    },
    {
      label: 'Borders',
      description: 'Equip and unlock card frame styles.',
      onClick: () => setShopSubview('borders'),
    },
    {
      label: 'Card Breakdown',
      description: 'Convert extra cards into shards in a dedicated view.',
      onClick: () => setShopSubview('breakdown'),
    },
  ]

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

  const handleClickOpenPack = (packId: string) => {
    if (packOpening !== null) return
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
        'pack',
      )
    }
  }

  const handleCeremonyOpenAnother = () => {
    if (!ceremonyPack || packOpening !== null) return
    void handleOpenPack(ceremonyPack.id)
  }

  return (
    <>
      <section className={`vault-grid shop-screen screen-panel ${activeScreen === 'shop' ? 'active' : 'hidden'}`}>
        <article className={`section-card utility-card reward-vault-card ${canClaimDailyReward ? 'claim-ready' : ''}`}>
          <SceneHeaderPanel
            className="shop-scene-header"
            title="Merchant's Bazaar"
            note="Featured stock, shard pressure, and faster routes into the vault."
            badges={(
              <>
                <span className="badge">{runes} Shards</span>
                <span className="badge">Next: {nextRewardLabel}</span>
                <button className="ghost mini" onClick={() => startMatch('ai')}>
                  Earn in Battle
                </button>
              </>
            )}
            tiles={bazaarTiles}
            viewLabel={viewLabel}
            onBack={shopSubview !== 'hub' ? () => setShopSubview('hub') : undefined}
            shortcuts={shopSubview === 'hub' ? shopShortcuts : undefined}
          />
        </article>

        {shopSubview === 'vault' && (
          <article className={`section-card utility-card reward-vault-card ${canClaimDailyReward ? 'claim-ready' : ''}`}>
            <div className="section-head compact">
              <h3>Reward Vault</h3>
              <span className="badge">{runes} Shards</span>
            </div>
            <p className="note">Claim your daily payout here and jump back into battle to refill the vault.</p>
            <div className="controls">
              <button className="primary mini" onClick={handleClaimDailyReward} disabled={!canClaimDailyReward}>
                Claim +50
              </button>
              <button className="ghost mini" onClick={() => startMatch('ai')}>
                Earn in Battle
              </button>
            </div>
          </article>
        )}

        {shopSubview === 'themes' && (
          <article className="section-card utility-card">
            <div className="section-head compact">
              <h3>Cosmetic Themes</h3>
              <span className="badge">Cosmetics</span>
            </div>
            <div className="theme-grid theme-grid-shop-fit">
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
        )}

        {shopSubview === 'borders' && (
          <article className="section-card utility-card">
            <div className="section-head compact">
              <h3>Card Borders</h3>
              <span className="badge">Cosmetics</span>
            </div>
            <div className="theme-grid theme-grid-shop-fit" data-scene-swipe-opt-out="true">
              {CARD_BORDER_OFFERS.map((border) => {
                const owned = ownedCardBorders.includes(border.id)
                const equipped = selectedCardBorder === border.id
                const canAfford = runes >= border.cost
                return (
                  <div className="theme-offer-card" key={border.id}>
                    <div className={`border-preview border-${border.id}`} aria-hidden="true">
                      <img className="border-preview-icon" src="/generated/ui/icon-attack.svg" alt="" aria-hidden="true" />
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
        )}

        {shopSubview === 'packs' && (
          <article className="section-card utility-card">
            <div className="section-head compact">
              <h3>Card Packs</h3>
              <span className="badge">Owned {totalOwnedCards}</span>
            </div>
            <div className="theme-grid theme-grid-shop-fit" data-scene-swipe-opt-out="true">
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
                  <h3>Latest Reveal</h3>
                </div>
                <div className="pack-reveal-grid" data-scene-swipe-opt-out="true">
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
                            draggable={false}
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
        )}

        {shopSubview === 'breakdown' && (
          <article className="section-card utility-card">
            <div className="section-head compact">
              <h3>Break Down Cards</h3>
              <span className="badge">{totalOwnedCards} owned</span>
            </div>

            {breakable.length === 0 ? (
              <p className="note">No excess cards to break down.</p>
            ) : (
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
                        <button className="ghost mini" onClick={() => setPendingBreakdown({ cardId: entry.cardId, qty: 1 })}>
                          Break 1
                        </button>
                        {entry.extra > 1 && (
                          <button className="ghost mini" onClick={() => setPendingBreakdown({ cardId: entry.cardId, qty: entry.extra })}>
                            Break All ({entry.extra})
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

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
                      <button className="primary mini" onClick={() => handleBreakdownCard(pendingBreakdown.cardId, pendingBreakdown.qty)}>
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
        )}
      </section>
      {ceremonyVisible && ceremonyPack && (
        <PackCeremonyOverlay
          key={ceremonyPack.id}
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
