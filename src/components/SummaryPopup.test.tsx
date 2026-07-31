// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SummaryPopup } from './SummaryPopup'

const actions = [{ label: 'Continue', onClick: () => {} }]

// This project runs vitest without globals, so @testing-library/react cannot
// register its own afterEach hook. Without an explicit cleanup, every render
// accumulates in document.body and `screen` queries match across tests.
afterEach(cleanup)

describe('SummaryPopup', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(
      <SummaryPopup visible={false} ariaLabel="Battle result" title="Victory" actions={actions} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('exposes dialog semantics with the supplied label', () => {
    const { container } = render(
      <SummaryPopup visible ariaLabel="Battle result" title="Victory" actions={actions} />,
    )
    const overlay = container.querySelector('.summary-popup-overlay')!
    expect(overlay.getAttribute('role')).toBe('dialog')
    expect(overlay.getAttribute('aria-modal')).toBe('true')
    expect(overlay.getAttribute('aria-label')).toBe('Battle result')
  })

  it('opts out of the scene-swipe gesture so a swipe cannot dismiss it', () => {
    const { container } = render(
      <SummaryPopup visible ariaLabel="Battle result" title="Victory" actions={actions} />,
    )
    const overlay = container.querySelector('.summary-popup-overlay')!
    expect(overlay.getAttribute('data-scene-swipe-opt-out')).toBe('true')
  })

  it('defaults the eyebrow to Summary and allows an override', () => {
    render(<SummaryPopup visible ariaLabel="a" title="Victory" actions={actions} />)
    expect(screen.getByText('Summary')).toBeTruthy()

    cleanup()
    render(<SummaryPopup visible ariaLabel="a" title="Victory" eyebrow="Round 3" actions={actions} />)
    expect(screen.getByText('Round 3')).toBeTruthy()
  })

  it('applies the tone class, defaulting to neutral', () => {
    const neutral = render(
      <SummaryPopup visible ariaLabel="a" title="Done" actions={actions} />,
    )
    expect(neutral.container.querySelector('.summary-popup-neutral')).toBeTruthy()

    const victory = render(
      <SummaryPopup visible ariaLabel="a" title="Won" tone="victory" actions={actions} />,
    )
    expect(victory.container.querySelector('.summary-popup-victory')).toBeTruthy()
  })

  it('omits the note and highlights when they are not supplied', () => {
    const { container } = render(
      <SummaryPopup visible ariaLabel="a" title="Victory" actions={actions} />,
    )
    expect(container.querySelector('.summary-popup-note')).toBeNull()
    expect(container.querySelector('.summary-popup-highlights')).toBeNull()
  })

  it('renders a highlight badge per entry', () => {
    render(
      <SummaryPopup
        visible
        ariaLabel="a"
        title="Victory"
        note="Well fought."
        highlights={['+50 Shards', '3 turns', 'Flawless']}
        actions={actions}
      />,
    )
    expect(screen.getByText('Well fought.')).toBeTruthy()
    expect(screen.getByText('+50 Shards')).toBeTruthy()
    expect(screen.getByText('3 turns')).toBeTruthy()
    expect(screen.getByText('Flawless')).toBeTruthy()
  })

  it('tones the status badge as ready for positive outcomes and warning otherwise', () => {
    const win = render(
      <SummaryPopup visible ariaLabel="a" title="Won" tone="victory" statusBadge="Victory" actions={actions} />,
    )
    expect(win.container.querySelector('.deck-status')!.className).toContain('ready')

    const loss = render(
      <SummaryPopup visible ariaLabel="a" title="Lost" tone="defeat" statusBadge="Defeat" actions={actions} />,
    )
    expect(loss.container.querySelector('.deck-status')!.className).toContain('warning')
  })

  it('flags a single-action layout so it can be centred', () => {
    const one = render(
      <SummaryPopup visible ariaLabel="a" title="Victory" actions={actions} />,
    )
    expect(one.container.querySelector('.summary-popup-actions')!.className)
      .toContain('is-single-action')

    cleanup()
    const two = render(
      <SummaryPopup
        visible
        ariaLabel="a"
        title="Victory"
        actions={[...actions, { label: 'Rematch', onClick: () => {} }]}
      />,
    )
    expect(two.container.querySelector('.summary-popup-actions')!.className)
      .not.toContain('is-single-action')
  })

  it('invokes the matching action handler', () => {
    const first = vi.fn()
    const second = vi.fn()
    render(
      <SummaryPopup
        visible
        ariaLabel="a"
        title="Victory"
        actions={[
          { label: 'Rematch', onClick: first, variant: 'primary' },
          { label: 'Leave', onClick: second },
        ]}
      />,
    )
    fireEvent.click(screen.getByText('Leave'))
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('defaults an action variant to ghost', () => {
    render(
      <SummaryPopup
        visible
        ariaLabel="a"
        title="Victory"
        actions={[
          { label: 'Rematch', onClick: () => {}, variant: 'primary' },
          { label: 'Leave', onClick: () => {} },
        ]}
      />,
    )
    expect(screen.getByText('Rematch').className).toBe('primary')
    expect(screen.getByText('Leave').className).toBe('ghost')
  })
})
