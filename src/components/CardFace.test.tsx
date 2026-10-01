// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CardFace } from './CardFace'

afterEach(cleanup)

const card = { id: 'spark-imp', name: 'Crawling Spark', cost: 1, attack: 3, health: 4, rarity: 'common', tribe: 'elemental' }

describe('CardFace stat colours', () => {
  it('marks damaged health red and leaves undamaged stats plain', () => {
    const { container } = render(<CardFace card={card} variant="board" currentHealth={2} base={{ attack: 3, health: 4 }} />)
    expect(container.querySelector('.cf-health.is-damaged')).toBeTruthy()
    expect(container.querySelector('.cf-attack.is-buffed')).toBeNull()
  })

  it('marks stats above their printed values green', () => {
    const { container } = render(<CardFace card={card} variant="board" currentHealth={4} base={{ attack: 2, health: 3 }} />)
    expect(container.querySelector('.cf-attack.is-buffed')).toBeTruthy()
    expect(container.querySelector('.cf-health.is-buffed')).toBeTruthy()
  })

  it('never reads as buffed without printed stats to compare against', () => {
    const { container } = render(<CardFace card={card} variant="hand" />)
    expect(container.querySelector('.is-buffed')).toBeNull()
    expect(container.querySelector('.cf-cost')?.getAttribute('aria-label')).toBe('Costs 1 mana')
  })
})
