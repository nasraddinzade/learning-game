// Rating for FSRS (SPEC §4.2). Takes only learning inputs: correctness, help used, speed.
// Game effects (boons, crits, hp) must never reach this function. That is law 2.
import type { Rating } from '@/types'

export const AGAIN: Rating = 1
export const HARD: Rating = 2
export const GOOD: Rating = 3
export const EASY: Rating = 4

export interface GradeInput {
  correct: boolean
  hintUsed: boolean
  typo: boolean
  /** Elapsed time divided by the base wind-up time for the move. >= 1 means the bar filled. */
  windupRatio: number
}

export function grade({ correct, hintUsed, typo, windupRatio }: GradeInput): Rating {
  if (!correct) return AGAIN
  if (hintUsed || typo || windupRatio >= 1) return HARD
  if (windupRatio < 0.5) return EASY
  return GOOD
}
