// Answer checking (SPEC §4.7): case and punctuation insensitive, contractions equal full
// forms, an `accept` list, and one typo allowed in a word longer than 4 letters (graded Hard).

const CONTRACTIONS: [RegExp, string][] = [
  [/\bwon't\b/g, 'will not'],
  [/\bcan't\b/g, 'can not'],
  [/\bcannot\b/g, 'can not'],
  [/\bshan't\b/g, 'shall not'],
  [/\blet's\b/g, 'let us'],
  [/\bgonna\b/g, 'going to'],
  [/\bwanna\b/g, 'want to'],
  [/\bgotta\b/g, 'got to'],
  [/\bi'm\b/g, 'i am'],
  [/\b(he|she|it|that|there|what|who|where|here)'s\b/g, '$1 is'],
  [/\b(you|we|they)'re\b/g, '$1 are'],
  [/\b(i|you|we|they|would|should|could|must|might)'ve\b/g, '$1 have'],
  [/\b(i|you|he|she|it|we|they|that|there|who|what)'ll\b/g, '$1 will'],
  [/\b(i|you|he|she|it|we|they|that|there|who|what)'d\b/g, '$1 would'],
  [/\b(is|are|was|were|do|does|did|have|has|had|should|could|would|must|need|ai)n't\b/g, '$1 not'],
]

/** Lowercases, expands contractions, strips punctuation and extra spaces. */
export function normalize(text: string): string {
  let t = text.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"')
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep)
  t = t.replace(/[^a-z0-9' ]+/g, ' ').replace(/'/g, '')
  return t.replace(/\s+/g, ' ').trim()
}

export function words(text: string): string[] {
  const n = normalize(text)
  return n === '' ? [] : n.split(' ')
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = new Array<number>(b.length + 1)
  let cur = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + cost)
    }
    const tmp = prev
    prev = cur
    cur = tmp
  }
  return prev[b.length] as number
}

export interface CheckResult {
  ok: boolean
  /** True when the answer matched only thanks to the single-typo allowance. */
  typo: boolean
  /** The expected variant that matched (original casing), if any. */
  matched: string | null
}

/** Word-by-word comparison allowing one typo in one word longer than 4 letters. */
function matchWords(got: string[], want: string[]): { ok: boolean; typo: boolean } {
  if (got.length !== want.length) return { ok: false, typo: false }
  let typos = 0
  for (let i = 0; i < want.length; i++) {
    const g = got[i] as string
    const w = want[i] as string
    if (g === w) continue
    if (w.length > 4 && g.length > 4 && levenshtein(g, w) === 1) {
      typos++
      if (typos > 1) return { ok: false, typo: false }
      continue
    }
    return { ok: false, typo: false }
  }
  return { ok: true, typo: typos === 1 }
}

/** Whole-answer check against any of the expected variants. */
export function checkAnswer(answer: string, expected: readonly string[]): CheckResult {
  const got = words(answer)
  if (got.length === 0) return { ok: false, typo: false, matched: null }
  let typoMatch: string | null = null
  for (const e of expected) {
    const r = matchWords(got, words(e))
    if (r.ok && !r.typo) return { ok: true, typo: false, matched: e }
    if (r.ok && typoMatch === null) typoMatch = e
  }
  if (typoMatch !== null) return { ok: true, typo: true, matched: typoMatch }
  return { ok: false, typo: false, matched: null }
}

/** True when any expected variant appears inside the answer (sliding window over words). */
export function containsTarget(answer: string, targets: readonly string[]): CheckResult {
  const got = words(answer)
  if (got.length === 0) return { ok: false, typo: false, matched: null }
  let typoMatch: string | null = null
  for (const t of targets) {
    const want = words(t)
    if (want.length === 0 || want.length > got.length) continue
    for (let i = 0; i + want.length <= got.length; i++) {
      const r = matchWords(got.slice(i, i + want.length), want)
      if (r.ok && !r.typo) return { ok: true, typo: false, matched: t }
      if (r.ok && typoMatch === null) typoMatch = t
    }
  }
  if (typoMatch !== null) return { ok: true, typo: true, matched: typoMatch }
  return { ok: false, typo: false, matched: null }
}

/** Fraction of reference words present in the spoken text (for voice, SPEC §4.7). */
export function wordOverlap(spoken: string, reference: string): number {
  const ref = words(reference)
  if (ref.length === 0) return 0
  const got = new Set(words(spoken))
  let hit = 0
  for (const w of ref) if (got.has(w)) hit++
  return hit / ref.length
}

/**
 * Voice check (SPEC §4.7): the target phrase is in the recognized text, or at least `minOverlap`
 * of its words are (one misheard word in a long phrase), which counts as a typo.
 */
export function matchVoice(transcripts: readonly string[], targets: readonly string[], minOverlap = 0.8): CheckResult {
  for (const t of transcripts) {
    const exact = containsTarget(t, targets)
    if (exact.ok && !exact.typo) return exact
  }
  for (const t of transcripts) {
    const partial = containsTarget(t, targets)
    if (partial.ok) return partial
  }
  for (const t of transcripts) {
    for (const target of targets) {
      if (words(target).length >= 2 && wordOverlap(t, target) >= minOverlap) return { ok: true, typo: true, matched: target }
    }
  }
  return { ok: false, typo: false, matched: null }
}
