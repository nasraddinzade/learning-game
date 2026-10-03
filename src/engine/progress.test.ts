import { describe, expect, it } from 'vitest'
import { addDays } from './clock'
import { applyAnswer, applyIntro, isDue, newProgress } from './progress'

const T0 = new Date(2026, 9, 3, 12, 0).getTime()

describe('applyIntro', () => {
  it('moves a new item to stage 1 without touching FSRS', () => {
    const p = applyIntro(newProgress('x', T0), T0)
    expect(p.stage).toBe(1)
    expect(p.fsrs.reps).toBe(0)
    expect(p.introducedAt).toBe(T0)
    expect(isDue(p, T0)).toBe(true)
  })
})

describe('applyAnswer', () => {
  it('a correct answer raises the stage and schedules the card', () => {
    const p = applyIntro(newProgress('x', T0), T0)
    const { progress, events } = applyAnswer(p, { move: 'swipe', correct: true, rating: 3, risked: false, now: T0 })
    expect(progress.stage).toBe(2)
    expect(events).toContain('stageUp')
    expect(progress.lastMove).toBe('swipe')
    expect(progress.fsrs.reps).toBe(1)
    expect(progress.inDebt).toBe(false)
  })

  it('a miss opens a debt, lowers the stage, counts a lapse', () => {
    let p = applyIntro(newProgress('x', T0), T0)
    p = applyAnswer(p, { move: 'swipe', correct: true, rating: 3, risked: false, now: T0 }).progress
    const { progress, events } = applyAnswer(p, { move: 'build', correct: false, rating: 1, risked: false, now: T0 + 1000 })
    expect(progress.inDebt).toBe(true)
    expect(progress.debtStreak).toBe(0)
    expect(progress.stage).toBe(1)
    expect(progress.lapses).toBe(1)
    expect(events).toEqual(expect.arrayContaining(['debtOpened', 'stageDown']))
  })

  it('a debt closes after two correct answers in a row', () => {
    let p = applyIntro(newProgress('x', T0), T0)
    p = applyAnswer(p, { move: 'swipe', correct: false, rating: 1, risked: false, now: T0 }).progress
    const first = applyAnswer(p, { move: 'build', correct: true, rating: 3, risked: false, now: T0 + 1 })
    expect(first.progress.inDebt).toBe(true)
    expect(first.progress.debtStreak).toBe(1)
    expect(first.events).not.toContain('debtClosed')
    const second = applyAnswer(first.progress, { move: 'gap', correct: true, rating: 3, risked: false, now: T0 + 2 })
    expect(second.progress.inDebt).toBe(false)
    expect(second.progress.debtStreak).toBe(0)
    expect(second.events).toContain('debtClosed')
  })

  it('a miss while paying the debt resets the streak', () => {
    let p = applyIntro(newProgress('x', T0), T0)
    p = applyAnswer(p, { move: 'swipe', correct: false, rating: 1, risked: false, now: T0 }).progress
    p = applyAnswer(p, { move: 'build', correct: true, rating: 3, risked: false, now: T0 + 1 }).progress
    p = applyAnswer(p, { move: 'gap', correct: false, rating: 1, risked: false, now: T0 + 2 }).progress
    expect(p.inDebt).toBe(true)
    expect(p.debtStreak).toBe(0)
    expect(p.lapses).toBe(2)
  })

  it('a risked hit jumps the stage to the move level', () => {
    const p = applyIntro(newProgress('x', T0), T0)
    const { progress } = applyAnswer(p, { move: 'translate', correct: true, rating: 3, risked: false, now: T0 })
    expect(progress.stage).toBe(2)
    const risked = applyAnswer(p, { move: 'translate', correct: true, rating: 3, risked: true, now: T0 })
    expect(risked.progress.stage).toBe(3)
  })

  it('Again makes the card due sooner than Easy', () => {
    const p = applyIntro(newProgress('x', T0), T0)
    const again = applyAnswer(p, { move: 'swipe', correct: false, rating: 1, risked: false, now: T0 }).progress
    const easy = applyAnswer(p, { move: 'swipe', correct: true, rating: 4, risked: false, now: T0 }).progress
    expect(again.fsrs.due.getTime()).toBeLessThan(easy.fsrs.due.getTime())
    expect(isDue(easy, addDays(T0, 30))).toBe(true)
  })

  it('mastery needs stage 5 and an interval of 21+ days', () => {
    let p = applyIntro(newProgress('x', T0), T0)
    let t = T0
    for (let i = 0; i < 8; i++) {
      p = applyAnswer(p, { move: 'improv', correct: true, rating: 4, risked: false, now: t }).progress
      t = Math.max(p.fsrs.due.getTime(), t + 1000)
    }
    expect(p.stage).toBe(5)
    expect(p.fsrs.scheduled_days).toBeGreaterThanOrEqual(21)
    expect(p.mastered).toBe(true)
  })
})
