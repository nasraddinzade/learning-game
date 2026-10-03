// Prompts, schemas and validators for every AI task (SPEC §10.3). Validators turn an untrusted JSON
// answer into a typed value or null; callers treat null as "no AI".
import type { Correction, FreshContext, JsonSchema, LifeItemDraft, ProductionCheck, SceneTurnResult } from './types'

export const PATTERN_IDS = ['articles', 'habit-present-simple', 'adverb-order', 'sv-agreement', 'calques'] as const

export const SYSTEM =
  'You help a Russian-speaking B2 learner of English inside a game. ' +
  'Explanations are in Russian: one short sentence, no grammar terms. ' +
  'English must be simple, natural and conversational. ' +
  'Answer with JSON only, exactly in the requested shape, no markdown.'

const str = { type: 'string' } as const
const bool = { type: 'boolean' } as const
const nullableStr = { type: 'string', nullable: true } as const

const correctionSchema: JsonSchema = {
  type: 'object',
  properties: { wrong: str, right: str, ruleRu: str, patternId: { type: 'string', nullable: true, enum: [...PATTERN_IDS] } },
  required: ['wrong', 'right', 'ruleRu', 'patternId'],
}

export const productionCheckSchema: JsonSchema = {
  type: 'object',
  properties: {
    ok: bool,
    usedTarget: bool,
    corrected: str,
    errors: { type: 'array', items: correctionSchema },
    moreNatural: nullableStr,
  },
  required: ['ok', 'usedTarget', 'corrected', 'errors', 'moreNatural'],
}

export const sceneTurnSchema: JsonSchema = {
  type: 'object',
  properties: {
    npcLine: str,
    check: { ...productionCheckSchema, nullable: true },
    outcome: { type: 'string', nullable: true, enum: ['success', 'partial', 'fail'] },
    whyRu: nullableStr,
  },
  required: ['npcLine', 'check', 'outcome', 'whyRu'],
}

const contextSchema: JsonSchema = { type: 'object', properties: { en: str, ru: str }, required: ['en', 'ru'] }

export const freshContextsSchema: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: str, contexts: { type: 'array', items: contextSchema }, promptRu: str },
        required: ['id', 'contexts', 'promptRu'],
      },
    },
  },
  required: ['items'],
}

export const fromLifeSchema: JsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          en: str,
          ru: str,
          accept: { type: 'array', items: str },
          contexts: { type: 'array', items: contextSchema },
          promptsRu: { type: 'array', items: str },
          falseMeanings: { type: 'array', items: str },
          noteRu: str,
        },
        required: ['en', 'ru', 'accept', 'contexts', 'promptsRu', 'falseMeanings', 'noteRu'],
      },
    },
  },
  required: ['items'],
}

export const mnemonicSchema: JsonSchema = { type: 'object', properties: { mnemonicRu: str }, required: ['mnemonicRu'] }

export const pingSchema: JsonSchema = { type: 'object', properties: { ok: bool }, required: ['ok'] }

// ---- prompts ----

export interface ProductionInput {
  answer: string
  target: string
  accept: readonly string[]
  /** The situation or question the learner was answering (Russian or English). */
  situation: string
}

export function productionPrompt(i: ProductionInput): string {
  return [
    'Check the learner\'s English answer.',
    `TARGET PHRASE: ${i.target}${i.accept.length ? ` (also fine: ${i.accept.join('; ')})` : ''}`,
    `SITUATION: ${i.situation}`,
    `ANSWER: ${i.answer}`,
    'ok: true when the answer is natural and grammatically fine for a B2 speaker (small slips are still ok=false with errors listed).',
    'usedTarget: true when the target phrase, or a close natural form of it, is used correctly.',
    'corrected: the answer with the errors fixed, keeping the learner\'s own words as much as possible.',
    'errors: every real error as {wrong, right, ruleRu, patternId}. ruleRu is one Russian sentence without grammar terms. patternId is one of articles, habit-present-simple, adverb-order, sv-agreement, calques, or null.',
    'moreNatural: a more natural way to say the same thing, or null when the answer is already natural.',
  ].join('\n')
}

