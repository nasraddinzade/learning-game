import { describe, expect, it } from 'vitest'
import type { Attempt, PatternStat, Progress, Run } from '@/types'
import { addDays, dayKey } from './clock'
import { applyIntro, newProgress } from './progress'
import { weeklyReport } from './stats'

const T0 = new Date(2026, 9, 4, 15).getTime()

function attempt(itemId: string, ts: number, correct: boolean, move: Attempt['move'] = 'translate'): Attempt {
  return { id: `${itemId}-${ts}`, itemId, move, ts, runId: 'r', correct, rating: correct ? 3 : 1, ms: 1000, hintUsed: false, risked: false, answer: 'x' }
}

function run(startedAt: number, status: Run['status']): Run {
  return { id: `run-${startedAt}`, seed: 1, kind: 'run', map: [], position: null, hp: 5, maxHp: 5, boons: [], runes: 0, combo: 0, failedItemIds: [], status, startedAt, combat: null, phase: 'summary', boonOffer: null, flags: { firstMissForgiven: false, secondWindUsed: false }, rest: null, encounter: null, pool: { debts: [], nemeses: [], reviews: [], fresh: [], materialized: [], chameleons: [] }, stats: { hits: 0, misses: 0, crits: 0, maxCombo: 0, closedDebtIds: [], defeatedNemesisIds: [], stageUpIds: [], masteredIds: [], seenItemIds: [], chests: 0, xp: 0 }, echoItemIds: null, cleanRun: false, sortieEndsAt: null, endedAt: startedAt }
}

describe('weeklyReport', () => {
  it('counts answers per day inside the window, ignoring intros and older attempts', () => {
    const attempts = [
      attempt('a', T0, true),
      attempt('a', T0 - 3600_000, false),
      attempt('b', addDays(T0, -2), true),
      attempt('b', addDays(T0, -2), true, 'intro'),
      attempt('c', addDays(T0, -9), true),
    ]
    const r = weeklyReport({ attempts, progress: [], patternStats: [], runs: [], trophyLog: [], now: T0 })
    expect(r.days).toHaveLength(7)
    expect(r.days[6]!.day).toBe(dayKey(T0))
    expect(r.days[6]).toMatchObject({ answers: 2, correct: 1 })
    expect(r.days[4]).toMatchObject({ answers: 1, correct: 1 })
    expect(r.answers).toBe(3)
    expect(r.accuracy).toBeCloseTo(2 / 3)
  })

  it('reports introduced and tamed phrases, runs, patterns, the stubborn nemesis and trophies', () => {
    const intro = applyIntro(newProgress('n1', addDays(T0, -1)), addDays(T0, -1))
    const old = applyIntro(newProgress('n2', addDays(T0, -30)), addDays(T0, -30))
    const tamedP: Progress = { ...old, itemId: 't', mastered: true }
    const nem1: Progress = { ...old, itemId: 'x', nemesis: { since: addDays(T0, -4), winsOverHero: 2, defeatedDays: [] } }
    const nem2: Progress = { ...old, itemId: 'y', nemesis: { since: addDays(T0, -10), winsOverHero: 2, defeatedDays: [] } }
    const patternStats: PatternStat[] = [
      { patternId: 'articles', last20: [true, true, false, true], activeDays: [], active: true },
      { patternId: 'calques', last20: [], activeDays: [], active: true },
    ]
    const r = weeklyReport({
      attempts: [attempt('t', T0, true)],
      progress: [intro, old, tamedP, nem1, nem2],
      patternStats,
      runs: [run(addDays(T0, -1), 'won'), run(addDays(T0, -3), 'retreated'), run(addDays(T0, -20), 'won'), run(T0, 'active')],
      trophyLog: [{ itemId: 'q', date: dayKey(addDays(T0, -2)), winsOverHero: 1, daysFought: 3 }, { itemId: 'w', date: dayKey(addDays(T0, -12)), winsOverHero: 0, daysFought: 3 }],
      now: T0,
    })
    expect(r.introduced).toBe(1)
    expect(r.tamed).toBe(1)
    expect(r.runs).toEqual({ total: 2, won: 1 })
    expect(r.patterns[0]).toMatchObject({ patternId: 'articles', accuracy: 0.75, attempts: 4 })
    expect(r.patterns[1]!.accuracy).toBeNull()
    expect(r.stubborn).toMatchObject({ itemId: 'y', winsOverHero: 2, days: 11 })
    expect(r.trophies).toBe(1)
  })

  it('is empty but well-formed without data', () => {
    const r = weeklyReport({ attempts: [], progress: [], patternStats: [], runs: [], trophyLog: [], now: T0 })
    expect(r.accuracy).toBeNull()
    expect(r.stubborn).toBeNull()
    expect(r.days.every((d) => d.answers === 0)).toBe(true)
  })
})
