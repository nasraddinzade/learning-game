import Dexie, { type EntityTable } from 'dexie'
import type { Attempt, Item, PatternStat, Profile, Progress, Run, TextDoc } from '@/types'

/** Cached AI responses keyed by a hash of the prompt. */
export interface AiCacheEntry {
  key: string
  task: string
  value: string
  createdAt: number
}

export class NemesisDB extends Dexie {
  items!: EntityTable<Item, 'id'>
  progress!: EntityTable<Progress, 'itemId'>
  attempts!: EntityTable<Attempt, 'id'>
  runs!: EntityTable<Run, 'id'>
  patternStats!: EntityTable<PatternStat, 'patternId'>
  profile!: EntityTable<Profile, 'id'>
  aiCache!: EntityTable<AiCacheEntry, 'key'>
  texts!: EntityTable<TextDoc, 'id'>

  constructor() {
    super('nemesis')
    this.version(1).stores({
      items: 'id, type, land, source, createdAt',
      progress: 'itemId, stage, inDebt, mastered, fsrs.due',
      attempts: 'id, itemId, runId, ts',
      runs: 'id, status, startedAt',
      patternStats: 'patternId, active',
      profile: 'id',
      aiCache: 'key, task, createdAt',
    })
    // Stage 2a: the reading-mode library and the link from an item to its text.
    this.version(2).stores({
      items: 'id, type, land, source, createdAt, textId',
      texts: 'id, createdAt',
    })
  }
}

export const db = new NemesisDB()

/** Wipes every table and the database itself. Used by the dev panel. */
export async function resetDatabase(): Promise<void> {
  db.close()
  await db.delete()
}
