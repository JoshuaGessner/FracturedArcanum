# Fractured Arcanum — Monetization Plan

> **Paid offerings, cosmetic pricing, and fairness rules.**
> Part of the design documentation suite. See also: [Game Design Bible](GAME_DESIGN_BIBLE.md) | [Economy Balance](ECONOMY_BALANCE.md).

---

## Goals

- Keep the game fair and clearly non-pay-to-win — the void does not favor the wealthy
- Monetize through cosmetics and optional progression boosts only
- Preserve a strong free player experience — every Acolyte can become a Herald through devotion alone
- Keep pricing simple and low-friction for a mobile-first audience
- All paid content is thematically aligned with the Lovecraftian cosmic-horror identity

---

## Core Principle — The Covenant of Fair Play

No amount of real money should ever purchase:
- Cards that are mechanically stronger than free cards
- Access to game modes that free players cannot reach
- Rating or matchmaking advantages
- Any gameplay advantage that cannot be earned through play

This is a **covenant**, not a guideline. Breaking it breaks the game.

---

## Recommended Launch Approach

### Phase 1 — The First Offering (Soft Launch)

Ship with:

- Free core gameplay (AI Skirmish + Ranked Duels)
- Daily Reward Vault (50 Runes per day — see [Economy Balance](ECONOMY_BALANCE.md))
- Earnable Runes from matches (30 win / 10 loss)
- 8 cosmetic themes (150–400 Runes each)
- 5 card borders (0–420 Runes each)
- No gameplay power sold for money

This is the safest and cleanest first monetization posture.

---

## Paid Offerings

### 1. Starter Bundle — *The Initiate's Pact*

**Price:** $2.99 (one-time purchase)

Includes:
- One exclusive cosmetic theme: **Abyssal Sanctum** (dark teal + bioluminescent accents — not available for Runes)
- 200 bonus Runes
- One-time value purchase; cannot be re-bought

**Economy impact:** 200 Runes = ~2 days of casual play income. Meaningful but not game-breaking.

### 2. Seasonal Pass — *The Rite of Seasons*

**Price:** $4.99–$6.99 per season

Includes:
- Extra cosmetic reward track (alternate hero frames, animated card backs, exclusive borders)
- 2–3 bonus weekly quests (Rune rewards only — no card advantages)
- Season-exclusive title and profile flair
- End-of-season bonus Runes based on participation

**Economy impact:** Pass holders earn roughly 30–50% more Runes per week from bonus quests. This accelerates collection but does not grant exclusive cards.

### 3. Cosmetic Shop — *The Curator's Vault*

**Price tiers:**
- $0.99–$2.99 for individual cosmetics (board skins, emote packs)
- $3.99–$7.99 for premium themed bundles

**Examples:**
- **Board skins:** Alternate arena backdrops (The Sunken Cathedral, The Brass Foundry, The Fungal Depths)
- **UI themes:** Color palette overrides with unique chrome textures
- **Emote packs:** Thematic in-match emotes (Eldritch Whisper, Void Salute, The Unspeakable Nod)
- **Victory flair:** Custom victory screen animations and defeat transitions

---

## Pricing Alignment with Free Economy

| Item | Paid Price | Rune Equivalent | Free Earn Time |
|------|-----------|----------------|----------------|
| Starter Bundle (200 Runes) | $2.99 | 200 Runes | ~2 days |
| Basic theme (in-game) | — | 150–400 Runes | 1–3 days |
| Card border (in-game) | — | 90–420 Runes | 1–4 days |
| Premium theme (paid-only) | $1.99 | Not purchasable with Runes | Exclusive |

**Rule:** Paid-exclusive items are cosmetic-only. All gameplay-relevant content (cards, packs) is earnable through play.

---

## What We Avoid — The Forbidden Practices

- ❌ Selling stronger cards or exclusive gameplay mechanics
- ❌ Paywalled game modes or matchmaking tiers
- ❌ Aggressive ads, forced interstitials, or reward-gating ads
- ❌ Hidden timers, misleading bundle values, or artificial urgency
- ❌ Loot boxes with real-money purchase (Rune-purchased packs are fine — odds are transparent)
- ❌ Any cosmetic that provides gameplay information advantage (e.g., card borders that reveal rarity)

---

## Metrics to Watch

| Metric | Target | Warning Threshold |
|--------|--------|-------------------|
| Daily active users | Growing or stable | 10%+ decline week-over-week |
| Day 1 / Day 7 / Day 30 retention | 40% / 20% / 10% | Below 30% / 10% / 5% |
| Daily reward claim rate | >70% of DAU | Below 50% |
| Free → first purchase conversion | 3–8% | Below 1% or above 15% |
| Cosmetic equip rate | >30% of owners equip purchases | Below 10% (buyers not using items) |
| Pass completion rate | >60% of purchasers | Below 40% (pass feels unrewarding) |

See [Economy Balance — Health Metrics](ECONOMY_BALANCE.md#8-economy-health-metrics) for currency-specific metrics.

---

## Implementation Path

1. **Now:** Keep the current Vault and Runes system as the free progression loop
2. **Next:** Add a server-backed catalog for cosmetic SKUs (themes, borders, board skins)
3. **Later:** Add platform billing integration only when the free retention loop is proven stable
4. **Always:** Keep all paid content cosmetic-first; validate against the Covenant of Fair Play

---

## Current Recommendation

For this project, the best simple monetization model is:

- **Cosmetic themes** — earnable with Runes or exclusive via paid bundles
- **Seasonal reward pass** — cosmetic track with bonus quest Runes
- **Small optional starter bundle** — one-time $2.99 value purchase

That keeps Fractured Arcanum competitive, fair, thematically coherent, and much easier to ship.