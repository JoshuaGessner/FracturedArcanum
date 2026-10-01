import { describe, expect, it } from 'vitest'
import {
  CARD_LIBRARY,
  AI_DIFFICULTY_PROFILES,
  DEFAULT_DECK_CONFIG,
  MIN_DECK_SIZE,
  STARTING_HEALTH,
  attack,
  castMomentumBurst,
  createDuelGame,
  createGame,
  getDeathrattle,
  getDeckSize,
  getRecommendedAIDifficulty,
  hasKeyword,
  passTurn,
  playCard,
  redactGameState,
  summonUnit,
  surrenderGame,
  type CardInstance,
  type GameState,
  type Unit,
} from './game'
import { chooseEnemyTarget, highestPlayableIndex } from './ai'

function findCard(id: string): CardInstance {
  const card = CARD_LIBRARY.find((c) => c.id === id)
  if (!card) throw new Error(`Card not found: ${id}`)
  return { ...card, instanceId: `${id}-test` }
}

function emptyBoard<T>(): Array<T | null> {
  return [null, null, null] as Array<T | null>
}

function craftGame(playerHand: CardInstance[], enemyHand: CardInstance[] = []): GameState {
  return {
    mode: 'ai',
    aiDifficulty: 'adept',
    player: {
      name: 'Tester',
      cardBorder: 'default',
      health: STARTING_HEALTH,
      mana: 10,
      maxMana: 10,
      momentum: 0,
      deck: [],
      hand: playerHand,
      board: emptyBoard<Unit>(),
    },
    enemy: {
      name: 'Dummy',
      cardBorder: 'default',
      health: STARTING_HEALTH,
      mana: 0,
      maxMana: 0,
      momentum: 0,
      deck: [],
      hand: enemyHand,
      board: emptyBoard<Unit>(),
    },
    turn: 'player',
    turnNumber: 1,
    log: [],
    winner: null,
  }
}

describe('Fractured Arcanum core rules', () => {
  it('creates a valid match from the default deck', () => {
    const game = createGame('ai', DEFAULT_DECK_CONFIG)

    expect(getDeckSize(DEFAULT_DECK_CONFIG)).toBeGreaterThanOrEqual(MIN_DECK_SIZE)
    expect(game.player.health).toBe(24)
    expect(game.player.hand.length).toBeGreaterThan(0)
    expect(game.enemy.health).toBe(24)
  })

  it('spends momentum burst to damage the enemy hero', () => {
    const base = createGame('ai', DEFAULT_DECK_CONFIG)
    const boosted = {
      ...base,
      player: {
        ...base.player,
        momentum: 3,
      },
    }

    const result = castMomentumBurst(boosted, 'player')

    expect(result.player.momentum).toBe(0)
    expect(result.enemy.health).toBe(base.enemy.health - 2)
  })

  it('plays an affordable card onto the board', () => {
    const base = createGame('ai', DEFAULT_DECK_CONFIG)
    const playableIndex = base.player.hand.findIndex((card) => card.cost <= base.player.mana)

    expect(playableIndex).toBeGreaterThanOrEqual(0)

    const result = playCard(base, 'player', playableIndex)
    expect(result.player.board.some((slot) => slot !== null)).toBe(true)
  })

  it('plays an affordable card into a requested empty lane', () => {
    const card = findCard('spark-imp')
    const base = craftGame([card])
    base.player.board = [summonUnit(findCard('tide-caller')), null, null]

    const result = playCard(base, 'player', 0, 2)

    expect(result.player.board[0]?.id).toBe('tide-caller')
    expect(result.player.board[1]).toBeNull()
    expect(result.player.board[2]?.id).toBe('spark-imp')
  })

  it('rejects requested lanes that are occupied', () => {
    const card = findCard('spark-imp')
    const base = craftGame([card])
    base.player.board = [summonUnit(findCard('tide-caller')), null, null]

    const result = playCard(base, 'player', 0, 0)

    expect(result).toBe(base)
  })

  it('awards the match to the opponent when a player surrenders', () => {
    const base = createGame('duel', DEFAULT_DECK_CONFIG)
    const result = surrenderGame(base, 'player')

    expect(result.winner).toBe('enemy')
    expect(result.log[0]).toContain('wins by forfeit')
  })

  it('recommends AI difficulty from player rating bands', () => {
    expect(getRecommendedAIDifficulty(1025)).toBe('novice')
    expect(getRecommendedAIDifficulty(1200)).toBe('adept')
    expect(getRecommendedAIDifficulty(1400)).toBe('veteran')
    expect(getRecommendedAIDifficulty(1600)).toBe('legend')
  })

  it('creates AI matches with the requested difficulty', () => {
    const game = createGame('ai', DEFAULT_DECK_CONFIG, 'Nemesis AI', 'veteran')

    expect(game.aiDifficulty).toBe('veteran')
    expect(game.enemy.name).toBe('Nemesis AI')
  })

  it('defines tactical profiles for every AI difficulty', () => {
    expect(Object.keys(AI_DIFFICULTY_PROFILES)).toEqual(['novice', 'adept', 'veteran', 'legend'])
    expect(AI_DIFFICULTY_PROFILES.novice.selectionMode).toBe('cheapest')
    expect(AI_DIFFICULTY_PROFILES.legend.legendaryWeight).toBeGreaterThan(AI_DIFFICULTY_PROFILES.adept.legendaryWeight)
  })

  it('uses profile scoring so stronger AI tiers prefer higher-impact cards', () => {
    const cheap = findCard('spark-imp')
    const impact = findCard('clockwork-knight')
    const hand = [impact, cheap]

    expect(highestPlayableIndex(hand, 4, 'novice')).toBe(1)
    expect(highestPlayableIndex(hand, 4, 'legend')).toBe(0)
  })

  it('legend target selection prioritizes dangerous units over hero pressure', () => {
    const base = craftGame([])
    base.player.health = 20
    base.enemy.board = [summonUnit(findCard('sky-raider')), null, null]
    base.player.board = [summonUnit(findCard('spark-imp')), summonUnit(findCard('ancient-hydra')), null]
    const attacker = base.enemy.board[0]
    if (!attacker) throw new Error('Missing attacker')

    expect(chooseEnemyTarget(base, attacker, 'legend')).toBe(1)
  })
})

