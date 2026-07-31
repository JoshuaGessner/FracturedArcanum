// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QuestLedgerPanel } from './QuestLedgerPanel'
import type { QuestCadence, QuestOverview, QuestProgress } from '../types'

// This project runs vitest without globals, so @testing-library/react cannot
// register its own afterEach hook. Without an explicit cleanup, every render
// accumulates in document.body and `screen` queries match across tests.
afterEach(cleanup)

let seq = 0
function quest(overrides: Partial<QuestProgress> & { cadence: QuestCadence }): QuestProgress {
  seq += 1
  return {
    id: `quest-${seq}`,
    tier: 'bronze',
    title: `Quest ${seq}`,
    description: 'Do the thing.',
    category: 'Battle',
    objective: { type: 'win_matches' },
    reward: { shards: 50 },
    icon: 'battle',
    progress: 0,
    target: 3,
    completed: false,
    claimed: false,
    periodKey: '2026-07-30',
    expiresAt: null,
    slotIndex: 0,
    rerolled: false,
    tierIndex: null,
    tierLabel: null,
    ...overrides,
  } as QuestProgress
}

function overviewOf(quests: QuestProgress[], claimable = 0): QuestOverview {
  return {
    quests,
    chains: [],
    summary: {
      total: quests.length,
      completed: quests.filter((q) => q.completed).length,
      claimable,
      claimed: quests.filter((q) => q.claimed).length,
      dailyClaimable: 0,
      weeklyClaimable: 0,
      milestoneClaimable: 0,
      skirmishClaimable: 0,
    },
    rerolls: { daily: true, weekly: true },
  } as QuestOverview
}

function setup(overview: QuestOverview | null) {
  const onBack = vi.fn()
  const onClaimQuest = vi.fn()
  const onClaimQuests = vi.fn()
  const view = render(
    <QuestLedgerPanel
      overview={overview}
      onBack={onBack}
      onClaimQuest={onClaimQuest}
      onClaimQuests={onClaimQuests}
    />,
  )
  return { onBack, onClaimQuest, onClaimQuests, ...view }
}

