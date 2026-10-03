import { describe, expect, it } from 'vitest'
import { AGAIN, EASY, GOOD, HARD, grade } from './grading'

describe('grade (SPEC §4.2 mapping)', () => {
  it('wrong → Again regardless of speed', () => {
    expect(grade({ correct: false, hintUsed: false, typo: false, windupRatio: 0.1 })).toBe(AGAIN)
  })
  it('correct with hint → Hard', () => {
    expect(grade({ correct: true, hintUsed: true, typo: false, windupRatio: 0.1 })).toBe(HARD)
  })
  it('correct with typo → Hard', () => {
    expect(grade({ correct: true, hintUsed: false, typo: true, windupRatio: 0.1 })).toBe(HARD)
  })
  it('correct after the bar filled → Hard', () => {
    expect(grade({ correct: true, hintUsed: false, typo: false, windupRatio: 1 })).toBe(HARD)
    expect(grade({ correct: true, hintUsed: false, typo: false, windupRatio: 2.5 })).toBe(HARD)
  })
  it('correct before half the bar → Easy', () => {
    expect(grade({ correct: true, hintUsed: false, typo: false, windupRatio: 0.49 })).toBe(EASY)
  })
  it('correct in the second half → Good', () => {
    expect(grade({ correct: true, hintUsed: false, typo: false, windupRatio: 0.5 })).toBe(GOOD)
    expect(grade({ correct: true, hintUsed: false, typo: false, windupRatio: 0.99 })).toBe(GOOD)
  })
})
