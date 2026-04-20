# Fractured Arcanum — Game Design Bible

> **Single source of truth** for all game content, mechanics, and design philosophy.
> Every new card, collectible, or economy change must be validated against this document before implementation.

---

## 1. Vision & Identity

### Core Fantasy

Fractured Arcanum is a **cosmic-horror lane-based card battler** set in a world where the boundary between reality and the void has shattered. Players are summoners who channel eldritch forces, commanding horrors, cultists, corrupted machines, and forgotten entities. These abominations are drawn from dimensions beyond mortal comprehension.

The game should feel like:
- **Dread made playable** — every card on the board is something that should not exist
- **A ritual, not a tournament** — matches are summoning duels, not polite card games
- **Uncomfortably alive** — the board, the cards, the UI all hint at something watching

### Thematic Pillars

| Pillar | Meaning | Design Implication |
|--------|---------|-------------------|
| **Cosmic Dread** | The unknowable is always present | Card text hints at vast forces beyond the battlefield; legendaries feel world-ending |
| **Forbidden Knowledge** | Power comes at a cost | Draw and card-advantage effects are thematically dangerous; knowledge = madness |
| **Corruption & Decay** | Nothing stays pure | Tribes like undead, demon, and nature reflect entropy; poison and drain are thematic staples |
| **Eldritch Machines** | Technology perverted by the void | Mech tribe represents brass husks and heretical forges, not clean sci-fi |
| **Fragile Mortality** | Heroes are vulnerable | 24 HP ceiling keeps games tense; healing is limited and flavored as unnatural |

### Tone Guidelines

- **Card names** use archaic, unsettling, or clinical language — not heroic fantasy
- **Flavor text** should evoke wrongness, ancient scale, or sensory dread — never comedy
- **Effect names** stay terse and evocative: Frostbite, Siphon, Silence, Deathrattle
- **No lighthearted naming** — a card is not "Funny Fire Guy" but "Ember Herald" or "Fire-Eater Cultist"
- **Legendaries** are named entities with titles suggesting cosmic scope: "the Fathomless", "the Carrion King", "the Starless Oracle"

---

## 2. Core Mechanics

### Battlefield

| Property | Value | Rationale |
|----------|-------|-----------|
| Lanes | 3 | Small enough for mobile, tactical enough for positioning |
| Board size constant | `BOARD_SIZE = 3` | Defined in `src/game.ts` line 74 |

### Resources

| Resource | Start | Growth | Cap | Purpose |
|----------|-------|--------|-----|---------|
| Health | 24 | None | 24 | Life total; reach 0 = lose |
| Mana | 1 | +1/turn | 10 | Pay card costs |
| Momentum | 0 | +1/turn | 10 | Fuel Momentum Burst (3 = 2 damage + draw) |

### Turn Structure

1. **Draw** — draw 1 card from deck
2. **Mana increment** — max mana +1 (cap 10), current mana refills to max
3. **Momentum increment** — +1 momentum (cap 10)
4. **Board reset** — all friendly units become ready (un-exhausted)
5. **Play phase** — play cards from hand, attack with ready units, use Momentum Burst
6. **End turn** — pass to opponent

### Win Conditions

- Reduce enemy hero health to 0 → **Victory**
- Both heroes reach 0 simultaneously → **Draw**
- Surrender → opponent wins by forfeit

### Mulligan

On game start, if no cards in the opening hand cost ≤ 1, the highest-cost card is swapped for a ≤ 1-cost card from the deck (if any exist).

---

## 3. Card Taxonomy

### Card Template Schema

Every card in `CARD_LIBRARY` (`src/game.ts`) uses this schema:

```
id:      kebab-case unique identifier
name:    display name (Lovecraftian tone)
cost:    mana cost (1–9)
attack:  base attack power
health:  base health points
icon:    emoji fallback (replaced by SVG in production)
text:    flavor/rules text
effect:  primary keyword (optional — vanilla units have none)
rarity:  common | rare | epic | legendary
tribe:   beast | elemental | undead | dragon | mech | arcane | warrior | nature | demon | none
```

### Rarity Tiers

| Rarity | Count | Deck Limit | Design Role |
|--------|-------|------------|-------------|
| Common (28) | 28 | 3 copies | Bread-and-butter units; simple effects; core of every deck |
| Rare (22) | 22 | 3 copies | Stronger effects, multi-keyword combos; archetype enablers |
| Epic (14) | 14 | 3 copies | Build-around power cards; complex multi-effect plays |
| Legendary (6) | 6 | 1 copy | Named world-ending horrors; game-swinging effects; unique identity |

