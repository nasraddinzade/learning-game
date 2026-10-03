import { describe, expect, it } from 'vitest'
import { addDays, dayKey } from './clock'
import { advanceStreak } from './streak'

const T0 = new Date(2026, 9, 3, 12, 0).getTime()

describe('streak with freezes (SPEC §7.2)', () => {
  it('starts at 1 and grows on consecutive days', () => {
    const d1 = advanceStreak({ streak: 0, freezes: 0, lastActiveDay: '' }, T0)
    expect(d1).toMatchObject({ streak: 1, lastActiveDay: dayKey(T0), broken: false })
    const d2 = advanceStreak(d1, addDays(T0, 1))
    expect(d2.streak).toBe(2)
  })

  it('does not grow twice on the same day', () => {
    const d1 = advanceStreak({ streak: 4, freezes: 0, lastActiveDay: dayKey(T0) }, T0 + 3600_000)
    expect(d1.streak).toBe(4)
  })

  it('breaks after a missed day without freezes', () => {
    const r = advanceStreak({ streak: 7, freezes: 0, lastActiveDay: dayKey(T0) }, addDays(T0, 2))
    expect(r).toMatchObject({ streak: 1, broken: true, usedFreezes: 0 })
  })

  it('a freeze covers one missed day and keeps the streak', () => {
    const r = advanceStreak({ streak: 7, freezes: 1, lastActiveDay: dayKey(T0) }, addDays(T0, 2))
    expect(r).toMatchObject({ streak: 8, freezes: 0, usedFreezes: 1, broken: false })
  })

  it('two missed days need two freezes', () => {
    const one = advanceStreak({ streak: 7, freezes: 1, lastActiveDay: dayKey(T0) }, addDays(T0, 3))
    expect(one).toMatchObject({ streak: 1, freezes: 1, broken: true })
    const two = advanceStreak({ streak: 7, freezes: 2, lastActiveDay: dayKey(T0) }, addDays(T0, 3))
    expect(two).toMatchObject({ streak: 8, freezes: 0, usedFreezes: 2 })
  })
})
