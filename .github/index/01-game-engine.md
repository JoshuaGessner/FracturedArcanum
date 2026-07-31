# Game Engine Index — `src/game.ts`

## Type Definitions (Lines 1–66)

| Type | Line | Definition |
|------|------|
| `GameMode` | `'ai' \| 'duel'` |
| `AIDifficulty` | `'novice' \| 'adept' \| 'veteran' \| 'legend'` |
| `BattleSide` | `'player' \| 'enemy'` |
| `CardEffect` | 21-value union: charge, guard, rally, blast, heal, draw, fury, drain, empower, poison, shield, siphon, bolster, cleave, lifesteal, summon, silence, frostbite, enrage, deathrattle, overwhelm |
| `CardRarity` | `'common' \| 'rare' \| 'epic' \| 'legendary'` |
| `CardTribe` | beast, elemental, undead, dragon, mech, arcane, warrior, nature, demon, none |
| `Winner` | `BattleSide \| 'draw' \| null` |
| `DeckConfig` | `Record<string, number>` |
| `CardTemplate` | id, name, cost, attack, health, icon, text, effect?, rarity, tribe |
| `CardInstance` | CardTemplate + instanceId |
| `Unit` | CardInstance on board + uid, currentHealth, exhausted, keywords? |
| `PlayerState` | name, health, mana, maxMana, momentum, deck, hand, board |
| `GameState` | mode, aiDifficulty, player, enemy, turn, turnNumber, log, winner |
| `RedactedPlayerState` | Opponent view (handCount, deckCount instead of arrays) |
| `RedactedGameState` | Multiplayer-safe state for clients |
| `DeathrattleSpec` | damage-hero or damage-all-enemy-units + amount |
| `SummonSpec` | Token template (id, name, icon, attack, health) |
| `CardParams` | Per-card override table for effects |
| `EnemyStep` | `{ state: GameState; label: string }` |

## Constants (Lines 57–102)

| Name | Value | Line |
|------|------|
| `BOARD_SIZE` | 57 |
| `STARTING_HEALTH` | 58 |
| `STARTING_HAND` | 59 |
| `MIN_DECK_SIZE` | 60 |
| `MAX_DECK_SIZE` | 61 |
| `MAX_COPIES` | 62 |
| `MAX_LEGENDARY_COPIES` | 63 |
| `RARITY_COLORS` | Hex color map | 65–70 |
| `DEFAULT_EFFECT_AMOUNT` | Lookup table | 644–652 |
| `DEFAULT_TOKEN` | 1/1 Spark | 654–659 |

## Card Library (Lines 72–372) — 70 Cards

| Section | Count | Lines |
|------|------|
| Common | 76–103 |
| Rare | 107–128 |
| Epic | 132–145 |
| Legendary | 150–155 |

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
|------|------|
| `DEFAULT_DECK_CONFIG` | 11-card starter deck |
| `AI_DECK_CONFIG` | 12-card base AI deck |
| `AI_DIFFICULTY_DECKS` | Per-difficulty decks (novice: 7, adept: 12, veteran: 12, legend: 14) |

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
|------|------|
| `createPlayer(name, deckConfig)` | Initialize player with deck, hand, mana |
| `createGame(mode, deckConfig, ...)` | Create AI or duel game |
| `createDuelGame(p1Name, p1Deck, p2Name, p2Deck)` | Create multiplayer duel |

### Board & Hand
| Function | Line | Purpose |
|------|------|
| `shuffle(items)` | Fisher-Yates shuffle |
| `buildDeck(config)` | Build deck from config |
| `drawCards(player, count)` | Draw N cards |
| `resetBoard(board)` | Reset unit exhaustion |
| `summonUnit(card)` | Create unit from card |
| `getDeckSize(config)` | Count cards in deck config |
| `otherSide(side)` | Flip player/enemy |
| `hasKeyword(unit, kind)` | Check unit for keyword |
| `pushLog(log, entry)` | Add log entry (max 10) |
| `boardHasGuard(board)` | Check for guard units |

### Card Playing & Combat
| Function | Line | Purpose |
|------|------|
| `playCard(base, side, handIndex, laneIndex?)` | Play card into first open lane or requested empty lane, resolve all effects |
| `attack(base, side, attackerIndex, target)` | Resolve combat (unit or hero) |
| `castMomentumBurst(base, side)` | Spend 3 momentum: 2 damage + draw |

### Turn Management
| Function | Line | Purpose |
|------|------|
| `beginTurn(player)` | Draw, increment mana, reset units |
| `passTurn(base)` | Advance turn to next player |
| `ensurePlayableOpeningHand(player)` | Mulligan high-cost cards |

### State Management
| Function | Line | Purpose |
|------|------|
| `redactGameState(state, forSide)` | Hide opponent hand/deck, remap perspective |
| `finalizeGame(base, player, enemy, log)` | Check win conditions |
| `applySides(base, side, actor, rival, log)` | Apply state based on side |
| `surrenderGame(base, side)` | Forfeit game |
| `getRecommendedAIDifficulty(rating)` | Map ELO → difficulty |

### AI Logic
| Function | Line | Purpose |
|------|------|
| `highestPlayableIndex(hand, mana, ...)` | Score and select best card |
| `chooseEnemyTarget(game, attacker, ...)` | Select attack target |
| `shouldEnemyUseBurst(game, difficulty)` | Decide on Momentum Burst |
| `runEnemyTurn(base)` | Execute full AI turn |
| `generateEnemyTurnSteps(base)` | Animated AI turn steps |

## Effect Resolution (in `playCard()` Lines 1145–1316)

| Effect | Behavior | Default Amount |
|------|------|
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
