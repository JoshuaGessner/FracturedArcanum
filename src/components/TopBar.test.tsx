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
        shards={180}
        onOpenSettings={() => {}}
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
    // The only button in the home header is the settings/account entry point.
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /settings and account/i })).toBeTruthy()
  })

  it('renders a compact header without home action buttons on inner screens', () => {
    render(
      <TopBar
        screenTitle="Collection"
        shards={180}
        onOpenSettings={() => {}}
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

    // Settings is a top-bar affordance on every screen, not a nav tab.
    expect(screen.getByRole('button', { name: /settings and account/i })).toBeTruthy()
    expect(screen.queryByText('Fractured Arcanum')).toBeNull()
    expect(screen.getByText('Collection')).toBeTruthy()
  })
})