### Deck Rules

| Rule | Value | Source |
|------|-------|--------|
| Minimum deck size | 10 cards | `MIN_DECK_SIZE` in game.ts |
| Maximum deck size | 16 cards | `MAX_DECK_SIZE` in game.ts |
| Max copies per card | 3 | `MAX_COPIES` in game.ts |
| Max legendary copies | 1 | `MAX_LEGENDARY_COPIES` in game.ts |

### Tribes (10)

| Tribe | Thematic Identity | Mechanical Identity |
|-------|-------------------|---------------------|
| **Beast** | Starving packs, parasites, things with too many limbs | Fury, Charge, Overwhelm — aggressive, snowballing |
| **Elemental** | Storms, dust, coral, magma — primal wrongness | Blast, Frostbite, Bolster — versatile, board control |
| **Undead** | Carrion things, shades, bone collectors | Deathrattle, Lifesteal, Siphon — attrition, value from death |
| **Dragon** | Leviathans, serpent-kin, fathomless wyrms | High stats, multi-keyword — late-game power |
| **Mech** | Brass husks, geared thralls, heretical forges | Guard, high health — defensive, resilient |
| **Arcane** | Seers, oracles, glyph scholars | Draw, Rally — card advantage, momentum generation |
| **Warrior** | Cultists, sentinels, zealots, archers | Empower, Rally, Poison — buff-oriented, synergy |
| **Nature** | Fungal treants, vine horrors, mycelial networks | Heal, Bolster, Guard — sustain, board-wide buffs |
| **Demon** | Tyrants, imps, abyssal things | Drain, Blast, Silence — disruption, enemy resource denial |
| **None** | Unaffiliated anomalies | Vanilla stats or unique one-off effects |

---

## 4. Keywords & Effects (21)

### Combat Keywords (Passive — active during combat)

| Keyword | Behavior | Balance Notes |
|---------|----------|---------------|
| **Charge** | Unit can attack immediately on summon | High tempo; reduce stats by ~1–2 total to compensate |
| **Guard** | Must be attacked before other targets | Defensive anchor; slight stat bonus allowed for low-attack guards |
| **Fury** | +1 attack after surviving combat with a unit or hero | Snowball threat; keep base attack moderate |
| **Lifesteal** | Heal hero for damage dealt | Sustain keyword; rare+ only; reduce attack to prevent unbeatable racing |
| **Enrage** | +2 attack when this unit takes damage | Reward for being attacked; pairs well with high health |
| **Overwhelm** | Excess damage from attacking a unit hits the enemy hero | Finisher keyword; keep on high-cost units |
| **Deathrattle** | Trigger effect on death (damage hero or damage all enemy units) | Value from death; defined in CARD_PARAMS |
| **Cleave** | Deal this unit's attack to all enemy units when attacking | Board clear on a body; very powerful; high cost required |

### On-Play Keywords (Trigger on summon)

| Keyword | Default Amount | Behavior |
|---------|---------------|----------|
| **Blast** | 2 | Deal N damage to enemy hero |
| **Heal** | 2 | Restore N health to your hero (cap 24) |
| **Draw** | 1 | Draw N cards from deck |
| **Rally** | 1 | Gain N Momentum (cap 10) |
| **Drain** | 1 | Steal N Momentum from the enemy |
| **Empower** | 1 | Grant +N attack to all friendly units on board |
| **Poison** | 1 | Deal N damage to all enemy units |
| **Shield** | 3 | Grant +N health to your hero (functions as armor) |
| **Siphon** | 2 | Deal N to enemy hero AND heal your hero for N |
| **Bolster** | 1 | Grant +N health to a random friendly unit (or all, via CARD_PARAMS) |
| **Frostbite** | — | Exhaust a random enemy unit (or all, via CARD_PARAMS) |
| **Silence** | — | Strip all effects and keywords from all enemy units |
| **Summon** | — | Create a token unit in an empty lane (spec in CARD_PARAMS) |

### Multi-Keyword Cards

Some cards have a primary `effect` keyword plus additional behaviors defined in `CARD_PARAMS.extras` or `CARD_PARAMS.grantsKeyword`. Examples:

