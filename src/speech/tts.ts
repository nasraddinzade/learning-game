// Text to speech through the Web Speech API (SPEC §3, §6). No network, no files.
// A test build can swap in a fake speaker so Playwright can see what would be spoken.
import type { TtsVoice } from '@/types'

export interface Speaker {
  available: () => boolean
  speak: (text: string, lang: TtsVoice) => Promise<void>
  stop: () => void
}

let override: Speaker | null = null

/** Installs a replacement speaker (dev/e2e only). Pass null to restore the real one. */
export function setSpeaker(s: Speaker | null): void {
  override = s
}

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
}

let voicesCache: SpeechSynthesisVoice[] = []

function loadVoices(): SpeechSynthesisVoice[] {
  const s = synth()
  if (!s) return []
  const v = s.getVoices()
  if (v.length > 0) voicesCache = v
  return voicesCache
}

if (typeof window !== 'undefined' && synth()) {
  loadVoices()
  synth()?.addEventListener?.('voiceschanged', loadVoices)
}

/** Best voice for the language: exact match, then same language, then anything English. */
export function pickVoice(lang: TtsVoice, voices: readonly SpeechSynthesisVoice[] = loadVoices()): SpeechSynthesisVoice | null {
  const norm = (l: string) => l.toLowerCase().replace('_', '-')
  const want = norm(lang)
  const exact = voices.filter((v) => norm(v.lang) === want)
  const english = voices.filter((v) => norm(v.lang).startsWith('en'))
  const pool = exact.length > 0 ? exact : english
  if (pool.length === 0) return null
  // Prefer local, non-novelty voices; Google/Microsoft natural voices sort first by name.
  const local = pool.filter((v) => v.localService)
  return (local[0] ?? pool[0]) as SpeechSynthesisVoice
}

const realSpeaker: Speaker = {
  available: () => synth() !== null,
  speak: (text, lang) =>
    new Promise((resolve) => {
      const s = synth()
      if (!s) {
        resolve()
        return
      }
      s.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang
      const voice = pickVoice(lang)
      if (voice) u.voice = voice
      u.rate = 0.95
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(guard)
        resolve()
      }
      u.onend = finish
      u.onerror = finish
      // Some engines never fire `end`; never leave the game waiting on a mute voice.
      const guard = setTimeout(finish, 2000 + text.length * 90)
      s.speak(u)
    }),
  stop: () => synth()?.cancel(),
}

export function ttsAvailable(): boolean {
  return (override ?? realSpeaker).available()
}

export function speak(text: string, lang: TtsVoice): Promise<void> {
  return (override ?? realSpeaker).speak(text, lang)
}

export function stopSpeaking(): void {
  ;(override ?? realSpeaker).stop()
}