describe('Card effect resolution (data-driven)', () => {
  it('storm-titan blasts for 3 and draws 1 (regression: previously stuck at 2)', () => {
    const card = findCard('storm-titan')
    const game = craftGame([card])
    game.player.deck = [findCard('spark-imp'), findCard('spark-imp')]
    const result = playCard(game, 'player', 0)
    expect(result.enemy.health).toBe(STARTING_HEALTH - 3)
    expect(result.player.hand.length).toBe(1)
  })

  it('storm-shaman blasts for 3 (regression: previously double-applied to 4)', () => {
    const card = findCard('storm-shaman')
    const game = craftGame([card])
    const result = playCard(game, 'player', 0)
    expect(result.enemy.health).toBe(STARTING_HEALTH - 3)
  })

  it('bone-collector drains 2 momentum total (regression: previously double-applied)', () => {
    const card = findCard('bone-collector')
    const game = craftGame([card])
    game.enemy.momentum = 5
    const result = playCard(game, 'player', 0)
    expect(result.enemy.momentum).toBe(3)
    expect(result.player.momentum).toBe(2)
  })

  it('shadow-assassin gets the lifesteal keyword via data, not id check', () => {
    const card = findCard('shadow-assassin')
    const unit = summonUnit(card)
    expect(hasKeyword(unit, 'lifesteal')).toBe(true)
    expect(hasKeyword(unit, 'charge')).toBe(true) // primary effect
    expect(unit.exhausted).toBe(false) // chargers act on summon
  })

  it('glacial-colossus has guard via grantsKeyword and is treated as a guard', () => {
    const card = findCard('glacial-colossus')
    const unit = summonUnit(card)
    expect(hasKeyword(unit, 'guard')).toBe(true)
  })

  it('phoenix-ascendant exposes its deathrattle via getDeathrattle()', () => {
    const dr = getDeathrattle('phoenix-ascendant')
    expect(dr).toEqual({ kind: 'damage-hero', amount: 3 })
  })

  it('ghost-knight deathrattle damages opposing hero on death', () => {
    const ghost = findCard('ghost-knight')
    const ghostUnit = { ...summonUnit(ghost), exhausted: false }
    const game = craftGame([])
    game.enemy.board[0] = ghostUnit

    const attackerCard = findCard('ironbark-guard')
    const attackerUnit: Unit = { ...summonUnit(attackerCard), attack: 6, currentHealth: 6, exhausted: false }
    game.player.board[0] = attackerUnit

    const result = attack(game, 'player', 0, 0)
    // Ghost died; deathrattle hits player hero for 2
    expect(result.player.health).toBe(STARTING_HEALTH - 2)
    expect(result.enemy.board[0]).toBeNull()
  })

  it('arcane-golem rallies for 3 momentum and draws 1 card', () => {
    const card = findCard('arcane-golem')
    const game = craftGame([card])
    game.player.deck = [findCard('spark-imp')]
    const result = playCard(game, 'player', 0)
    expect(result.player.momentum).toBe(3)
    expect(result.player.hand.length).toBe(1)
  })

  it('velara-the-lifebinder restores hero to full and empowers all friendlies', () => {
    const card = findCard('velara-the-lifebinder')
    const game = craftGame([card])
    game.player.health = 5
    const buddy = findCard('spark-imp')
    game.player.board[0] = summonUnit(buddy)
    const baseAttack = (game.player.board[0] as Unit).attack

    const result = playCard(game, 'player', 0)
    expect(result.player.health).toBe(STARTING_HEALTH)
    // Both the new Velara and the existing buddy get +2 attack
    expect((result.player.board[0] as Unit).attack).toBe(baseAttack + 2)
  })
})