- **Drakarion** (Legendary): Charge (primary) + Cleave (via extras)
- **Glacial Colossus** (Epic): Frostbite-all (primary + freezeAll) + Guard (via grantsKeyword)
- **Shadow Assassin** (Epic): Charge (primary) + Lifesteal (via grantsKeyword)

**Rule:** Multi-keyword cards must pay a heavier stat tax. The more keywords, the lower the raw stats relative to the vanilla baseline for that mana cost.

---

## 5. Tokens

Tokens are units created by Summon effects. They cannot exist in decks or hands.

| Token | Stats | Created By |
|-------|-------|------------|
| Spark | 1/1 | Default token (Arcane Artificer fallback) |
| Wisp | 1/1 | Arcane Artificer (Occult Artificer) |
| Ghoul | 2/2 | Necro-Sage (Charnel Sage) — fills all empty lanes |
| Wraith | 3/3 | Malachar, the Carrion King — fills all empty lanes |

**Design rule:** Tokens should be simple vanilla units. Do not give tokens keywords or complex effects.

---

## 6. AI System

### Difficulty Tiers

| Difficulty | Rating Range | Deck Quality | Behavior |
|------------|-------------|--------------|----------|
| Novice | < 1150 | 7 commons only | Plays cards by highest index; no burst strategy |
| Adept | 1150–1324 | 12 mixed cards | Standard play logic; occasional burst |
| Veteran | 1325–1499 | 12 cards with rares | Smarter targeting; uses burst when ahead |
| Legend | ≥ 1500 | 14 cards with epics | Full scoring AI; priority targeting; strategic burst |

### AI Deck Design Rules

- Novice decks: commons only, no keywords more complex than Guard
- Adept decks: mix of commons and a few rares, basic keywords
- Veteran decks: stronger rares, some synergy pairs
- Legend decks: epics included, coherent archetype (aggro or midrange)

---

## 7. Collectible Registry

All collectible items in the game. When adding new collectibles, register them here first.

### Cards (70 total — Core Set `SET-S1-CORE`)

Tracked in `CARD_LIBRARY` in `src/game.ts`. Full catalog maintained in [`docs/CARD_CATALOG.md`](CARD_CATALOG.md).

