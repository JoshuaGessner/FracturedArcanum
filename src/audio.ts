export type SoundName =
  | 'tap'
  | 'summon'
  | 'attack'
  | 'burst'
  | 'match'
  | 'win'
  | 'lose'
  | 'navigate'
  | 'packOpen'
  | 'cardReveal'
  | 'legendaryReveal'
  | 'rankUp'
  | 'questComplete'
  | 'error'
  | 'challenge'
  | 'trade'
  | 'countdown'
  | 'sceneOpen'
  | 'sceneClose'
  | 'portalSlam'
  | 'runeWipe'
  | 'modalOpen'
  | 'modalClose'
  | 'cardLift'
  | 'cardSlam'
  | 'attackLunge'
  | 'heroHit'
  | 'heroHeal'
  | 'heroLowHp'
  | 'turnChange'
  | 'unitDeath'
  | 'draw'
  | 'packHover'
  | 'lidSplit'
  | 'cardArc'
  | 'firstTime'
  | 'beatAdvance'

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null
  }

  const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!AudioContextConstructor) {
    return null
  }

  audioContext ??= new AudioContextConstructor()

  if (audioContext.state === 'suspended') {
    void audioContext.resume()
  }

  return audioContext
}

function playTone(
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  volume: number,
) {
  const oscillator = context.createOscillator()
  const gainNode = context.createGain()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  gainNode.gain.setValueAtTime(0.0001, start)
  gainNode.gain.exponentialRampToValueAtTime(volume, start + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  oscillator.connect(gainNode)
  gainNode.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + duration)
}

function playNoise(
  context: AudioContext,
  start: number,
  duration: number,
  filterFreqStart: number,
  filterFreqEnd: number,
  volume: number,
) {
  const bufferSize = Math.max(1, Math.floor(context.sampleRate * duration))
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1
  }
  const source = context.createBufferSource()
  source.buffer = buffer
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(filterFreqStart, start)
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterFreqEnd), start + duration)
  const gainNode = context.createGain()
  gainNode.gain.setValueAtTime(0.0001, start)
  gainNode.gain.exponentialRampToValueAtTime(volume, start + 0.02)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter)
  filter.connect(gainNode)
  gainNode.connect(context.destination)
  source.start(start)
  source.stop(start + duration)
}

