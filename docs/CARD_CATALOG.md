# Fractured Arcanum — Card Catalog

> **Complete card reference for every card in the game.**
> Organized by rarity, with stats, effects, balance notes, and tribe synergies.
> Source of truth: `CARD_LIBRARY` and `CARD_PARAMS` in `src/game.ts`.
> Balance methodology: [`docs/CARD_BALANCE_FRAMEWORK.md`](CARD_BALANCE_FRAMEWORK.md).
> Rotation rules: [`docs/CARD_BALANCE_FRAMEWORK.md` §10](CARD_BALANCE_FRAMEWORK.md#10-seasonal-expansion--rotation-system).

---

## Current Set: Core (`SET-S1-CORE`)

All 70 cards below belong to the **Core Set**. Core set cards are permanent — they never rotate out of Ranked play.

---

## Balance Legend

| Column | Meaning |
|--------|---------|
| **Cost** | Mana cost to play |
| **ATK/HP** | Attack / Health |
| **Stats** | ATK + HP total |
| **Budget** | Expected vanilla stats at this cost = (Cost × 2) + 1 |
| **Delta** | Stats − Budget + Keyword Tax adjustment. Positive = above curve; Negative = below curve |
| **Effect** | Primary keyword from `effect` field |
| **Extras** | Additional effects from `CARD_PARAMS` |

---

## Common Cards (28)

| # | ID | Name | Cost | ATK/HP | Stats | Budget | Effect | Extras | Tribe | Delta | Notes |
|---|-----|------|------|--------|-------|--------|--------|--------|-------|-------|-------|
| 1 | spark-imp | Crawling Spark | 1 | 2/1 | 3 | 3 | — | — | Elemental | 0 | Vanilla; fair 1-drop |
| 2 | tide-caller | Abyssal Caller | 1 | 1/2 | 3 | 3 | Bolster | — | Elemental | +0.5 | Bolster tax is light (−0.5) |
| 3 | cave-bat | Cavern Fluke | 1 | 1/1 | 2 | 3 | Charge | — | Beast | 0 | Charge −2 tax; 1-cost gets slight pass |
| 4 | copper-automaton | Brass Husk | 1 | 1/3 | 4 | 3 | — | — | Mech | +1 | Vanilla bonus; high health wall |
| 5 | shade-fox | Pallid Fox | 2 | 2/2 | 4 | 5 | Fury | — | Beast | 0 | Fury −1 tax applied |
| 6 | ironbark-guard | Bone Fence Sentinel | 2 | 1/4 | 5 | 5 | Guard | — | Nature | +1 | Guard −1 tax; +1 for low ATK guard |
| 7 | dawn-healer | Pallid Mender | 2 | 1/3 | 4 | 5 | Heal 2 | — | Arcane | 0 | Heal −1 tax |
| 8 | blaze-runner | Ember Herald | 2 | 3/1 | 4 | 5 | Charge | — | Elemental | +1 | Charge −2 tax; glass cannon |
| 9 | void-leech | Thought-Leech | 2 | 2/2 | 4 | 5 | Drain 1 | — | Demon | +0.5 | Drain −0.5 tax |
| 10 | bog-lurker | Marsh Lurker | 2 | 2/3 | 5 | 5 | — | — | Beast | 0 | Vanilla 2-drop; solid |
| 11 | militia-recruit | Cult Acolyte | 2 | 2/2 | 4 | 5 | Rally 1 | — | Warrior | +0.5 | Rally −0.5 tax |
| 12 | rust-golem | Corroded Husk | 2 | 1/5 | 6 | 5 | Guard | — | Mech | +2 | Slightly hot; 1 ATK compensates |
| 13 | rune-scholar | Glyph Scholar | 3 | 2/3 | 5 | 7 | Rally 1 | — | Arcane | −1.5 | Slightly under; could be 2/4 |
| 14 | sky-raider | Wind-Stalker | 3 | 3/2 | 5 | 7 | Charge | — | Warrior | 0 | Charge −2 tax |
| 15 | thornback-boar | Bristle Beast | 3 | 3/3 | 6 | 7 | Fury | — | Beast | 0 | Fury −1 tax |
| 16 | wind-sprite | Mist Wraith | 3 | 2/2 | 4 | 7 | Draw 1 | — | Nature | −1.5 | Draw −1.5 tax |
| 17 | granite-sentinel | Obelisk Sentinel | 3 | 2/4 | 6 | 7 | Guard | — | Elemental | 0 | Guard −1 tax |
| 18 | fire-imp | Ember Imp | 3 | 3/2 | 5 | 7 | Blast 1 | — | Demon | −1 | Blast 1 = −1 tax |
| 19 | field-medic | Battle Mender | 3 | 2/3 | 5 | 7 | Heal 3 | — | Warrior | +0.5 | Heal 3 = −1.5 tax |
| 20 | sand-elemental | Dust Horror | 4 | 3/4 | 7 | 9 | Bolster 1 | — | Elemental | −1.5 | Slightly under curve |
| 21 | pack-wolf | Starving Pack | 4 | 4/3 | 7 | 9 | Empower 1 | — | Beast | −1 | Empower −1 tax |
| 22 | clockwork-knight | Geared Thrall | 4 | 4/5 | 9 | 9 | — | — | Mech | 0 | Vanilla 4-drop; on curve |
| 23 | storm-brute | Thunderous Colossus | 5 | 5/6 | 11 | 11 | — | — | Elemental | 0 | Vanilla 5-drop; on curve |
| 24 | siege-turtle | Carapace Wyrm | 5 | 2/8 | 10 | 11 | Guard | — | Beast | 0 | Guard −1 tax; health-skewed |
| 25 | flame-juggler | Fire-Eater Cultist | 4 | 3/4 | 7 | 9 | Blast 1 | — | Elemental | +1 | Blast 1 = −1 tax; differentiated from rare Ashen Witch (Blast 2) |
| 26 | highland-archer | Barrow Archer | 3 | 3/2 | 5 | 7 | Poison 1 | — | Warrior | −1 | Poison −1 tax |
| 27 | moss-treant | Fungal Treant | 5 | 4/5 | 9 | 11 | Heal 2 | — | Nature | −1 | Heal −1 tax |
| 28 | coral-guardian | Coral Bastion | 4 | 2/5 | 7 | 9 | Shield 2 | — | Nature | −1 | Shield 2 = −1 tax |

---

## Rare Cards (22)

| # | ID | Name | Cost | ATK/HP | Stats | Budget | Effect | Extras | Tribe | Delta | Notes |
|---|-----|------|------|--------|-------|--------|--------|--------|-------|-------|-------|
| 1 | moonwell-sage | Pale Moon Seer | 4 | 2/4 | 6 | 9 | Draw 1 | — | Arcane | −1.5 | Draw −1.5 tax |
| 2 | ember-witch | Ashen Witch | 4 | 3/4 | 7 | 9 | Blast 2 | — | Arcane | 0 | Blast 2 = −2 tax |
| 3 | venom-drake | Venomous Serpent-Kin | 3 | 2/4 | 6 | 7 | Poison 1 | — | Dragon | 0 | Poison −1 tax |
| 4 | warcry-sentinel | Ululating Sentinel | 3 | 2/3 | 5 | 7 | Empower 1 | — | Warrior | −1 | Empower −1 tax |
| 5 | aegis-knight | Ward-Knight | 4 | 3/5 | 8 | 9 | Shield 3 | — | Warrior | +0.5 | Shield 3 = −1.5 tax |
| 6 | soul-reaver | Soul Harvester | 4 | 4/3 | 7 | 9 | Siphon 2 | — | Undead | 0 | Siphon −2 tax |
| 7 | crystal-golem | Geode Colossus | 5 | 3/8 | 11 | 11 | Guard | — | Elemental | +1 | Guard −1 tax; rare bonus |
| 8 | runebound-oracle | Hollow Oracle | 3 | 1/4 | 5 | 7 | Draw 2 | — | Arcane | −1 | Draw 2 = −3 tax; low ATK |
| 9 | frost-weaver | Rime Weaver | 3 | 2/3 | 5 | 7 | Frostbite | — | Elemental | +0.5 | Frostbite −1.5 tax |
| 10 | crimson-berserker | Blood-Maddened Zealot | 4 | 5/3 | 8 | 9 | Enrage | — | Warrior | 0 | Enrage −1 tax |
| 11 | ghost-knight | Shade Knight | 3 | 3/3 | 6 | 7 | Deathrattle | DR: 2 hero dmg | Undead | 0 | DR −1 tax |
| 12 | war-mammoth | Chitinous Behemoth | 5 | 5/5 | 10 | 11 | Overwhelm | — | Beast | 0 | Overwhelm −1 tax |
| 13 | thunder-hawk | Storm Carrion | 3 | 4/2 | 6 | 7 | Cleave | Charge (via params) | Beast | −1 | Cleave −2 + Charge −2 + multi = −5; stats are generous — flagged |
| 14 | hex-spider | Weaver of Ill Omen | 2 | 2/3 | 5 | 5 | Poison 1 | — | Beast | +1 | Poison −1 tax; slight over |
| 15 | iron-clad | Iron-Clad Devotee | 5 | 4/6 | 10 | 11 | Guard | Shield 2 | Mech | 0 | Guard −1 + Shield −1 + multi −1 = −3 |
| 16 | shadow-dancer | Umbral Dancer | 4 | 4/3 | 7 | 9 | Lifesteal | — | Undead | 0 | Lifesteal −2 tax |
| 17 | arcane-artificer | Occult Artificer | 3 | 2/4 | 6 | 7 | Summon | 1/1 Wisp | Arcane | 0 | Summon 1/1 = −1 tax |
| 18 | vine-lasher | Vine Horror | 4 | 3/4 | 7 | 9 | Poison 2 | — | Nature | 0 | Poison 2 = −2 tax |
| 19 | storm-shaman | Tempest Cultist | 5 | 3/5 | 8 | 11 | Blast 3 | — | Elemental | 0 | Blast 3 = −3 tax |
| 20 | bone-collector | Ossuary Collector | 4 | 3/4 | 7 | 9 | Drain 2 | — | Undead | −1 | Drain 2 = −1 tax |
| 21 | lava-hound | Magma Hound | 5 | 4/5 | 9 | 11 | Deathrattle | DR: 3 AoE | Elemental | 0 | DR AoE −2 tax |
| 22 | bronze-drake | Brazen Wyrm | 4 | 4/4 | 8 | 9 | Draw 1 | — | Dragon | +0.5 | Draw −1.5 tax; slight over |

---

## Epic Cards (14)

| # | ID | Name | Cost | ATK/HP | Stats | Budget | Effect | Extras | Tribe | Delta | Notes |
|---|-----|------|------|--------|-------|--------|--------|--------|-------|-------|-------|
| 1 | nether-witch | Void Witch | 5 | 4/5 | 9 | 11 | Blast 2 | Draw 1 | Arcane | 0 | Blast −2 + Draw −1.5 + multi −1 |
| 2 | sunforged-giant | Hollow-Sun Giant | 6 | 6/7 | 13 | 13 | — | — | Elemental | 0 | Vanilla epic; stat stick |
| 3 | abyssal-tyrant | Deep Tyrant | 6 | 5/6 | 11 | 13 | Silence | Blast 2 | Demon | 0 | Silence −2 + Blast −2 + multi −1 |
| 4 | phoenix-ascendant | Ashborn Reborn | 6 | 5/5 | 10 | 13 | Charge | DR: 3 hero | Elemental | −1 | Charge −2 + DR −1 + multi −1 |
| 5 | glacial-colossus | Rimebound Colossus | 7 | 4/10 | 14 | 15 | Frostbite-all | Guard | Elemental | 0 | FrostAll −3 + Guard −1 + multi −1 |
| 6 | blood-queen | Crimson Matron | 6 | 5/5 | 10 | 13 | Siphon 3 | Lifesteal | Undead | 0 | Siphon −3 + Lifesteal −2 + multi −1 |
| 7 | iron-juggernaut | Iron Juggernaut | 7 | 7/7 | 14 | 15 | Overwhelm | — | Mech | 0 | Overwhelm −1 tax |
| 8 | ancient-hydra | Many-Mawed Horror | 6 | 4/6 | 10 | 13 | Cleave | Fury | Beast | 0 | Cleave −2 + Fury −1 + multi −1 |
| 9 | void-empress | Starless Queen | 6 | 4/5 | 9 | 13 | Empower 2 | — | Demon | −2 | Empower 2 = −2 tax; board-dependent |
| 10 | storm-titan | Storm Herald | 7 | 6/6 | 12 | 15 | Blast 3 | Draw 1 | Elemental | −0.5 | Blast −3 + Draw −1.5 + multi −1 |
| 11 | necro-sage | Charnel Sage | 5 | 3/5 | 8 | 11 | Summon-all | 2/2 Ghouls (×3 max) | Undead | varies | Up to 12 stats in tokens; very strong on empty board |
| 12 | druid-elder | Verdant Elder | 5 | 3/6 | 9 | 11 | Heal 4 | Bolster-all | Nature | 0 | Heal −2 + Bolster-all −1 + multi −1 |
| 13 | shadow-assassin | Whispering Assassin | 5 | 5/3 | 8 | 11 | Charge | Lifesteal | Undead | +2 | Charge −2 + Lifesteal −2 + multi −1; within epic range |
| 14 | arcane-golem | Runic Husk | 6 | 5/5 | 10 | 13 | Rally 3 | Draw 1 | Arcane | 0 | Rally −1.5 + Draw −1.5 + multi −1 |

---

## Legendary Cards (6)

| # | ID | Name | Cost | ATK/HP | Stats | Budget | Effect | Extras | Tribe | Delta | Notes |
|---|-----|------|------|--------|-------|--------|--------|--------|-------|-------|-------|
| 1 | drakarion-the-eternal | Drakarion, the Fathomless | 8 | 8/8 | 16 | 17 | Charge | Cleave | Dragon | +4 | Charge −2 + Cleave −2 + multi −1 = −5 tax; Legendary Allowance |
| 2 | zephyr-world-breaker | Zephyr, the Whispering Gale | 9 | 7/10 | 17 | 19 | Frostbite-all | Guard, Blast 4 | Elemental | +4 | Triple keyword; Legendary Allowance; 9-cost finisher |
| 3 | velara-the-lifebinder | Velara, the Mycelial | 8 | 5/9 | 14 | 17 | Heal-to-full | Empower 2 | Nature | +1 | Heal-full + Empower 2 + multi; Legendary Allowance; late-game stabilizer |
| 4 | malachar-the-undying | Malachar, the Carrion King | 8 | 6/7 | 13 | 17 | Silence-all | Summon-all 3/3 Wraiths | Undead | varies | Legendary Allowance; body is under vanilla but token payload is massive |
| 5 | kronos-the-forgemaster | Kronos, the Ironclad Heretic | 9 | 8/8 | 16 | 19 | Empower 3 | Shield 5 | Mech | +3.5 | Empower −3 + Shield −2.5 + multi −1; Legendary Allowance |
| 6 | aethon-runekeeper | Aethon, the Starless Oracle | 7 | 5/6 | 11 | 15 | Draw 3 | Rally 3 | Arcane | +3 | Draw −4.5 + Rally −1.5 + multi −1; Legendary Allowance; pure value engine |

---

## Tokens

| ID | Name | ATK/HP | Created By | Notes |
|----|------|--------|------------|-------|
| token-spark | Spark | 1/1 | Default fallback | Standard token |
| token-wisp | Wisp | 1/1 | Occult Artificer | Identical to Spark; different flavor |
| token-ghoul | Ghoul | 2/2 | Charnel Sage | Fills all empty lanes |
| token-wraith | Wraith | 3/3 | Malachar, the Carrion King | Fills all empty lanes; powerful |

---

## Flagged Cards for Future Review

| Card | Issue | Severity | Status |
|------|-------|----------|--------|
| Thunder Hawk (storm-carrion) | Charge + Cleave at 3 mana is aggressive; 4/2 stats with two major keywords | Medium | Monitor win rates; may need cost increase to 4 |
| Rust Golem (corroded-husk) | 1/5 with Guard at 2-cost is +1 over budget | Low | Accepted — 1 ATK is nearly irrelevant offensively (documented deviation) |
| Necro-Sage (charnel-sage) | Summon-all 2/2s on an empty board is up to 12 stats of tokens for 5 mana | Medium | Board-dependent; dead on a full board; monitor |
| Blood Queen (crimson-matron) | Siphon 3 + Lifesteal at 6-cost; +3 over keyword tax budget | Medium | Accepted — Lifesteal requires surviving combat; documented as Epic Multi-Keyword exception |
| ~~Storm Brute (thunderous-colossus)~~ | ~~5/4 vanilla for 5 mana was under curve~~ | ~~Low~~ | ✅ **Fixed** — buffed to 5/6 (Season 1 patch) |
| ~~Clockwork Knight (geared-thrall)~~ | ~~4/4 vanilla for 4 mana was 1 under budget~~ | ~~Low~~ | ✅ **Fixed** — buffed to 4/5 (Season 1 patch) |
| ~~Shadow Assassin (whispering-assassin)~~ | ~~6/3 with Charge + Lifesteal was +3 over budget~~ | ~~Medium~~ | ✅ **Fixed** — nerfed to 5/3 (Season 1 patch) |
| ~~Flame Juggler (fire-eater-cultist)~~ | ~~Blast 2 at common was redundant with rare Ashen Witch~~ | ~~Low~~ | ✅ **Fixed** — reduced to Blast 1, stats buffed to 3/4 (Season 1 patch) |

---

## Tribe Distribution Summary

| Tribe | Common | Rare | Epic | Legendary | Total |
|-------|--------|------|------|-----------|-------|
| Elemental | 7 | 4 | 4 | 1 | 16 |
| Beast | 6 | 3 | 1 | 0 | 10 |
| Arcane | 2 | 4 | 2 | 1 | 9 |
| Undead | 0 | 4 | 3 | 1 | 8 |
| Nature | 4 | 1 | 1 | 1 | 7 |
| Warrior | 4 | 3 | 0 | 0 | 7 |
| Mech | 3 | 1 | 1 | 1 | 6 |
| Demon | 2 | 0 | 2 | 0 | 4 |
| Dragon | 0 | 2 | 0 | 1 | 3 |

### Observations

- **Elemental** is the most populated tribe (16 cards) — appropriate as a core versatile tribe
- **Dragon** is severely underrepresented (3 cards) — needs 2–3 more in the next expansion to support tribal synergy
- **Demon** is light (4 cards) — needs 1–2 more to fill out the disruption archetype
- **Warrior** has no Epics or Legendaries — consider adding a Warrior epic in the next expansion
- **Undead** has no Commons — consider adding 1–2 common undead cards for budget undead decks
- **Arcane** has only 2 Commons — consider 1–2 more for common-tier card advantage options

---

## Keyword Distribution Summary

| Keyword | Common | Rare | Epic | Legendary | Total |
|---------|--------|------|------|-----------|-------|
| Charge | 4 | 0 | 2 | 1 | 7 |
| Guard | 5 | 2 | 1 | 0 | 8 |
| Fury | 2 | 0 | 0 | 0 | 2 |
| Blast | 2 | 2 | 2 | 0 | 6 |
| Heal | 3 | 0 | 1 | 1 | 5 |
| Draw | 1 | 3 | 0 | 1 | 5 |
| Rally | 2 | 0 | 1 | 0 | 3 |
| Drain | 1 | 1 | 0 | 0 | 2 |
| Empower | 1 | 1 | 1 | 1 | 4 |
| Poison | 1 | 3 | 0 | 0 | 4 |
| Shield | 1 | 1 | 0 | 0 | 2 |
| Siphon | 0 | 1 | 1 | 0 | 2 |
| Bolster | 2 | 0 | 0 | 0 | 2 |
| Frostbite | 0 | 1 | 1 | 1 | 3 |
| Silence | 0 | 0 | 1 | 1 | 2 |
| Cleave | 0 | 1 | 1 | 0 | 2 |
| Lifesteal | 0 | 1 | 1 | 0 | 2 |
| Overwhelm | 0 | 1 | 1 | 0 | 2 |
| Enrage | 0 | 1 | 0 | 0 | 1 |
| Deathrattle | 0 | 2 | 0 | 0 | 2 |
| Summon | 0 | 1 | 1 | 1 | 3 |
| Vanilla (no keyword) | 5 | 0 | 1 | 0 | 6 |

### Observations

- **Guard** and **Charge** are the most common keywords — appropriate for core gameplay
- **Enrage** only appears once — consider adding 1–2 more Enrage cards in the next expansion
- **Fury** is limited to commons (2 cards) — consider a Rare Fury card
- **Deathrattle** has only 2 cards, both Rare — consider a Common deathrattle for accessibility

---

## Redundancy Analysis

Cards sharing the same cost, keyword, and amount are tracked here. Redundancy is acceptable when cards differ by **tribe**, **rarity**, or **stat distribution** to serve different deck archetypes. It becomes a problem when two cards at the same rarity are functionally interchangeable.

| Group | Cards | Differentiation | Status |
|-------|-------|-----------------|--------|
| 2-cost Guard | Bone Fence Sentinel (nature, 1/4) vs Corroded Husk (mech, 1/5) | Different tribes, different stat lines; Rust Golem is tankier but in a different tribal pool | ⚠️ Acceptable — different tribes serve different deck archetypes; slight stat overlap but Guard is a core keyword |
| 5-cost Guard | Carapace Wyrm (beast, 2/8) vs Geode Colossus (elemental, 3/8) vs Iron-Clad Devotee (mech, 4/6+Shield) | Different tribes, different rarities (C/R/R), Iron-Clad has Shield | ✅ Healthy — rarity progression creates clear upgrade path |
| 3-cost Poison 1 | Barrow Archer (warrior, 3/2) vs Venomous Serpent-Kin (dragon, 2/4) | Different tribes, different rarities (C/R), reversed stat emphasis | ✅ Healthy — aggro (ATK-heavy) vs defensive (HP-heavy) profiles |
| 4-cost Draw 1 | Pale Moon Seer (arcane, 2/4) vs Brazen Wyrm (dragon, 4/4) | Different tribes; Brazen Wyrm has much better stats | ⚠️ Monitor — same rarity makes this tight; Pale Moon Seer may need a buff or secondary effect in future |
| 4-cost Blast | Fire-Eater Cultist (elemental, 3/4, Blast 1) vs Ashen Witch (arcane, 3/4, Blast 2) | Different tribes, different rarities (C/R), different amounts | ✅ **Fixed** — previously both were Blast 2; now clearly differentiated by rarity and amount |

---

## Balance Change Log

All stat and effect changes are recorded here. Each entry references the season/patch and the reason for the change.

| Season | Card | Change | Reason |
|--------|------|--------|--------|
| S1-CORE | Geared Thrall (clockwork-knight) | HP 4 → 5 | Under-statted vanilla; 4/4 = 8 stats was 1 below vanilla budget of 9 |
| S1-CORE | Thunderous Colossus (storm-brute) | HP 4 → 6 | Under-statted vanilla; 5/4 = 9 stats was 2 below vanilla budget of 11 |
| S1-CORE | Whispering Assassin (shadow-assassin) | ATK 6 → 5 | Over-budget with Charge + Lifesteal; 6/3 gave +3 delta over expected |
| S1-CORE | Fire-Eater Cultist (flame-juggler) | Blast 2 → 1; HP 3 → 4 | Redundant with rare Ashen Witch; differentiated via lower blast + higher body |
