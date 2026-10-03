import { describe, expect, it } from 'vitest'
import type { Item, Progress } from '@/types'
import { addDays } from './clock'
import { becomeNemesis } from './nemesis'
import { applyAnswer, applyIntro, newProgress } from './progress'
import { buildQueue, newAllowedToday, queueCounts, OVERLOAD_THRESHOLD } from './scheduler'

const T0 = new Date(2026, 9, 3, 12, 0).getTime()

function item(id: string, source: Item['source'] = 'seed'): Item {
  return {
    id,
    type: 'phrase',
    land: 'test',
    en: id,
    ru: id,
    accept: [],
    contexts: [],
    promptsRu: [],
    questionEn: '',
    falseMeanings: [],
    noteRu: '',
    source,
    createdAt: 0,
  }
}

function reviewed(id: string, correct: boolean, at = T0): Progress {
  const p = applyIntro(newProgress(id, at), at)
  return applyAnswer(p, { move: 'swipe', correct, rating: correct ? 3 : 1, risked: false, now: at }).progress
}

describe('buildQueue priority', () => {
  it('orders debts → nemeses → reviews → new', () => {
    const items = ['debt', 'nem', 'rev', 'new1', 'new2'].map((id) => item(id))
    const debt = reviewed('debt', false)
    const nem = becomeNemesis(reviewed('nem', true), T0)
    const rev = reviewed('rev', true, addDays(T0, -40))
    const queue = buildQueue({ items, progress: [debt, nem, rev], now: T0, newPerDay: 6 })
    expect(queue.map((q) => q.kind)).toEqual(['debt', 'nemesis', 'review', 'new', 'new'])
    expect(queue[0]?.itemId).toBe('debt')
  })

  it('does not include items that are not due yet', () => {
    const p = reviewed('fresh', true)
    const queue = buildQueue({ items: [item('fresh')], progress: [p], now: T0, newPerDay: 0 })
    expect(queue.filter((q) => q.kind === 'review')).toHaveLength(0)
    const later = buildQueue({ items: [item('fresh')], progress: [p], now: addDays(T0, 60), newPerDay: 0 })
    expect(later.map((q) => q.kind)).toEqual(['review'])
  })

  it('a nemesis beaten today stays out of today\'s queue', () => {
    const nem = becomeNemesis(reviewed('nem', true), T0)
    const beaten: Progress = { ...nem, nemesis: { ...nem.nemesis!, defeatedDays: ['2026-10-03'] } }
    const queue = buildQueue({ items: [item('nem')], progress: [beaten], now: T0, newPerDay: 0 })
    expect(queue).toEqual([])
  })

  it('puts items from life before seed items among new', () => {
    const items = [item('seed1'), item('life1', 'life'), item('seed2')]
    const queue = buildQueue({ items, progress: [], now: T0, newPerDay: 2 })
    expect(queue.map((q) => q.itemId)).toEqual(['life1', 'seed1'])
  })

  it('respects the battle size limit', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(`i${i}`))
    expect(buildQueue({ items, progress: [], now: T0, newPerDay: 12, limit: 8 })).toHaveLength(8)
  })
})

describe('load regulator (SPEC §4.6)', () => {
  it('allows newPerDay minus what was already introduced today', () => {
    expect(newAllowedToday({ newPerDay: 6, introducedToday: 2, debts: 0, reviews: 0 })).toBe(4)
    expect(newAllowedToday({ newPerDay: 6, introducedToday: 9, debts: 0, reviews: 0 })).toBe(0)
  })

  it('allows no new items when debts + reviews exceed the threshold', () => {
    expect(newAllowedToday({ newPerDay: 6, introducedToday: 0, debts: 10, reviews: OVERLOAD_THRESHOLD - 9 })).toBe(0)
    expect(newAllowedToday({ newPerDay: 6, introducedToday: 0, debts: 10, reviews: OVERLOAD_THRESHOLD - 10 })).toBe(6)
  })

  it('counts items introduced today against the cap', () => {
    const introducedToday = [reviewed('a', true), reviewed('b', true)]
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id))
    const counts = queueCounts({ items, progress: introducedToday, now: T0, newPerDay: 3 })
    expect(counts.newIntroducedToday).toBe(2)
    expect(counts.newAllowed).toBe(1)
    const tomorrow = queueCounts({ items, progress: introducedToday, now: addDays(T0, 1), newPerDay: 3 })
    expect(tomorrow.newIntroducedToday).toBe(0)
    expect(tomorrow.newAllowed).toBe(3)
  })

  it('queue has zero new items under overload', () => {
    const items = Array.from({ length: 40 }, (_, i) => item(`i${i}`))
    const progress = items.slice(0, 32).map((i) => reviewed(i.id, false))
    const queue = buildQueue({ items, progress, now: T0, newPerDay: 6 })
    expect(queue.filter((q) => q.kind === 'new')).toHaveLength(0)
    expect(queue.filter((q) => q.kind === 'debt')).toHaveLength(32)
  })
})
