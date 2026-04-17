import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DECK_CONFIG,
  MIN_DECK_SIZE,
  castMomentumBurst,
  createGame,
  getDeckSize,
  playCard,
  surrenderGame,
} from './game'

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

  it('awards the match to the opponent when a player surrenders', () => {
    const base = createGame('duel', DEFAULT_DECK_CONFIG)
    const result = surrenderGame(base, 'player')

    expect(result.winner).toBe('enemy')
    expect(result.log[0]).toContain('wins by forfeit')
  })
})
