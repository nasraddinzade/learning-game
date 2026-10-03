// Builds concrete tasks for a move from an item. Pure and seeded, so a battle replays the
// same tasks after a reload.
import { checkAnswer, containsTarget, matchVoice, normalize, words } from '@/engine/answerCheck'
import { rngInt, rngPick, rngShuffle, type Rng } from '@/engine/rng'
import type { Item, MoveId } from '@/types'
import { balance } from '@/game/balance'
import type {
  BuildTask,
  DictationTask,
  GapTask,
  ImprovTask,
  IntroTask,
  ListenTask,
  MoveResult,
  MoveTask,
  SwipeTask,
  TranslateTask,
  VoiceTask,
} from './types'

/** Words that are typical slips for this user (SPEC §6, Сборка distractors). */
const DISTRACTOR_POOL = ['the', 'a', 'an', 'just', 'already', 'is', 'are', 'was', 'can', 'do', 'does', 'have', 'has', 'to', 'of']

function tokens(sentence: string): string[] {
  return sentence.split(/\s+/).filter(Boolean)
}

/** Index of the context sentence that contains the phrase (or an accepted variant), else -1. */
function contextWithPhrase(item: Item): { ctx: Item['contexts'][number]; variant: string; start: number } | null {
  const variants = [item.en, ...item.accept]
  for (const ctx of item.contexts) {
    const low = ctx.en.toLowerCase()
    for (const v of variants) {
      const idx = low.indexOf(v.toLowerCase())
      if (idx >= 0) return { ctx, variant: ctx.en.slice(idx, idx + v.length), start: idx }
    }
  }
  return null
}

/** Whether the item has the content a move needs. Device capabilities are checked separately. */
export function canUse(move: MoveId, item: Item): boolean {
  switch (move) {
    case 'intro':
    case 'translate':
    case 'voice':
      return true
    case 'swipe':
      return item.contexts.length > 0 && item.falseMeanings.length > 0
    case 'listen':
    case 'dictation':
      return item.contexts.length > 0
    case 'build':
      return item.contexts.some((c) => tokens(c.en).length >= 3)
    case 'gap':
      return contextWithPhrase(item) !== null
    case 'improv':
      return item.promptsRu.length >= 2
    default:
      return false
  }
}

/** Situation prompt for Перевод (first half) and Экспромт (second half), so the improv one is new. */
function promptFor(item: Item, kind: 'translate' | 'improv', rng: Rng): string {
  const prompts = item.promptsRu
  if (prompts.length === 0) return item.ru
  if (prompts.length === 1) return prompts[0] as string
  const half = Math.floor(prompts.length / 2)
  const pool = kind === 'translate' ? prompts.slice(0, half) : prompts.slice(half)
  return rngPick(rng, pool)
}

export function buildIntro(item: Item, rng: Rng): IntroTask {
  const ctx = item.contexts.length > 0 ? rngPick(rng, item.contexts) : { en: item.en, ru: item.ru }
  return { move: 'intro', contextEn: ctx.en, contextRu: ctx.ru }
}

export function buildSwipe(item: Item, rng: Rng): SwipeTask {
  const ctx = rngPick(rng, item.contexts)
  const matches = rng() < 0.5
  return {
    move: 'swipe',
    sentenceEn: ctx.en,
    phraseEn: item.en,
    meaningRu: matches ? item.ru : rngPick(rng, item.falseMeanings),
    matches,
  }
}

/** Picks distractor tiles tailored to typical mistakes: extra articles, misplaced adverbs, -s forms. */
export function pickDistractors(sentenceTokens: string[], rng: Rng, count: number): string[] {
  const present = new Set(sentenceTokens.map((t) => normalize(t)))
  const out: string[] = []
  // Verb form variant: a word ending in s → without s, or a short word → with s.
  const verbish = sentenceTokens.map((t) => normalize(t)).filter((t) => t.length >= 4 && /^[a-z]+$/.test(t))
  if (verbish.length > 0) {
    const w = rngPick(rng, verbish)
    const variant = w.endsWith('s') ? w.slice(0, -1) : `${w}s`
    if (!present.has(variant)) out.push(variant)
  }
  const pool = rngShuffle(
    rng,
    DISTRACTOR_POOL.filter((d) => !present.has(d)),
  )
  for (const d of pool) {
    if (out.length >= count) break
    out.push(d)
  }
  return out.slice(0, count)
}

