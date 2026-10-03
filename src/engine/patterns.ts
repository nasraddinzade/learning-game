// Pattern progress (SPEC §4.5). A pattern is learned when accuracy over the last 20 attempts
// is at least 90% and those attempts span at least 5 different days.
import type { PatternStat } from '@/types'
import { dayKey } from './clock'

export const PATTERN_WINDOW = 20
export const PATTERN_MIN_ACCURACY = 0.9
export const PATTERN_MIN_DAYS = 5

export function newPatternStat(patternId: string): PatternStat {
  return { patternId, last20: [], activeDays: [], active: true }
}

export function patternAccuracy(stat: PatternStat): number {
  if (stat.last20.length === 0) return 0
  return stat.last20.filter(Boolean).length / stat.last20.length
}

export function isPatternLearned(stat: PatternStat): boolean {
  return (
    stat.last20.length >= PATTERN_WINDOW &&
    patternAccuracy(stat) >= PATTERN_MIN_ACCURACY &&
    stat.activeDays.length >= PATTERN_MIN_DAYS
  )
}

/** Records one Ловушка answer and deactivates the pattern once it is learned. */
export function recordTrap(stat: PatternStat, correct: boolean, now: number): PatternStat {
  const day = dayKey(now)
  const last20 = [...stat.last20, correct].slice(-PATTERN_WINDOW)
  const activeDays = stat.activeDays.includes(day) ? stat.activeDays : [...stat.activeDays, day]
  const next: PatternStat = { ...stat, last20, activeDays }
  return { ...next, active: !isPatternLearned(next) }
}

/** The AI (or a miss in free speech) found this mistake again: the pattern wakes up. */
export function reactivatePattern(stat: PatternStat): PatternStat {
  return { ...stat, active: true, last20: [], activeDays: [] }
}
