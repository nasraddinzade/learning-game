// Sounds synthesized with the Web Audio API and vibration (SPEC §7.3). No audio files.
// Both respect the settings toggles; both are no-ops where the APIs are missing.
import { useProfileStore } from '@/store/profile'

type Wave = OscillatorType

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function soundOn(): boolean {
  return useProfileStore.getState().profile?.settings.sound ?? true
}

function vibrationOn(): boolean {
  return useProfileStore.getState().profile?.settings.vibration ?? true
}

interface Note {
  /** Hz at start and end (glide). */
  from: number
  to?: number
  /** Seconds after the call. */
  at: number
  dur: number
  wave?: Wave
  gain?: number
}

function play(notes: Note[]): void {
  if (!soundOn()) return
  const c = audio()
  if (!c) return
  const t0 = c.currentTime
  for (const n of notes) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = n.wave ?? 'square'
    osc.frequency.setValueAtTime(n.from, t0 + n.at)
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.dur)
    const peak = n.gain ?? 0.08
    g.gain.setValueAtTime(0.0001, t0 + n.at)
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur)
    osc.connect(g).connect(c.destination)
    osc.start(t0 + n.at)
    osc.stop(t0 + n.at + n.dur + 0.02)
  }
}

export function vibrate(pattern: number | number[]): void {
  if (!vibrationOn()) return
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* ignore */
  }
}

/** Game feedback sounds. Short, synthetic, never louder than a tap. */
export const fx = {
  /** A clean hit: a quick upward blip. */
  hit: () => play([{ from: 440, to: 660, at: 0, dur: 0.08 }]),
  /** A crit: two blips and a sparkle. */
  crit: () => play([
    { from: 523, to: 784, at: 0, dur: 0.07 },
    { from: 784, to: 1175, at: 0.07, dur: 0.1 },
    { from: 1568, at: 0.17, dur: 0.12, wave: 'triangle', gain: 0.05 },
  ]),
  /** The enemy strikes: a low thud. */
  miss: () => play([{ from: 180, to: 90, at: 0, dur: 0.18, wave: 'sawtooth', gain: 0.07 }]),
  /** A debt closes: a rising arpeggio. */
  debtClosed: () => play([
    { from: 392, at: 0, dur: 0.08, wave: 'triangle' },
    { from: 523, at: 0.08, dur: 0.08, wave: 'triangle' },
    { from: 659, at: 0.16, dur: 0.14, wave: 'triangle' },
  ]),
  /** Stage up: a soft chime. */
  stageUp: () => play([{ from: 880, at: 0, dur: 0.12, wave: 'sine', gain: 0.06 }, { from: 1319, at: 0.1, dur: 0.18, wave: 'sine', gain: 0.05 }]),
  /** Victory: a short fanfare. */
  win: () => play([
    { from: 523, at: 0, dur: 0.12, wave: 'triangle' },
    { from: 659, at: 0.12, dur: 0.12, wave: 'triangle' },
    { from: 784, at: 0.24, dur: 0.12, wave: 'triangle' },
    { from: 1047, at: 0.36, dur: 0.3, wave: 'triangle' },
  ]),
  /** A nemesis falls, a level is gained: a bigger fanfare. */
  big: () => play([
    { from: 392, at: 0, dur: 0.1, wave: 'square', gain: 0.06 },
    { from: 523, at: 0.1, dur: 0.1, wave: 'square', gain: 0.06 },
    { from: 659, at: 0.2, dur: 0.1, wave: 'square', gain: 0.06 },
    { from: 784, at: 0.3, dur: 0.1, wave: 'square', gain: 0.06 },
    { from: 1047, at: 0.4, dur: 0.4, wave: 'triangle', gain: 0.08 },
    { from: 1319, at: 0.5, dur: 0.4, wave: 'sine', gain: 0.04 },
  ]),
  /** Improv clock tick. */
  tick: () => play([{ from: 1200, at: 0, dur: 0.03, wave: 'sine', gain: 0.03 }]),
  /** Time is up. */
  timeUp: () => play([{ from: 300, to: 150, at: 0, dur: 0.3, wave: 'sawtooth', gain: 0.06 }]),
}

export const buzz = {
  hit: () => vibrate(15),
  miss: () => vibrate([40, 40, 60]),
  debtClosed: () => vibrate([30, 30, 30, 30, 80]),
  big: () => vibrate([60, 40, 60, 40, 160]),
}
