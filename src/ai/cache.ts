import { db } from '@/db/db'
import { hashString } from '@/engine/rng'
import type { AITaskId } from './types'

/** Everything generated is cached on the device (SPEC §10.2); the key hashes the whole prompt. */
export function cacheKey(task: AITaskId, prompt: string): string {
  return `${task}:${hashString(prompt).toString(16)}:${prompt.length}`
}

export async function getCached(key: string): Promise<string | null> {
  const row = await db.aiCache.get(key)
  return row?.value ?? null
}

export async function putCached(key: string, task: AITaskId, value: string, now: number): Promise<void> {
  await db.aiCache.put({ key, task, value, createdAt: now })
}

const USAGE_PREFIX = 'usage:'

export async function usageFor(day: string): Promise<number> {
  const row = await db.aiCache.get(USAGE_PREFIX + day)
  return row ? Number(row.value) || 0 : 0
}

export async function addUsage(day: string, now: number): Promise<void> {
  const n = await usageFor(day)
  await db.aiCache.put({ key: USAGE_PREFIX + day, task: 'ping', value: String(n + 1), createdAt: now })
}

/** Marker rows for once-a-day jobs. */
export async function hasMarker(key: string): Promise<boolean> {
  return (await db.aiCache.get(`marker:${key}`)) !== undefined
}

export async function setMarker(key: string, now: number): Promise<void> {
  await db.aiCache.put({ key: `marker:${key}`, task: 'ping', value: '1', createdAt: now })
}
