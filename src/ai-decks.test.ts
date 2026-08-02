import { describe, expect, it } from 'vitest'
import {
  AI_DIFFICULTY_DECKS,
  CARD_LIBRARY,
  MAX_COPIES,
  MAX_DECK_SIZE,
  MAX_LEGENDARY_COPIES,
  MIN_DECK_SIZE,
  getDeckSize,
  type AIDifficulty,
  type DeckConfig,
} from './game'

/**
 * The AI decks, against the rules that make them work.
 *
 * These were rebuilt after `npm run ai:arena` showed the difficulty ladder ran
 * backwards at the top: the Legend deck was the third best of the four, and
 * every difficulty's weights performed worse holding it than holding Adept's.
 * The cause was that difficulty had been expressed as *more expensive cards*,
 * which on a 24-health, three-lane, three-card-hand clock is a handicap.
 *
 * Win rates need the simulator and are far too slow for a unit test, so what is
 * pinned here is the deck *shape* — the properties the measured ladder depends
 * on. A future edit that reintroduces a pile of expensive singletons fails here
 * in milliseconds instead of silently undoing the work.
 */

const DIFFICULTIES: AIDifficulty[] = ['novice', 'adept', 'veteran', 'legend']
const byId = new Map(CARD_LIBRARY.map((card) => [card.id, card]))

function cardsOf(config: DeckConfig) {
  const cards = []
  for (const [id, count] of Object.entries(config)) {
    const card = byId.get(id)
    if (!card) throw new Error(`unknown card id "${id}"`)
    for (let i = 0; i < (count ?? 0); i += 1) cards.push(card)
  }
  return cards
}

function averageCost(config: DeckConfig) {
  const cards = cardsOf(config)
  return cards.reduce((sum, card) => sum + card.cost, 0) / cards.length
}

describe('AI decks are legal', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty} is a deck the game would accept from a player`, () => {
      const config = AI_DIFFICULTY_DECKS[difficulty]
      const size = getDeckSize(config)

      expect(size).toBeGreaterThanOrEqual(MIN_DECK_SIZE)
      expect(size).toBeLessThanOrEqual(MAX_DECK_SIZE)

      for (const [id, count] of Object.entries(config)) {
        const card = byId.get(id)
        expect(card, `${difficulty} references unknown card "${id}"`).toBeTruthy()
        const limit = card!.rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES
        expect(count, `${difficulty} runs ${count}x ${id}, over the limit of ${limit}`).toBeLessThanOrEqual(limit)
      }
    })
  }
})

describe('AI decks respect the clock', () => {
  /**
   * The binding constraint. One mana a turn, a three-card opening hand and
   * games that end around turn eight mean a deck averaging four mana spends the
   * first half of the game holding cards it cannot cast. The old Legend deck
   * averaged 4.21 and lost to decks averaging 2.8.
   */
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty} averages under 3.5 mana`, () => {
      expect(averageCost(AI_DIFFICULTY_DECKS[difficulty])).toBeLessThan(3.5)
    })
  }

  it('gets more expensive as it gets harder, but only slightly', () => {
    const costs = DIFFICULTIES.map((difficulty) => averageCost(AI_DIFFICULTY_DECKS[difficulty]))
    // Monotonic non-decreasing: a harder deck may reach further up the curve.
    for (let i = 1; i < costs.length; i += 1) {
      expect(costs[i], `${DIFFICULTIES[i]} is cheaper than ${DIFFICULTIES[i - 1]}`)
        .toBeGreaterThanOrEqual(costs[i - 1] - 0.01)
    }
    // But never by much. Difficulty is power and consistency, not mana.
    expect(costs[3] - costs[0]).toBeLessThan(1.5)
  })
})

describe('AI decks follow the design bible', () => {
  /** Novice: commons only, no keyword more complex than Guard. */
  it('novice runs commons with no keyword beyond Guard', () => {
    for (const card of cardsOf(AI_DIFFICULTY_DECKS.novice)) {
      expect(card.rarity, `novice runs ${card.id}, a ${card.rarity}`).toBe('common')
      if (card.effect) {
        expect(card.effect, `novice runs ${card.id} with effect "${card.effect}"`).toBe('guard')
      }
    }
  })

  /**
   * Novice may not wall the game up. An earlier rebuild ran four blockers and
   * stalled: 27 games in 200 hit the turn limit and the average ran to 21
   * turns, because a starter deck cannot chew through 1/4 and 2/4 bodies. A
   * difficulty nobody can lose to and nobody can beat is not easy, it is dull.
   */
  it('novice runs at most two blockers', () => {
    const guards = cardsOf(AI_DIFFICULTY_DECKS.novice).filter((card) => card.effect === 'guard')
    expect(guards.length, `novice runs ${guards.length} Guard bodies and will stall`).toBeLessThanOrEqual(2)
  })

  it('legend includes epics', () => {
    const rarities = new Set(cardsOf(AI_DIFFICULTY_DECKS.legend).map((card) => card.rarity))
    expect(rarities.has('epic'), 'legend runs no epics').toBe(true)
  })

  /**
   * The top difficulty should draw its plan reliably rather than draw bigger
   * cards. Fourteen singletons was the old Legend deck's real defect.
   */
  it('legend is built on redundancy, not singletons', () => {
    const counts = Object.values(AI_DIFFICULTY_DECKS.legend)
    const singletons = counts.filter((count) => count === 1).length
    expect(singletons, 'legend is mostly singletons again').toBeLessThanOrEqual(2)
    expect(Math.max(...counts), 'legend has no card it can rely on drawing').toBeGreaterThanOrEqual(3)
  })

  /**
   * The AI plays greedily — highest-scoring affordable card, then attacks lane
   * by lane, with no sequencing or curve planning. That is an adequate
   * aggressive player and a poor control one, so the harder decks have to be
   * able to close. Reach means Charge: damage the turn it lands.
   */
  it('veteran and legend can close a game', () => {
    for (const difficulty of ['veteran', 'legend'] as const) {
      const charge = cardsOf(AI_DIFFICULTY_DECKS[difficulty]).filter((card) => card.effect === 'charge')
      expect(charge.length, `${difficulty} has no Charge and cannot convert late mana into damage`)
        .toBeGreaterThanOrEqual(2)
    }
  })
})
