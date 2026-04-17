export type SoundName = 'tap' | 'summon' | 'attack' | 'burst' | 'match' | 'win' | 'lose'

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
  }
}
