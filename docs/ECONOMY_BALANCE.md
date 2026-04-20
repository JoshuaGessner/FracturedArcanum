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

## 2. Currency — Runes (Shards)

The game uses a single soft currency called **Runes** (referred to as "shards" in the codebase and "Runestones" in the monetization plan — these should be unified to **Runes** across all documentation).

### Earning Rates

| Source | Amount | Frequency | Weekly Potential |
|--------|--------|-----------|-----------------|
| Match win | 30 runes | Per win | 210 (1 win/day) to 630+ (3 wins/day) |
| Match loss | 10 runes | Per loss | Variable |
| Daily reward | 50 runes | Once per day | 350 |
| Card breakdown (Common) | 5 runes | Per copy | Variable |
| Card breakdown (Rare) | 10 runes | Per copy | Variable |
| Card breakdown (Epic) | 25 runes | Per copy | Variable |
| Card breakdown (Legendary) | 100 runes | Per copy | Variable |

**Source constants:** `server/db.js` — `WIN_RUNES = 30`, `LOSS_RUNES = 10`, `DAILY_RUNES = 50`
**Breakdown values:** `server/db.js` — `RARITY_BREAKDOWN_VALUE` map

### Weekly Income Model

For a player who plays 3 matches per day (50% win rate):

```
Daily match income:  (1.5 wins × 30) + (1.5 losses × 10) = 45 + 15 = 60 runes
Daily reward:        50 runes
Daily total:         110 runes
Weekly total:        770 runes
```

For a dedicated player (5 matches/day, 60% win rate):

```
Daily match income:  (3 wins × 30) + (2 losses × 10) = 90 + 20 = 110 runes
Daily reward:        50 runes
Daily total:         160 runes
Weekly total:        1,120 runes
```

---

## 3. Spending — Where Runes Go

### Card Packs

| Pack | Cost | Guaranteed Contents | Upgrade Chance |
|------|------|-------------------|----------------|
| Basic | 50 runes | 3 Common + 1 Rare | Each slot can upgrade by rarity |
| Premium | 150 runes | 3 Common + 1 Rare + 1 Epic | Each slot can upgrade |
| Legendary | 400 runes | 1 Common + 2 Rare + 1 Epic + 1 Legendary | Each slot can upgrade |

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
| Crimson Sanctum | 150 runes |
| Verdant Hollow | 200 runes |
| Azure Depths | 250 runes |
| Golden Spire | 300 runes |
| Ember Forge | 300 runes |
| Frost Tomb | 350 runes |
| Void Eclipse | 400 runes |

### Card Borders

| Border | Cost |
|--------|------|
| Bronze | 90 runes |
| Frost | 180 runes |
| Solar | 280 runes |
| Void | 420 runes |

---

## 4. Pack Value Analysis

### Expected Value per Pack

**Basic Pack (50 runes):**
- 3 Common (guaranteed): 3 × 5 = 15 runes breakdown value
- 1 Rare (guaranteed): 1 × 10 = 10 runes breakdown value
- Base breakdown value: 25 runes (50% return if all duplicates)
- New-card value: significantly higher for incomplete collections

**Premium Pack (150 runes):**
- 3 Common: 15 runes
- 1 Rare: 10 runes
- 1 Epic (guaranteed): 25 runes
- Base breakdown value: 50 runes (33% return)
- Premium over basic: guaranteed Epic access

**Legendary Pack (400 runes):**
- 1 Common: 5 runes
- 2 Rare: 20 runes
- 1 Epic: 25 runes
- 1 Legendary (guaranteed): 100 runes
- Base breakdown value: 150 runes (37.5% return)
- Premium: guaranteed Legendary card

### Pack Purchase Frequency

| Pack | Cost | Casual Player (770/week) | Dedicated Player (1,120/week) |
|------|------|--------------------------|-------------------------------|
| Basic | 50 | ~15 per week | ~22 per week |
| Premium | 150 | ~5 per week | ~7 per week |
| Legendary | 400 | ~1.9 per week | ~2.8 per week |

**Recommendation:** Players should be able to afford at least 1 Legendary pack per week through normal play. Current rates support this for both casual and dedicated players.

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
- **Core-only:** 4–6 months (current)
- **Core + 1 expansion:** 5–8 months
- **Core + 2 expansions:** 7–10 months

If the timeline exceeds 10 months for a dedicated player, increase earning rates or reduce expansion size.

### Rotation and Collection

When a set rotates out of Ranked:
- Players keep all cards from the rotated set (available in casual/AI modes)
- The "active collection" shrinks, making it easier for new players to be competitive
- Pack contents should shift to only include legal-set cards (preventing frustration of pulling rotated cards)

