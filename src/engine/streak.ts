// Daily streak with freezes (SPEC §7.2). A missed day breaks the streak unless a freeze
// covers it. No reproaches: a broken streak simply starts again at 1.
import { dayKey, daysBetween } from './clock'

export interface StreakState {
  streak: number
  freezes: number
  /** YYYY-MM-DD of the last day with a finished run, '' when none. */
  lastActiveDay: string
}

export interface StreakUpdate extends StreakState {
  /** Freezes spent to bridge missed days this time. */
  usedFreezes: number
  /** The streak was broken (no freezes left to cover the gap). */
  broken: boolean
}

/** Applies activity on `now` to the streak state. */
export function advanceStreak(state: StreakState, now: number): StreakUpdate {
  const today = dayKey(now)
  if (state.lastActiveDay === today) return { ...state, usedFreezes: 0, broken: false }
  if (state.lastActiveDay === '') return { streak: 1, freezes: state.freezes, lastActiveDay: today, usedFreezes: 0, broken: false }
  const last = new Date(`${state.lastActiveDay}T12:00:00`).getTime()
  const gap = daysBetween(last, now)
  if (gap <= 1) return { streak: state.streak + 1, freezes: state.freezes, lastActiveDay: today, usedFreezes: 0, broken: false }
  const missed = gap - 1
  if (state.freezes >= missed) {
    return { streak: state.streak + 1, freezes: state.freezes - missed, lastActiveDay: today, usedFreezes: missed, broken: false }
  }
  return { streak: 1, freezes: state.freezes, lastActiveDay: today, usedFreezes: 0, broken: true }
}
