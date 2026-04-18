// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { act } from 'react'
import { useSceneSwipe } from './useSceneSwipe'
import { SCENE_SWIPE_OPT_OUT_ATTR } from '../utils/sceneSwipe'

type HarnessProps = {
  isBattleScreen?: boolean
  enabled?: boolean
  onCommit: (direction: 'prev' | 'next') => void
  optOut?: boolean
}

function Harness({ isBattleScreen = false, enabled = true, onCommit, optOut = false }: HarnessProps) {
  const bind = useSceneSwipe({ isBattleScreen, enabled, onCommit })
  return (
    <div data-testid="stage" {...bind}>
      <div
        data-testid="rail"
        {...(optOut ? { [SCENE_SWIPE_OPT_OUT_ATTR]: '' } : {})}
      >
        <span data-testid="rail-child">child</span>
      </div>
    </div>
  )
}

type FakeTouch = { identifier: number; clientX: number; clientY: number; target: EventTarget }

function makeTouchEvent(
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: FakeTouch[],
  changedTouches?: FakeTouch[],
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    touches: FakeTouch[]
    targetTouches: FakeTouch[]
    changedTouches: FakeTouch[]
  }
  event.touches = touches
  event.targetTouches = touches
  event.changedTouches = changedTouches ?? touches
  return event
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

describe('useSceneSwipe — integration', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('fires onCommit("next") for a left-swipe past the distance threshold', () => {
    setViewportWidth(400) // 25% threshold = 100px
    const onCommit = vi.fn()
    const { getByTestId } = render(<Harness onCommit={onCommit} />)
    const stage = getByTestId('stage')
    const start: FakeTouch = { identifier: 1, clientX: 300, clientY: 100, target: stage }
    const end: FakeTouch = { identifier: 1, clientX: 140, clientY: 105, target: stage }

    act(() => {
      stage.dispatchEvent(makeTouchEvent('touchstart', [start]))
      stage.dispatchEvent(makeTouchEvent('touchmove', [end]))
      stage.dispatchEvent(makeTouchEvent('touchend', [], [end]))
    })

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('next')
  })

  it('fires onCommit("prev") for a right-swipe past the distance threshold', () => {
    setViewportWidth(400)
    const onCommit = vi.fn()
    const { getByTestId } = render(<Harness onCommit={onCommit} />)
    const stage = getByTestId('stage')
    const start: FakeTouch = { identifier: 9, clientX: 60, clientY: 200, target: stage }
    const end: FakeTouch = { identifier: 9, clientX: 240, clientY: 205, target: stage }

    act(() => {
      stage.dispatchEvent(makeTouchEvent('touchstart', [start]))
      stage.dispatchEvent(makeTouchEvent('touchmove', [end]))
      stage.dispatchEvent(makeTouchEvent('touchend', [], [end]))
    })

    expect(onCommit).toHaveBeenCalledWith('prev')
  })

  it('never commits when isBattleScreen is true', () => {
    setViewportWidth(400)
    const onCommit = vi.fn()
    const { getByTestId } = render(<Harness onCommit={onCommit} isBattleScreen />)
    const stage = getByTestId('stage')
    const start: FakeTouch = { identifier: 1, clientX: 300, clientY: 100, target: stage }
    const end: FakeTouch = { identifier: 1, clientX: 50, clientY: 110, target: stage }

    act(() => {
      stage.dispatchEvent(makeTouchEvent('touchstart', [start]))
      stage.dispatchEvent(makeTouchEvent('touchend', [], [end]))
    })

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('never commits when the touch starts inside an opt-out ancestor', () => {
    setViewportWidth(400)
    const onCommit = vi.fn()
    const { getByTestId } = render(<Harness onCommit={onCommit} optOut />)
    const stage = getByTestId('stage')
    const child = getByTestId('rail-child')
    const start: FakeTouch = { identifier: 1, clientX: 300, clientY: 100, target: child }
    const end: FakeTouch = { identifier: 1, clientX: 50, clientY: 110, target: child }

    act(() => {
      child.dispatchEvent(makeTouchEvent('touchstart', [start]))
      stage.dispatchEvent(makeTouchEvent('touchend', [], [end]))
    })

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('never commits when enabled is false', () => {
    setViewportWidth(400)
    const onCommit = vi.fn()
    const { getByTestId } = render(<Harness onCommit={onCommit} enabled={false} />)
    const stage = getByTestId('stage')
    const start: FakeTouch = { identifier: 1, clientX: 300, clientY: 100, target: stage }
    const end: FakeTouch = { identifier: 1, clientX: 50, clientY: 110, target: stage }

    act(() => {
      stage.dispatchEvent(makeTouchEvent('touchstart', [start]))
      stage.dispatchEvent(makeTouchEvent('touchend', [], [end]))
    })

    expect(onCommit).not.toHaveBeenCalled()
  })
})