export function buildBuild(item: Item, rng: Rng): BuildTask {
  const candidates = item.contexts.filter((c) => tokens(c.en).length >= 3)
  const ctx = rngPick(rng, candidates)
  const base = tokens(ctx.en).map((t) => t.replace(/[.,!?;:]+$/g, ''))
  const distractors = pickDistractors(base, rng, rngInt(rng, 2, 3))
  return {
    move: 'build',
    sentenceRu: ctx.ru,
    tiles: rngShuffle(rng, [...base, ...distractors]),
    expected: [ctx.en],
  }
}

export function hintFor(phrase: string): string {
  return words(phrase)
    .map((w) => w[0] + '·'.repeat(Math.max(1, w.length - 1)))
    .join(' ')
}

export function buildGap(item: Item): GapTask {
  const found = contextWithPhrase(item)
  if (!found) throw new Error(`gap: no context with phrase for ${item.id}`)
  const { ctx, variant, start } = found
  return {
    move: 'gap',
    before: ctx.en.slice(0, start),
    after: ctx.en.slice(start + variant.length),
    sentenceRu: ctx.ru,
    expected: [item.en, ...item.accept],
    hint: hintFor(variant),
  }
}

export function buildTranslate(item: Item, rng: Rng): TranslateTask {
  const found = contextWithPhrase(item)
  if (item.promptsRu.length > 0) {
    return {
      move: 'translate',
      promptRu: promptFor(item, 'translate', rng),
      mode: 'situation',
      expected: [item.en, ...item.accept],
      sample: found?.ctx.en ?? item.en,
    }
  }
  return { move: 'translate', promptRu: item.ru, mode: 'phrase', expected: [item.en, ...item.accept], sample: item.en }
}

/** На слух: the sentence is spoken; pick its meaning among three. Distractors come from other items. */
export function buildListen(item: Item, rng: Rng, pool: readonly Item[] = []): ListenTask {
  const ctx = rngPick(rng, item.contexts)
  const others = pool.filter((i) => i.id !== item.id && i.contexts.length > 0)
  const sameLand = others.filter((i) => i.land === item.land)
  const source = sameLand.length >= 2 ? sameLand : others
  const distractors: string[] = []
  for (const o of rngShuffle(rng, source)) {
    if (distractors.length >= 2) break
    const ru = rngPick(rng, o.contexts).ru
    if (ru !== ctx.ru && !distractors.includes(ru)) distractors.push(ru)
  }
  // Fallback when the pool is small: other sentences of the same item, then false meanings.
  for (const c of item.contexts) {
    if (distractors.length >= 2) break
    if (c.ru !== ctx.ru && !distractors.includes(c.ru)) distractors.push(c.ru)
  }
  for (const f of item.falseMeanings) {
    if (distractors.length >= 2) break
    if (!distractors.includes(f)) distractors.push(f)
  }
  const options = rngShuffle(rng, [ctx.ru, ...distractors.slice(0, 2)])
  return { move: 'listen', sentenceEn: ctx.en, options, correctIndex: options.indexOf(ctx.ru) }
}

/** Диктант: the sentence with the phrase is spoken; type it whole. */
export function buildDictation(item: Item, rng: Rng): DictationTask {
  const found = contextWithPhrase(item)
  const ctx = found ? found.ctx : rngPick(rng, item.contexts)
  return { move: 'dictation', sentenceEn: ctx.en, sentenceRu: ctx.ru, expected: [ctx.en] }
}

/** Голос: a Russian situation, say it in English; the phrase must be heard. */
export function buildVoice(item: Item, rng: Rng): VoiceTask {
  const found = contextWithPhrase(item)
  return {
    move: 'voice',
    promptRu: promptFor(item, 'translate', rng),
    targets: [item.en, ...item.accept],
    sample: found?.ctx.en ?? item.en,
  }
}

