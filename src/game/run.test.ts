import { describe, expect, it } from 'vitest'
import { applyAnswer, applyIntro, newProgress } from '@/engine/progress'
import { mulberry32 } from '@/engine/rng'
import type { QueueEntry } from '@/engine/scheduler'
import type { Progress } from '@/types'
import { balance } from './balance'
import { createCombat, resolve, NO_OPTIONS } from './combat'
import { planEcho } from './echo'
import {
  answerRest,
  chooseBoon,
  createRun,
  createSortie,
  entriesForNode,
  finishBattleNode,
  finishRestNode,
  nextRest,
  startBattleNode,
  startRestNode,
} from './run'

const T0 = new Date(2026, 9, 3, 12, 0).getTime()

function queue(): QueueEntry[] {
  return [
    { itemId: 'd1', kind: 'debt' },
    { itemId: 'd2', kind: 'debt' },
    { itemId: 'n1', kind: 'nemesis' },
    ...Array.from({ length: 12 }, (_, i) => ({ itemId: `r${i}`, kind: 'review' as const })),
    ...Array.from({ length: 6 }, (_, i) => ({ itemId: `f${i}`, kind: 'new' as const })),
  ]
}

function progressMap(ids: string[]): Map<string, Progress> {
  const m = new Map<string, Progress>()
  for (const id of ids) m.set(id, applyIntro(newProgress(id, T0), T0))
  return m
}

const hit = { correct: true, crit: false, risked: false, typo: false, debtClosed: false } as const
const miss = { correct: false, crit: false, risked: false, typo: false, debtClosed: false } as const

describe('run creation', () => {
  it('splits the queue into pools and starts on the map with an Ambush first when debts exist', () => {
    const run = createRun({ id: 'r', seed: 3, now: T0, queue: queue(), maxHp: 5 })
    expect(run.pool.debts).toEqual(['d1', 'd2'])
    expect(run.pool.nemeses).toEqual(['n1'])
    expect(run.pool.reviews).toHaveLength(12)
    expect(run.pool.fresh).toHaveLength(6)
    expect(run.map[0]).toEqual([{ type: 'ambush', next: expect.any(Array), done: false }])
    expect(run.phase).toBe('map')
    expect(run.hp).toBe(5)
  })
})

describe('node contents', () => {
  const progress = progressMap(queue().map((e) => e.itemId))

  it('Ambush takes every debtor', () => {
    const run = createRun({ id: 'r', seed: 3, now: T0, queue: queue(), maxHp: 5 })
    const { entries, pool } = entriesForNode(run, 'ambush', progress)
    expect(entries.map((e) => e.itemId)).toEqual(['d1', 'd2'])
    expect(entries.every((e) => e.kind === 'debt')).toBe(true)
    expect(pool.debts).toEqual([])
  })

  it('Skirmish takes 4–5 reviews', () => {
    const run = createRun({ id: 'r', seed: 3, now: T0, queue: queue(), maxHp: 5 })
    const { entries, pool } = entriesForNode(run, 'skirmish', progress)
    expect(entries.length).toBeGreaterThanOrEqual(balance.nodes.skirmishMin)
    expect(entries.length).toBeLessThanOrEqual(balance.nodes.skirmishMax)
    expect(entries.every((e) => e.kind === 'review')).toBe(true)
    expect(pool.reviews).toHaveLength(12 - entries.length)
  })

  it('Skirmish tops up with new items when reviews run out', () => {
    const run = createRun({ id: 'r', seed: 3, now: T0, queue: queue().filter((e) => e.kind !== 'review'), maxHp: 5 })
    const { entries } = entriesForNode(run, 'skirmish', progress)
    expect(entries.length).toBeGreaterThanOrEqual(4)
    expect(entries.some((e) => e.kind === 'new')).toBe(true)
  })

  it('Scout takes new items, Lair one nemesis', () => {
    const run = createRun({ id: 'r', seed: 3, now: T0, queue: queue(), maxHp: 5 })
    const scout = entriesForNode(run, 'scout', progress)
    expect(scout.entries.map((e) => e.kind)).toEqual(['new', 'new', 'new'])
    const lair = entriesForNode(run, 'lair', progress)
    expect(lair.entries).toEqual([{ itemId: 'n1', kind: 'nemesis' }])
  })

  it('a Scout with nothing new never steals the nemesis from the Lair', () => {
    const run = createRun({ id: 'r', seed: 3, now: T0, queue: [{ itemId: 'n1', kind: 'nemesis' }], maxHp: 5 })
    const scout = entriesForNode(run, 'scout', progress)
    expect(scout.entries.length).toBeGreaterThan(0)
    expect(scout.entries.some((e) => e.itemId === 'n1')).toBe(false)
    expect(scout.pool.nemeses).toEqual(['n1'])
    const lair = entriesForNode({ ...run, pool: scout.pool }, 'lair', progress)
    expect(lair.entries).toEqual([{ itemId: 'n1', kind: 'nemesis' }])
  })

  it('a battle node never starts empty', () => {
    const run = createRun({ id: 'r', seed: 3, now: T0, queue: [], maxHp: 5 })
    const { entries } = entriesForNode(run, 'skirmish', progress)
    expect(entries.length).toBeGreaterThan(0)
  })
})