describe('cosmetic frames in redacted state', () => {
  const duel = () => createDuelGame('One', DEFAULT_DECK_CONFIG, 'Two', DEFAULT_DECK_CONFIG, 'void', 'bronze')

  it('gives each side its own owner frame from that side\'s perspective', () => {
    // This is what makes a board unit wear its OWN owner's frame. Each client
    // reads `player`/`enemy` identically, so the remap has to be what swaps
    // them — if it did not, both players would see the host's frame on
    // everything.
    const fromOne = redactGameState(duel(), 'player')
    expect(fromOne.player.cardBorder).toBe('void')
    expect(fromOne.enemy.cardBorder).toBe('bronze')

    const fromTwo = redactGameState(duel(), 'enemy')
    expect(fromTwo.player.cardBorder).toBe('bronze')
    expect(fromTwo.enemy.cardBorder).toBe('void')
  })

  it('leaves the AI on the standard frame while the player keeps theirs', () => {
    const game = createGame('ai', DEFAULT_DECK_CONFIG, 'Nemesis', 'adept', 'solar')
    expect(game.player.cardBorder).toBe('solar')
    expect(game.enemy.cardBorder).toBe('default')
  })

  it('defaults both seats when no frame is supplied', () => {
    const game = createGame('ai', DEFAULT_DECK_CONFIG)
    expect(game.player.cardBorder).toBe('default')
    expect(game.enemy.cardBorder).toBe('default')
  })
})

/** A ready-to-act unit for a crafted board. */
function readyUnit(id: string, overrides: Partial<Unit> = {}): Unit {
  return { ...summonUnit(findCard(id)), exhausted: false, ...overrides }
}

