# Fractured Arcanum — Economy Balance

> **Currency flow, pack mathematics, collection progression, and economy tuning.**
> All economy changes must be validated against this document. Implements the economy philosophy from the [Game Design Bible](GAME_DESIGN_BIBLE.md).

---

## 1. Economy Philosophy

### Core Principles

Fractured Arcanum's economy follows the **Ritual Offering** model — progress feels earned through devotion (play time), not purchased through wealth.

| Principle | Rule | Rationale |
|-----------|------|-----------|
| **Fair grind** | A free player who plays daily should complete the collection in a reasonable timeframe | Prevents pay-to-win perception |
| **Meaningful choices** | Currency should force interesting decisions (save vs spend, pack vs theme) | Engagement driver |
| **No dead ends** | Duplicate cards always convert to value; no currency is ever wasted | Prevents frustration |
| **Transparency** | All pack odds and earning rates are documented and discoverable | Builds trust |
| **Cosmic patience** | Progression is steady, not instant — the void rewards those who endure | Thematic alignment |

---

## 2. Currency — Shards

The game uses a single soft currency called **Shards**. All code, UI, and documentation use "Shards" consistently. Server constants use `WIN_SHARDS`, `LOSS_SHARDS`, `DAILY_SHARDS`. The database column is `shards`.

### Earning Rates

| Source | Amount | Frequency | Per-Session (3 games) |
|--------|--------|-----------|----------------------|
| Match win | 30 shards | Per win | 45–90 (at 50–100% WR) |
| Match loss | 10 shards | Per loss | 10–15 (at 33–50% LR) |
| Win streak bonus | +5 per streak past 2 (cap +20) | Per qualifying win | Variable |
| Daily reward | 25 shards | Once per day | 25 |
| Card breakdown (Common) | 5 shards | Per copy | Variable |
| Card breakdown (Rare) | 10 shards | Per copy | Variable |
| Card breakdown (Epic) | 25 shards | Per copy | Variable |
| Card breakdown (Legendary) | 100 shards | Per copy | Variable |

**Source constants:** `server/db.js` — `WIN_SHARDS = 30`, `LOSS_SHARDS = 10`, `DAILY_SHARDS = 25`
**Breakdown values:** `server/db.js` — `RARITY_BREAKDOWN_VALUE` map
**Streak bonus:** +5 shards per streak past 2 wins (capped at +20 extra). Source: `resolveMatchResult()` in `server/db.js`
**Match duration:** Matches typically last ~5 minutes, making shard income very fast per real-time minute of play.

### Weekly Income Model

Games are fast-paced (typically ~5 minutes per match). Income should be calculated per match and per session, not per hour.

**Per-match income (50% win rate across 2 games):**

```
1 win (30) + 1 loss (10) = 40 shards per 2 games (~10 minutes)
Average per match: 20 shards
```

**Casual player** (3 matches/day, ~15 minutes, 50% win rate):

```
Daily match income:  (1.5 wins × 30) + (1.5 losses × 10) = 45 + 15 = 60 shards
Daily reward:        25 shards
Daily total:         85 shards
Weekly total:        595 shards

That's ~1.7 Basic packs per day from matches alone, or ~1 per 15-minute session.
```

**Dedicated player** (5 matches/day, ~25 minutes, 60% win rate):

```
Daily match income:  (3 wins × 30) + (2 losses × 10) = 90 + 20 = 110 shards
Streak bonus:        ~10 shards (from 3-streak)
Daily reward:        25 shards
Daily total:         ~145 shards
Weekly total:        ~1,015 shards

That's ~2.9 Basic packs per day, or 1 Legendary pack every ~2.8 days.
```

**Key insight:** Two wins (60 shards) pay for a Basic pack (50 shards) within one ~10-minute session. Progression still feels immediate for casual play while the lower win reward gives the collection meaningful longevity.

---

## 3. Spending — Where Shards Go

### Card Packs

| Pack | Cost | Guaranteed Contents | Upgrade Chance |
|------|------|-------------------|----------------|
| Basic | 50 shards | 3 Common + 1 Rare | Each slot can upgrade by rarity |
| Premium | 150 shards | 3 Common + 1 Rare + 1 Epic | Each slot can upgrade |
| Legendary | 400 shards | 1 Common + 2 Rare + 1 Epic + 1 Legendary | Each slot can upgrade |

**Source:** `server/db.js` — `PACK_DEFS`

### Rarity Weights (for upgrade rolls)

