import { describe, expect, it } from 'vitest'
import type { MoveId } from '@/types'
import { moveStage, pickMove, riskOptions, stageAfterHit, stageAfterMiss } from './moves'
import { mulberry32 } from './rng'

const enabled: MoveId[] = ['swipe', 'build', 'gap', 'translate']

describe('stage transitions', () => {
  it('a hit raises the stage by one, capped at 5', () => {
    expect(stageAfterHit(1, 'swipe', false)).toBe(2)
    expect(stageAfterHit(5, 'improv', false)).toBe(5)
  })
  it('a risked hit jumps straight to the move stage', () => {
    expect(stageAfterHit(1, 'translate', true)).toBe(3)
    expect(stageAfterHit(1, 'voice', true)).toBe(4)
  })
  it('a risked hit never lowers the stage', () => {
    expect(stageAfterHit(3, 'build', true)).toBe(4)
  })
  it('a miss lowers the stage but not below 1', () => {
    expect(stageAfterMiss(3)).toBe(2)
    expect(stageAfterMiss(1)).toBe(1)
    expect(stageAfterMiss(0)).toBe(1)
  })
})

describe('pickMove', () => {
  it('picks a move of the item stage', () => {
    for (let seed = 0; seed < 20; seed++) {
      const m = pickMove({ stage: 2, enabled, rng: mulberry32(seed) })
      expect(['build', 'gap']).toContain(m)
    }
  })
  it('never repeats the excluded move when an alternative exists at the stage', () => {
    for (let seed = 0; seed < 30; seed++) {
      expect(pickMove({ stage: 2, enabled, excluded: ['build'], rng: mulberry32(seed) })).toBe('gap')
    }
  })
  it('falls back to the nearest stage when the only move at the stage is excluded', () => {
    for (let seed = 0; seed < 30; seed++) {
      const m = pickMove({ stage: 1, enabled, excluded: ['swipe'], rng: mulberry32(seed) })
      expect(['build', 'gap']).toContain(m)
    }
  })
  it('uses the highest available move for stages above what is implemented', () => {
    expect(pickMove({ stage: 5, enabled, rng: mulberry32(1) })).toBe('translate')
  })
  it('uses an excluded move only when nothing else is enabled', () => {
    expect(pickMove({ stage: 3, enabled: ['translate'], excluded: ['translate'], rng: mulberry32(1) })).toBe('translate')
  })
  it('ignores non-item moves', () => {
    expect(() => pickMove({ stage: 1, enabled: ['trap', 'intro'], rng: mulberry32(1) })).toThrow()
  })
})

describe('riskOptions', () => {
  it('lists enabled moves above the current stage', () => {
    expect(riskOptions('swipe', enabled)).toEqual(['build', 'gap', 'translate'])
    expect(riskOptions('translate', enabled)).toEqual([])
  })
  it('agrees with moveStage', () => {
    expect(moveStage('gap')).toBe(2)
  })
})
