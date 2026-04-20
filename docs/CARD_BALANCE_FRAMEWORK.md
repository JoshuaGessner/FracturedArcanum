# Fractured Arcanum — Card Balance Framework

> **Stat formulas, keyword budgets, rarity power curves, and the balance audit process.**
> Consult this before designing or modifying any card. Implements the balance philosophy from the [Game Design Bible](GAME_DESIGN_BIBLE.md).

---

## 1. The Vanilla Baseline

The **vanilla test** is the foundation of all card balance. A card with no keywords or effects should follow this stat budget:

### Stat Budget Formula

```
Total Stats = (Mana Cost × 2) + 1
```

Where **Total Stats = Attack + Health**.

| Mana Cost | Vanilla Budget | Example Stat Lines |
|-----------|---------------|-------------------|
| 1 | 3 | 2/1, 1/2 |
| 2 | 5 | 3/2, 2/3 |
| 3 | 7 | 4/3, 3/4 |
| 4 | 9 | 5/4, 4/5 |
| 5 | 11 | 6/5, 5/6 |
| 6 | 13 | 7/6, 6/7 |
| 7 | 15 | 8/7, 7/8 |
| 8 | 17 | 9/8, 8/9 |
| 9 | 19 | 10/9, 9/10 |

### When to deviate

- **+1 stat point** is acceptable for vanilla units (no effect) at any rarity as a "no-keyword bonus"
- **−1 to −3 stat points** are used to pay for keywords (see keyword tax below)
- Legendary cards may exceed the baseline by +2 to +4 given their 1-copy deck limit, high mana cost (7–9), and role as game-ending threats. This is the **Legendary Allowance**.
- **Tribe exceptions** (documented in Section 5a) may permit a keyword from a tribe's "Avoid" list when there is strong thematic or gameplay justification

---

## 2. Keyword Tax

Every keyword costs stat points from the vanilla budget. This is the **keyword tax** — the stat reduction a card pays for having an effect.

### Combat Keyword Costs

| Keyword | Stat Tax | Rationale |
|---------|----------|-----------|
| **Charge** | −2 | Immediate board impact; the strongest tempo keyword |
| **Guard** | −1 | Defensive; opponent can choose attack order; slight tax |
| **Fury** | −1 | Conditional; only triggers on surviving combat |
| **Lifesteal** | −2 | Sustain is powerful; reduces opponent's damage advantage |
| **Enrage** | −1 | Conditional; only activates when damaged |
| **Overwhelm** | −1 | Only relevant when attacking units; dead vs heroes |
| **Deathrattle** | −1 to −2 | Depends on deathrattle payload (hero damage = −1, AoE = −2) |
| **Cleave** | −2 | Board-wide damage on a body; very powerful |

### On-Play Keyword Costs

| Keyword | Base Tax (per default amount) | Scaling |
|---------|-------------------------------|---------|
| **Blast** | −1 per 1 damage | Linear; 2 damage = −2 tax |
| **Heal** | −0.5 per 1 healing | Healing is weaker than damage |
| **Draw** | −1.5 per card | Card advantage is king |
| **Rally** | −0.5 per momentum | Momentum is medium value |
| **Drain** | −0.5 per momentum stolen | Swing effect but small value |
| **Empower** | −1 per +1 (scales with board) | Board-dependent; high ceiling |
| **Poison** | −1 per 1 damage (to all) | AoE is strong |
| **Shield** | −0.5 per 1 armor | Similar to heal |
| **Siphon** | −1 per 1 (damage+heal combo) | Combined value |
| **Bolster** | −0.5 per +1 health | Single target = low; all = −1 per +1 |
| **Frostbite** | −1.5 (single) / −3 (all) | Tempo denial; freeze-all is devastating |
| **Silence** | −2 (all enemies) | Strips all value; very powerful |
| **Summon** | −(token ATK + token HP) / 2 | Token value in stat points |

### Multi-Keyword Tax

When a card has multiple keywords (via `extras` or `grantsKeyword`):

```
Total Tax = Primary Keyword Tax + Secondary Keyword Tax + 1 (multi-keyword surcharge)
```

The **+1 surcharge** exists because keyword synergy is worth more than the sum of parts.

---

## 3. Rarity Power Curves

Each rarity tier has a target power envelope. Cards should fall within these ranges.

### Stat Efficiency by Rarity

