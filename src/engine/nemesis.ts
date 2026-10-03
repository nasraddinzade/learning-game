// Nemesis rules (SPEC §4.4). An item becomes a nemesis after 3 lapses in total or after
// failing in two runs in a row. It comes to every run until beaten on three different days.
import type { Progress } from '@/types'

export const NEMESIS_LAPSES = 3
export const NEMESIS_FAILED_RUNS = 2
export const NEMESIS_MAX_ACTIVE = 5
export const NEMESIS_DEFEAT_DAYS = 3
/** A nemesis fight is this many different moves in a row without a mistake (SPEC §5.4). */
export const NEMESIS_HITS = 3

export function shouldBecomeNemesis(p: Progress): boolean {
  if (p.nemesis !== null || p.mastered) return false
  return p.lapses >= NEMESIS_LAPSES || p.failedRunsInRow >= NEMESIS_FAILED_RUNS
}

export function becomeNemesis(p: Progress, now: number): Progress {
  return { ...p, nemesis: { since: now, winsOverHero: 0, defeatedDays: [] } }
}

/**
 * Called once per run for every item that took part in it. Tracks consecutive failed runs
 * and promotes the item to nemesis when the rule triggers.
 */
export function endRunForItem(p: Progress, failedInRun: boolean, now: number): Progress {
  const next: Progress = { ...p, failedRunsInRow: failedInRun ? p.failedRunsInRow + 1 : 0 }
  return shouldBecomeNemesis(next) ? becomeNemesis(next, now) : next
}

export interface NemesisFightResult {
  progress: Progress
  /** The nemesis is destroyed: beaten on three different days. */
  destroyed: boolean
}

/** Records the outcome of a nemesis fight on `day` (YYYY-MM-DD). */
export function recordNemesisFight(p: Progress, won: boolean, day: string): NemesisFightResult {
  if (!p.nemesis) return { progress: p, destroyed: false }
  if (!won) {
    return {
      progress: { ...p, nemesis: { ...p.nemesis, winsOverHero: p.nemesis.winsOverHero + 1 } },
      destroyed: false,
    }
  }
  const days = p.nemesis.defeatedDays.includes(day)
    ? p.nemesis.defeatedDays
    : [...p.nemesis.defeatedDays, day]
  if (days.length >= NEMESIS_DEFEAT_DAYS) {
    // Destroyed for good: the item goes back to being an ordinary creature with a clean slate,
    // including lapses, otherwise the 3-lapses rule would promote it again at once.
    return {
      progress: { ...p, nemesis: null, failedRunsInRow: 0, lapses: 0, inDebt: false, debtStreak: 0 },
      destroyed: true,
    }
  }
  return {
    progress: { ...p, nemesis: { ...p.nemesis, defeatedDays: days }, inDebt: false, debtStreak: 0 },
    destroyed: false,
  }
}

/** Active nemeses (max 5, oldest first). The rest wait in line. */
export function activeNemeses(progress: readonly Progress[]): Progress[] {
  return progress
    .filter((p) => p.nemesis !== null)
    .sort((a, b) => (a.nemesis?.since ?? 0) - (b.nemesis?.since ?? 0))
    .slice(0, NEMESIS_MAX_ACTIVE)
}
