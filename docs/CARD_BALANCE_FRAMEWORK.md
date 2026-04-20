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
- Legendary cards may exceed the baseline by +1 to +2 given their 1-copy deck limit and high cost

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
| Copper Automaton (1-cost, 1/3, vanilla) | +1 | Intentional — vanilla bonus for no keyword |
| Siege Turtle (5-cost, 2/8, Guard) | 0 | Health-skewed distribution is fine for Guard |
| Crystal Golem (5-cost, 3/8, Guard) | 0 | Same as Siege Turtle pattern |
| Glacial Colossus (7-cost, 4/10, Frostbite-all + Guard) | −1 | Multi-keyword tax applied; the freeze-all justifies stat loss |
| All Legendaries | +1 to +3 | Intentional — 1-copy limit and high cost justify premium stats |

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