| Rarity | Stat Efficiency vs Vanilla | Keyword Complexity | Design Goal |
|--------|---------------------------|-------------------|-------------|
| **Common** | 90–105% | 0–1 keywords, simple effects | Reliable workhorse cards; every deck wants some |
| **Rare** | 95–110% | 1 keyword, moderate effects | Archetype enablers; stronger but not game-winning alone |
| **Epic** | 100–115% | 1–2 keywords, complex combos | Build-around threats; reward smart deck construction |
| **Legendary** | 110–130% | 2–3 keywords, unique effects | Game-changers limited to 1 copy; justify high mana cost with massive impact |

### Efficiency Calculation

```
Stat Efficiency = (Actual ATK + Actual HP + Keyword Value) / Vanilla Budget × 100%
```

Where **Keyword Value** = keyword's estimated stat-point contribution (e.g., Charge on a 3-ATK unit ≈ 3 stat points of immediate impact).

### Rarity Design Rules

**Common:**
- Maximum of 1 keyword
- No multi-effect combos
- Stat line should feel "fair" — predictable, not swingy
- Effects should be easy to understand in one read

**Rare:**
- 1 keyword with possibly elevated amount (Draw 2, Blast 3)
- OR 1 keyword + 1 secondary effect via `CARD_PARAMS.extras`
- Some build-around potential but not deck-defining alone

**Epic:**
- 1–2 keywords, often with enhanced amounts
- Multi-effect combos (Blast + Draw, Charge + Lifesteal)
- Can define a game plan but should have clear counterplay
- `grantsKeyword` and `extras` are expected at this tier

**Legendary:**
- 2–3 keywords with powerful amounts
- Unique named entities; only 1 per deck
- Should feel game-changing when played but not auto-win
- High mana cost (7–9) means they require surviving to late game
- Must have clear vulnerability (silence, early aggro, etc.)

---

## 4. Mana Curve Design

A healthy card set ensures viable options at every mana cost to support diverse deck archetypes.

### Target Distribution

| Mana Cost | Ideal % of Set | Current Count (of 70) | Archetype Role |
|-----------|---------------|----------------------|----------------|
| 1 | 8–12% | 4 (5.7%) | Early drops, board presence |
| 2 | 14–18% | 8 (11.4%) | Curve plays, aggressive starts |
| 3 | 16–22% | 10 (14.3%) | Core midrange, effect units |
| 4 | 16–22% | 14 (20.0%) | Midgame power, rare effects |
| 5 | 12–16% | 14 (20.0%) | Late-midgame, build-around |
| 6 | 8–12% | 8 (11.4%) | Heavy hitters, multi-keyword |
| 7 | 4–8% | 4 (5.7%) | Epic/Legendary finishers |
| 8 | 2–5% | 4 (5.7%) | Legendary game-enders |
| 9 | 1–3% | 2 (2.9%) | Ultimate legendaries |

### Curve Notes

- The current set is slightly light on 1-cost drops (4 cards). Future expansions should add 2–3 more 1-drops to support aggressive archetypes
- The 4–5 cost range is well-populated, supporting a healthy midrange meta
- 7+ mana cards are appropriately rare, ensuring games don't stall waiting for finishers

---

## 5. Tribe Balance

Each tribe should have a distinct mechanical identity. No tribe should be strictly dominant across all archetypes.

### Tribe Keyword Affinity

| Tribe | Primary Keywords | Secondary Keywords | Avoid |
|-------|-----------------|-------------------|-------|
| Beast | Fury, Charge, Overwhelm | Deathrattle | Guard, Draw |
| Elemental | Blast, Frostbite, Bolster | Shield, Poison | Lifesteal |
| Undead | Deathrattle, Lifesteal, Siphon | Silence | Rally, Bolster |
| Dragon | Charge, Overwhelm, Draw | Cleave | Summon, Poison |
| Mech | Guard, Shield | Empower | Lifesteal, Siphon |
| Arcane | Draw, Rally, Summon | Silence | Fury, Overwhelm |
| Warrior | Empower, Rally, Poison | Charge, Enrage | Summon |
| Nature | Heal, Bolster, Guard | Shield | Drain, Siphon |
| Demon | Drain, Blast, Silence | Siphon | Heal, Bolster |

### Tribe Count Balance

