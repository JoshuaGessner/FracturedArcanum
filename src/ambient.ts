/**
 * Phase 3V — Ambient Scene Loops
 *
 * Tiny, low-volume Web Audio beds per screen. Not music — just an
 * atmospheric pulse so silence does not feel sterile on mobile. Each
 * scene mounts an oscillator + filtered-noise + slow LFO graph plus an
 * occasional accent (chime, mug clink, quill scratch, drum) on a timer.
 *
 * Exposes a single entry point — {@link setAmbientScene} — that the
 * AppShell calls whenever the active screen or the user's `soundEnabled`
 * / `ambientEnabled` toggles change. All audio nodes route through one
 * master gain that fades 0 → ~0.018 on enter and fades back to 0 on
 * leave so transitions are never jarring.
 *
 * Gating order:
 *   1. `setAmbientScene(scene, enabled)` is the one public function.
 *   2. `enabled` should already be `soundEnabled && ambientEnabled` —
 *      both toggles must be on for any ambient sound to play.
 *   3. The default state of `ambientEnabled` is **false** so we never
 *      surprise users with sound they did not opt into.
 */

export type AmbientScene =
  | 'home'
  | 'play'
  | 'collection'
  | 'social'
  | 'shop'
  | 'settings'
  | 'battle'

const AMBIENT_TARGET_GAIN = 0.018
const AMBIENT_FADE_SEC = 0.6

type SceneCleanup = () => void

let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
let activeScene: AmbientScene | null = null
let activeCleanup: SceneCleanup | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null
  }
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) {
    return null
  }
  audioContext ??= new Ctor()
  if (audioContext.state === 'suspended') {
    void audioContext.resume()
  }
  return audioContext
}

function ensureMaster(ctx: AudioContext): GainNode {
  if (!masterGain) {
    masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0.0001, ctx.currentTime)
    masterGain.connect(ctx.destination)
  }
  return masterGain
}

function fadeMasterTo(ctx: AudioContext, target: number) {
  if (!masterGain) return
  const now = ctx.currentTime
  const safeTarget = Math.max(0.00001, target)
  masterGain.gain.cancelScheduledValues(now)
  // Read the current value so the ramp starts from where we are, not
  // from the most recently scheduled keyframe.
  const current = Math.max(0.00001, masterGain.gain.value)
  masterGain.gain.setValueAtTime(current, now)
  masterGain.gain.exponentialRampToValueAtTime(safeTarget, now + AMBIENT_FADE_SEC)
}

/** Start a slow filtered-noise wash that loops indefinitely. */
function startNoiseBed(
  ctx: AudioContext,
  master: GainNode,
  options: { gain: number; filter: number; q?: number; type?: BiquadFilterType },
): SceneCleanup {
  const bufferSize = Math.floor(ctx.sampleRate * 2)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = options.type ?? 'lowpass'
  filter.frequency.value = options.filter
  if (options.q !== undefined) {
    filter.Q.value = options.q
  }
  const gain = ctx.createGain()
  gain.gain.value = options.gain
  source.connect(filter)
  filter.connect(gain)
  gain.connect(master)
  source.start()
  return () => {
    try {
      source.stop()
    } catch {
      // already stopped — ignore
    }
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
  }
}

/** Slow modulated drone — sine + LFO on its frequency. */
function startDrone(
  ctx: AudioContext,
  master: GainNode,
  options: { freq: number; lfoFreq: number; lfoDepth: number; gain: number; type?: OscillatorType },
): SceneCleanup {
  const osc = ctx.createOscillator()
  osc.type = options.type ?? 'sine'
  osc.frequency.value = options.freq
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = options.lfoFreq
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = options.lfoDepth
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  const gain = ctx.createGain()
  gain.gain.value = options.gain
  osc.connect(gain)
  gain.connect(master)
  osc.start()
  lfo.start()
  return () => {
    try {
      osc.stop()
      lfo.stop()
    } catch {
      // already stopped
    }
    osc.disconnect()
    lfo.disconnect()
    lfoGain.disconnect()
    gain.disconnect()
  }
}

