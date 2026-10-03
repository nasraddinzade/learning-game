import { db } from './db'
import type { Attempt, Item, Progress, Run } from '@/types'

export async function allItems(): Promise<Item[]> {
  return db.items.toArray()
}

export async function allProgress(): Promise<Progress[]> {
  return db.progress.toArray()
}

export async function progressMap(): Promise<Map<string, Progress>> {
  const m = new Map<string, Progress>()
  for (const p of await db.progress.toArray()) m.set(p.itemId, p)
  return m
}

export async function saveProgress(p: Progress): Promise<void> {
  await db.progress.put(p)
}

export async function addAttempt(a: Attempt): Promise<void> {
  await db.attempts.add(a)
}

/** The newest active run. Older stray active runs (if any) are closed as retreated. */
export async function activeRun(): Promise<Run | undefined> {
  const active = await db.runs.where('status').equals('active').sortBy('startedAt')
  const newest = active.pop()
  if (active.length > 0) {
    await db.runs.bulkPut(active.map((r) => ({ ...r, status: 'retreated' as const })))
  }
  return newest
}

export async function saveRun(run: Run): Promise<void> {
  await db.runs.put(run)
}

export function newId(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${rnd}`
}
