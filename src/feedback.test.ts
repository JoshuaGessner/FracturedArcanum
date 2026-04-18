import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feedback, FEEDBACK_TABLE, type FeedbackKind } from './feedback'

const playSoundMock = vi.fn()
const pulseFeedbackMock = vi.fn()

vi.mock('./audio', () => ({
  playSound: (...args: unknown[]) => playSoundMock(...args),
}))

vi.mock('./utils', () => ({
  pulseFeedback: (...args: unknown[]) => pulseFeedbackMock(...args),
}))

describe('feedback()', () => {
  beforeEach(() => {
    playSoundMock.mockReset()
    pulseFeedbackMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('exposes one profile per documented kind', () => {
    const expected: FeedbackKind[] = [
      'tap',
      'confirm',
      'cancel',
      'error',
      'nav',
      'select',
      'equip',
      'claim',
      'purchase',
      'inspect',
    ]
    expect(Object.keys(FEEDBACK_TABLE).sort()).toEqual([...expected].sort())
  })

  it('routes the canonical sound + haptic for tap', () => {
    feedback('tap', true)
    expect(playSoundMock).toHaveBeenCalledWith('tap', true)
    expect(pulseFeedbackMock).toHaveBeenCalledWith(8)
  })

  it('passes the sound-enabled flag through to playSound', () => {
    feedback('confirm', false)
    expect(playSoundMock).toHaveBeenCalledWith('match', false)
    expect(pulseFeedbackMock).toHaveBeenCalledWith(18)
  })

  it('skips playSound when the kind is haptic-only (inspect)', () => {
    feedback('inspect', true)
    expect(playSoundMock).not.toHaveBeenCalled()
    expect(pulseFeedbackMock).toHaveBeenCalledWith(12)
  })

  it('uses distinct sound profiles for purchase vs equip vs claim', () => {
    feedback('purchase', true)
    feedback('equip', true)
    feedback('claim', true)
    expect(playSoundMock.mock.calls.map((call) => call[0])).toEqual(['summon', 'tap', 'win'])
  })

  it('plays the error cue with a stronger haptic pulse', () => {
    feedback('error', true)
    expect(playSoundMock).toHaveBeenCalledWith('error', true)
    expect(pulseFeedbackMock).toHaveBeenCalledWith(30)
  })

  // ─── Phase 3Z — hapticsEnabled gating ───────────────────────────
  it('suppresses haptic when hapticsEnabled is false', () => {
    feedback('tap', true, false)
    expect(playSoundMock).toHaveBeenCalledWith('tap', true)
    expect(pulseFeedbackMock).not.toHaveBeenCalled()
  })

  it('still plays sound when hapticsEnabled is false', () => {
    feedback('confirm', true, false)
    expect(playSoundMock).toHaveBeenCalledWith('match', true)
    expect(pulseFeedbackMock).not.toHaveBeenCalled()
  })

  it('fires haptic when hapticsEnabled is true (explicit)', () => {
    feedback('error', true, true)
    expect(playSoundMock).toHaveBeenCalledWith('error', true)
    expect(pulseFeedbackMock).toHaveBeenCalledWith(30)
  })

  it('fully silent when both sound and haptics disabled', () => {
    feedback('claim', false, false)
    expect(playSoundMock).toHaveBeenCalledWith('win', false)
    expect(pulseFeedbackMock).not.toHaveBeenCalled()
  })

  it('defaults hapticsEnabled to true for backward compat', () => {
    feedback('nav', true)
    expect(pulseFeedbackMock).toHaveBeenCalledWith(10)
  })
})
