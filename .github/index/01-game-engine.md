# Game Engine Index — `src/game.ts` (1,410 lines)

## Type Definitions (Lines 1–66)

| Type | Line | Definition |
|------|------|------------|
| `GameMode` | 1 | `'ai' \| 'duel'` |
| `AIDifficulty` | 2 | `'novice' \| 'adept' \| 'veteran' \| 'legend'` |
| `BattleSide` | 3 | `'player' \| 'enemy'` |
| `CardEffect` | 4 | 21-value union: charge, guard, rally, blast, heal, draw, fury, drain, empower, poison, shield, siphon, bolster, cleave, lifesteal, summon, silence, frostbite, enrage, deathrattle, overwhelm |
| `CardRarity` | 5 | `'common' \| 'rare' \| 'epic' \| 'legendary'` |
| `CardTribe` | 6 | beast, elemental, undead, dragon, mech, arcane, warrior, nature, demon, none |
| `Winner` | 7 | `BattleSide \| 'draw' \| null` |
| `DeckConfig` | 8 | `Record<string, number>` |
| `CardTemplate` | 9–18 | id, name, cost, attack, health, icon, text, effect?, rarity, tribe |
| `CardInstance` | 20–22 | CardTemplate + instanceId |
| `Unit` | 24–35 | CardInstance on board + uid, currentHealth, exhausted, keywords? |
| `PlayerState` | 37–45 | name, health, mana, maxMana, momentum, deck, hand, board |
| `GameState` | 47–55 | mode, aiDifficulty, player, enemy, turn, turnNumber, log, winner |
| `RedactedPlayerState` | 806–816 | Opponent view (handCount, deckCount instead of arrays) |
| `RedactedGameState` | 818–828 | Multiplayer-safe state for clients |
| `DeathrattleSpec` | 604–606 | damage-hero or damage-all-enemy-units + amount |
| `SummonSpec` | 608–613 | Token template (id, name, icon, attack, health) |
| `CardParams` | 615–636 | Per-card override table for effects |
| `EnemyStep` | 1589 | `{ state: GameState; label: string }` |

## Constants (Lines 57–102)

| Name | Value | Line |
|------|-------|------|
| `BOARD_SIZE` | 3 | 57 |
| `STARTING_HEALTH` | 24 | 58 |
| `STARTING_HAND` | 3 | 59 |
| `MIN_DECK_SIZE` | 10 | 60 |
| `MAX_DECK_SIZE` | 16 | 61 |
| `MAX_COPIES` | 3 | 62 |
| `MAX_LEGENDARY_COPIES` | 1 | 63 |
| `RARITY_COLORS` | Hex color map | 65–70 |
| `DEFAULT_EFFECT_AMOUNT` | Lookup table | 644–652 |
| `DEFAULT_TOKEN` | 1/1 Spark | 654–659 |

## Card Library (Lines 72–372) — 70 Cards

| Section | Count | Lines |
|---------|-------|-------|
| Common | 28 | 76–103 |
| Rare | 22 | 107–128 |
| Epic | 14 | 132–145 |
| Legendary | 6 | 150–155 |

### Legendary Cards
| ID | Name | Cost | ATK/HP | Tribe | Effect |
|----|------|------|--------|-------|--------|
| drakarion-the-eternal | Drakarion, the Fathomless | 8 | 8/8 | dragon | charge |
| zephyr-world-breaker | Zephyr, the Whispering Gale | 9 | 7/10 | elemental | frostbite |
| velara-the-lifebinder | Velara, the Mycelial | 8 | 5/9 | nature | heal |
| malachar-the-undying | Malachar, the Carrion King | 8 | 6/7 | undead | silence |
| kronos-the-forgemaster | Kronos, the Ironclad Heretic | 9 | 8/8 | mech | empower |
| aethon-runekeeper | Aethon, the Starless Oracle | 7 | 5/6 | arcane | draw |

## Deck Configurations (Lines 163–218)

| Name | Line | Cards |
|------|------|-------|
| `DEFAULT_DECK_CONFIG` | 163–174 | 11-card starter deck |
| `AI_DECK_CONFIG` | 176–188 | 12-card base AI deck |
| `AI_DIFFICULTY_DECKS` | 190–218 | Per-difficulty decks (novice: 7, adept: 12, veteran: 12, legend: 14) |

## Card Params Override System (Lines 615–690)

`CARD_PARAMS` at lines 677–690 provides per-card customization:
- `amount` — Override default effect amount
- `extras` — Additional on-play effects
- `healToFull` — Heal to max (Velara)
- `bolsterAll` — Bolster all friendlies
- `freezeAll` — Freeze all enemies
- `summonOne` / `summonAll` — Token specs
- `grantsKeyword` — Extra keyword on summon
- `deathrattle` — Death behavior