describe('rules regressions from the edge-case bug pass', () => {
  it('Magma Hound\'s deathrattle hits the attacker\'s board when it dies in combat', () => {
    const game = craftGame([])
    game.enemy.board[0] = readyUnit('lava-hound', { currentHealth: 1 })
    game.player.board = [readyUnit('storm-brute'), readyUnit('bog-lurker', { currentHealth: 5, health: 5 }), null]

    const result = attack(game, 'player', 0, 0)
    // Storm brute: 6 - 4 (strike back) - 3 (eruption) → dead. Bog lurker: 5 - 3 → 2.
    expect(result.player.board[0]).toBeNull()
    expect(result.player.board[1]?.currentHealth).toBe(2)
    expect(result.enemy.board[0]).toBeNull()
  })

  it('a deathrattle fires when Poison kills the unit, not only in combat', () => {
    const game = craftGame([findCard('hex-spider')])
    game.enemy.board[0] = readyUnit('ghost-knight', { currentHealth: 1 })
    const result = playCard(game, 'player', 0)
    expect(result.enemy.board[0]).toBeNull()
    expect(result.player.health).toBe(STARTING_HEALTH - 2)
  })

  it('deathrattles chain: a poisoned Magma Hound erupts onto the board that poisoned it', () => {
    const game = craftGame([findCard('hex-spider')])
    game.enemy.board[0] = readyUnit('lava-hound', { currentHealth: 1 })
    const result = playCard(game, 'player', 0)
    // The just-summoned Weaver (2/3) takes the 3-damage eruption and dies.
    expect(result.player.board.every((slot) => slot === null)).toBe(true)
  })

  it('Silence disarms a deathrattle', () => {
    const game = craftGame([findCard('abyssal-tyrant')])
    game.enemy.board[0] = readyUnit('ghost-knight')
    const silenced = playCard(game, 'player', 0)
    expect(silenced.enemy.board[0]?.silenced).toBe(true)

    const tyrantLane = silenced.player.board.findIndex((slot) => slot !== null)
    const ready: GameState = {
      ...silenced,
      player: {
        ...silenced.player,
        board: silenced.player.board.map((unit) => (unit ? { ...unit, exhausted: false } : null)),
      },
    }
    const healthBefore = ready.player.health
    const result = attack(ready, 'player', tyrantLane, 0)
    expect(result.enemy.board[0]).toBeNull()
    expect(result.player.health).toBe(healthBefore)
  })

  it('Frostbite keeps the unit exhausted through its owner\'s next turn, then thaws', () => {
    const game = craftGame([findCard('frost-weaver')])
    game.enemy.board[0] = readyUnit('storm-brute')
    const frozenTurn = passTurn(playCard(game, 'player', 0))
    expect(frozenTurn.turn).toBe('enemy')
    expect(frozenTurn.enemy.board[0]?.exhausted).toBe(true)
    expect(attack(frozenTurn, 'enemy', 0, 'hero')).toBe(frozenTurn)

    const thawed = passTurn(passTurn(frozenTurn))
    expect(thawed.turn).toBe('enemy')
    expect(thawed.enemy.board[0]?.exhausted).toBe(false)
    expect(thawed.enemy.board[0]?.frozen).toBe(false)
  })

  it('Malachar summons a 3/3 Wraith in each empty lane', () => {
    const game = craftGame([findCard('malachar-the-undying')])
    const result = playCard(game, 'player', 0)
    const wraiths = result.player.board.filter((unit) => unit?.id === 'token-wraith')
    expect(wraiths).toHaveLength(2)
    expect(wraiths.every((unit) => unit?.attack === 3 && unit?.currentHealth === 3)).toBe(true)
  })

  it('healing never lowers health that armor pushed above the cap', () => {
    const healer = craftGame([findCard('dawn-healer')])
    healer.player.health = 28
    expect(playCard(healer, 'player', 0).player.health).toBe(28)

    const velara = craftGame([findCard('velara-the-lifebinder')])
    velara.player.health = 30
    expect(playCard(velara, 'player', 0).player.health).toBe(30)

    const siphon = craftGame([findCard('soul-reaver')])
    siphon.player.health = 27
    expect(playCard(siphon, 'player', 0).player.health).toBe(27)

    const lifesteal = craftGame([])
    lifesteal.player.health = 26
    lifesteal.player.board[0] = readyUnit('shadow-dancer')
    expect(attack(lifesteal, 'player', 0, 'hero').player.health).toBe(26)

    // Below the cap, healing still stops at it.
    const capped = craftGame([findCard('field-medic')])
    capped.player.health = 23
    expect(playCard(capped, 'player', 0).player.health).toBe(STARTING_HEALTH)
  })

  it('Enrage triggers when the unit is damaged while defending', () => {
    const game = craftGame([])
    game.enemy.board[0] = readyUnit('crimson-berserker')
    game.player.board[0] = readyUnit('spark-imp')
    const result = attack(game, 'player', 0, 0)
    expect(result.enemy.board[0]?.currentHealth).toBe(1)
    expect(result.enemy.board[0]?.attack).toBe(7)
  })

  it('Enrage triggers on Poison damage and not on a killing blow', () => {
    const poisoned = craftGame([findCard('hex-spider')])
    poisoned.enemy.board[0] = readyUnit('crimson-berserker')
    expect(playCard(poisoned, 'player', 0).enemy.board[0]?.attack).toBe(7)

    const killed = craftGame([findCard('vine-lasher')])
    killed.enemy.board[0] = readyUnit('crimson-berserker', { currentHealth: 2 })
    expect(playCard(killed, 'player', 0).enemy.board[0]).toBeNull()
  })
})
