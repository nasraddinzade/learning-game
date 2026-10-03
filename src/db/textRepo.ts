import type { LifeItemDraft } from '@/ai/types'
import { normalize } from '@/engine/answerCheck'
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
  /** Fields the AI produced for this phrase (SPEC §9.3), merged on top of the user's input. */
  draft?: LifeItemDraft
}

function sameText(a: string, b: string): boolean {
  return normalize(a) === normalize(b)
}

/** Adds the AI draft's fields where the item lacks them; the user's own translation wins. */
export function mergeDraft(item: Item, d: LifeItemDraft): Item {
  const placeholderRu = item.ru.trim() === '' || item.ru.startsWith('вместо «')
  const contexts = [...item.contexts]
  for (const c of d.contexts) {
    const i = contexts.findIndex((x) => sameText(x.en, c.en))
    if (i >= 0) {
      if (!contexts[i]!.ru && c.ru) contexts[i] = { ...contexts[i]!, ru: c.ru }
    } else contexts.push({ en: c.en, ru: c.ru, source: 'ai' })
  }
  const union = (a: string[], b: string[]) => [...a, ...b.filter((x) => !a.some((y) => sameText(x, y)))]
  return {
    ...item,
    ru: placeholderRu && d.ru ? d.ru : item.ru,
    accept: union(item.accept, d.accept.filter((x) => !sameText(x, item.en))),
    contexts,
    promptsRu: union(item.promptsRu, d.promptsRu),
    falseMeanings: union(item.falseMeanings, d.falseMeanings),
    noteRu: item.noteRu || d.noteRu,
  }
}

/** Appends fresh contexts and a situation from the daily request (SPEC §10.3 freshContexts). */
export function mergeFresh(item: Item, f: { contexts: { en: string; ru: string }[]; promptRu: string }): Item {
  const contexts = [...item.contexts]
  for (const c of f.contexts) if (!contexts.some((x) => sameText(x.en, c.en))) contexts.push({ en: c.en, ru: c.ru, source: 'ai' })
  const promptsRu = f.promptRu && !item.promptsRu.some((x) => sameText(x, f.promptRu)) ? [...item.promptsRu, f.promptRu] : item.promptsRu
  return { ...item, contexts, promptsRu }
}

/** Items in seed format from "Не смог сказать" and "Вставить текст" (SPEC §9.2). */
export async function addDraftItems(drafts: readonly LifeItemDraft[], now: number, textId?: string): Promise<Item[]> {
  const out: Item[] = []
  for (const d of drafts) {
    const base: Item = {
      id: newId('life'),
      type: 'phrase',
      land: 'life',
      en: d.en.trim(),
      ru: d.ru.trim(),
      accept: [],
      contexts: [],
      promptsRu: [],
      questionEn: '',
      falseMeanings: [],
      noteRu: '',
      source: 'life',
      createdAt: now,
    }
    if (textId) base.textId = textId
    const item = mergeDraft(base, d)
    await db.items.put(item)
    out.push(item)
  }
  return out
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
  const merged = input.draft ? mergeDraft(item, input.draft) : item
  await db.items.put(merged)
  return merged
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