Each tribe should have at least 5 cards in the library to support tribal synergies in future expansions. Current counts:

| Tribe | Count | Status |
|-------|-------|--------|
| Elemental | 16 | ✅ Healthy |
| Beast | 10 | ✅ Healthy |
| Arcane | 9 | ✅ Healthy |
| Undead | 8 | ✅ Healthy |
| Nature | 7 | ✅ Healthy |
| Warrior | 7 | ✅ Healthy |
| Mech | 6 | ✅ Healthy |
| Demon | 4 | ⚠️ Light — consider adding 1–2 more |
| Dragon | 3 | ⚠️ Light — consider adding 2–3 more in next expansion |
| None | 0 | N/A — not a tribal identity |

### 5a. Tribe Keyword Exceptions

The "Avoid" column in the affinity table is a guideline, not a hard block. Documented exceptions exist when there is strong thematic or gameplay justification. Every exception must be recorded here.

| Card | Tribe | Avoided Keyword | Justification |
|------|-------|-----------------|---------------|
| Carapace Wyrm (siege-turtle) | Beast | Guard | A giant ancient turtle is thematically a natural blocker; the 2/8 stat line reflects a massive defensive creature |
| Venomous Serpent-Kin (venom-drake) | Dragon | Poison | Serpent-kin are explicitly venomous in flavor; Poison fits the "corrosive wyrm" archetype within the cosmic horror setting |

**Rule:** No more than 1 exception per tribe per expansion set. If a tribe accumulates 3+ exceptions across all sets, the affinity table should be revisited and the secondary column updated.

---

## 6. Archetype Support

The card set should support at least these core deck archetypes:

### Core Archetypes

| Archetype | Strategy | Key Cards/Keywords | Mana Curve |
|-----------|----------|-------------------|------------|
| **Aggro** | Win fast with cheap Charge units and direct damage | Charge, Blast, Fury | Heavy 1–3, light 5+ |
| **Control** | Survive early, win with late-game power | Guard, Heal, Shield, Frostbite | Light 1–2, heavy 4–7 |
| **Midrange** | Efficient on-curve plays, board dominance | Empower, Rally, Bolster | Balanced 2–5 |
| **Tempo** | Gain advantage through efficient trades and momentum | Drain, Draw, Siphon | Balanced with momentum synergy |

### Preset Deck Validation

The four preset decks in `src/constants.ts` should each embody one archetype cleanly:
- **Balanced** → Midrange (current: `DEFAULT_DECK_CONFIG`)
- **Aggro** → Aggressive (current: low-cost Charge + Blast focus)
- **Control** → Defensive (current: Guard + Heal focus)
- **Tempo** → Momentum (current: Drain + Rally focus)

---

## 7. Balance Audit Process

### When to Audit

- Before any new card is added
- After any stat or effect change
- Before each release/patch
- When community feedback identifies problem cards

### Audit Checklist

For each card being audited:

- [ ] **Vanilla test:** Does `ATK + HP` fall within expected range for the mana cost?
- [ ] **Keyword tax:** Is the stat reduction appropriate for the keywords granted?
- [ ] **Rarity fit:** Does the card's complexity match its rarity tier?
- [ ] **Tribe fit:** Does the keyword assignment match the tribe's mechanical identity?
- [ ] **Archetype role:** Does the card serve a clear purpose in at least one deck archetype?
- [ ] **Counterplay:** Can the opponent reasonably answer this card? (Guard blocks Charge; Silence strips buffs; removal exists)
- [ ] **Strictly better check:** Is there another card at the same cost and rarity that is strictly worse?
- [ ] **Curve impact:** Does adding this card improve or harm mana curve distribution?
- [ ] **Economy impact:** Does this card's rarity and pack slot affect collection math?
- [ ] **Theme check:** Does the card name, flavor text, and tribe fit the Lovecraftian tone?

### Red Flags

Immediately re-evaluate any card that:
- Has more total stats than the vanilla baseline AND a powerful keyword
- Can deal more than 6 damage to face in a single turn from hand (excluding Momentum Burst combo)
- Has a keyword combination that prevents any counterplay (e.g., Charge + Lifesteal + high ATK at low cost)
- Makes a lower-rarity card with the same cost completely obsolete
- Creates infinite or near-infinite value loops when combined with other cards

---

## 8. Stat Audit — Current Card Library

### Outlier Analysis Methodology