### Starter Collection

New players receive a starter collection via `buildStarterCollection()` in `server/db.js`. This provides a baseline set of common cards to build an initial deck.

### Collection Completion Timeline

**Casual player model** (770 runes/week, buying Basic packs):
- Basic packs per week: ~15
- Cards per pack: 4
- Cards per week: ~60
- Assuming ~30% new cards early, ~5% new cards late
- Estimated time to collect all commons: ~4–6 weeks
- Estimated time to collect all rares: ~8–12 weeks
- Estimated time to collect all epics: ~16–24 weeks
- Estimated full collection: ~24–36 weeks

**Dedicated player model** (1,120 runes/week, mix of packs):
- Estimated full collection: ~16–24 weeks

**Target:** A dedicated free player should be able to collect the full set within 4–6 months. This is competitive with similar F2P card games.

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
| WIN_RUNES | 30 | Faster collection; less cosmetic spending | Slower collection; more frustration |
| LOSS_RUNES | 10 | Reduced loss penalty; encourages play | Risk of grind-it-out mentality |
| DAILY_RUNES | 50 | Rewards logging in; helps casual players | Less meaningful daily loop |

### Cost Levers

| Lever | Current Value | Increase Effect | Decrease Effect |
|-------|--------------|-----------------|-----------------|
| Basic pack cost | 50 | Slower card collection | Faster devaluation of runes |
| Premium pack cost | 150 | Premium feels more exclusive | Easier Epic access |
| Legendary pack cost | 400 | Legendary feels more earned | Faster Legendary acquisition |
| Theme costs | 150–400 | Cosmetics as long-term goals | Quick cosmetic completion |
| Border costs | 90–420 | Borders feel exclusive | Quick border completion |

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
| Runes earned per session | 50–150 | Below 30 = frustrating; above 200 = too generous |
| Packs opened per week (casual) | 8–20 | Below 5 = insufficient income |
| Days to first Epic | 3–7 | Above 14 = early frustration |
| Days to first Legendary | 7–21 | Above 30 = collection feels stalled |
| Collection % at 30 days | 40–60% | Below 30% = too slow; above 80% = nothing to chase |
| Duplicate rate at 50% collection | 20–40% | Above 60% = duplicate protection not working |
| Cosmetic purchase rate | 1 theme per 2–4 weeks | If never buying = prices too high |

### Balance Red Flags

🚩 **Investigate immediately** if any of these occur:
- A new player cannot build a competitive deck within their first week
- A daily player runs out of meaningful purchases within 2 months
- Card breakdown is more profitable than playing matches
- Any single pack type dominates all others in value (nobody buys the other types)
- Cosmetic prices are so high nobody buys them, or so low everybody has everything

---

## 9. Future Economy Features

Planned features that will need economy integration (validate against this document when implementing):

### From Monetization Plan

- **Starter Bundle** ($2.99) — one-time cosmetic + rune bonus
- **Seasonal Pass** ($4.99–$6.99) — extra cosmetic reward track
- **Cosmetic Shop** ($0.99–$7.99) — board skins, emote packs, victory flair

### Future Considerations

- **Crafting system** — targeted card creation from breakdown runes (higher cost than breakdown value to maintain pack incentive)
- **Season rewards** — end-of-season rune/pack bonuses based on final rating
- **Quest system** — daily/weekly challenges with specific rune rewards
- **Trading economy** — card trades between friends (already implemented; monitor for economy exploitation)
- **Expansion packs** — new pack types that guarantee cards from a specific expansion set
- **Catch-up packs** — discounted packs for older sets to help returning players; economy must be modeled before adding

### Expansion Economy Impact

When releasing a new expansion:

1. **Recalculate collection timelines** per the formula in Section 5
2. **Consider catch-up mechanics** — if rotated sets leave gaps in new player collections
3. **Model pack value shift** — adding cards to the pool dilutes guaranteed-rarity slots; verify Basic pack value doesn't drop below 40% return rate
4. **Season pass alignment** — if a seasonal pass exists, expansion timing should coincide with new pass seasons
5. **Update Section 5** — add new row to the Total Collection Size table with the expansion's cards

### Trading System Safeguards

The existing trade system (`server/db.js` — `trades` table) includes:
- Friends-only trading (prevents anonymous market exploitation)
- Trade expiry (7 days via `TRADE_TTL_DAYS`)
- Maximum 6 items per side (`MAX_TRADE_ITEMS_PER_SIDE`)
- Ownership validation on both sides

**Economy note:** Card trading does not create or destroy runes. It only redistributes cards. Monitor for:
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
