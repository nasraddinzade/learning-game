// Speech recognition through the Web Speech API. Chrome on Android sends audio to Google;
// only learning phrases are ever spoken into it (SPEC §10.1). A fake can be installed for tests.

export interface RecognitionResult {
  /** Best transcript first, then alternatives. */
  transcripts: string[]
  confidence: number
}

export interface Recognizer {
  available: () => boolean
  /** Resolves with the result, or null when nothing was heard, denied or timed out. */
  listen: (lang: string, maxMs: number) => Promise<RecognitionResult | null>
  stop: () => void
}

type SRConstructor = new () => SpeechRecognitionLike

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

let override: Recognizer | null = null

export function setRecognizer(r: Recognizer | null): void {
  override = r
}

function ctor(): SRConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

let current: SpeechRecognitionLike | null = null

const realRecognizer: Recognizer = {
  available: () => ctor() !== null,
  listen: (lang, maxMs) =>
    new Promise((resolve) => {
      const C = ctor()
      if (!C) {
        resolve(null)
        return
      }
      const r = new C()
      current = r
      r.lang = lang
      r.interimResults = false
      r.maxAlternatives = 3
      r.continuous = false
      let settled = false
      const finish = (res: RecognitionResult | null) => {
        if (settled) return
        settled = true
        clearTimeout(guard)
        current = null
        resolve(res)
      }
      r.onresult = (e) => {
        const first = e.results[0]
        if (!first || first.length === 0) {
          finish(null)
          return
        }
        const alts: string[] = []
        for (let i = 0; i < first.length; i++) {
          const a = first[i]
          if (a && a.transcript.trim()) alts.push(a.transcript.trim())
        }
        finish(alts.length > 0 ? { transcripts: alts, confidence: first[0]?.confidence ?? 0 } : null)
      }
      r.onerror = () => finish(null)
      r.onend = () => finish(null)
      const guard = setTimeout(() => {
        try {
          r.stop()
        } catch {
          /* ignore */
        }
        finish(null)
      }, maxMs)
      try {
        r.start()
      } catch {
        finish(null)
      }
    }),
  stop: () => {
    try {
      current?.stop()
    } catch {
      /* ignore */
    }
  },
}

export function recognitionAvailable(): boolean {
  return (override ?? realRecognizer).available()
}

export function listen(lang: string, maxMs: number): Promise<RecognitionResult | null> {
  return (override ?? realRecognizer).listen(lang, maxMs)
}

export function stopListening(): void {
  ;(override ?? realRecognizer).stop()
}
