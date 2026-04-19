// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TopBar } from './TopBar'

describe('TopBar mobile variants', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps home actions visible while using an icon-led home header', () => {
    render(
      <TopBar
        screenTitle="Arena Home"
        serverProfile={{
          username: 'josh',
          runes: 180,
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
        soundEnabled={true}
        onToggleSound={() => {}}
        installPromptEvent={null}
        onInstallApp={() => {}}
        onLogout={() => {}}
      />,
    )

    expect(screen.getByRole('img', { name: /fractured arcanum home crest/i })).toBeTruthy()
    expect(screen.queryByText('Arena Home')).toBeNull()
    expect(screen.queryByText('Fractured Arcanum')).toBeNull()
    expect(screen.getByRole('button', { name: /sound on/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /logout/i })).toBeTruthy()
  })

  it('renders a compact header without home action buttons on inner screens', () => {
    render(
      <TopBar
        screenTitle="Collection"
        serverProfile={{
          username: 'josh',
          runes: 180,
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
        soundEnabled={true}
        onToggleSound={() => {}}
        installPromptEvent={null}
        onInstallApp={() => {}}
        onLogout={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: /logout/i })).toBeNull()
    expect(screen.queryByText('Fractured Arcanum')).toBeNull()
    expect(screen.getByText('Collection')).toBeTruthy()
  })
})
