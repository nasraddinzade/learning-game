// Seed content: lands with items, and patterns with trap exercises (SPEC §9.1).
import type { Item, ItemType, PatternDef } from '@/types'
import smalltalk from './lands/smalltalk.json'
import opinion from './lands/opinion.json'
import daily from './lands/daily.json'
import emotions from './lands/emotions.json'
import stories from './lands/stories.json'
import work from './lands/work.json'
import travel from './lands/travel.json'
import phrasal from './lands/phrasal.json'
import fillers from './lands/fillers.json'
import articles from './patterns/articles.json'
import habitPresentSimple from './patterns/habit-present-simple.json'

interface SeedItemJson {
  id: string
  type?: string
  en: string
  ru: string
  accept: string[]
  contexts: { en: string; ru: string }[]
  promptsRu: string[]
  questionEn: string
  falseMeanings: string[]
  noteRu: string
}

export interface LandDef {
  id: string
  name: string
  emoji: string
}

interface LandJson extends LandDef {
  items: SeedItemJson[]
}

const LAND_JSON: LandJson[] = [smalltalk, opinion, daily, emotions, stories, work, travel, phrasal, fillers]

function toItemType(t: string | undefined): ItemType {
  return t === 'word' ? 'word' : 'phrase'
}

function toItem(raw: SeedItemJson, land: string, order: number): Item {
  return {
    id: raw.id,
    type: toItemType(raw.type),
    land,
    en: raw.en,
    ru: raw.ru,
    accept: raw.accept,
    contexts: raw.contexts.map((c) => ({ ...c, source: 'seed' as const })),
    promptsRu: raw.promptsRu,
    questionEn: raw.questionEn,
    falseMeanings: raw.falseMeanings,
    noteRu: raw.noteRu,
    source: 'seed',
    // Seed order doubles as creation time so new items arrive in the authored order.
    createdAt: order,
  }
}

export const lands: LandDef[] = LAND_JSON.map(({ id, name, emoji }) => ({ id, name, emoji }))

let order = 0
export const seedItems: Item[] = LAND_JSON.flatMap((land) => land.items.map((raw) => toItem(raw, land.id, order++)))

export const seedPatterns: PatternDef[] = [articles, habitPresentSimple] as PatternDef[]
