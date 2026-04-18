// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OnboardingTour } from './OnboardingTour'

const playSoundMock = vi.fn()
const feedbackMock = vi.fn()

vi.mock('../audio', () => ({
  playSound: (...args: unknown[]) => playSoundMock(...args),
}))

vi.mock('../feedback', () => ({
  feedback: (...args: unknown[]) => feedbackMock(...args),
}))

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

describe('OnboardingTour', () => {
  beforeEach(() => {
    playSoundMock.mockReset()
    feedbackMock.mockReset()
    configureMatchMedia(false)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <OnboardingTour
        visible={false}
        soundEnabled={false}
        onComplete={() => {}}
        onSkip={() => {}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the first step caption when visible is true', () => {
    render(
      <OnboardingTour
        visible
        soundEnabled
        onComplete={() => {}}
        onSkip={() => {}}
      />,
    )
    expect(screen.getByText('Welcome to the Arcanum')).toBeTruthy()
    expect(screen.getByText(/Step 1 of 5/)).toBeTruthy()
    expect(screen.getByTestId('onboarding-tour-next').textContent).toBe('Next')
  })

  it('advances steps on Next and calls onComplete on Finish', () => {
    const onComplete = vi.fn()
    const onSkip = vi.fn()
    render(
      <OnboardingTour
        visible
        soundEnabled
        onComplete={onComplete}
        onSkip={onSkip}
      />,
    )
    // Click Next 4 times to reach the final step.
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByTestId('onboarding-tour-next'))
    }
    const finishButton = screen.getByTestId('onboarding-tour-next')
    expect(finishButton.textContent).toBe('Finish')
    expect(screen.getByText(/Step 5 of 5/)).toBeTruthy()
    fireEvent.click(finishButton)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onSkip).not.toHaveBeenCalled()
    expect(playSoundMock).toHaveBeenCalledWith('questComplete', true)
  })

  it('clicking Skip calls onSkip and not onComplete', () => {
    const onComplete = vi.fn()
    const onSkip = vi.fn()
    render(
      <OnboardingTour
        visible
        soundEnabled={false}
        onComplete={onComplete}
        onSkip={onSkip}
      />,
    )
    fireEvent.click(screen.getByTestId('onboarding-tour-skip'))
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('reduced-motion mode renders without animation classes on the veil', () => {
    configureMatchMedia(true)
    render(
      <OnboardingTour
        visible
        soundEnabled={false}
        onComplete={() => {}}
        onSkip={() => {}}
      />,
    )
    const overlay = screen.getByTestId('onboarding-tour')
    expect(overlay.className).toContain('reduced-motion')
    const veil = screen.getByTestId('onboarding-tour-veil')
    expect(veil.className).toContain('reduced-motion')
  })
})