export interface SceneInput {
  title: string
  settingEn: string
  goalEn: string
  character: string
  /** The learner's target phrases for this scene. */
  targets: readonly string[]
  history: readonly { role: 'npc' | 'hero'; text: string }[]
  turn: number
  totalTurns: number
}

export function scenePrompt(i: SceneInput): string {
  const last = [...i.history].reverse().find((h) => h.role === 'hero')
  const closing = i.turn >= i.totalTurns
  return [
    `Role-play scene "${i.title}". You are ${i.character}. Setting: ${i.settingEn}. The learner's goal: ${i.goalEn}.`,
    `The learner tries to use these phrases: ${i.targets.join('; ') || 'none'}.`,
    'HISTORY:',
    ...i.history.map((h) => `${h.role === 'npc' ? 'CHARACTER' : 'LEARNER'}: ${h.text}`),
    last ? `LAST LEARNER ANSWER TO CHECK: ${last.text}` : 'No learner answer yet.',
    closing
      ? 'This was the final exchange. npcLine: a short closing line (up to 25 words). outcome: success, partial or fail, judged by whether the learner reached the goal with understandable, polite English. whyRu: one Russian sentence why.'
      : `Exchange ${i.turn} of ${i.totalTurns}. npcLine: the character's next line, up to 25 words, B2 level, stays in character and moves the situation forward. outcome: null. whyRu: null.`,
    last
      ? 'check: check the LAST LEARNER ANSWER like a production check: ok, usedTarget (any target phrase used correctly), corrected, errors[{wrong,right,ruleRu,patternId}], moreNatural.'
      : 'check: null.',
  ].join('\n')
}

export function freshContextsPrompt(items: readonly { id: string; en: string; ru: string }[]): string {
  return [
    'For each phrase give 2 new short example sentences (en + Russian translation) and 1 new situation in Russian where the learner would need the phrase (promptRu, one sentence, addressed as "ты").',
    'Sentences: B2, everyday, 6-14 words, each uses the phrase naturally.',
    'ITEMS:',
    ...items.map((i) => `- id=${i.id} | ${i.en} | ${i.ru}`),
  ].join('\n')
}

export type LifeMode = 'ru' | 'text' | 'phrase'

export function fromLifePrompt(mode: LifeMode, text: string, sentence?: string): string {
  const shape =
    'Each item: en (the phrase to learn, 1-8 words), ru (Russian meaning), accept (0-3 acceptable variants of en), contexts (2 example sentences en+ru, the first one from the source when possible), promptsRu (2 Russian situations where the learner needs the phrase), falseMeanings (2 plausible but wrong Russian meanings), noteRu (one Russian sentence: when and how the phrase is used).'
  switch (mode) {
    case 'ru':
      return [
        'The learner wanted to say this in English but could not. Give the natural everyday English version and pick the one phrase worth remembering from it.',
        `RUSSIAN: ${text}`,
        'Return exactly one item. Its first context is the full English sentence that says what the learner wanted.',
        shape,
      ].join('\n')
    case 'text':
      return [
        'From this English text pick 5-10 phrases worth learning for a B2 speaker: idioms, collocations, natural spoken chunks. Skip names and trivial words.',
        'TEXT:',
        text.slice(0, 6000),
        'Return the items; the first context of each is the sentence from the text where it appears.',
        shape,
      ].join('\n')
    default:
      return [
        'The learner selected a phrase in a text and wants to learn it.',
        `PHRASE: ${text}`,
        `SENTENCE: ${sentence ?? ''}`,
        'Return exactly one item. ru is the meaning of the phrase in this sentence; the first context is this sentence with its Russian translation.',
        shape,
      ].join('\n')
  }
}

