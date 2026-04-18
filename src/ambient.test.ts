import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MockNode = {
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  type?: string
  loop?: boolean
  buffer?: unknown
  frequency: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; cancelScheduledValues: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> }
  Q: { value: number }
  gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; cancelScheduledValues: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> }
}

function makeNode(): MockNode {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  })
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: param(),
    Q: { value: 0 },
    gain: param(),
  }
}

class MockAudioContext {
  currentTime = 0
  destination = {} as AudioDestinationNode
  state = 'running' as AudioContextState
  sampleRate = 44100
  resume = vi.fn(async () => {})
  createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(1024) }))
  createBufferSource = vi.fn(() => makeNode())
  createOscillator = vi.fn(() => makeNode())
  createGain = vi.fn(() => makeNode())
  createBiquadFilter = vi.fn(() => makeNode())
}

describe('ambient scene loops', () => {
  let originalWindow: unknown

  beforeEach(() => {
    vi.useFakeTimers()
    originalWindow = (globalThis as Record<string, unknown>).window
    ;(globalThis as Record<string, unknown>).window = {
      AudioContext: MockAudioContext,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
    }
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window
    } else {
      ;(globalThis as Record<string, unknown>).window = originalWindow
    }
  })

  it('mounts a scene only when audio + ambient are both enabled', async () => {
    const mod = await import('./ambient')
    mod.setAmbientScene('home', false)
    expect(mod.getActiveAmbientScene()).toBeNull()
    mod.setAmbientScene('home', true)
    expect(mod.getActiveAmbientScene()).toBe('home')
  })

  it('switches scenes by tearing down the previous bed', async () => {
    const mod = await import('./ambient')
    mod.setAmbientScene('home', true)
    mod.setAmbientScene('battle', true)
    expect(mod.getActiveAmbientScene()).toBe('battle')
  })

  it('clears the active scene when disabled', async () => {
    const mod = await import('./ambient')
    mod.setAmbientScene('shop', true)
    mod.setAmbientScene('shop', false)
    vi.advanceTimersByTime(1000)
    expect(mod.getActiveAmbientScene()).toBeNull()
  })

  it('no-ops when handed the same scene twice', async () => {
    const mod = await import('./ambient')
    mod.setAmbientScene('collection', true)
    const before = mod.getActiveAmbientScene()
    mod.setAmbientScene('collection', true)
    expect(mod.getActiveAmbientScene()).toBe(before)
  })
})
