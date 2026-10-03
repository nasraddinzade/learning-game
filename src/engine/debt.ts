// Debt rules (SPEC §4.3). A miss makes the item a debtor. It returns after 3–5 other answers
// with a different move and is cleared after two correct answers in a row.
import type { Progress } from '@/types'
import type { Rng } from './rng'
import { rngInt } from './rng'

export const DEBT_RETURN_MIN = 3
export const DEBT_RETURN_MAX = 5
export const DEBT_HITS_TO_CLOSE = 2

export function debtReturnDelay(rng: Rng): number {
  return rngInt(rng, DEBT_RETURN_MIN, DEBT_RETURN_MAX)
}

export function openDebt(p: Progress): Progress {
  return { ...p, inDebt: true, debtStreak: 0 }
}

/** Applies a correct answer to a debtor. Returns the new progress and whether the debt closed. */
export function payDebt(p: Progress): { progress: Progress; closed: boolean } {
  if (!p.inDebt) return { progress: p, closed: false }
  const streak = p.debtStreak + 1
  if (streak >= DEBT_HITS_TO_CLOSE) {
    return { progress: { ...p, inDebt: false, debtStreak: 0 }, closed: true }
  }
  return { progress: { ...p, debtStreak: streak }, closed: false }
}
