// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RewardCinemaOverlay } from './RewardCinemaOverlay'
import { buildPackSummarySequence, type RewardBeat } from './RewardCinemaSequence'
import { UI_ASSETS } from '../constants'

const playSoundMock = vi.fn()
const feedbackMock = vi.fn()

vi.mock('../audio', () => ({
  playSound: (...args: unknown[]) => playSoundMock(...args),
}))

vi.mock('../feedback', () => ({
  feedback: (...args: unknown[]) => feedbackMock(...args),
}))

const sampleSequence: RewardBeat[] = [
  {
    id: 'banner-beat',
    kind: 'banner',
    label: 'Victory Secured',
    iconAsset: '/generated/ui/overlay-victory.svg',
    sound: 'win',
  },
  {
    id: 'count-beat',
    kind: 'count',
    label: 'Shards Earned',
    value: 30,
    valueLabel: 'Shards',
  },
  {
    id: 'card-beat',
    kind: 'card',
    label: 'Bronze Standing',
    iconAsset: '/generated/ui/rank-bronze.svg',
  },
]

function configureMatchMedia(reduced: boolean) {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: matchMedia,
  })
}

describe('RewardCinemaOverlay', () => {
  beforeEach(() => {
    playSoundMock.mockReset()
    feedbackMock.mockReset()
    configureMatchMedia(false)
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders nothing when sequence is null', () => {
    const { container } = render(
      <RewardCinemaOverlay sequence={null} soundEnabled={false} hapticsEnabled={false} onClose={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when sequence is empty', () => {
    const { container } = render(
      <RewardCinemaOverlay sequence={[]} soundEnabled={false} hapticsEnabled={false} onClose={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('starts on the first beat with Continue disabled until the last beat', () => {
    render(
      <RewardCinemaOverlay sequence={sampleSequence} soundEnabled={false} hapticsEnabled={false} onClose={() => {}} />,
    )
    expect(screen.getByText('Victory Secured')).toBeTruthy()
    const continueBtn = screen.getByTestId('reward-cinema-continue') as HTMLButtonElement
    expect(continueBtn.disabled).toBe(true)
  })

  it('plays the beat sound through playSound when soundEnabled is true', () => {
    render(
      <RewardCinemaOverlay sequence={sampleSequence} soundEnabled={true} hapticsEnabled={true} onClose={() => {}} />,
    )
    expect(playSoundMock).toHaveBeenCalledWith('win', true)
  })

  it('advances beats automatically on the timer and enables Continue at the end', () => {
    render(
      <RewardCinemaOverlay sequence={sampleSequence} soundEnabled={false} hapticsEnabled={false} onClose={() => {}} />,
    )

    // Advance past the banner beat (1100ms) — should land on the count beat.
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(screen.getByText('Shards Earned')).toBeTruthy()
    expect((screen.getByTestId('reward-cinema-continue') as HTMLButtonElement).disabled).toBe(true)

    // Advance past the count beat (1300ms) — should land on the final card beat.
    act(() => {
      vi.advanceTimersByTime(1300)
    })
    expect(screen.getByText('Bronze Standing')).toBeTruthy()
    expect((screen.getByTestId('reward-cinema-continue') as HTMLButtonElement).disabled).toBe(false)
  })

  it('requires an explicit Continue click to fire onClose', () => {
    const onClose = vi.fn()
    render(
      <RewardCinemaOverlay sequence={sampleSequence} soundEnabled={true} hapticsEnabled={true} onClose={onClose} />,
    )

    // Walk through every beat. The component must not auto-dismiss after the
    // last beat lands — it has to wait for the Continue button.
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    act(() => {
      vi.advanceTimersByTime(1300)
    })
    expect(onClose).not.toHaveBeenCalled()
    const continueBtn = screen.getByTestId('reward-cinema-continue') as HTMLButtonElement
    expect(continueBtn.disabled).toBe(false)

    fireEvent.click(continueBtn)
    expect(feedbackMock).toHaveBeenCalledWith('claim', true, true)

    // The overlay plays a 260ms exit animation before calling onClose.
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('builds pack recaps without battle-victory framing', () => {
    const sequence = buildPackSummarySequence({
      packId: 'premium',
      cards: [
        { id: 'spark-imp', rarity: 'common', duplicate: false },
        { id: 'venom-drake', rarity: 'rare', duplicate: true },
      ],
      shardsRefunded: 10,
    })

    expect(sequence[0]?.label).toMatch(/pack/i)
    expect(sequence[0]?.label).not.toMatch(/victory|won|secured/i)
    expect(sequence[0]?.iconAsset).not.toBe(UI_ASSETS.overlays.victory)
    expect(sequence.some((beat) => beat.label === 'New Cards Added')).toBe(true)
  })

  it('marks the reward overlay as swipe-isolated', () => {
    render(
      <RewardCinemaOverlay sequence={sampleSequence} soundEnabled={false} hapticsEnabled={false} onClose={() => {}} />,
    )

    const dialog = screen.getByRole('dialog', { name: /reward cinematic/i })
    expect(dialog.getAttribute('data-scene-swipe-opt-out')).toBe('true')
  })

  it('respects prefers-reduced-motion: skips ember shower and collapses timing', () => {
    configureMatchMedia(true)
    const reducedSequence: RewardBeat[] = [
      {
        id: 'shower-beat',
        kind: 'shower',
        label: 'Promotion',
        iconAsset: '/generated/ui/rank-gold.svg',
      },
      {
        id: 'final-beat',
        kind: 'card',
        label: 'Gold Reached',
        iconAsset: '/generated/ui/rank-gold.svg',
      },
    ]

    const { container } = render(
      <RewardCinemaOverlay sequence={reducedSequence} soundEnabled={false} hapticsEnabled={false} onClose={() => {}} />,
    )

    // Reduced motion class is applied to the overlay shell.
    expect(container.querySelector('.reward-cinema-overlay.reduced-motion')).not.toBeNull()
    // Ember shower must NOT render in reduced-motion mode.
    expect(container.querySelector('.reward-cinema-shower')).toBeNull()

    // Reduced motion collapses inter-beat timing to ~280ms — advancing 320ms
    // is enough to reach the final beat.
    act(() => {
      vi.advanceTimersByTime(320)
    })
    expect(screen.getByText('Gold Reached')).toBeTruthy()
    expect((screen.getByTestId('reward-cinema-continue') as HTMLButtonElement).disabled).toBe(false)
  })
})