/** Schedule a recurring short accent (chime, mug clink, quill scratch, drum hit). */
function startAccent(
  ctx: AudioContext,
  master: GainNode,
  intervalMs: number,
  fire: (now: number) => void,
): SceneCleanup {
  // Fire once at a small initial delay, then on the cadence so the user
  // gets feedback shortly after entering the scene.
  const initial = window.setTimeout(() => fire(ctx.currentTime + 0.01), 800)
  const id = window.setInterval(() => fire(ctx.currentTime + 0.01), intervalMs)
  return () => {
    window.clearTimeout(initial)
    window.clearInterval(id)
    // master stays connected — accents don't own their nodes long-term;
    // each fire() creates short-lived oscillators that auto-stop.
    void master
  }
}

function tone(
  ctx: AudioContext,
  master: GainNode,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType,
  volume: number,
) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.00001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.04)
  gain.gain.exponentialRampToValueAtTime(0.00001, start + duration)
  osc.connect(gain)
  gain.connect(master)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

function noiseBurst(
  ctx: AudioContext,
  master: GainNode,
  start: number,
  duration: number,
  filterFreq: number,
  volume: number,
) {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration))
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = filterFreq
  filter.Q.value = 0.8
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.00001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.00001, start + duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(master)
  source.start(start)
  source.stop(start + duration + 0.05)
}

// ───── Scene builders ──────────────────────────────────────────────────

function buildHome(ctx: AudioContext, master: GainNode): SceneCleanup {
  // soft wind + distant rune chime ~12s
  const wind = startNoiseBed(ctx, master, { gain: 0.4, filter: 320, q: 0.8 })
  const drone = startDrone(ctx, master, { freq: 110, lfoFreq: 0.07, lfoDepth: 4, gain: 0.18 })
  const chime = startAccent(ctx, master, 12000, (t) => {
    tone(ctx, master, 1320, t, 0.9, 'triangle', 0.18)
    tone(ctx, master, 1760, t + 0.18, 0.7, 'triangle', 0.12)
  })
  return () => {
    wind()
    drone()
    chime()
  }
}

function buildPlay(ctx: AudioContext, master: GainNode): SceneCleanup {
  // distant crowd murmur — filtered noise with slow LFO
  const crowd = startNoiseBed(ctx, master, { gain: 0.5, filter: 480, q: 0.6 })
  const sway = startDrone(ctx, master, { freq: 70, lfoFreq: 0.05, lfoDepth: 6, gain: 0.18, type: 'triangle' })
  return () => {
    crowd()
    sway()
  }
}

function buildCollection(ctx: AudioContext, master: GainNode): SceneCleanup {
  // parchment rustle + low choir hum
  const rustle = startNoiseBed(ctx, master, { gain: 0.22, filter: 2400, q: 0.4, type: 'highpass' })
  const choir = startDrone(ctx, master, { freq: 196, lfoFreq: 0.04, lfoDepth: 1.5, gain: 0.14, type: 'sine' })
  const choir2 = startDrone(ctx, master, { freq: 261, lfoFreq: 0.03, lfoDepth: 1.2, gain: 0.1, type: 'sine' })
  return () => {
    rustle()
    choir()
    choir2()
  }
}

function buildSocial(ctx: AudioContext, master: GainNode): SceneCleanup {
  // crackling fire + faint mug clink ~20s
  const fire = startNoiseBed(ctx, master, { gain: 0.45, filter: 900, q: 1.2 })
  const warmth = startDrone(ctx, master, { freq: 90, lfoFreq: 0.09, lfoDepth: 3, gain: 0.16 })
  const clink = startAccent(ctx, master, 20000, (t) => {
    tone(ctx, master, 1180, t, 0.08, 'triangle', 0.16)
    tone(ctx, master, 1480, t + 0.05, 0.06, 'triangle', 0.12)
  })
  return () => {
    fire()
    warmth()
    clink()
  }
}

