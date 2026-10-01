// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HomeDeckShowcase } from './HomeDeckShowcase'

afterEach(cleanup)

const cards = [
  { id: 'spark-imp', name: 'Crawling Spark', rarity: 'common' },
  { id: 'wind-stalker', name: 'Wind-Stalker', rarity: 'rare' },
]

function renderShowcase(overrides: Partial<Parameters<typeof HomeDeckShowcase>[0]> = {}) {
  const props = {
    deckName: 'Main',
    deckSize: 13,
    deckGoal: 14,
    ready: false,
    cards,
    canCycle: true,
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onOpen: vi.fn(),
    ...overrides,
  }
  render(<HomeDeckShowcase {...props} />)
  return props
}

describe('HomeDeckShowcase', () => {
  it('names the deck and how far it is from playable', () => {
    renderShowcase()
    expect(screen.getByText('Main')).toBeTruthy()
    expect(screen.getByText(/13 cards · 1 short/)).toBeTruthy()
  })

  it('steps through decks and opens the collection', () => {
    const props = renderShowcase()
    fireEvent.click(screen.getByRole('button', { name: /next deck/i }))
    fireEvent.click(screen.getByRole('button', { name: /previous deck/i }))
    fireEvent.click(screen.getByRole('button', { name: /open in the collection/i }))
    expect(props.onNext).toHaveBeenCalledTimes(1)
    expect(props.onPrevious).toHaveBeenCalledTimes(1)
    expect(props.onOpen).toHaveBeenCalledTimes(1)
  })

  it('hides the arrows when there is only one deck', () => {
    renderShowcase({ canCycle: false, ready: true, deckSize: 14 })
    expect(screen.queryByRole('button', { name: /next deck/i })).toBeNull()
    expect(screen.getByText(/14 cards · Ready/)).toBeTruthy()
  })
})
