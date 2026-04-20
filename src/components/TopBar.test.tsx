// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TopBar } from './TopBar'

describe('TopBar mobile variants', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a slimmer home header with the crest, wordmark, and username', () => {
    render(
      <TopBar
        screenTitle="Arena Home"
        serverProfile={{
          username: 'josh',
          shards: 180,
          seasonRating: 1210,
          wins: 3,
          losses: 2,
          streak: 1,
          deckConfig: {},
          ownedThemes: ['royal'],
          selectedTheme: 'royal',
          ownedCardBorders: ['default'],
          selectedCardBorder: 'default',
          lastDaily: '',
          totalEarned: 0,
        }}
      />,
    )

    expect(screen.getByRole('img', { name: /fractured arcanum home crest/i })).toBeTruthy()
    expect(screen.queryByText('Arena Home')).toBeNull()
    expect(screen.getByText('Fractured Arcanum')).toBeTruthy()
    expect(screen.getByText('@josh')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders a compact header without home action buttons on inner screens', () => {
    render(
      <TopBar
        screenTitle="Collection"
        serverProfile={{
          username: 'josh',
          shards: 180,
          seasonRating: 1210,
          wins: 3,
          losses: 2,
          streak: 1,
          deckConfig: {},
          ownedThemes: ['royal'],
          selectedTheme: 'royal',
          ownedCardBorders: ['default'],
          selectedCardBorder: 'default',
          lastDaily: '',
          totalEarned: 0,
        }}
      />,
    )

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('Fractured Arcanum')).toBeNull()
    expect(screen.getByText('Collection')).toBeTruthy()
  })
})