For each card, calculate:
```
Expected Stats = (Cost × 2) + 1 - Keyword Tax
Actual Stats = ATK + HP
Delta = Actual Stats - Expected Stats
```

Cards with **Delta > +2** or **Delta < −2** should be flagged for review.

### Known Intentional Deviations

| Card | Delta | Reason |
|------|-------|--------|
| Copper Automaton (1-cost, 1/3, vanilla) | +1 | Intentional — vanilla bonus for no keyword; 1 ATK makes it non-threatening |
| Rust Golem (2-cost, 1/5, Guard) | +1 | Intentional — 1 ATK makes the extra health non-threatening offensively |
| Siege Turtle (5-cost, 2/8, Guard) | 0 | Health-skewed distribution is fine for Guard; beast tribe exception (Section 5a) |
| Crystal Golem (5-cost, 3/8, Guard) | +1 | Same as Siege Turtle pattern; slight rare bonus |
| Glacial Colossus (7-cost, 4/10, Frostbite-all + Guard) | 0 | Multi-keyword tax + freeze-all premium balances the health |
| Drakarion (8-cost, 8/8, Charge + Cleave) | +4 | **Legendary Allowance** — 1-copy limit, 8-mana cost, hard-countered by Guard walls |
| Zephyr (9-cost, 7/10, Frostbite-all + Guard + Blast 4) | +4 | **Legendary Allowance** — 9-mana finisher, triple-keyword justifies premium |
| Velara (8-cost, 5/9, Heal-full + Empower 2) | ~+1 | **Legendary Allowance** — late-game stabilizer; heal-to-full is the primary value |
| Malachar (8-cost, 6/7, Silence-all + Summon 3/3s) | varies | **Legendary Allowance** — board-reset effect is the real payload; stats below vanilla |
| Kronos (9-cost, 8/8, Empower 3 + Shield 5) | +3.5 | **Legendary Allowance** — 9-mana cost; team-wide buff requires existing board |
| Aethon (7-cost, 5/6, Draw 3 + Rally 3) | +3 | **Legendary Allowance** — pure value engine; 7-mana is late but not game-ending body |
| Blood Queen (6-cost, 5/5, Siphon 3 + Lifesteal) | +3 | **Epic Multi-Keyword** — intentional; Lifesteal only triggers in combat, requires surviving |
| Necro-Sage (5-cost, 3/5, Summon-all 2/2s) | −3 to +9 | Board-dependent — dead on full board, up to 12 extra stats on empty board; highly volatile |

---

## 9. Future Expansion Guidelines

When designing new cards for set expansions:

1. **Fill curve gaps first** — add 1-drops and underrepresented tribes before new mechanics
2. **Introduce 1 new keyword per expansion max** — too many keywords dilute strategic depth
3. **Maintain rarity ratios** — aim for 40% Common, 30% Rare, 20% Epic, 10% Legendary
4. **Add tribal payoffs gradually** — tribe synergy cards should appear at Rare+ only
5. **Test against existing presets** — new cards should not make preset decks obsolete
6. **Preserve the horror** — every new card must pass the Lovecraftian tone check
7. **Run the full audit** — every new card must pass the balance checklist in Section 7

---

## 10. Seasonal Expansion & Rotation System

Fractured Arcanum uses a seasonal expansion model to keep the meta fresh, introduce new content, and ensure long-term balance. This section governs how new cards enter the game and how older sets are managed.

### Set Identity

Every card belongs to a **set**, identified by a set tag. Sets are released seasonally.

| Field | Format | Example |
|-------|--------|---------|
| Set tag | `SET-{season}{year}` | `SET-S1-CORE` (Core set), `SET-S2-2026` (Season 2, 2026) |
| Season cadence | Quarterly (4 seasons per year) | S1 = Jan–Mar, S2 = Apr–Jun, S3 = Jul–Sep, S4 = Oct–Dec |

The current 70 cards all belong to the **Core Set** (`SET-S1-CORE`). Core set cards are never rotated out — they form the permanent foundation.

### Expansion Size Targets

| Rarity | Per Expansion | Rationale |
|--------|---------------|-----------|
| Common | 8–12 | Fill curve/tribe gaps; simple workhorse units |
| Rare | 6–8 | Archetype enablers; moderate complexity |
| Epic | 3–5 | Build-around threats; complex multi-keyword |
| Legendary | 1–2 | Named entities; unique game-changers |
| **Total** | **18–27** | Small enough to digest, large enough to shift the meta |