## Exported Functions

### State Creation
| Function | Line | Purpose |
|----------|------|---------|
| `createPlayer(name, deckConfig)` | 768 | Initialize player with deck, hand, mana |
| `createGame(mode, deckConfig, ...)` | 783 | Create AI or duel game |
| `createDuelGame(p1Name, p1Deck, p2Name, p2Deck)` | 805 | Create multiplayer duel |

### Board & Hand
| Function | Line | Purpose |
|----------|------|---------|
| `shuffle(items)` | 715 | Fisher-Yates shuffle |
| `buildDeck(config)` | 745 | Build deck from config |
| `drawCards(player, count)` | 727 | Draw N cards |
| `resetBoard(board)` | 745 | Reset unit exhaustion |
| `summonUnit(card)` | 749 | Create unit from card |
| `getDeckSize(config)` | 733 | Count cards in deck config |
| `otherSide(side)` | 731 | Flip player/enemy |
| `hasKeyword(unit, kind)` | 57 | Check unit for keyword |
| `pushLog(log, entry)` | 751 | Add log entry (max 10) |
| `boardHasGuard(board)` | 755 | Check for guard units |

### Card Playing & Combat
| Function | Line | Purpose |
|----------|------|---------|
| `playCard(base, side, handIndex)` | 1033 | Play card, resolve all effects |
| `attack(base, side, attackerIndex, target)` | 1322 | Resolve combat (unit or hero) |
| `castMomentumBurst(base, side)` | 1313 | Spend 3 momentum: 2 damage + draw |

### Turn Management
| Function | Line | Purpose |
|----------|------|---------|
| `beginTurn(player)` | 1356 | Draw, increment mana, reset units |
| `passTurn(base)` | 1356 | Advance turn to next player |
| `ensurePlayableOpeningHand(player)` | 1356 | Mulligan high-cost cards |

### State Management
| Function | Line | Purpose |
|----------|------|---------|
| `redactGameState(state, forSide)` | 856 | Hide opponent hand/deck, remap perspective |
| `finalizeGame(base, player, enemy, log)` | 898 | Check win conditions |
| `applySides(base, side, actor, rival, log)` | 920 | Apply state based on side |
| `surrenderGame(base, side)` | 929 | Forfeit game |
| `getRecommendedAIDifficulty(rating)` | 666 | Map ELO → difficulty |

### AI Logic
| Function | Line | Purpose |
|----------|------|---------|
| `highestPlayableIndex(hand, mana, ...)` | 1530 | Score and select best card |
| `chooseEnemyTarget(game, attacker, ...)` | 1586 | Select attack target |
| `shouldEnemyUseBurst(game, difficulty)` | 1632 | Decide on Momentum Burst |
| `runEnemyTurn(base)` | 1646 | Execute full AI turn |
| `generateEnemyTurnSteps(base)` | 1673 | Animated AI turn steps |

## Effect Resolution (in `playCard()` Lines 1145–1316)

| Effect | Behavior | Default Amount |
|--------|----------|---------------|
| rally | +Momentum (max 10) | 1 |
| blast | Damage enemy hero | 2 |
| heal | Restore hero health (max 24) | 2 |
| draw | Draw N cards | 1 |
| drain | Steal momentum from enemy | 1 |
| empower | +Attack all friendly units | 1 |
| poison | Damage all enemy units | 1 |
| shield | +Health to hero | 3 |
| siphon | Damage enemy hero + heal self | 2 |
| bolster | +Health to random (or all) friendlies | 1 |
| frostbite | Exhaust random (or all) enemies | — |
| silence | Strip effects from all enemy units | — |
| summon | Create token in empty lane | — |
| cleave | Damage all enemy units for ATK | — |
| charge/guard/fury/lifesteal/enrage/overwhelm/deathrattle | Combat-only keywords | — |

## Combat Resolution (`attack()` Lines 1322–1528)

- **Guard Lock:** Must target guard units before hero
- **Unit vs Hero:** Direct damage, fury (+1 ATK), lifesteal
- **Unit vs Unit:** Simultaneous damage, enrage (+2 ATK on survive), overwhelm (excess → hero)
- **Deathrattle:** Triggers on death (damage-hero or damage-all-enemy-units)

## Win Conditions (`finalizeGame()`)
- Both health ≤ 0 → Draw
- Enemy health ≤ 0 → Player wins
- Player health ≤ 0 → Enemy wins
