// Test hooks on window for the dev panel session and Playwright (dev and e2e builds only).
import { seedPatterns } from '@/content/patterns'
import { expectedAnswerOf } from '@/moves/tasks'
import { fixedSentence } from '@/moves/trap/fixedSentence'
import { setRecognizer } from '@/speech/recognition'
import { setSpeaker } from '@/speech/tts'
import { resetDatabase } from '@/db/db'
import { useClockStore } from '@/store/clock'
import { useRunStore } from '@/store/run'
import type { MoveId, TrapExercise } from '@/types'

export interface DebugHooks {
  state: () => ReturnType<typeof useRunStore.getState>
  answer: () => string | null
  /** The current Привал exercise with its solution. */
  trap: () => (TrapExercise & { fixed: string }) | null
  /** The next prepared task uses this move (when the item supports it). */
  forceMove: (move: MoveId | null) => void
  /**
   * Replaces speech synthesis and recognition with fakes: spoken texts are recorded in
   * `spoken`, and the microphone returns whatever `setTranscript` set (null = heard nothing).
   * `recognition: false` keeps recognition unavailable to exercise the self-assessment path.
   */
  fakeSpeech: (opts?: { recognition?: boolean }) => void
  realSpeech: () => void
  setTranscript: (text: string | null) => void
  spoken: () => string[]
  /** Deletes the database and the dev clock offset without reloading (the caller reloads). */
  wipe: () => Promise<void>
}

const FAKE_KEY = 'nemesis.dev.fakeSpeech'

export function installDebugHooks(): void {
  const spoken: string[] = []
  let transcript: string | null = null
  const hooks: DebugHooks = {
    state: () => useRunStore.getState(),
    answer: () => expectedAnswerOf(useRunStore.getState().task),
    trap: () => {
      const rest = useRunStore.getState().run?.rest
      if (!rest) return null
      const def = seedPatterns.find((p) => p.id === rest.patternId)
      const idx = rest.exercises[rest.index]
      const ex = def && idx !== undefined ? def.exercises[idx] : undefined
      return ex ? { ...ex, fixed: fixedSentence(ex) } : null
    },
    forceMove: (move) => useRunStore.getState().forceMove(move),
    fakeSpeech: (opts = {}) => {
      spoken.length = 0
      // Survives reloads within the tab so a test that reloads keeps deterministic speech.
      try {
        sessionStorage.setItem(FAKE_KEY, JSON.stringify(opts))
      } catch {
        /* ignore */
      }
      setSpeaker({
        available: () => true,
        speak: async (text) => {
          spoken.push(text)
        },
        stop: () => undefined,
      })
      setRecognizer({
        available: () => opts.recognition !== false,
        listen: async () => (transcript === null ? null : { transcripts: [transcript], confidence: 0.9 }),
        stop: () => undefined,
      })
    },
    realSpeech: () => {
      try {
        sessionStorage.removeItem(FAKE_KEY)
      } catch {
        /* ignore */
      }
      setSpeaker(null)
      setRecognizer(null)
    },
    setTranscript: (text) => {
      transcript = text
    },
    spoken: () => [...spoken],
    wipe: async () => {
      await resetDatabase()
      useClockStore.getState().resetOffset()
    },
  }
  ;(window as unknown as { __nemesis: DebugHooks }).__nemesis = hooks
  try {
    const saved = sessionStorage.getItem(FAKE_KEY)
    if (saved) hooks.fakeSpeech(JSON.parse(saved) as { recognition?: boolean })
  } catch {
    /* ignore */
  }
}