function buildShop(ctx: AudioContext, master: GainNode): SceneCleanup {
  // wind-chime tinkle + soft drum
  const air = startNoiseBed(ctx, master, { gain: 0.3, filter: 600, q: 0.7 })
  const drum = startDrone(ctx, master, { freq: 60, lfoFreq: 0.12, lfoDepth: 2, gain: 0.18 })
  const tinkle = startAccent(ctx, master, 9000, (t) => {
    tone(ctx, master, 1980, t, 0.18, 'triangle', 0.1)
    tone(ctx, master, 2640, t + 0.06, 0.16, 'triangle', 0.08)
    tone(ctx, master, 3120, t + 0.12, 0.14, 'triangle', 0.06)
  })
  return () => {
    air()
    drum()
    tinkle()
  }
}

function buildSettings(ctx: AudioContext, master: GainNode): SceneCleanup {
  // quill scratch every ~15s + low room tone
  const room = startNoiseBed(ctx, master, { gain: 0.28, filter: 260, q: 0.7 })
  const scratch = startAccent(ctx, master, 15000, (t) => {
    noiseBurst(ctx, master, t, 0.22, 3200, 0.18)
  })
  return () => {
    room()
    scratch()
  }
}

function buildBattle(ctx: AudioContext, master: GainNode): SceneCleanup {
  // war drum heartbeat — slow steady pulse + low rumble
  const rumble = startDrone(ctx, master, { freq: 50, lfoFreq: 0.08, lfoDepth: 3, gain: 0.18 })
  const drum = startAccent(ctx, master, 1800, (t) => {
    tone(ctx, master, 70, t, 0.14, 'sine', 0.32)
    tone(ctx, master, 70, t + 0.22, 0.14, 'sine', 0.22)
  })
  return () => {
    rumble()
    drum()
  }
}

const SCENE_BUILDERS: Record<AmbientScene, (ctx: AudioContext, master: GainNode) => SceneCleanup> = {
  home: buildHome,
  play: buildPlay,
  collection: buildCollection,
  social: buildSocial,
  shop: buildShop,
  settings: buildSettings,
  battle: buildBattle,
}

function teardownActive() {
  if (activeCleanup) {
    try {
      activeCleanup()
    } catch {
      // best-effort teardown
    }
    activeCleanup = null
  }
  activeScene = null
}

/**
 * Switch to (or stop) the ambient bed for a scene.
 *
 * Pass `enabled = false` to fade out and tear down the current scene.
 * Pass the same scene twice in a row to no-op.
 */
export function setAmbientScene(scene: AmbientScene | null, enabled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  if (!enabled || scene === null) {
    if (audioContext && masterGain) {
      fadeMasterTo(audioContext, 0)
      const ctx = audioContext
      window.setTimeout(() => {
        teardownActive()
        if (ctx === audioContext && masterGain) {
          masterGain.gain.cancelScheduledValues(ctx.currentTime)
          masterGain.gain.setValueAtTime(0.00001, ctx.currentTime)
        }
      }, AMBIENT_FADE_SEC * 1000)
    } else {
      teardownActive()
    }
    return
  }

  if (scene === activeScene) {
    return
  }

  const ctx = getAudioContext()
  if (!ctx) {
    return
  }
  const master = ensureMaster(ctx)

  // Tear down the previous scene immediately — avoids two beds layering
  // through the fade. The fade handles the perceived smoothness.
  teardownActive()

  activeCleanup = SCENE_BUILDERS[scene](ctx, master)
  activeScene = scene
  fadeMasterTo(ctx, AMBIENT_TARGET_GAIN)
}

/** Test/inspection hook — exposes the currently mounted scene. */
export function getActiveAmbientScene(): AmbientScene | null {
  return activeScene
}