| Rarity | Weight |
|--------|--------|
| Common | 70% |
| Rare | 20% |
| Epic | 8% |
| Legendary | 2% |

**Source:** `server/db.js` — `RARITY_WEIGHTS`

### Cosmetic Themes

| Theme | Cost |
|-------|------|
| Royal Arcane (default) | 0 shards |
| Ember Court | 120 shards |
| Moonwell Glow | 180 shards |

**Source:** `server/db.js` — `THEME_COSTS`; `src/constants.ts` — `THEME_OFFERS`

**Design note:** The theme catalog is intentionally small at launch. Additional themes (Crimson Sanctum, Verdant Hollow, Azure Depths, Golden Spire, Void Eclipse, Frost Tomb, Ember Forge at 150–400 shards) are planned for future seasonal releases. See the Seasonal Schedule in [`docs/CARD_BALANCE_FRAMEWORK.md` §10](CARD_BALANCE_FRAMEWORK.md#10-seasonal-expansion--rotation-system) for the cosmetic expansion roadmap.

### Card Borders

| Border | Cost |
|--------|------|
| Bronze | 90 shards |
| Frost | 180 shards |
| Solar | 280 shards |
| Void | 420 shards |

---

## 4. Pack Value Analysis

### Expected Value per Pack

**Basic Pack (50 shards):**
- 3 Common (guaranteed): 3 × 5 = 15 shards breakdown value
- 1 Rare (guaranteed): 1 × 10 = 10 shards breakdown value
- Base breakdown value: 25 shards (50% return if all duplicates)
- New-card value: significantly higher for incomplete collections

**Premium Pack (150 shards):**
- 3 Common: 15 shards
- 1 Rare: 10 shards
- 1 Epic (guaranteed): 25 shards
- Base breakdown value: 50 shards (33% return)
- Premium over basic: guaranteed Epic access

**Legendary Pack (400 shards):**
- 1 Common: 5 shards
- 2 Rare: 20 shards
- 1 Epic: 25 shards
- 1 Legendary (guaranteed): 100 shards
- Base breakdown value: 150 shards (37.5% return)
- Premium: guaranteed Legendary card

### Pack Purchase Frequency

| Pack | Cost | Wins to Earn | Matches (~50% WR) | Casual Player (~85/day) | Dedicated Player (~145/day) |
|------|------|-------------|-------------------|--------------------------|-------------------------------|
| Basic | 50 | 2 wins | 2–3 games (~10–15 min) | ~1.7 per day | ~2.9 per day |
| Premium | 150 | 5 wins | ~8 games (~40 min) | 1 every ~1.8 days | ~1 per day |
| Legendary | 400 | ~14 wins | ~22 games (~110 min) | 1 every ~4.7 days | 1 every ~2.8 days |

**Key metric:** Two wins pay for a Basic pack, reachable within a single short session. The gap between income and pack cost is intentional — packs should feel earned rather than automatic. Players open their first pack within the first two games of play.

**Weekly volume:**

| Pack | Casual (595/week) | Dedicated (~1,015/week) |
|------|-------------------|-------------------------|
| Basic (if all spent on Basic) | ~11.9 per week | ~20 per week |
| Premium (if all spent on Premium) | ~4 per week | ~6.8 per week |
| Legendary (if all spent on Legendary) | ~1.5 per week | ~2.5 per week |

---

## 5. Collection Progression

### Total Collection Size — Core Set (`SET-S1-CORE`)

| Rarity | Cards | Max Copies | Total Copies Needed |
|--------|-------|------------|-------------------|
| Common | 28 | 3 | 84 |
| Rare | 22 | 3 | 66 |
| Epic | 14 | 3 | 42 |
| Legendary | 6 | 1 | 6 |
| **Total** | **70** | — | **198** |

### Expansion Impact on Collection

When a new expansion is released, recalculate using this formula:

```
New Total Copies = Current Total Copies + (Expansion Commons × 3) + (Expansion Rares × 3) + (Expansion Epics × 3) + (Expansion Legendaries × 1)
```

**Example:** An expansion adding 10C / 7R / 4E / 2L = 30 + 21 + 12 + 2 = 65 additional copies needed.

The collection completion target should scale proportionally:
- **Core-only:** 4–5 months (dedicated), 6–8 months (casual)
- **Core + 1 expansion:** 5–7 months (dedicated), 8–11 months (casual)
- **Core + 2 expansions:** 7–9 months (dedicated), 10–14 months (casual)

If the timeline exceeds 10 months for a dedicated player, increase earning rates or reduce expansion size.

### Rotation and Collection

When a set rotates out of Ranked:
- Players keep all cards from the rotated set (available in casual/AI modes)
- The "active collection" shrinks, making it easier for new players to be competitive
- Pack contents should shift to only include legal-set cards (preventing frustration of pulling rotated cards)

### Starter Collection

New players receive a starter collection via `buildStarterCollection()` in `server/db.js`. This provides a baseline set of common cards to build an initial deck.

### Collection Completion Timeline

**Casual player model** (3 games/day, ~15 min/day, 595 shards/week, buying Basic packs):
- Basic packs per week: ~11.9
- Cards per pack: 4 (plus upgrade chances)
- Cards per week: ~47
- Assuming ~30% new cards early, ~5% new cards late
- Estimated time to collect all commons: ~3–5 weeks
- Estimated time to collect all rares: ~6–10 weeks
- Estimated time to collect all epics: ~12–20 weeks
- Estimated full collection (max copies): ~28–34 weeks (~7–8 months)

**Dedicated player model** (~5 games/day, ~25 min/day, ~1,015 shards/week, mix of packs):
- Estimated full collection: ~16–22 weeks (~4–5.5 months)

**Target:** A dedicated free player should be able to collect the full Core Set within 4–6 months. A casual player who plays 3 quick games a day reaches it in 6–8 months. This timeline is intentionally longer than in many F2P card games — the game monetizes through cosmetics, not card scarcity, so collection completion is a genuine long-term goal rather than a weekend task.

**First-session experience:** After 3 matches (~15 min), a new player earns 45–90 shards in match rewards + 25 daily = 70–115 shards. That's 1–2 Basic packs on day one, delivering an immediate "collection growing" feeling without front-loading progression.

### Duplicate Protection

The pack system includes **duplicate protection** in the `openPack()` function. When rolling a card:
1. First, try to award a card the player does not own (or owns fewer than the max copies of)
2. If all cards of that rarity are fully collected, award a random card (which becomes breakdown fodder)

This prevents the frustrating "I keep getting the same card" experience.

---

## 6. Rated Match Economy

### Rating System

| Constant | Value | Source |
|----------|-------|--------|
| Win rating change | +25 | `WIN_RATING` in db.js |
| Loss rating change | −15 | `LOSS_RATING` in db.js |
| Rating floor | 1000 | `RATING_FLOOR` in db.js |
| Starting rating | 1000 | Default on profile creation |

### Rating Tier Thresholds

| Tier | Rating | Thematic Name |
|------|--------|---------------|
| Bronze | 1000–1149 | Acolyte |
| Silver | 1150–1324 | Initiate |
| Gold | 1325–1499 | Devoted |
| Champion | 1500+ | Herald of the Rift |

### ELO Asymmetry

The win/loss asymmetry (+25/−15) is intentional:
- Creates upward rating pressure so active players feel progression
- 40% win rate maintains rating (0.4 × 25 = 10; 0.6 × 15 = 9 → net +1)
- 50% win rate climbs steadily (12.5 − 7.5 = +5 per match pair)
- Prevents rating deflation in a small player pool

---

## 7. Economy Tuning Levers

These are the knobs to turn when the economy needs adjustment. Each lever has second-order effects — consider all impacts before changing.

### Income Levers

| Lever | Current Value | Increase Effect | Decrease Effect |
|-------|--------------|-----------------|-----------------|
| WIN_SHARDS | 30 | Faster collection; less cosmetic spending | Slower collection; more frustration |
| LOSS_SHARDS | 10 | Reduced loss penalty; encourages play | Risk of grind-it-out mentality |
| DAILY_SHARDS | 25 | Rewards logging in; helps casual players | Less meaningful daily loop |

### Cost Levers

| Lever | Current Value | Increase Effect | Decrease Effect |
|-------|--------------|-----------------|-----------------|
| Basic pack cost | 50 | Slower card collection | Faster devaluation of shards |
| Premium pack cost | 150 | Premium feels more exclusive | Easier Epic access |
| Legendary pack cost | 400 | Legendary feels more earned | Faster Legendary acquisition |
| Theme costs | 0–180 | Cosmetics as short-term goals | Quick cosmetic completion |
| Border costs | 0–420 | Borders feel exclusive | Quick border completion |

### Breakdown Levers

| Lever | Current Value | Increase Effect | Decrease Effect |
|-------|--------------|-----------------|-----------------|
| Common breakdown | 5 | Excess commons have more value | Lower pack floor value |
| Rare breakdown | 10 | Better return on rare dupes | Rares feel less valuable |
| Epic breakdown | 25 | Easier targeted collection | Epic dupes feel mandatory to break |
| Legendary breakdown | 100 | High value for spares | Legendaries lose sacred feel |

---

## 8. Economy Health Metrics

### What to Monitor

| Metric | Healthy Range | Warning Sign |
|--------|--------------|--------------|
| Shards earned per session (3 games) | 60–170 | Below 40 = frustrating; above 250 = too generous |
| Shards earned per match (average) | 15–40 | Below 10 = not worth playing; above 55 = devalues currency |
| Packs opened per week (casual) | 8–16 | Below 5 = insufficient income |
| Days to first Basic pack | 0–1 (first or second session) | If >2 = early frustration |
| Days to first Epic | 2–5 | Above 10 = early frustration |
| Days to first Legendary | 5–14 | Above 21 = collection feels stalled |
| Collection % at 30 days (casual) | 25–50% | Below 15% = too slow; above 65% = nothing to chase |
| Duplicate rate at 50% collection | 20–40% | Above 60% = duplicate protection not working |
| Cosmetic purchase rate | 1 theme per 2–4 weeks | If never buying = prices too high |

### Balance Red Flags

🚩 **Investigate immediately** if any of these occur:
- A new player cannot build a competitive deck within their first week
- A daily player runs out of meaningful purchases within 4 months
- Card breakdown is more profitable than playing matches
- Any single pack type dominates all others in value (nobody buys the other types)
- Cosmetic prices are so high nobody buys them, or so low everybody has everything

---

## 9. Future Economy Features

Planned features that will need economy integration (validate against this document when implementing):

### From Monetization Plan

- **Starter Bundle** ($2.99) — one-time cosmetic + shard bonus
- **Seasonal Pass** ($4.99–$6.99) — extra cosmetic reward track
- **Cosmetic Shop** ($0.99–$7.99) — board skins, emote packs, victory flair

### Future Considerations

- **Crafting system** — targeted card creation from breakdown shards (higher cost than breakdown value to maintain pack incentive)
- **Season rewards** — end-of-season shard/pack bonuses based on final rating
- **Quest system** — daily/weekly challenges with specific shard rewards
- **Trading economy** — card trades between friends (already implemented; monitor for economy exploitation)
- **Expansion packs** — new pack types that guarantee cards from a specific expansion set
- **Catch-up packs** — discounted packs for older sets to help returning players; economy must be modeled before adding

### Expansion Economy Impact

When releasing a new expansion (see the full 5-year seasonal schedule in [`CARD_BALANCE_FRAMEWORK.md` §11](CARD_BALANCE_FRAMEWORK.md#11-five-year-seasonal-schedule-2026-2030)):

1. **Recalculate collection timelines** per the formula in Section 5
2. **Consider catch-up mechanics** — if rotated sets leave gaps in new player collections
3. **Model pack value shift** — adding cards to the pool dilutes guaranteed-rarity slots; verify Basic pack value doesn't drop below 40% return rate
4. **Season pass alignment** — if a seasonal pass exists, expansion timing should coincide with new pass seasons
5. **Update Section 5** — add new row to the Total Collection Size table with the expansion's cards
6. **Cosmetic pricing check** — verify new seasonal theme cost follows the escalation curve in §11 Cosmetic Pricing Progression

### Trading System Safeguards

The existing trade system (`server/db.js` — `trades` table) includes:
- Friends-only trading (prevents anonymous market exploitation)
- Trade expiry (7 days via `TRADE_TTL_DAYS`)
- Maximum 6 items per side (`MAX_TRADE_ITEMS_PER_SIDE`)
- Ownership validation on both sides

**Economy note:** Card trading does not create or destroy shards. It only redistributes cards. Monitor for:
- Trade inflation (rare cards becoming too easy to acquire through social networks)
- Alt-account funneling (sybil checks in account creation help prevent this)

---

## 10. Economy Change Procedure

When modifying any economy constant:

1. **Model the change** — calculate impact on weekly income, pack frequency, and collection timeline
2. **Check secondary effects** — does this affect cosmetic purchasing power? Pack type preferences?
3. **Validate against metrics** — will healthy ranges in Section 8 still hold?
4. **Update this document** — change the relevant tables and recalculate derived values
5. **Update the Game Design Bible** — if the change affects collectible pricing
6. **Test** — verify the change works in `server/db.js` and passes existing tests
7. **Monitor** — after deploy, watch economy health metrics for 1–2 weeks
