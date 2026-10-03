import { seedPatterns } from '@/content/patterns'
import { newPatternStat } from '@/engine/patterns'
import type { PatternDef, PatternStat } from '@/types'
import { db } from './db'

export function patternDef(id: string): PatternDef | undefined {
  return seedPatterns.find((p) => p.id === id)
}

export async function allPatternStats(): Promise<PatternStat[]> {
  const stats = await db.patternStats.toArray()
  const known = new Set(stats.map((s) => s.patternId))
  const missing = seedPatterns.filter((p) => !known.has(p.id)).map((p) => newPatternStat(p.id))
  if (missing.length > 0) await db.patternStats.bulkPut(missing)
  return [...stats, ...missing]
}

export async function savePatternStat(stat: PatternStat): Promise<void> {
  await db.patternStats.put(stat)
}

/** Active patterns, the one with the worst recent accuracy first. */
export async function activePatterns(): Promise<PatternStat[]> {
  const stats = await allPatternStats()
  return stats
    .filter((s) => s.active && patternDef(s.patternId) !== undefined)
    .sort((a, b) => accuracy(a) - accuracy(b))
}

function accuracy(s: PatternStat): number {
  return s.last20.length === 0 ? 0 : s.last20.filter(Boolean).length / s.last20.length
}
