import { describe, expect, it } from 'vitest'
import type { Item, Progress } from '@/types'
import { creatureStatus, landProgress, unlockedLandIds } from './lands'
import { applyAnswer, applyIntro, newProgress } from './progress'

const T0 = new Date(2026, 9, 3, 12, 0).getTime()

function item(id: string, land: string): Item {
  return { id, type: 'phrase', land, en: id, ru: id, accept: [], contexts: [], promptsRu: [], questionEn: '', falseMeanings: [], noteRu: '', source: 'seed', createdAt: 0 }
}

const items = [
  ...Array.from({ length: 5 }, (_, i) => item(`a${i}`, 'A')),
  ...Array.from({ length: 5 }, (_, i) => item(`b${i}`, 'B')),
  ...Array.from({ length: 5 }, (_, i) => item(`c${i}`, 'C')),
]

function met(id: string): Progress {
  return applyIntro(newProgress(id, T0), T0)
}
function wounded(id: string): Progress {
  return applyAnswer(met(id), { move: 'swipe', correct: true, rating: 3, risked: false, now: T0 }).progress
}

describe('creature status', () => {
  it('maps progress to the four statuses', () => {
    expect(creatureStatus(undefined)).toBe('unseen')
    expect(creatureStatus(newProgress('x', T0))).toBe('unseen')
    expect(creatureStatus(met('x'))).toBe('met')
    expect(creatureStatus(wounded('x'))).toBe('wounded')
    expect(creatureStatus({ ...wounded('x'), mastered: true })).toBe('tamed')
  })
})

describe('land progress and unlocking', () => {
  it('counts met, wounded and tamed per land', () => {
    const progress = new Map<string, Progress>([
      ['a0', met('a0')],
      ['a1', wounded('a1')],
      ['a2', { ...wounded('a2'), mastered: true }],
    ])
    expect(landProgress('A', items, progress)).toEqual({ landId: 'A', total: 5, met: 3, wounded: 2, tamed: 1, share: 0.6 })
    expect(landProgress('B', items, progress).met).toBe(0)
  })

  it('opens the next land once enough of the previous one is met', () => {
    const order = ['A', 'B', 'C']
    expect(unlockedLandIds(order, items, new Map(), 3)).toEqual(['A'])
    const two = new Map<string, Progress>([['a0', met('a0')], ['a1', met('a1')]])
    expect(unlockedLandIds(order, items, two, 3)).toEqual(['A'])
    const three = new Map(two)
    three.set('a2', met('a2'))
    expect(unlockedLandIds(order, items, three, 3)).toEqual(['A', 'B'])
    // C stays closed until B has three met items, even if A is fully done.
    for (const id of ['a3', 'a4']) three.set(id, met(id))
    expect(unlockedLandIds(order, items, three, 3)).toEqual(['A', 'B'])
    for (const id of ['b0', 'b1', 'b2']) three.set(id, met(id))
    expect(unlockedLandIds(order, items, three, 3)).toEqual(['A', 'B', 'C'])
  })

  it('a tiny land opens the next one when fully met', () => {
    const small = [item('s0', 'S'), item('t0', 'T')]
    expect(unlockedLandIds(['S', 'T'], small, new Map([['s0', met('s0')]]), 12)).toEqual(['S', 'T'])
  })
})
