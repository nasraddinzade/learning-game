// Weekly report (SPEC §13, screen 11): pure aggregation over attempts, progress, patterns and runs.
import type { Attempt, PatternStat, Progress, Run, Trophy } from '@/types'
import { addDays, dayKey } from './clock'

export interface DayStat {
  day: string
  answers: number
  correct: number
}

export interface PatternReport {
  patternId: string
  /** Accuracy over the last 20 traps, null when none yet. */
  accuracy: number | null
  attempts: number
  active: boolean
}

export interface StubbornNemesis {
  itemId: string
  winsOverHero: number
  /** Days since she became a nemesis. */
  days: number
}

export interface WeeklyReport {
  from: number
  to: number
  days: DayStat[]
  answers: number
  correct: number
  accuracy: number | null
  /** Phrases met for the first time this week. */
  introduced: number
  /** Phrases that reached "tamed" and were answered this week. */
  tamed: number
  runs: { total: number; won: number }
  patterns: PatternReport[]
  stubborn: StubbornNemesis | null
  trophies: number
}

export interface StatsInput {
  attempts: readonly Attempt[]
  progress: readonly Progress[]
  patternStats: readonly PatternStat[]
  runs: readonly Run[]
  trophyLog: readonly Trophy[]
  now: number
  /** Window length in days, 7 by default. */
  days?: number
}

export function weeklyReport(input: StatsInput): WeeklyReport {
  const span = input.days ?? 7
  const to = input.now
  const from = addDays(to, -(span - 1))
  const fromDay = dayKey(from)
  const inWindow = (ts: number) => dayKey(ts) >= fromDay && ts <= to

  const days: DayStat[] = Array.from({ length: span }, (_, i) => ({ day: dayKey(addDays(from, i)), answers: 0, correct: 0 }))
  const byDay = new Map(days.map((d) => [d.day, d]))
  let answers = 0
  let correct = 0
  const answeredIds = new Set<string>()
  for (const a of input.attempts) {
    if (a.move === 'intro' || !inWindow(a.ts)) continue
    const d = byDay.get(dayKey(a.ts))
    if (!d) continue
    d.answers++
    answers++
    answeredIds.add(a.itemId)
    if (a.correct) {
      d.correct++
      correct++
    }
  }

  const introduced = input.progress.filter((p) => p.introducedAt !== null && inWindow(p.introducedAt)).length
  const tamed = input.progress.filter((p) => p.mastered && answeredIds.has(p.itemId)).length

  const weekRuns = input.runs.filter((r) => r.kind === 'run' && inWindow(r.startedAt) && r.status !== 'active')
  const runs = { total: weekRuns.length, won: weekRuns.filter((r) => r.status === 'won').length }

  const patterns: PatternReport[] = input.patternStats.map((s) => ({
    patternId: s.patternId,
    accuracy: s.last20.length === 0 ? null : s.last20.filter(Boolean).length / s.last20.length,
    attempts: s.last20.length,
    active: s.active,
  }))

  let stubborn: StubbornNemesis | null = null
  for (const p of input.progress) {
    if (!p.nemesis) continue
    const cand: StubbornNemesis = { itemId: p.itemId, winsOverHero: p.nemesis.winsOverHero, days: Math.max(1, Math.floor((to - p.nemesis.since) / 86_400_000) + 1) }
    if (!stubborn || cand.winsOverHero > stubborn.winsOverHero || (cand.winsOverHero === stubborn.winsOverHero && cand.days > stubborn.days)) stubborn = cand
  }

  const trophies = input.trophyLog.filter((t) => t.date >= fromDay && t.date <= dayKey(to)).length

  return { from, to, days, answers, correct, accuracy: answers === 0 ? null : correct / answers, introduced, tamed, runs, patterns, stubborn, trophies }
}