/** Экспромт: a situation not seen before, a few seconds to start, voice or typing. */
export function buildImprov(item: Item, rng: Rng): ImprovTask {
  const found = contextWithPhrase(item)
  return {
    move: 'improv',
    promptRu: promptFor(item, 'improv', rng),
    targets: [item.en, ...item.accept],
    sample: found?.ctx.en ?? item.en,
    startWindowMs: balance.improv.startWindowMs,
  }
}

export function buildTask(move: MoveId, item: Item, rng: Rng, pool: readonly Item[] = []): MoveTask {
  switch (move) {
    case 'intro':
      return buildIntro(item, rng)
    case 'swipe':
      return buildSwipe(item, rng)
    case 'listen':
      return buildListen(item, rng, pool)
    case 'build':
      return buildBuild(item, rng)
    case 'gap':
      return buildGap(item)
    case 'translate':
      return buildTranslate(item, rng)
    case 'dictation':
      return buildDictation(item, rng)
    case 'voice':
      return buildVoice(item, rng)
    case 'improv':
      return buildImprov(item, rng)
    default:
      throw new Error(`buildTask: move ${move} is not implemented yet`)
  }
}

/** Checks a typed or assembled answer for the task. Swipe and intro are decided in the UI. */
export function checkTask(task: MoveTask, answer: string, hintUsed: boolean): MoveResult {
  switch (task.move) {
    case 'build': {
      const r = checkAnswer(answer, task.expected)
      return { correct: r.ok, hintUsed, typo: r.typo, answer, expected: task.expected[0] ?? '' }
    }
    case 'gap': {
      const r = checkAnswer(answer, task.expected)
      return { correct: r.ok, hintUsed, typo: r.typo, answer, expected: task.expected[0] ?? '' }
    }
    case 'translate': {
      const r = task.mode === 'phrase' ? checkAnswer(answer, task.expected) : containsTarget(answer, task.expected)
      return { correct: r.ok, hintUsed, typo: r.typo, answer, expected: task.sample }
    }
    case 'listen': {
      const picked = Number(answer)
      return {
        correct: picked === task.correctIndex,
        hintUsed: false,
        typo: false,
        answer: task.options[picked] ?? answer,
        expected: task.sentenceEn,
      }
    }
    case 'dictation': {
      const r = checkAnswer(answer, task.expected)
      return { correct: r.ok, hintUsed, typo: r.typo, answer, expected: task.sentenceEn }
    }
    case 'voice': {
      // Self-assessment without recognition: 'self:ok' | 'self:typo' | 'self:fail'.
      if (answer.startsWith('self:')) {
        const v = answer.slice(5)
        return { correct: v !== 'fail', hintUsed: false, typo: v === 'typo', answer: '(самооценка)', expected: task.sample }
      }
      const r = matchVoice(answer.split('\n'), task.targets, balance.voice.overlapMin)
      return { correct: r.ok, hintUsed: false, typo: r.typo, answer, expected: task.sample }
    }
    case 'improv': {
      if (answer === '') return { correct: false, hintUsed: false, typo: false, answer: '(не начал)', expected: task.sample }
      const r = answer.includes('\n')
        ? matchVoice(answer.split('\n'), task.targets, balance.voice.overlapMin)
        : containsTarget(answer, task.targets)
      return { correct: r.ok, hintUsed: false, typo: r.typo, answer, expected: task.sample }
    }
    case 'swipe': {
      const saidMatches = answer === 'right'
      return {
        correct: saidMatches === task.matches,
        hintUsed: false,
        typo: false,
        answer: saidMatches ? 'совпадает' : 'не совпадает',
        expected: task.matches ? 'совпадает' : 'не совпадает',
      }
    }
    case 'intro':
      return { correct: true, hintUsed: false, typo: false, answer, expected: '' }
  }
}

/** For dev tools and e2e: the expected answer of a task, or null when it has none (intro). */
export function expectedAnswerOf(task: MoveTask | null): string | null {
  if (!task) return null
  switch (task.move) {
    case 'swipe':
      return task.matches ? 'right' : 'left'
    case 'listen':
      return String(task.correctIndex)
    case 'build':
    case 'gap':
    case 'translate':
    case 'dictation':
      return task.expected[0] ?? null
    case 'voice':
    case 'improv':
      return task.targets[0] ?? null
    default:
      return null
  }
}