describe('Echo (SPEC §5.4)', () => {
  it('is built from the run\'s failed items with the hardest move', () => {
    const plan = planEcho({ failedItemIds: ['a', 'b', 'a'], seenItemIds: ['a', 'b', 'c'], progress: new Map() })
    expect(plan).toEqual({ itemIds: ['a', 'b'], clean: false })
  })

  it('a clean run faces the three least stable items', () => {
    let p = applyIntro(newProgress('easy', T0), T0)
    for (let i = 0; i < 4; i++) p = applyAnswer(p, { move: 'translate', correct: true, rating: 4, risked: false, now: T0 + i }).progress
    const progress = new Map<string, Progress>([
      ['easy', p],
      ['hard1', applyIntro(newProgress('hard1', T0), T0)],
      ['hard2', applyIntro(newProgress('hard2', T0), T0)],
      ['hard3', applyIntro(newProgress('hard3', T0), T0)],
    ])
    const plan = planEcho({ failedItemIds: [], seenItemIds: ['easy', 'hard1', 'hard2', 'hard3'], progress })
    expect(plan.clean).toBe(true)
    expect(plan.itemIds).toHaveLength(3)
    expect(plan.itemIds).not.toContain('easy')
  })

  it('starting the Echo node records the plan and the clean flag on the run', () => {
    const run = createRun({ id: 'r', seed: 3, now: T0, queue: queue(), maxHp: 5 })
    const progress = progressMap(queue().map((e) => e.itemId))
    const withFail = { ...run, failedItemIds: ['r1'], stats: { ...run.stats, seenItemIds: ['r1', 'r2'] } }
    const echoStep = run.map.length - 1
    const started = startBattleNode(withFail, { step: echoStep, node: 0 }, progress)
    expect(started.echoItemIds).toEqual(['r1'])
    expect(started.cleanRun).toBe(false)
    expect(started.combat?.current?.kind).toBe('echo')
    expect(started.combat?.nodeType).toBe('echo')
  })
})

