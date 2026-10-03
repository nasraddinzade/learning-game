// Seed content: lands with items (SPEC §9.1). Heavy, so it is imported lazily by ensureSeed.
import type { Item, ItemType } from '@/types'
import { lands, type LandDef } from '../lands'
import smalltalk from './lands/smalltalk.json'
import opinion from './lands/opinion.json'
import daily from './lands/daily.json'
import emotions from './lands/emotions.json'
import stories from './lands/stories.json'
import work from './lands/work.json'
import travel from './lands/travel.json'
import phrasal from './lands/phrasal.json'
import fillers from './lands/fillers.json'
import smalltalk2 from './lands/smalltalk-2.json'
import opinion2 from './lands/opinion-2.json'
import daily2 from './lands/daily-2.json'
import emotions2 from './lands/emotions-2.json'
import stories2 from './lands/stories-2.json'
import work2 from './lands/work-2.json'
import travel2 from './lands/travel-2.json'
import phrasal2 from './lands/phrasal-2.json'
import fillers2 from './lands/fillers-2.json'

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

interface LandJson extends LandDef {
  items: SeedItemJson[]
}

// Several files may share a land id; items are concatenated in this order.
const LAND_JSON: LandJson[] = [
  smalltalk,
  opinion,
  daily,
  emotions,
  stories,
  work,
  travel,
  phrasal,
  fillers,
  smalltalk2,
  opinion2,
  daily2,
  emotions2,
  stories2,
  work2,
  travel2,
  phrasal2,
  fillers2,
]

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

/** Lands as the JSON files declare them; must equal `lands` from ../lands (checked by seed.test.ts). */
export const landsFromJson: LandDef[] = LAND_JSON.filter((land, i) => LAND_JSON.findIndex((l) => l.id === land.id) === i).map(
  ({ id, name, emoji }) => ({ id, name, emoji }),
)

export { lands, type LandDef }

let order = 0
export const seedItems: Item[] = LAND_JSON.flatMap((land) => land.items.map((raw) => toItem(raw, land.id, order++)))

export { seedPatterns } from '../patterns'