describe('QuestLedgerPanel', () => {
  it('opens on the daily tab', () => {
    const { container } = setup(overviewOf([quest({ cadence: 'daily', title: 'Win three' })]))
    expect(screen.getByText('Win three')).toBeTruthy()
    // "Daily" also appears as the toolbar heading for the active cadence, so
    // scope to the tab strip.
    const active = container.querySelectorAll('.quest-ledger-tabs button.active')
    expect(active).toHaveLength(1)
    expect(active[0].textContent).toBe('Daily')
  })

  it('shows only the active cadence, and switches on tab press', () => {
    setup(overviewOf([
      quest({ cadence: 'daily', title: 'Daily one' }),
      quest({ cadence: 'weekly', title: 'Weekly one' }),
    ]))
    expect(screen.getByText('Daily one')).toBeTruthy()
    expect(screen.queryByText('Weekly one')).toBeNull()

    fireEvent.click(screen.getByText('Weekly'))
    expect(screen.getByText('Weekly one')).toBeTruthy()
    expect(screen.queryByText('Daily one')).toBeNull()
  })

  it('counts only unclaimed completed quests on a tab badge', () => {
    setup(overviewOf([
      quest({ cadence: 'weekly', completed: true, claimed: false }),
      quest({ cadence: 'weekly', completed: true, claimed: true }),
      quest({ cadence: 'weekly', completed: false }),
    ]))
    // Ready-to-claim count is appended to the tab label; claimed ones excluded.
    expect(screen.getByText('Weekly 1')).toBeTruthy()
  })

  it('omits the count entirely when a tab has nothing ready', () => {
    setup(overviewOf([quest({ cadence: 'weekly', completed: false })]))
    expect(screen.getByText('Weekly')).toBeTruthy()
  })

  it('reports the ready count and total reward for the active tab', () => {
    setup(overviewOf([
      quest({ cadence: 'daily', completed: true, reward: { shards: 50 } }),
      quest({ cadence: 'daily', completed: true, reward: { shards: 70 } }),
    ]))
    expect(screen.getByText('2 Ready')).toBeTruthy()
    expect(screen.getByText('120 Shards waiting in this ledger.')).toBeTruthy()
  })

  it('falls back to rotation copy when nothing is claimable', () => {
    setup(overviewOf([quest({ cadence: 'daily' })]))
    expect(screen.getByText(/Fresh contracts rotate/)).toBeTruthy()
    expect(screen.getByText('0 Ready')).toBeTruthy()
  })

  it('summarises completion for the active tab only', () => {
    setup(overviewOf([
      quest({ cadence: 'daily', completed: true }),
      quest({ cadence: 'daily', completed: false }),
      quest({ cadence: 'weekly', completed: true }),
    ]))
    expect(screen.getByText('1/2 Daily Complete')).toBeTruthy()
  })

  describe('claiming', () => {
    it('disables Claim until a quest is complete', () => {
      setup(overviewOf([quest({ cadence: 'daily', completed: false })]))
      expect((screen.getByText('Claim') as HTMLButtonElement).disabled).toBe(true)
    })

    it('disables Claim once already claimed', () => {
      setup(overviewOf([quest({ cadence: 'daily', completed: true, claimed: true })]))
      expect((screen.getByText('Claim') as HTMLButtonElement).disabled).toBe(true)
    })

    it('enables Claim and reports the quest id', () => {
      const { onClaimQuest } = setup(
        overviewOf([quest({ cadence: 'daily', id: 'q-win', completed: true })]),
      )
      const button = screen.getByText('Claim') as HTMLButtonElement
      expect(button.disabled).toBe(false)
      fireEvent.click(button)
      expect(onClaimQuest).toHaveBeenCalledWith('q-win')
    })

    it('offers claim-all only when more than one is ready', () => {
      setup(overviewOf([quest({ cadence: 'daily', completed: true })]))
      expect(screen.queryByText('Claim Ready Rewards')).toBeNull()

      cleanup()
      setup(overviewOf([
        quest({ cadence: 'daily', completed: true }),
        quest({ cadence: 'daily', completed: true }),
      ]))
      expect(screen.getByText('Claim Ready Rewards')).toBeTruthy()
    })

    it('claim-all sends only the ready quests on the active tab', () => {
      const { onClaimQuests } = setup(overviewOf([
        quest({ cadence: 'daily', id: 'ready-a', completed: true }),
        quest({ cadence: 'daily', id: 'ready-b', completed: true }),
        quest({ cadence: 'daily', id: 'already', completed: true, claimed: true }),
        quest({ cadence: 'daily', id: 'not-done', completed: false }),
        quest({ cadence: 'weekly', id: 'other-tab', completed: true }),
      ]))
      fireEvent.click(screen.getByText('Claim Ready Rewards'))
      expect(onClaimQuests).toHaveBeenCalledWith(['ready-a', 'ready-b'])
    })
  })

  it('shows an empty state when a tab has no contracts', () => {
    setup(overviewOf([quest({ cadence: 'daily' })]))
    fireEvent.click(screen.getByText('Milestones'))
    expect(screen.getByText('No contracts posted')).toBeTruthy()
  })

  it('renders without an overview at all', () => {
    setup(null)
    expect(screen.getByText('No contracts posted')).toBeTruthy()
    expect(screen.getByText('0 Ready')).toBeTruthy()
  })

  it('goes back when the Back control is pressed', () => {
    const { onBack } = setup(overviewOf([quest({ cadence: 'daily' })]))
    fireEvent.click(screen.getByText('Back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('caps the progress bar at 100% when progress overshoots the target', () => {
    const { container } = setup(
      overviewOf([quest({ cadence: 'daily', progress: 9, target: 3, completed: true })]),
    )
    const fill = container.querySelector('.quest-progress-track span') as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('opts the tab strip out of the scene-swipe gesture', () => {
    const { container } = setup(overviewOf([quest({ cadence: 'daily' })]))
    expect(
      container.querySelector('.quest-ledger-tabs')!.getAttribute('data-scene-swipe-opt-out'),
    ).toBe('true')
  })
})