describe('battle nodes and boons', () => {
  const progress = progressMap(queue().map((e) => e.itemId))

  it('a won node merges stats, marks the node done and offers three boons', () => {
    let run = createRun({ id: 'r', seed: 3, now: T0, queue: queue(), maxHp: 5 })
    run = startBattleNode(run, { step: 0, node: 0 }, progress)
    expect(run.phase).toBe('battle')
    let combat = run.combat!
    while (combat.status === 'active') combat = resolve(combat, { ...hit, move: 'gap', debtClosed: true }).state
    run = finishBattleNode(run, combat, mulberry32(1))
    expect(run.phase).toBe('boon')
    expect(run.boonOffer).toHaveLength(3)
    expect(run.map[0]![0]!.done).toBe(true)
    expect(run.stats.closedDebtIds).toEqual(['d1', 'd2'])
    expect(run.runes).toBe(combat.runes)
    run = chooseBoon(run, run.boonOffer![0]!)
    expect(run.boons).toHaveLength(1)
    expect(run.phase).toBe('map')
  })

  it('a retreat ends the run with half the runes', () => {
    let run = createRun({ id: 'r', seed: 3, now: T0, queue: queue(), maxHp: 5 })
    run = { ...run, runes: 100 }
    run = startBattleNode(run, { step: 0, node: 0 }, progress)
    let combat = run.combat!
    for (let i = 0; i < 5; i++) combat = resolve(combat, { ...miss, move: 'gap' }).state
    expect(combat.status).toBe('retreated')
    run = finishBattleNode(run, combat)
    expect(run.status).toBe('retreated')
    expect(run.phase).toBe('summary')
    expect(run.runes).toBe(50)
  })

  it('Память рода spares the first miss, Второе дыхание lifts the hero once from 0', () => {
    const c = createCombat(Array.from({ length: 10 }, (_, i) => ({ itemId: `x${i}`, kind: 'review' as const })), new Map(), 1, 2, 5)
    const opts = { boons: ['kinMemory', 'secondWind'] as const, flags: NO_OPTIONS.flags }
    let r = resolve(c, { ...miss, move: 'gap' }, opts)
    expect(r.state.hp).toBe(2)
    expect(r.flags.firstMissForgiven).toBe(true)
    r = resolve(r.state, { ...miss, move: 'gap' }, { boons: opts.boons, flags: r.flags })
    expect(r.state.hp).toBe(1)
    r = resolve(r.state, { ...miss, move: 'gap' }, { boons: opts.boons, flags: r.flags })
    expect(r.state.hp).toBe(1)
    expect(r.flags.secondWindUsed).toBe(true)
    expect(r.events.map((e) => e.type)).toContain('secondWind')
    r = resolve(r.state, { ...miss, move: 'gap' }, { boons: opts.boons, flags: r.flags })
    expect(r.state.status).toBe('retreated')
  })

  it('Разведка spares hp on an item\'s first miss', () => {
    const c = createCombat([{ itemId: 'a', kind: 'review' }, { itemId: 'b', kind: 'review' }], new Map(), 1, 5, 5, 'scout')
    const r = resolve(c, { ...miss, move: 'swipe' })
    expect(r.state.hp).toBe(5)
    expect(r.events[0]).toMatchObject({ type: 'miss', spared: true })
  })

  it('Азарт, Чистый клинок, Упрямство and Охотник change runes and hp only', () => {
    const c = createCombat([{ itemId: 'a', kind: 'review' }], new Map(), 1, 3, 5)
    const plain = resolve(c, { ...hit, move: 'gap', risked: true })
    const gamble = resolve(c, { ...hit, move: 'gap', risked: true }, { boons: ['gamble', 'cleanBlade'], flags: NO_OPTIONS.flags })
    const plainHit = plain.events.find((e) => e.type === 'hit')
    const gambleHit = gamble.events.find((e) => e.type === 'hit')
    expect(gambleHit && plainHit && gambleHit.type === 'hit' && plainHit.type === 'hit' && gambleHit.runes).toBe(
      Math.round(balance.runes.perHit * balance.runes.riskMultiplier * balance.runes.gambleBonus),
    )
    expect(gamble.events.some((e) => e.type === 'chest')).toBe(true)
    expect(gamble.state.runes).toBe((gambleHit?.type === 'hit' ? gambleHit.runes : 0) + balance.runes.chestRunes)

    const debtor = createCombat([{ itemId: 'd', kind: 'debt' }], new Map(), 1, 3, 5)
    const stubborn = resolve(debtor, { ...hit, move: 'gap', debtClosed: true }, { boons: ['stubbornness'], flags: NO_OPTIONS.flags })
    expect(stubborn.state.hp).toBe(4)

    let nem = createCombat([{ itemId: 'n', kind: 'nemesis' }], new Map(), 1, 1, 5)
    nem = resolve(nem, { ...hit, move: 'swipe' }, { boons: ['hunter'], flags: NO_OPTIONS.flags }).state
    nem = resolve(nem, { ...hit, move: 'build' }, { boons: ['hunter'], flags: NO_OPTIONS.flags }).state
    const win = resolve(nem, { ...hit, move: 'gap' }, { boons: ['hunter'], flags: NO_OPTIONS.flags })
    expect(win.state.hp).toBe(3)
  })

  it('Щит переписчика restores the first typo of a battle, later typos keep half', () => {
    const c = createCombat([{ itemId: 'a', kind: 'review' }, { itemId: 'b', kind: 'review' }], new Map(), 1, 5, 5)
    const noShield = resolve(c, { ...hit, move: 'gap', typo: true })
    expect(noShield.events[0]).toMatchObject({ type: 'hit', runes: balance.runes.perHit * balance.runes.typoKeep })
    const shield = resolve(c, { ...hit, move: 'gap', typo: true }, { boons: ['scribeShield'], flags: NO_OPTIONS.flags })
    expect(shield.events[0]).toMatchObject({ type: 'hit', runes: balance.runes.perHit })
    const second = resolve(shield.state, { ...hit, move: 'gap', typo: true }, { boons: ['scribeShield'], flags: NO_OPTIONS.flags })
    expect(second.events[0]).toMatchObject({ type: 'hit', runes: balance.runes.perHit * balance.runes.typoKeep })
  })
})