export function mnemonicPrompt(i: { en: string; ru: string; errors: readonly string[] }): string {
  return [
    `The learner keeps failing the phrase "${i.en}" (${i.ru}).`,
    i.errors.length ? `Their wrong answers: ${i.errors.slice(0, 5).join(' | ')}` : '',
    'Give one short Russian mnemonic (up to 20 words) that links the sound or image of the phrase with its meaning. Playful is fine.',
  ]
    .filter(Boolean)
    .join('\n')
}

export const PING_PROMPT = 'Reply with {"ok": true}.'

// ---- validators ----

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function strOf(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(strOf).filter(Boolean) : []
}

function correctionOf(v: unknown): Correction | null {
  if (!isObj(v)) return null
  const wrong = strOf(v.wrong)
  const right = strOf(v.right)
  if (!wrong || !right || wrong === right) return null
  const pid = strOf(v.patternId)
  return { wrong, right, ruleRu: strOf(v.ruleRu), patternId: (PATTERN_IDS as readonly string[]).includes(pid) ? pid : null }
}

export function parseProductionCheck(v: unknown): ProductionCheck | null {
  if (!isObj(v) || typeof v.ok !== 'boolean' || typeof v.usedTarget !== 'boolean') return null
  const errors = Array.isArray(v.errors) ? v.errors.map(correctionOf).filter((c): c is Correction => c !== null) : []
  const corrected = strOf(v.corrected)
  const more = strOf(v.moreNatural)
  return { ok: v.ok && errors.length === 0, usedTarget: v.usedTarget, corrected, errors, moreNatural: more || null }
}

export function parseSceneTurn(v: unknown): SceneTurnResult | null {
  if (!isObj(v)) return null
  const npcLine = strOf(v.npcLine)
  const outcome = strOf(v.outcome)
  const check = v.check === null || v.check === undefined ? null : parseProductionCheck(v.check)
  return {
    npcLine,
    check,
    outcome: outcome === 'success' || outcome === 'partial' || outcome === 'fail' ? outcome : null,
    whyRu: strOf(v.whyRu) || null,
  }
}

function contextsOf(v: unknown): { en: string; ru: string }[] {
  if (!Array.isArray(v)) return []
  return v
    .map((c) => (isObj(c) ? { en: strOf(c.en), ru: strOf(c.ru) } : { en: '', ru: '' }))
    .filter((c) => c.en.length > 0)
}

export function parseFreshContexts(v: unknown): FreshContext[] | null {
  if (!isObj(v) || !Array.isArray(v.items)) return null
  const out: FreshContext[] = []
  for (const it of v.items) {
    if (!isObj(it)) continue
    const id = strOf(it.id)
    const contexts = contextsOf(it.contexts)
    if (!id || contexts.length === 0) continue
    out.push({ id, contexts: contexts.slice(0, 2), promptRu: strOf(it.promptRu) })
  }
  return out
}

export function parseLifeItems(v: unknown): LifeItemDraft[] | null {
  if (!isObj(v) || !Array.isArray(v.items)) return null
  const out: LifeItemDraft[] = []
  for (const it of v.items) {
    if (!isObj(it)) continue
    const en = strOf(it.en)
    const ru = strOf(it.ru)
    if (!en || !ru) continue
    out.push({
      en,
      ru,
      accept: strArr(it.accept).slice(0, 3),
      contexts: contextsOf(it.contexts).slice(0, 3),
      promptsRu: strArr(it.promptsRu).slice(0, 3),
      falseMeanings: strArr(it.falseMeanings).slice(0, 3),
      noteRu: strOf(it.noteRu),
    })
  }
  return out.length > 0 ? out.slice(0, 10) : null
}

export function parseMnemonic(v: unknown): string | null {
  if (!isObj(v)) return null
  const m = strOf(v.mnemonicRu)
  return m || null
}

export function parsePing(v: unknown): boolean {
  return isObj(v) && v.ok === true
}
