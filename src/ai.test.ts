import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EVAL_WEIGHTS,
  LOSS,
  WIN,
  availableFaceDamage,
  evaluateBoard,
  maxPositionalSwing,
  opposingGuardLane,
  planAttacks,
  unitValue,
} from './ai'
import {
  DEFAULT_DECK_CONFIG,
  attack,
  createGame,
  type GameState,
  type Unit,
} from './game'

/**
 * The board evaluator.
 *
 * This is the foundation the AI's mana planning, attack sequencing and board
 * reading are all built on, so a quiet defect here would surface as three
 * separate mysterious behaviours. The properties below are the ones the search
 * relies on rather than a sample of scores.
 */

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'test-unit',
    name: 'Test Unit',
    cost: 3,
    attack: 3,
    health: 3,
    icon: '*',
    text: '',
    rarity: 'common',
    instanceId: 'test-unit-0',
    uid: 'test-unit-0-a',
    currentHealth: 3,
    exhausted: false,
    ...overrides,
  } as Unit
}

/** A game with both boards and hands emptied, so a test controls every term. */
function blankGame(): GameState {
  const game = createGame('ai', DEFAULT_DECK_CONFIG, 'Nemesis AI', 'legend')
  return {
    ...game,
    player: { ...game.player, board: [null, null, null], hand: [], momentum: 0 },
    enemy: { ...game.enemy, board: [null, null, null], hand: [], momentum: 0 },
  }
}

describe('evaluateBoard terminal states', () => {
  /**
   * The whole reason lethal detection does not need to exist as its own rule.
   * A search that can reach a winning position takes it because WIN dominates
   * every positional term — so "never misses lethal" is a property of search
   * depth rather than a hand-written check that can rot.
   */
  it('scores a win above anything a position can otherwise reach', () => {
    const game = { ...blankGame(), winner: 'enemy' as const }
    expect(evaluateBoard(game, 'enemy')).toBe(WIN)
    expect(WIN).toBeGreaterThan(maxPositionalSwing())
  })

  it('scores a loss below anything a position can otherwise reach', () => {
    const game = { ...blankGame(), winner: 'player' as const }
    expect(evaluateBoard(game, 'enemy')).toBe(LOSS)
    expect(LOSS).toBeLessThan(-maxPositionalSwing())
  })

  /**
   * Finite on purpose. With Infinity, any later arithmetic on two terminal
   * scores yields NaN, and NaN loses every comparison silently — a search
   * would then quietly stop preferring wins.
   */
  it('keeps terminal scores finite so search arithmetic stays sane', () => {
    expect(Number.isFinite(WIN)).toBe(true)
    expect(Number.isFinite(LOSS)).toBe(true)
    expect(WIN + LOSS).toBe(0)
  })
})

describe('evaluateBoard symmetry', () => {
  /**
   * The property most likely to hide a bug. An asymmetric evaluator lets a
   * search prefer a line because of *who is asking* rather than what is on the
   * board, and that shows up in play as an AI that makes inexplicable choices
   * in positions that look even.
   */
  it('is the exact negation of the same position from the other seat', () => {
    const base = blankGame()
    const game: GameState = {
      ...base,
      player: {
        ...base.player,
        health: 17,
        board: [makeUnit({ attack: 4, currentHealth: 2 }), null, makeUnit({ effect: 'guard' })],
      },
      enemy: {
        ...base.enemy,
        health: 9,
        board: [makeUnit({ attack: 1, currentHealth: 6 }), null, null],
      },
    }

    expect(evaluateBoard(game, 'enemy')).toBeCloseTo(-evaluateBoard(game, 'player'), 10)
  })

  it('scores a mirrored position as dead even', () => {
    const base = blankGame()
    const game: GameState = {
      ...base,
      player: { ...base.player, health: 20, board: [makeUnit(), null, null] },
      enemy: { ...base.enemy, health: 20, board: [makeUnit(), null, null] },
    }
    expect(evaluateBoard(game, 'enemy')).toBeCloseTo(0, 10)
  })
})