describe('Привал', () => {
  it('heals 2 (3 with Тёплый костёр), five traps, clean training offers a boon', () => {
    let run = createRun({ id: 'r', seed: 3, now: T0, queue: queue(), maxHp: 5 })
    run = { ...run, hp: 2 }
    const rested = startRestNode(run, { step: 1, node: 0 }, 'articles', 40)
    expect(rested.hp).toBe(4)
    expect(rested.rest?.exercises).toHaveLength(balance.nodes.restTraps)
    expect(new Set(rested.rest?.exercises).size).toBe(balance.nodes.restTraps)
    const warm = startRestNode({ ...run, boons: ['warmFire'] }, { step: 1, node: 0 }, 'articles', 40)
    expect(warm.hp).toBe(5)

    let r = rested
    for (let i = 0; i < balance.nodes.restTraps; i++) {
      r = answerRest(r, true, 'rule', 'fixed')
      expect(r.rest?.feedback?.correct).toBe(true)
      r = nextRest(r)
    }
    expect(r.rest?.done).toBe(true)
    const done = finishRestNode(r, mulberry32(9))
    expect(done.phase).toBe('boon')
    expect(done.boonOffer).toHaveLength(3)
    expect(done.map[1]![0]!.done).toBe(true)

    let dirty = rested
    dirty = nextRest(answerRest(dirty, false, 'rule', 'fixed'))
    for (let i = 1; i < balance.nodes.restTraps; i++) dirty = nextRest(answerRest(dirty, true, 'rule', 'fixed'))
    expect(finishRestNode(dirty).phase).toBe('map')
  })

  it('a rest without an active pattern just heals', () => {
    const run = createRun({ id: 'r', seed: 3, now: T0, queue: queue(), maxHp: 5 })
    const rested = startRestNode({ ...run, hp: 1 }, { step: 1, node: 0 }, null, 0)
    expect(rested.rest?.done).toBe(true)
    expect(rested.hp).toBe(3)
  })
})

describe('Вылазка', () => {
  it('is a single Ambush with debtors and one nemesis and a two-minute clock', () => {
    const run = createSortie({ id: 's', seed: 1, now: T0, queue: queue(), maxHp: 5 })
    expect(run.kind).toBe('sortie')
    expect(run.map).toEqual([[{ type: 'ambush', next: [], done: false }]])
    expect(run.sortieEndsAt).toBe(T0 + balance.sortie.durationMs)
    const progress = progressMap(queue().map((e) => e.itemId))
    const { entries } = entriesForNode(run, 'ambush', progress)
    expect(entries.map((e) => e.kind)).toEqual(['debt', 'debt', 'nemesis'])
  })

  it('ends after its single node', () => {
    let run = createSortie({ id: 's', seed: 1, now: T0, queue: queue(), maxHp: 5 })
    const progress = progressMap(queue().map((e) => e.itemId))
    run = startBattleNode(run, { step: 0, node: 0 }, progress)
    let combat = run.combat!
    while (combat.status === 'active') combat = resolve(combat, { ...hit, move: 'gap', debtClosed: true }).state
    run = finishBattleNode(run, combat)
    expect(run.status).toBe('won')
    expect(run.phase).toBe('summary')
  })
})
