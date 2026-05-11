import { useMemo, useState } from 'react'
import { CARD_LIBRARY, RARITY_COLORS } from '../game'
import { CARD_BORDER_OFFERS, ECONOMY_REWARDS, THEME_OFFERS } from '../constants'
import { PackArt, RarityBadge } from '../components/AssetBadge'
import { PackCeremonyOverlay } from '../components/PackCeremonyOverlay'
import { buildPackSummarySequence } from '../components/RewardCinemaSequence'
import { cardArtPath, handleCardArtError } from '../utils'
import { useAppShell, useGame, useProfile } from '../contexts'

const RARITY_REFUND = { common: 5, rare: 10, epic: 25, legendary: 100 } as const
type ShopSubview = 'hub' | 'vault' | 'packs' | 'themes' | 'borders' | 'breakdown'

export function ShopScreen() {
  const { activeScreen, loggedIn, soundEnabled, hapticsEnabled, presentRewardCinema, lastPackRefund, setLastPackRefund } = useAppShell()
  const {
    shards, totalOwnedCards, nextRewardLabel, canClaimDailyReward, handleClaimDailyReward,
    ownedThemes, selectedTheme, handleEquipTheme,
    ownedCardBorders, selectedCardBorder, handlePurchaseBorder,
    packOffers, packOpening, openedPackCards, handleOpenPack,
    setOpenedPackCards, prevCollectionSnapshot, setPrevCollectionSnapshot,
    collection, savedDecks, pendingBreakdown, setPendingBreakdown, handleBreakdownCard,
  } = useProfile()
  const { startMatch } = useGame()
  const [activeCeremonyPackId, setActiveCeremonyPackId] = useState<string | null>(null)
  const [shopSubview, setShopSubview] = useState<ShopSubview>('hub')

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
  const dailyShardReward = ECONOMY_REWARDS.dailyShards
  const claimButtonLabel = canClaimDailyReward ? `Claim +${dailyShardReward}` : 'Claimed Today'
  const vaultPrimaryLabel = canClaimDailyReward ? `${nextRewardLabel} waiting` : 'Vault charging'
  const vaultStatusLabel = canClaimDailyReward ? 'Ready' : 'Charging'
  const openablePackCount = packOffers.filter((pack) => shards >= pack.cost).length
  const packAccessLabel = packOffers.length > 0 ? `${openablePackCount}/${packOffers.length} ready` : 'No packs listed'
  const packDetailLabel = openablePackCount > 0 ? 'Open a seal now' : 'Earn shards to open seals'
  const cheapestLockedTheme = THEME_OFFERS.find((theme) => !ownedThemes.includes(theme.id))
  const cheapestLockedBorder = CARD_BORDER_OFFERS.find((border) => !ownedCardBorders.includes(border.id))
  const selectedThemeName = THEME_OFFERS.find((theme) => theme.id === selectedTheme)?.name ?? selectedTheme
  const selectedBorderName = CARD_BORDER_OFFERS.find((border) => border.id === selectedCardBorder)?.name ?? selectedCardBorder
  const nextCosmeticCost = Math.min(
    cheapestLockedTheme?.cost ?? Number.POSITIVE_INFINITY,
    cheapestLockedBorder?.cost ?? Number.POSITIVE_INFINITY,
  )
  const nextCosmeticLabel = Number.isFinite(nextCosmeticCost) ? `${nextCosmeticCost} Shards` : 'All owned'
  const themeUnlockLabel = cheapestLockedTheme ? `${cheapestLockedTheme.name} · ${cheapestLockedTheme.cost} Shards` : 'Theme archive complete'
  const borderUnlockLabel = cheapestLockedBorder ? `${cheapestLockedBorder.name} · ${cheapestLockedBorder.cost} Shards` : 'Border vault complete'

  const breakable = useMemo(() => Object.entries(collection)
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
    }), [collection, savedDecks])

  const handleClickOpenPack = (packId: string) => {
    if (packOpening !== null) return
    setActiveCeremonyPackId(packId)
    void handleOpenPack(packId)
  }

  const handleCeremonyClose = () => {
    const finisherCards = openedPackCards
    const finisherPackId = ceremonyPack?.id ?? activeCeremonyPackId
    const finisherRefund = lastPackRefund

    // Present cinema first so it fades in on top of the closing ceremony.
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

    // Clear ceremony state so the overlay unmounts behind the cinema.
    setOpenedPackCards([])
    setPrevCollectionSnapshot(null)
    setActiveCeremonyPackId(null)
    setLastPackRefund(0)
  }

  const handleCeremonyOpenAnother = () => {
    if (!ceremonyPack || packOpening !== null) return
    void handleOpenPack(ceremonyPack.id)
  }

  const shopNav: { id: ShopSubview; label: string }[] = [
    { id: 'vault', label: 'Vault' },
    { id: 'packs', label: 'Packs' },
    { id: 'themes', label: 'Themes' },
    { id: 'borders', label: 'Borders' },
    { id: 'breakdown', label: 'Breakdown' },
  ]

  const renderShopToolbar = (label: string, meta: string) => (
    <div className="shop-section-toolbar">
      <button className="ghost mini subview-back-btn" onClick={() => setShopSubview('hub')} aria-label="Back to shop">
        Back
      </button>
      <strong>{label}</strong>
      <span className="badge">{meta}</span>
    </div>
  )

  return (
    <>
      <section className={`shop-screen shop-market screen-panel ${activeScreen === 'shop' ? 'active' : 'hidden'}`}>
        <article className={`section-card utility-card shop-market-card shop-view-${shopSubview} ${canClaimDailyReward ? 'claim-ready' : ''}`}>
          <div className="shop-market-ledger">
            <div className="shop-market-title">
              <span className="subview-label">{viewLabel}</span>
              <strong>Merchant's Bazaar</strong>
            </div>
            <div className="shop-resource-strip" aria-label="Shop resources">
              <span className="shop-resource-chip"><strong>{shards}</strong> Shards</span>
              <span className={`shop-resource-chip ${canClaimDailyReward ? 'is-accent' : ''}`.trim()}><strong>{vaultSignalLabel}</strong> Vault</span>
              <span className="shop-resource-chip"><strong>{packOffers.length}</strong> Packs</span>
            </div>
          </div>

          <div className="shop-nav-strip" aria-label="Shop sections" data-scene-swipe-opt-out="true">
            <button className={shopSubview === 'hub' ? 'active' : ''} onClick={() => setShopSubview('hub')}>Overview</button>
            {shopNav.map((item) => (
              <button className={shopSubview === item.id ? 'active' : ''} key={item.id} onClick={() => setShopSubview(item.id)}>
                {item.label}
              </button>
            ))}
          </div>

          {shopSubview === 'hub' && (
            <div className="shop-hub-surface">
              <div className="shop-feature-panel shop-feature-vault">
                <div>
                  <span className="subview-label">Daily Vault</span>
                  <strong>{vaultPrimaryLabel}</strong>
                  <p className="note">Claim the daily payout here, then refill the vault through battle rewards.</p>
                  <div className="shop-vault-stat-strip">
                    <span><strong>+{dailyShardReward}</strong> Daily</span>
                    <span><strong>+{ECONOMY_REWARDS.winShards}</strong> Win</span>
                    <span><strong>+{ECONOMY_REWARDS.lossShards}</strong> Loss</span>
                    <span><strong>{nextRewardLabel}</strong> Reward</span>
                  </div>
                </div>
                <div className="controls shop-vault-actions">
                  <button className="primary mini" onClick={handleClaimDailyReward} disabled={!canClaimDailyReward}>
                    {claimButtonLabel}
                  </button>
                  <button className="ghost mini" onClick={() => startMatch('ai')}>
                    Earn in Battle
                  </button>
                </div>
              </div>

              <div className="shop-hub-panels">
                <button className="shop-hub-panel shop-hub-panel-packs" onClick={() => setShopSubview('packs')}>
                  <span className="shop-hub-panel-kicker">Packs</span>
                  <strong>{packAccessLabel}</strong>
                  <span>{packDetailLabel}</span>
                  <span className="shop-hub-panel-stat">{totalOwnedCards} cards logged</span>
                </button>
                <button className="shop-hub-panel shop-hub-panel-themes" onClick={() => setShopSubview('themes')}>
                  <span className="shop-hub-panel-kicker">Themes</span>
                  <strong>{ownedThemes.length}/{THEME_OFFERS.length} owned</strong>
                  <span>{themeUnlockLabel}</span>
                  <span className="shop-hub-panel-stat">Equipped · {selectedThemeName}</span>
                </button>
                <button className="shop-hub-panel shop-hub-panel-borders" onClick={() => setShopSubview('borders')}>
                  <span className="shop-hub-panel-kicker">Borders</span>
                  <strong>{ownedCardBorders.length}/{CARD_BORDER_OFFERS.length} owned</strong>
                  <span>{borderUnlockLabel}</span>
                  <span className="shop-hub-panel-stat">Equipped · {selectedBorderName}</span>
                </button>
                <button className="shop-hub-panel shop-hub-panel-breakdown" onClick={() => setShopSubview('breakdown')}>
                  <span className="shop-hub-panel-kicker">Breakdown</span>
                  <strong>{breakable.length} excess cards</strong>
                  <span>Convert duplicates into shards</span>
                  <span className="shop-hub-panel-stat">Next cosmetic · {nextCosmeticLabel}</span>
                </button>
              </div>
            </div>
          )}

        {shopSubview === 'vault' && (
          <div className={`shop-section-panel reward-vault-card ${canClaimDailyReward ? 'is-ready' : 'is-charging'}`}>
            {renderShopToolbar('Reward Vault', `${shards} Shards`)}
            <div className="reward-vault-console">
              <div className="reward-vault-stage">
                <div className="reward-vault-medallion" aria-label={`Daily vault reward ${dailyShardReward} Shards`}>
                  <span>Daily Vault</span>
                  <strong>+{dailyShardReward}</strong>
                  <span>Shards</span>
                </div>
                <div className="reward-vault-copy">
                  <span className="reward-vault-state">{vaultStatusLabel}</span>
                  <strong>{vaultPrimaryLabel}</strong>
                  <p className="note">Claim the daily payout, then push the streak to charge faster pack and cosmetic unlocks.</p>
                </div>
              </div>

              <div className="controls reward-vault-action-center">
                <button className="primary reward-vault-primary" onClick={handleClaimDailyReward} disabled={!canClaimDailyReward}>
                  {claimButtonLabel}
                </button>
                <button className="ghost reward-vault-secondary" onClick={() => startMatch('ai')}>
                  Earn in Battle
                </button>
              </div>

              <div className="reward-vault-rule-grid" aria-label="Shard reward rules">
                <span className="reward-vault-rule"><strong>+{ECONOMY_REWARDS.dailyShards}</strong> Daily</span>
                <span className="reward-vault-rule"><strong>+{ECONOMY_REWARDS.winShards}</strong> Victory</span>
                <span className="reward-vault-rule"><strong>+{ECONOMY_REWARDS.lossShards}</strong> Defeat</span>
                <span className="reward-vault-rule"><strong>+{ECONOMY_REWARDS.streakBonusStep}</strong> Streak</span>
              </div>
            </div>
          </div>
        )}

        {shopSubview === 'themes' && (
          <div className="shop-section-panel">
            {renderShopToolbar('Cosmetic Themes', `${ownedThemes.length}/${THEME_OFFERS.length} owned`)}
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
          </div>
        )}

        {shopSubview === 'borders' && (
          <div className="shop-section-panel">
            {renderShopToolbar('Card Borders', `${ownedCardBorders.length}/${CARD_BORDER_OFFERS.length} owned`)}
            <div className="theme-grid theme-grid-shop-fit" data-scene-swipe-opt-out="true">
              {CARD_BORDER_OFFERS.map((border) => {
                const owned = ownedCardBorders.includes(border.id)
                const equipped = selectedCardBorder === border.id
                const canAfford = shards >= border.cost
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
          </div>
        )}

        {shopSubview === 'packs' && (
          <div className="shop-section-panel">
            {renderShopToolbar('Card Packs', `Owned ${totalOwnedCards}`)}
            <div className="theme-grid theme-grid-shop-fit" data-scene-swipe-opt-out="true">
              {packOffers.map((pack) => (
                <div className={`theme-offer-card pack-offer-card pack-offer-${pack.id}`} key={pack.id}>
                  <PackArt packId={pack.id} label={`${pack.id} pack artwork`} />
                  <strong>{pack.id[0].toUpperCase() + pack.id.slice(1)} Pack</strong>
                  <p className="mini-text">{pack.cardCount} random cards with rarity protection.</p>
                  <div className="badges">
                    <span className="badge">{pack.cost} Shards</span>
                  </div>
                  <button className="primary" onClick={() => handleClickOpenPack(pack.id)} disabled={packOpening === pack.id || shards < pack.cost}>
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
          </div>
        )}

        {shopSubview === 'breakdown' && (
          <div className="shop-section-panel">
            {renderShopToolbar('Break Down Cards', `${totalOwnedCards} owned`)}

            {breakable.length === 0 ? (
              <p className="note">No excess cards to break down.</p>
            ) : (
              <div className="leaderboard-list shop-breakdown-list">
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
          </div>
        )}
        </article>
      </section>
      {ceremonyVisible && ceremonyPack && (
        <PackCeremonyOverlay
          key={ceremonyPack.id}
          cards={openedPackCards}
          packId={ceremonyPack.id}
          packCost={ceremonyPack.cost}
          shards={shards}
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