export function playSound(name: SoundName, enabled: boolean) {
  if (!enabled) {
    return
  }

  const context = getAudioContext()

  if (!context) {
    return
  }

  const now = context.currentTime + 0.01

  switch (name) {
    case 'tap':
      playTone(context, 520, now, 0.08, 'triangle', 0.025)
      break
    case 'summon':
      playTone(context, 330, now, 0.12, 'sine', 0.03)
      playTone(context, 440, now + 0.05, 0.12, 'triangle', 0.025)
      break
    case 'attack':
      playTone(context, 190, now, 0.09, 'square', 0.025)
      playTone(context, 140, now + 0.04, 0.07, 'square', 0.02)
      break
    case 'burst':
      playTone(context, 320, now, 0.16, 'sawtooth', 0.03)
      playTone(context, 640, now + 0.05, 0.18, 'triangle', 0.022)
      break
    case 'match':
      playTone(context, 392, now, 0.12, 'triangle', 0.025)
      playTone(context, 523, now + 0.08, 0.16, 'triangle', 0.025)
      break
    case 'win':
      playTone(context, 523, now, 0.14, 'triangle', 0.03)
      playTone(context, 659, now + 0.08, 0.16, 'triangle', 0.028)
      playTone(context, 784, now + 0.16, 0.2, 'triangle', 0.025)
      break
    case 'lose':
      playTone(context, 294, now, 0.16, 'sine', 0.024)
      playTone(context, 220, now + 0.1, 0.22, 'sine', 0.024)
      break
    case 'navigate':
      // Quick ascending two-note chime (C5 → E5)
      playTone(context, 523, now, 0.06, 'triangle', 0.022)
      playTone(context, 659, now + 0.04, 0.07, 'triangle', 0.022)
      break
    case 'packOpen':
      // Deep thud + ascending shimmer sweep
      playTone(context, 80, now, 0.18, 'sine', 0.03)
      playTone(context, 200, now + 0.08, 0.16, 'sawtooth', 0.022)
      playTone(context, 520, now + 0.18, 0.18, 'triangle', 0.024)
      playTone(context, 880, now + 0.3, 0.14, 'triangle', 0.02)
      break
    case 'cardReveal':
      // Quick bright ting
      playTone(context, 880, now, 0.06, 'triangle', 0.022)
      break
    case 'legendaryReveal':
      // Extended golden fanfare (C5 → E5 → G5 → C6)
      playTone(context, 523, now, 0.12, 'triangle', 0.028)
      playTone(context, 659, now + 0.12, 0.12, 'triangle', 0.028)
      playTone(context, 784, now + 0.24, 0.14, 'triangle', 0.028)
      playTone(context, 1046, now + 0.38, 0.22, 'triangle', 0.03)
      break
    case 'rankUp':
      // Rising three-note triumph (F4 → A4 → C5)
      playTone(context, 349, now, 0.1, 'triangle', 0.026)
      playTone(context, 440, now + 0.09, 0.1, 'triangle', 0.026)
      playTone(context, 523, now + 0.18, 0.16, 'triangle', 0.028)
      break
    case 'questComplete':
      // Warm double-chime (G4 + B4 chord)
      playTone(context, 392, now, 0.18, 'sine', 0.024)
      playTone(context, 494, now, 0.18, 'sine', 0.022)
      break
    case 'error':
      // Low buzz
      playTone(context, 120, now, 0.1, 'square', 0.02)
      break
    case 'challenge':
      // Alert horn (descending sawtooth)
      playTone(context, 440, now, 0.12, 'sawtooth', 0.026)
      playTone(context, 330, now + 0.1, 0.14, 'sawtooth', 0.024)
      break
    case 'trade':
      // Coin clink × 2
      playTone(context, 1200, now, 0.04, 'triangle', 0.022)
      playTone(context, 1400, now + 0.06, 0.04, 'triangle', 0.022)
      break
    case 'countdown':
      // Metronome tick
      playTone(context, 660, now, 0.05, 'triangle', 0.025)
      break
    case 'sceneOpen':
      // Soft parchment whoosh — filtered noise sweep 800 → 200 Hz
      playNoise(context, now, 0.2, 800, 200, 0.022)
      break
    case 'sceneClose':
      // Mirror sweep + faint click
      playNoise(context, now, 0.18, 600, 1400, 0.02)
      playTone(context, 320, now + 0.16, 0.04, 'triangle', 0.018)
      break
    case 'portalSlam':
      // Deep sub bass thud layered with summon-style chime
      playTone(context, 80, now, 0.18, 'sine', 0.03)
      playTone(context, 330, now + 0.04, 0.12, 'sine', 0.026)
      playTone(context, 440, now + 0.09, 0.14, 'triangle', 0.024)
      break
    case 'runeWipe':
      // Crystal shimmer arpeggio (4 quick notes)
      playTone(context, 1318, now, 0.05, 'triangle', 0.02)
      playTone(context, 1568, now + 0.05, 0.05, 'triangle', 0.02)
      playTone(context, 1760, now + 0.1, 0.05, 'triangle', 0.02)
      playTone(context, 2093, now + 0.15, 0.06, 'triangle', 0.02)
      break
    case 'modalOpen':
      // tap overlay + soft glow tone
      playTone(context, 520, now, 0.06, 'triangle', 0.02)
      playTone(context, 660, now, 0.18, 'sine', 0.018)
      break
    case 'modalClose':
      // Reversed-feeling close
      playTone(context, 660, now, 0.12, 'sine', 0.018)
      playTone(context, 440, now + 0.06, 0.06, 'triangle', 0.018)
      break
    case 'cardLift':
      // Brief soft swoosh — filtered noise rising slightly
      playNoise(context, now, 0.08, 1200, 600, 0.018)
      playTone(context, 720, now + 0.02, 0.06, 'sine', 0.014)
      break
    case 'cardSlam':
      // Wood thud + bright top harmonic
      playTone(context, 110, now, 0.12, 'sine', 0.034)
      playTone(context, 220, now + 0.02, 0.1, 'square', 0.022)
      playTone(context, 1320, now + 0.04, 0.08, 'triangle', 0.02)
      playNoise(context, now, 0.09, 600, 200, 0.016)
      break
    case 'attackLunge':
      // Existing attack thump extended with a metallic ring tail
      playTone(context, 190, now, 0.09, 'square', 0.026)
      playTone(context, 140, now + 0.04, 0.07, 'square', 0.022)
      playTone(context, 1760, now + 0.08, 0.18, 'triangle', 0.02)
      playTone(context, 2640, now + 0.12, 0.16, 'triangle', 0.014)
      break
    case 'heroHit':
      // Low impact thud + brief crack
      playTone(context, 90, now, 0.16, 'sine', 0.034)
      playNoise(context, now + 0.02, 0.08, 1800, 400, 0.022)
      playTone(context, 1200, now + 0.04, 0.06, 'square', 0.018)
      break
    case 'heroHeal':
      // Soft sine swell 440 → 660 Hz
      {
        const oscillator = context.createOscillator()
        const gainNode = context.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(440, now)
        oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.22)
        gainNode.gain.setValueAtTime(0.0001, now)
        gainNode.gain.exponentialRampToValueAtTime(0.024, now + 0.04)
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)
        oscillator.connect(gainNode)
        gainNode.connect(context.destination)
        oscillator.start(now)
        oscillator.stop(now + 0.26)
      }
      break
    case 'heroLowHp':
      // Single heartbeat thump-thump (call repeatedly via startLoopingSound)
      playTone(context, 60, now, 0.1, 'sine', 0.02)
      playTone(context, 60, now + 0.18, 0.1, 'sine', 0.016)
      break
    case 'turnChange':
      // Brief chime marking turn swap — low tone + high ting
      playTone(context, 330, now, 0.08, 'sine', 0.02)
      playTone(context, 880, now + 0.04, 0.06, 'triangle', 0.018)
      break
    case 'unitDeath':
      // Crumbling fall — descending tone + filtered noise
      playTone(context, 260, now, 0.14, 'sine', 0.024)
      playTone(context, 140, now + 0.06, 0.16, 'sine', 0.02)
      playNoise(context, now + 0.04, 0.12, 1200, 300, 0.016)
      break
    case 'draw':
      // Flat neutral tone — two equal-pitch sustained notes
      playTone(context, 330, now, 0.18, 'sine', 0.022)
      playTone(context, 330, now + 0.14, 0.18, 'triangle', 0.02)
      break
    case 'packHover':
      // Soft chime 880Hz, 60ms
      playTone(context, 880, now, 0.06, 'triangle', 0.022)
      break
    case 'lidSplit':
      // Sharp wood crack 200Hz + bright sparkle on top
      playTone(context, 200, now, 0.09, 'square', 0.034)
      playNoise(context, now, 0.08, 2400, 600, 0.022)
      playTone(context, 1760, now + 0.04, 0.18, 'triangle', 0.02)
      playTone(context, 2640, now + 0.08, 0.16, 'triangle', 0.014)
      break
    case 'cardArc':
      // Whoosh per card with slight pitch variance for layered fan
      {
        const variance = 1 + (Math.random() - 0.5) * 0.18
        playNoise(context, now, 0.12, 1400 * variance, 400 * variance, 0.018)
        playTone(context, 660 * variance, now + 0.02, 0.08, 'sine', 0.014)
      }
      break
    case 'firstTime':
      // Bright bell triad — major chord with sparkle
      playTone(context, 1046, now, 0.22, 'triangle', 0.026)
      playTone(context, 1318, now + 0.04, 0.22, 'triangle', 0.024)
      playTone(context, 1568, now + 0.08, 0.24, 'triangle', 0.022)
      playTone(context, 2093, now + 0.18, 0.18, 'sine', 0.018)
      break
    case 'beatAdvance':
      // Soft tonal tick for reward-cinema beat transitions
      playTone(context, 660, now, 0.05, 'sine', 0.016)
      playTone(context, 880, now + 0.03, 0.04, 'triangle', 0.012)
      break
  }
}

/**
 * Start a looping ambient/feedback sound. Returns a stop function.
 *
 * Currently used by the battle scene for the low-HP heartbeat. The cue is
 * re-triggered on a fixed interval (Web Audio scheduling stays per-tick so
 * the audio context can be muted/closed cleanly without leaving dangling
 * oscillators). If `enabled` is false the call is a no-op and the returned
 * stop function does nothing.
 */
export function startLoopingSound(
  name: Extract<SoundName, 'heroLowHp'>,
  enabled: boolean,
  intervalMs: number = 1000,
): () => void {
  if (!enabled || typeof window === 'undefined') {
    return () => {}
  }

  // Trigger immediately so the player hears the cue without waiting a full beat.
  playSound(name, enabled)
  const intervalId = window.setInterval(() => playSound(name, enabled), intervalMs)
  return () => {
    window.clearInterval(intervalId)
  }
}
