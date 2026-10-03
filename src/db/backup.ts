// Export and import of all data as JSON (SPEC §13, settings). AI keys never leave the device:
// they are stripped on export and kept as they are on import.
import type { Attempt, Item, PatternStat, Profile, Progress, Run, TextDoc } from '@/types'
import { db } from './db'
import { loadProfile } from './profileRepo'

export const BACKUP_VERSION = 1

export interface Backup {
  app: 'nemesis'
  version: number
  exportedAt: number
  tables: {
    items: Item[]
    progress: Progress[]
    attempts: Attempt[]
    runs: Run[]
    patternStats: PatternStat[]
    texts: TextDoc[]
    profile: Profile[]
  }
}

export interface BackupCounts {
  items: number
  progress: number
  attempts: number
  runs: number
  patternStats: number
  texts: number
}

function stripKeys(p: Profile): Profile {
  return { ...p, settings: { ...p.settings, ai: { ...p.settings.ai, geminiKey: '', groqKey: '' } } }
}

export async function exportBackup(now: number): Promise<Backup> {
  const [items, progress, attempts, runs, patternStats, texts, profile] = await Promise.all([
    db.items.toArray(),
    db.progress.toArray(),
    db.attempts.toArray(),
    db.runs.toArray(),
    db.patternStats.toArray(),
    db.texts.toArray(),
    db.profile.toArray(),
  ])
  return { app: 'nemesis', version: BACKUP_VERSION, exportedAt: now, tables: { items, progress, attempts, runs, patternStats, texts, profile: profile.map(stripKeys) } }
}

export function backupFilename(now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `nemesis-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Checks the shape; throws with a Russian message when the file is not a Nemesis backup. */
export function parseBackup(data: unknown): Backup {
  if (!isObj(data) || data.app !== 'nemesis' || !isObj(data.tables)) throw new Error('Это не файл резервной копии Nemesis')
  const t = data.tables
  const arr = (name: string) => {
    const v = t[name]
    if (v === undefined) return []
    if (!Array.isArray(v)) throw new Error(`Таблица ${name} повреждена`)
    return v
  }
  const version = typeof data.version === 'number' ? data.version : 0
  if (version > BACKUP_VERSION) throw new Error('Файл сделан более новой версией игры')
  return {
    app: 'nemesis',
    version,
    exportedAt: typeof data.exportedAt === 'number' ? data.exportedAt : 0,
    tables: {
      items: arr('items') as Item[],
      progress: arr('progress') as Progress[],
      attempts: arr('attempts') as Attempt[],
      runs: arr('runs') as Run[],
      patternStats: arr('patternStats') as PatternStat[],
      texts: arr('texts') as TextDoc[],
      profile: arr('profile') as Profile[],
    },
  }
}

export function backupCounts(b: Backup): BackupCounts {
  return { items: b.tables.items.length, progress: b.tables.progress.length, attempts: b.tables.attempts.length, runs: b.tables.runs.length, patternStats: b.tables.patternStats.length, texts: b.tables.texts.length }
}

/** Replaces every table with the backup in one transaction. The current AI keys survive. */
export async function importBackup(b: Backup): Promise<BackupCounts> {
  const current = await loadProfile()
  await db.transaction('rw', [db.items, db.progress, db.attempts, db.runs, db.patternStats, db.texts, db.profile], async () => {
    await Promise.all([db.items.clear(), db.progress.clear(), db.attempts.clear(), db.runs.clear(), db.patternStats.clear(), db.texts.clear(), db.profile.clear()])
    await db.items.bulkPut(b.tables.items)
    await db.progress.bulkPut(b.tables.progress)
    await db.attempts.bulkPut(b.tables.attempts)
    await db.runs.bulkPut(b.tables.runs)
    await db.patternStats.bulkPut(b.tables.patternStats)
    await db.texts.bulkPut(b.tables.texts)
    const incoming = b.tables.profile[0]
    if (incoming) {
      const merged: Profile = { ...incoming, id: 'me', settings: { ...incoming.settings, ai: { ...incoming.settings.ai, geminiKey: current.settings.ai.geminiKey, groqKey: current.settings.ai.groqKey } } }
      await db.profile.put(merged)
    } else await db.profile.put(current)
  })
  return backupCounts(b)
}
