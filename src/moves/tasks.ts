// Builds concrete tasks for a move from an item. Pure and seeded, so a battle replays the
// same tasks after a reload.
import { checkAnswer, containsTarget, normalize, words } from '@/engine/answerCheck'
import { rngInt, rngPick, rngShuffle, type Rng } from '@/engine/rng'
import type { Item, MoveId } from '@/types'
import type { BuildTask, GapTask, IntroTask, MoveResult, MoveTask, SwipeTask, TranslateTask } from './types'

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

export function canUse(move: MoveId, item: Item): boolean {
  switch (move) {
    case 'intro':
    case 'translate':
      return true
    case 'swipe':
      return item.contexts.length > 0 && item.falseMeanings.length > 0
    case 'build':
      return item.contexts.some((c) => tokens(c.en).length >= 3)
    case 'gap':
      return contextWithPhrase(item) !== null
    default:
      return false
  }
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
      promptRu: rngPick(rng, item.promptsRu),
      mode: 'situation',
      expected: [item.en, ...item.accept],
      sample: found?.ctx.en ?? item.en,
    }
  }
  return { move: 'translate', promptRu: item.ru, mode: 'phrase', expected: [item.en, ...item.accept], sample: item.en }
}

export function buildTask(move: MoveId, item: Item, rng: Rng): MoveTask {
  switch (move) {
    case 'intro':
      return buildIntro(item, rng)
    case 'swipe':
      return buildSwipe(item, rng)
    case 'build':
      return buildBuild(item, rng)
    case 'gap':
      return buildGap(item)
    case 'translate':
      return buildTranslate(item, rng)
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
    case 'build':
    case 'gap':
    case 'translate':
      return task.expected[0] ?? null
    default:
      return null
  }
}