### Expansion Design Checklist

Before finalizing a new expansion, verify:

- [ ] **Curve gaps**: Does this expansion improve mana curve distribution toward ideals in Section 4?
- [ ] **Tribe gaps**: Does this expansion add cards to tribes with <5 members (Dragon, Demon)?
- [ ] **Rarity ratios**: Does the expansion maintain ~40/30/20/10 rarity split?
- [ ] **New keyword cap**: At most 1 new keyword introduced per expansion
- [ ] **Existing keyword support**: At least 2 cards using under-represented keywords (Enrage, Fury, Shield)
- [ ] **Archetype support**: Does this expansion enable at least 1 new deck archetype or strengthen a weak one?
- [ ] **No strictly-better additions**: No new card is strictly better than a same-cost, same-rarity existing card
- [ ] **Preset deck validity**: Preset decks still function without expansion cards
- [ ] **Economy impact**: Collection timeline in [ECONOMY_BALANCE.md](ECONOMY_BALANCE.md) recalculated with new total card count
- [ ] **Lovecraftian tone check**: Every card name, flavor text, and tribe fits the cosmic horror identity

### Rotation Rules

Rotation prevents the card pool from growing unbounded and keeps the meta dynamic.

| Rule | Detail |
|------|--------|
| **Core set is permanent** | The 70 cards in `SET-S1-CORE` never rotate out |
| **Expansion lifespan** | Each expansion set is legal for 4 seasons (1 year) after release |
| **Rotation timing** | At the start of each new expansion release, the oldest non-Core set rotates out |
| **Rotated cards remain owned** | Players keep rotated cards in their collection; they just cannot be used in Ranked play |
| **Casual mode** | All cards from all sets are always legal in AI and casual modes |
| **Rotation announcement** | Rotation schedule must be published at least 1 season (3 months) in advance |

### Rotation Impact Procedure

When a set rotates out:

1. **Identify affected preset decks** — update any preset that uses rotated cards
2. **Check archetype viability** — ensure at least one version of each core archetype (Aggro, Control, Midrange, Tempo) remains viable
3. **Update economy math** — recalculate collection completion timeline with the new legal card pool
4. **Update CARD_CATALOG.md** — mark rotated cards with `[ROTATED]` tag and their set of origin
5. **Update GAME_DESIGN_BIBLE.md** — adjust collectible registry counts
6. **Announce** — publish rotation guide with recommended deck substitutions

### Power Creep Prevention

The following invariants prevent long-term power creep across expansions:

| Invariant | Rule |
|-----------|------|
| **Stat ceiling** | No expansion card may exceed the Core set's vanilla budget by more than the Legendary Allowance (+4 stats) |
| **Keyword tax consistency** | Keyword tax values in Section 2 are global and do not change per expansion |
| **No free keywords** | Every keyword always has a non-zero stat cost; no expansion may introduce a 0-tax keyword |
| **Max keywords per card** | Commons: 1, Rares: 2, Epics: 3, Legendaries: 4 — never increases |
| **Backward compatibility** | New keywords must not invalidate existing keyword interactions (e.g., a new keyword that bypasses Guard) |
| **Deck size limits** | MIN_DECK_SIZE (10) and MAX_DECK_SIZE (16) do not change between expansions |

### Balancing Existing Cards Across Seasons

When seasonal data reveals that a card is over- or under-performing:

| Action | Threshold | Process |
|--------|-----------|---------|
| **Stat adjustment** | Win rate in decks containing this card is >58% or <42% over 2+ weeks | Adjust ATK or HP by ±1; update CARD_CATALOG.md; run full build + test |
| **Effect amount change** | Card appears in >70% of all Ranked decks at its cost tier | Adjust keyword amount in CARD_PARAMS; update CARD_CATALOG.md |
| **Rarity promotion/demotion** | Card's complexity no longer matches its tier after meta shifts | Move rarity in CARD_LIBRARY; update economy calculations |
| **Emergency ban** | Card enables a 0-counterplay combo discovered post-release | Remove from Ranked play immediately; schedule fix in next patch |

**Documentation requirement:** Every balance change must update CARD_CATALOG.md with a changelog entry and the season it was applied.