describe('evaluateBoard orders positions sensibly', () => {
  it('prefers having the board to having the same stats in hand', () => {
    const base = blankGame()
    const onBoard: GameState = {
      ...base,
      enemy: { ...base.enemy, board: [makeUnit({ attack: 5, currentHealth: 5 }), null, null] },
    }
    const inHand: GameState = {
      ...base,
      enemy: { ...base.enemy, hand: [makeUnit({ attack: 5, health: 5 })] },
    }
    expect(evaluateBoard(onBoard, 'enemy')).toBeGreaterThan(evaluateBoard(inHand, 'enemy'))
  })

  /**
   * Uses currentHealth, not printed health. A 5/5 chipped to 5/1 is nearly
   * dead, and a card-level scorer cannot make that distinction because it only
   * ever sees cards in hand — which is precisely the blind spot this replaces.
   */
  it('values a damaged unit below a healthy one', () => {
    const healthy = makeUnit({ attack: 5, health: 5, currentHealth: 5 })
    const chipped = makeUnit({ attack: 5, health: 5, currentHealth: 1 })
    expect(unitValue(chipped)).toBeLessThan(unitValue(healthy))
  })

  it('values a Guard above the same body without it', () => {
    const plain = makeUnit({ attack: 2, currentHealth: 4 })
    const guard = makeUnit({ attack: 2, currentHealth: 4, effect: 'guard' })
    expect(unitValue(guard)).toBeGreaterThan(unitValue(plain))
  })

  it('values a keyword body above a vanilla one of the same size', () => {
    const plain = makeUnit({ attack: 3, currentHealth: 3 })
    const poisonous = makeUnit({ attack: 3, currentHealth: 3, effect: 'poison' })
    expect(unitValue(poisonous)).toBeGreaterThan(unitValue(plain))
  })

  /**
   * Board presence outweighs a point of hero health: a unit generates its
   * attack every turn, a life point is spent once. On a three-lane board with
   * a 24-point clock, the side holding the board usually converts it first.
   */
  it('weighs a unit above a single point of hero health', () => {
    expect(unitValue(makeUnit())).toBeGreaterThan(DEFAULT_EVAL_WEIGHTS.heroHealth)
  })

  it('prefers a healthier hero, all else equal', () => {
    const base = blankGame()
    const healthy: GameState = { ...base, enemy: { ...base.enemy, health: 20 } }
    const hurt: GameState = { ...base, enemy: { ...base.enemy, health: 5 } }
    expect(evaluateBoard(healthy, 'enemy')).toBeGreaterThan(evaluateBoard(hurt, 'enemy'))
  })
})

describe('search pre-filters', () => {
  it('sums face damage from unexhausted attackers only', () => {
    const base = blankGame()
    const game: GameState = {
      ...base,
      enemy: {
        ...base.enemy,
        board: [
          makeUnit({ attack: 4 }),
          makeUnit({ attack: 3, exhausted: true }),
          makeUnit({ attack: 2 }),
        ],
      },
    }
    expect(availableFaceDamage(game, 'enemy')).toBe(6)
  })

  /**
   * Reads through hasKeyword, not `effect`. A unit can be granted Guard at
   * summon on top of another primary effect, and checking the field directly
   * misses exactly those — a mistake already made once in this repo's arena
   * harness, where it sent the reference opponent into a wall it could not see.
   */
  it('finds a Guard granted through keywords rather than as the primary effect', () => {
    const base = blankGame()
    const game: GameState = {
      ...base,
      player: {
        ...base.player,
        board: [null, makeUnit({ effect: 'frostbite', keywords: ['guard'] }), null],
      },
    }
    expect(opposingGuardLane(game, 'enemy')).toBe(1)
  })

  it('reports no lane when the opponent has no Guard', () => {
    const base = blankGame()
    const game: GameState = { ...base, player: { ...base.player, board: [makeUnit(), null, null] } }
    expect(opposingGuardLane(game, 'enemy')).toBe(-1)
  })
})

