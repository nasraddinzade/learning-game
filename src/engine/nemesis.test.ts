import { describe, expect, it } from 'vitest'
import { activeNemeses, becomeNemesis, endRunForItem, recordNemesisFight, shouldBecomeNemesis } from './nemesis'
import { applyAnswer, applyIntro, newProgress } from './progress'

const T0 = new Date(2026, 9, 3, 12, 0).getTime()

describe('nemesis creation', () => {
  it('three lapses in total make a nemesis', () => {
    let p = applyIntro(newProgress('x', T0), T0)
    for (let i = 0; i < 3; i++) {
      p = applyAnswer(p, { move: 'swipe', correct: false, rating: 1, risked: false, now: T0 + i }).progress
    }
    expect(p.lapses).toBe(3)
    expect(shouldBecomeNemesis(p)).toBe(true)
    expect(endRunForItem(p, true, T0).nemesis).not.toBeNull()
  })

  it('two lapses are not enough', () => {
    let p = applyIntro(newProgress('x', T0), T0)
    p = applyAnswer(p, { move: 'swipe', correct: false, rating: 1, risked: false, now: T0 }).progress
    p = applyAnswer(p, { move: 'build', correct: false, rating: 1, risked: false, now: T0 }).progress
    expect(shouldBecomeNemesis(p)).toBe(false)
  })

  it('failing in two runs in a row makes a nemesis', () => {
    let p = applyIntro(newProgress('x', T0), T0)
    p = applyAnswer(p, { move: 'swipe', correct: false, rating: 1, risked: false, now: T0 }).progress
    p = endRunForItem(p, true, T0)
    expect(p.failedRunsInRow).toBe(1)
    expect(p.nemesis).toBeNull()
    p = endRunForItem(p, true, T0 + 1)
    expect(p.failedRunsInRow).toBe(2)
    expect(p.nemesis).not.toBeNull()
  })

  it('a clean run resets the failed-run counter', () => {
    let p = applyIntro(newProgress('x', T0), T0)
    p = endRunForItem(p, true, T0)
    p = endRunForItem(p, false, T0)
    expect(p.failedRunsInRow).toBe(0)
    expect(p.nemesis).toBeNull()
  })

  it('does not promote twice', () => {
    const p = becomeNemesis(newProgress('x', T0), T0)
    expect(shouldBecomeNemesis({ ...p, lapses: 10 })).toBe(false)
  })
})

describe('nemesis fights', () => {
  it('a loss counts a win over the hero', () => {
    const p = becomeNemesis(newProgress('x', T0), T0)
    const { progress, destroyed } = recordNemesisFight(p, false, '2026-10-03')
    expect(progress.nemesis?.winsOverHero).toBe(1)
    expect(destroyed).toBe(false)
  })

  it('wins on three different days destroy the nemesis; same day counts once', () => {
    let p = becomeNemesis(newProgress('x', T0), T0)
    p = recordNemesisFight(p, true, '2026-10-03').progress
    p = recordNemesisFight(p, true, '2026-10-03').progress
    expect(p.nemesis?.defeatedDays).toEqual(['2026-10-03'])
    p = recordNemesisFight(p, true, '2026-10-04').progress
    const last = recordNemesisFight({ ...p, lapses: 5 }, true, '2026-10-06')
    expect(last.destroyed).toBe(true)
    expect(last.progress.nemesis).toBeNull()
    expect(last.progress.inDebt).toBe(false)
    expect(last.progress.lapses).toBe(0)
    // A destroyed nemesis must not be promoted again at the end of the same run.
    expect(shouldBecomeNemesis(endRunForItem(last.progress, false, T0))).toBe(false)
    expect(endRunForItem(last.progress, false, T0).nemesis).toBeNull()
  })

  it('keeps at most five active, oldest first', () => {
    const list = Array.from({ length: 7 }, (_, i) => becomeNemesis(newProgress(`n${i}`, T0), T0 + (7 - i)))
    const active = activeNemeses(list)
    expect(active).toHaveLength(5)
    expect(active[0]?.itemId).toBe('n6')
    expect(active.map((p) => p.itemId)).not.toContain('n0')
  })
})
