import { describe, expect, it } from 'vitest'
import { addDays, dayKey, daysBetween } from './clock'

describe('clock', () => {
  const base = new Date(2026, 9, 3, 14, 30).getTime() // 2026-10-03 14:30 local

  it('formats a local day key', () => {
    expect(dayKey(base)).toBe('2026-10-03')
  })

  it('adds whole days keeping the time of day', () => {
    const next = addDays(base, 1)
    expect(dayKey(next)).toBe('2026-10-04')
    expect(new Date(next).getHours()).toBe(14)
  })

  it('crosses month boundaries', () => {
    expect(dayKey(addDays(base, 29))).toBe('2026-11-01')
  })

  it('counts whole days between timestamps', () => {
    expect(daysBetween(base, addDays(base, 3))).toBe(3)
    expect(daysBetween(base, base + 60 * 60 * 1000)).toBe(0)
    expect(daysBetween(addDays(base, 2), base)).toBe(-2)
  })
})