describe('attack sequencing', () => {
  /**
   * The property that motivated the search.
   *
   * Three attackers for four each is lethal through twelve health, but no
   * attacker is lethal alone, so every per-attacker check misses it. The old
   * code had three partial heuristics for this — `player.health <= attacker.attack`,
   * `lethalPressureBonus`, `burstHeroThreshold` — and still missed it, because
   * none of them added damage across attackers.
   *
   * Nothing in `planAttacks` looks for lethal. The winning line simply
   * evaluates to WIN and beats every alternative.
   */
  it('finds lethal that no single attacker could see', () => {
    const base = blankGame()
    const game: GameState = {
      ...base,
      turn: 'enemy',
      player: { ...base.player, health: 12, board: [null, null, null] },
      enemy: {
        ...base.enemy,
        board: [
          makeUnit({ attack: 4, currentHealth: 4 }),
          makeUnit({ attack: 4, currentHealth: 4 }),
          makeUnit({ attack: 4, currentHealth: 4 }),
        ],
      },
    }

    const plan = planAttacks(game, 'enemy')
    expect(plan).toHaveLength(3)
    expect(plan.every((choice) => choice.target === 'hero')).toBe(true)

    let result = game
    for (const { lane, target } of plan) result = attack(result, 'enemy', lane, target)
    expect(result.winner).toBe('enemy')
  })

  /**
   * Ordering, which a lane-by-lane loop cannot express: the second decision is
   * made before the first has happened, so it cannot know a lane is now clear.
   *
   * A 2/2 kills the 1/1 blocker; the 6/6 then reaches the face. Taking them in
   * lane order sends the 6/6 into the blocker and wastes it.
   */
  it('clears a blocker with the smaller attacker so the bigger one gets through', () => {
    const base = blankGame()
    const game: GameState = {
      ...base,
      turn: 'enemy',
      player: {
        ...base.player,
        health: 20,
        board: [makeUnit({ attack: 1, currentHealth: 1, effect: 'guard' }), null, null],
      },
      enemy: {
        ...base.enemy,
        board: [makeUnit({ attack: 6, currentHealth: 6 }), makeUnit({ attack: 2, currentHealth: 2 }), null],
      },
    }

    const plan = planAttacks(game, 'enemy')
    // The small one goes into the guard first...
    expect(plan[0]).toEqual({ lane: 1, target: 0 })
    // ...and the big one is then free to hit the face.
    expect(plan.some((choice) => choice.target === 'hero')).toBe(true)

    let result = game
    for (const { lane, target } of plan) result = attack(result, 'enemy', lane, target)
    expect(result.player.health).toBeLessThan(20)
  })

  it('declines to attack when swinging only loses material', () => {
    const base = blankGame()
    const game: GameState = {
      ...base,
      turn: 'enemy',
      player: {
        ...base.player,
        health: 24,
        board: [makeUnit({ attack: 9, currentHealth: 9, effect: 'guard' }), null, null],
      },
      enemy: { ...base.enemy, board: [makeUnit({ attack: 1, currentHealth: 1 }), null, null] },
    }

    // The only legal swing is a 1/1 into a 9/9 guard: it dies and achieves
    // nothing. Standing pat is the baseline every line has to beat.
    expect(planAttacks(game, 'enemy')).toEqual([])
  })

  it('never plans more swings than it has attackers', () => {
    const base = blankGame()
    const game: GameState = {
      ...base,
      turn: 'enemy',
      player: { ...base.player, health: 24 },
      enemy: { ...base.enemy, board: [makeUnit({ attack: 3, currentHealth: 3 }), null, null] },
    }
    expect(planAttacks(game, 'enemy').length).toBeLessThanOrEqual(1)
  })
})
