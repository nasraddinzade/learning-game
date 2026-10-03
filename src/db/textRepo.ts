import type { Item, TextDoc } from '@/types'
import { titleFor } from '@/reading/text'
import { db } from './db'
import { newId } from './repos'

export async function allTexts(): Promise<TextDoc[]> {
  return db.texts.orderBy('createdAt').reverse().toArray()
}

export async function getText(id: string): Promise<TextDoc | undefined> {
  return db.texts.get(id)
}

export async function addText(body: string, now: number, title?: string): Promise<TextDoc> {
  const doc: TextDoc = {
    id: newId('text'),
    title: title?.trim() || titleFor(body),
    body: body.replace(/\r\n?/g, '\n').trim(),
    createdAt: now,
  }
  await db.texts.put(doc)
  return doc
}

/** Deletes the text only; items taken from it keep living (SPEC §9.3). */
export async function deleteText(id: string): Promise<void> {
  await db.texts.delete(id)
}

/** How many items were taken from each text, keyed by text id. */
export async function itemCountsByText(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  await db.items
    .where('textId')
    .notEqual('')
    .each((i) => {
      if (i.textId) counts.set(i.textId, (counts.get(i.textId) ?? 0) + 1)
    })
  return counts
}

export interface LifeItemInput {
  en: string
  ru: string
  /** The sentence the phrase was taken from; becomes the first context. */
  contextEn: string
  textId?: string
  now: number
}

/**
 * Creates a phrase "from life" with the data the user gave. Missing fields (more contexts,
 * situations, false meanings) stay empty until the AI layer fills them (stage 5); until then
 * `canUse` keeps the item on the moves that work with one context.
 */
export async function addLifeItem(input: LifeItemInput): Promise<Item> {
  const item: Item = {
    id: newId('life'),
    type: 'phrase',
    land: 'life',
    en: input.en.trim(),
    ru: input.ru.trim(),
    accept: [],
    contexts: [{ en: input.contextEn.trim(), ru: '', source: 'life' }],
    promptsRu: [],
    questionEn: '',
    falseMeanings: [],
    noteRu: '',
    source: 'life',
    createdAt: input.now,
  }
  if (input.textId) item.textId = input.textId
  await db.items.put(item)
  return item
}

export interface CorrectionItemInput {
  wrong: string
  right: string
  ruleRu: string
  /** The corrected sentence the error came from; becomes the first context. */
  sentence: string
  now: number
}

/**
 * An error the AI caught in free speech becomes a phrase with the right variant (SPEC §8).
 * The Russian side is filled later by the daily enrichment; until then the rule is the hint.
 */
export async function addCorrectionItem(input: CorrectionItemInput): Promise<Item> {
  const item: Item = {
    id: newId('fix'),
    type: 'phrase',
    land: 'life',
    en: input.right.trim(),
    ru: `вместо «${input.wrong.trim()}»`,
    accept: [],
    contexts: input.sentence.trim() ? [{ en: input.sentence.trim(), ru: '', source: 'ai' }] : [],
    promptsRu: [],
    questionEn: '',
    falseMeanings: [],
    noteRu: input.ruleRu.trim(),
    source: 'ai-correction',
    createdAt: input.now,
  }
  await db.items.put(item)
  return item
}