All current cards belong to the **Core Set** — these are permanent and never rotate out of Ranked play. Future expansion sets will be tracked here with their set tags. See [`docs/CARD_BALANCE_FRAMEWORK.md` §10](CARD_BALANCE_FRAMEWORK.md#10-seasonal-expansion--rotation-system) for rotation rules and the full **Five-Year Seasonal Schedule** (§11) for the complete expansion roadmap through 2030.

| Set | Tag | Cards | Status |
|-----|-----|-------|--------|
| Core | `SET-S1-CORE` | 70 | ✅ Permanent — never rotates |

#### Planned Expansion Sets (Year 1)

| Season | Set Tag | Expansion Name | Cards | New Keyword |
|--------|---------|---------------|-------|-------------|
| S2 2026 | `SET-S2-2026` | Rift of the Serpent Kings | 20 | Ambush |
| S3 2026 | `SET-S3-2026` | Tides of the Drowned | 22 | Corrode |
| S4 2026 | `SET-S4-2026` | Feast of the Hollow | 20 | — |

See [`CARD_BALANCE_FRAMEWORK.md` §11](CARD_BALANCE_FRAMEWORK.md#11-five-year-seasonal-schedule-2026-2030) for the complete 5-year schedule covering Years 1–5 (2026–2030), including all 20 expansion sets, 10 new keywords, 22 cosmetic themes, and rotation order.

### Cosmetic Themes

Tracked in `THEME_COSTS` in `server/db.js` and `THEME_OFFERS` in `src/constants.ts`.

| Theme | Cost (Runes) | Thematic Note |
|-------|-------------|---------------|
| Royal Arcane | 0 (default) | Regal arcane tournament finish |
| Ember Court | 120 | Warm volcanic glow — heretical forge flames |
| Moonwell Glow | 180 | Cool luminous highlights — abyssal moonlight |

**Future themes** (planned for seasonal expansion releases — see Seasonal Schedule in CARD_BALANCE_FRAMEWORK.md §10):

| Theme | Target Cost (Runes) | Target Season | Thematic Note |
|-------|-------------------|---------------|---------------|
| Crimson Sanctum | 200 | S2-2026 | Blood-ritual red — cultist chambers |
| Verdant Hollow | 220 | S3-2026 | Toxic growth green — fungal overgrowth |
| Azure Depths | 250 | S4-2026 | Deep-ocean blue — abyssal trenches |
| Golden Spire | 280 | S1-2027 | Forbidden gold — heretical temple |
| Void Eclipse | 350 | S2-2027 | Null purple — cosmic void |
| Frost Tomb | 300 | S3-2027 | Rime white — frozen catacomb |
| Ember Forge | 280 | S4-2027 | Forge orange — heretical machine-works |

### Card Borders

Tracked in `CARD_BORDERS` in `server/db.js`.

| Border | Cost (Runes) | Thematic Note |
|--------|-------------|---------------|
| Default | 0 | Standard brass frame |
| Bronze | 90 | Tarnished devotion |
| Frost | 180 | Rime-touched edge |
| Solar | 280 | Forbidden radiance |
| Void | 420 | Null-space trim |

### Card Packs

| Pack | Cost (Shards) | Contents | Thematic Note |
|------|--------------|----------|---------------|
| Basic | 50 | 3 Common + 1 Rare (upgrade chance) | Acolyte's offering |
| Premium | 150 | 3 Common + 1 Rare + 1 Epic guaranteed | Cultist's tithe |
| Legendary | 400 | 1 Common + 2 Rare + 1 Epic + 1 Legendary guaranteed | Elder rite |

### Ranked Tiers

| Tier | Rating Range | Thematic Name |
|------|-------------|---------------|
| Bronze | 1000–1149 | Acolyte |
| Silver | 1150–1324 | Initiate |
| Gold | 1325–1499 | Devoted |
| Champion | 1500+ | Herald of the Rift |

---

## 8. Adding New Content — Procedures

### Adding a New Card

1. **Design** — define card in this bible first (name, stats, tribe, keywords, rarity, flavor text, target set tag)
2. **Balance check** — validate against [`docs/CARD_BALANCE_FRAMEWORK.md`](CARD_BALANCE_FRAMEWORK.md) stat budget and keyword tax
3. **Audit checklist** — run the full 10-point balance audit from CARD_BALANCE_FRAMEWORK.md Section 7
4. **Redundancy check** — verify no existing card at the same cost/rarity/keyword is made obsolete (see Card Catalog redundancy analysis)
5. **Implement** — add to `CARD_LIBRARY` in `src/game.ts`
6. **Params** — if the card has non-default effect amounts or multi-keyword behavior, add to `CARD_PARAMS`
7. **Art** — add blueprint to `scripts/generate-brand-assets.mjs`, regenerate, verify manifest
8. **Test** — add test cases in `src/game.test.ts` for the new card's effect resolution
9. **Build** — run `npm run build:engine` then `npm run build`
10. **Economy check** — verify the card doesn't break pack value or collection progression math; recalculate timelines in [`docs/ECONOMY_BALANCE.md`](ECONOMY_BALANCE.md)
11. **Update docs** — update [`docs/CARD_CATALOG.md`](CARD_CATALOG.md) (add card entry + update distributions), this bible's collectible registry, and add a change log entry

### Adding a New Keyword

1. **Design** — define keyword behavior, default amount, balance cost (stat tax), and affected tribe affinities
2. **Add type** — extend `CardEffect` union in `src/game.ts`
3. **Implement resolver** — add case in `playCard()` or `attack()` in `src/game.ts`
4. **Default amount** — add to `DEFAULT_EFFECT_AMOUNT` if it uses an amount
5. **Update balance framework** — add to keyword tax table and tribe affinity matrix in [`docs/CARD_BALANCE_FRAMEWORK.md`](CARD_BALANCE_FRAMEWORK.md)
6. **Update docs** — add to this bible's keyword table (Section 4), CARD_CATALOG.md keyword distribution
7. **Test** — add comprehensive test cases
8. **Build** — run `npm run build:engine` then `npm run build`

### Adding a New Tribe

1. **Design** — define thematic and mechanical identity in this bible (Section 3)
2. **Add type** — extend `CardTribe` union in `src/game.ts`
3. **Update balance framework** — add tribe to affinity matrix with Primary/Secondary/Avoid keywords
4. **Art** — create tribe visual identity in asset pipeline
5. **Test** — verify existing logic handles the new tribe
6. **Update docs** — add to this bible's tribe table and CARD_BALANCE_FRAMEWORK.md tribe count table

### Adding a New Collectible Type

1. **Design** — define in this bible first with economy impact analysis
2. **Economy check** — validate against [`docs/ECONOMY_BALANCE.md`](ECONOMY_BALANCE.md)
3. **Implement** — server persistence in `server/db.js`, API in `server/server.js`, client display
4. **Update docs** — add to this bible's collectible registry

### Releasing a New Expansion

1. **Design phase** — use CARD_BALANCE_FRAMEWORK.md Section 10 expansion design checklist
2. **Assign set tag** — e.g., `SET-S2-2026` for Season 2, 2026
3. **Design all cards** — follow "Adding a New Card" procedure for each card
4. **Run expansion-level checks** — curve distribution, tribe fill, rarity ratios, archetype support
5. **Update economy** — recalculate collection completion timeline with expanded card pool
6. **Process any rotation** — follow CARD_BALANCE_FRAMEWORK.md rotation impact procedure for outgoing sets
7. **Update all docs** — add set to this bible's collectible registry, CARD_CATALOG.md (new section per set), economy calculations
8. **Full test** — `npm run release:check`

### Seasonal Balance Patch

1. **Identify problem cards** — review win rates, deck inclusion rates, community feedback
2. **Propose changes** — use CARD_BALANCE_FRAMEWORK.md threshold table (stat adjustment, effect change, rarity shift, or emergency ban)
3. **Validate** — run balance audit on each changed card
4. **Implement** — modify `CARD_LIBRARY` and/or `CARD_PARAMS` in `src/game.ts`
5. **Update CARD_CATALOG.md** — update card entry, add to Balance Change Log
6. **Build + test** — `npm run build:engine && npm run build && npm test`

---

## 9. Design Constraints

### What Fractured Arcanum Is NOT

- **Not a deck-stacking simulator** — no card should make a deck auto-win regardless of opponent's play
- **Not pay-to-win** — legendaries are unique and exciting, not strictly better than lower rarities
- **Not RNG-dependent** — randomness exists (draw order, bolster target, frostbite target) but should never be the sole deciding factor in a match
- **Not derivative** — all card names, mechanics, art, and lore are original; no copyrighted references

### Balance Invariants

These rules must hold true at all times:

1. **No card should have positive expected value at every point in the game** — aggro cards are weak late, control cards are dead early
2. **Guard must always be respected** — no effect bypasses guard except direct-damage spells (Blast, Siphon, Poison)
3. **Legendaries are limited to 1 copy per deck** — their power is offset by inconsistency
4. **Healing cannot exceed starting health** — 24 HP cap prevents stall strategies
5. **Momentum Burst costs exactly 3** — this is the pressure-relief valve for board stalls
6. **Mana caps at 10** — games must end; infinite scaling is not permitted
7. **All game functions are pure** — `(state, ...args) => newState` — never mutate

### Content Principles

- Every card must have a clear role in at least one deck archetype
- No card should be strictly better than another card of the same rarity and cost
- Tribe identity should be reinforced through keywords, not just flavor text
- New content should expand strategic options, not invalidate existing cards

---

## 10. Document Map

This game design bible is the root document. All other design docs extend from it:

| Document | Purpose | Location |
|----------|---------|----------|
| **Game Design Bible** (this file) | Master design document, single source of truth | `docs/GAME_DESIGN_BIBLE.md` |
| **Card Balance Framework** | Stat formulas, keyword budgets, balance audit process | [`docs/CARD_BALANCE_FRAMEWORK.md`](CARD_BALANCE_FRAMEWORK.md) |
| **Economy Balance** | Currency flow, pack math, collection progression | [`docs/ECONOMY_BALANCE.md`](ECONOMY_BALANCE.md) |
| **Card Catalog** | Complete card reference with balance notes | [`docs/CARD_CATALOG.md`](CARD_CATALOG.md) |
| **Monetization Plan** | Paid offerings, cosmetic pricing, fairness rules | [`docs/monetization-plan.md`](monetization-plan.md) |
| **Asset Pipeline** | SVG generation, art direction, quality gates | [`docs/asset-pipeline.md`](asset-pipeline.md) |
| **AAA Asset Pipeline** | AI-generated asset production workflow | [`docs/aaa-asset-pipeline.md`](aaa-asset-pipeline.md) |
| **Release Checklist** | Pre-deploy validation | [`docs/release-checklist.md`](release-checklist.md) |
