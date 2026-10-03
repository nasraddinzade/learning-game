import type { Item, MoveId } from '@/types'

export interface IntroTask {
  move: 'intro'
  contextEn: string
  contextRu: string
}

export interface SwipeTask {
  move: 'swipe'
  sentenceEn: string
  phraseEn: string
  meaningRu: string
  /** Whether meaningRu really is the meaning of the phrase. */
  matches: boolean
}

export interface ListenTask {
  move: 'listen'
  /** Spoken, never shown. */
  sentenceEn: string
  /** Three Russian meanings, shuffled. */
  options: string[]
  correctIndex: number
}

export interface BuildTask {
  move: 'build'
  sentenceRu: string
  /** Shuffled tiles including distractors. */
  tiles: string[]
  /** Accepted full sentences. */
  expected: string[]
}

export interface GapTask {
  move: 'gap'
  before: string
  after: string
  sentenceRu: string
  expected: string[]
  /** First letters of each expected word, e.g. "d··· o·". */
  hint: string
}

export interface TranslateTask {
  move: 'translate'
  promptRu: string
  /** 'phrase': the whole answer must match. 'situation': the phrase must appear in the answer. */
  mode: 'phrase' | 'situation'
  expected: string[]
  /** A model answer shown after the attempt. */
  sample: string
}

export interface DictationTask {
  move: 'dictation'
  /** Spoken, never shown until feedback. */
  sentenceEn: string
  sentenceRu: string
  expected: string[]
}

export interface VoiceTask {
  move: 'voice'
  promptRu: string
  /** The phrase (and accepted variants) that must be heard. */
  targets: string[]
  /** Model answer for the self-assessment fallback and the feedback. */
  sample: string
}

export interface ImprovTask {
  move: 'improv'
  /** A situation the item has not shown before (second prompt). */
  promptRu: string
  targets: string[]
  sample: string
  /** Milliseconds to start answering before it counts as a miss. */
  startWindowMs: number
}

export type MoveTask = IntroTask | SwipeTask | ListenTask | BuildTask | GapTask | TranslateTask | DictationTask | VoiceTask | ImprovTask

export interface MoveResult {
  correct: boolean
  hintUsed: boolean
  typo: boolean
  answer: string
  /** What a correct answer looks like, shown in feedback. */
  expected: string
}

export interface MoveProps<T extends MoveTask = MoveTask> {
  task: T
  item: Item
  onSubmit: (result: MoveResult) => void
  /** Called on the first interaction (typing, dragging) so the UI can react. */
  onInteract?: () => void
}

export const IMPLEMENTED_MOVES: readonly MoveId[] = ['swipe', 'listen', 'build', 'gap', 'translate', 'dictation', 'voice', 'improv']
