import { describe, expect, it } from 'vitest'
import { addDays } from './clock'
import { isPatternLearned, newPatternStat, patternAccuracy, reactivatePattern, recordTrap } from './patterns'

const T0 = new Date(2026, 9, 3, 12, 0).getTime()

describe('pattern stats (SPEC §4.5)', () => {
  it('keeps a rolling window of 20 and the set of active days', () => {
    let s = newPatternStat('articles')
    for (let i = 0; i < 25; i++) s = recordTrap(s, i % 2 === 0, T0)
    expect(s.last20).toHaveLength(20)
    expect(s.activeDays).toEqual(['2026-10-03'])
    expect(patternAccuracy(s)).toBeCloseTo(0.5)
    expect(s.active).toBe(true)
  })

  it('is learned at 90% over 20 attempts spread over 5 days', () => {
    let s = newPatternStat('articles')
    for (let i = 0; i < 20; i++) s = recordTrap(s, i !== 3 && i !== 11, addDays(T0, i % 5))
    expect(patternAccuracy(s)).toBe(0.9)
    expect(s.activeDays).toHaveLength(5)
    expect(isPatternLearned(s)).toBe(true)
    expect(s.active).toBe(false)
  })

  it('is not learned when the days are too few', () => {
    let s = newPatternStat('articles')
    for (let i = 0; i < 20; i++) s = recordTrap(s, true, addDays(T0, i % 4))
    expect(isPatternLearned(s)).toBe(false)
    expect(s.active).toBe(true)
  })

  it('is not learned below 90%', () => {
    let s = newPatternStat('articles')
    for (let i = 0; i < 20; i++) s = recordTrap(s, i % 4 !== 0, addDays(T0, i % 6))
    expect(patternAccuracy(s)).toBe(0.75)
    expect(s.active).toBe(true)
  })

  it('reactivates with a clean window', () => {
    let s = newPatternStat('articles')
    for (let i = 0; i < 20; i++) s = recordTrap(s, true, addDays(T0, i % 5))
    expect(s.active).toBe(false)
    s = reactivatePattern(s)
    expect(s.active).toBe(true)
    expect(s.last20).toEqual([])
  })
})
