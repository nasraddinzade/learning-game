import { describe, expect, it } from 'vitest'
import { DEBT_RETURN_MAX, DEBT_RETURN_MIN } from '@/engine/debt'
import { grade } from '@/engine/grading'
import { applyAnswer, applyIntro, newProgress } from '@/engine/progress'
import type { QueueEntry } from '@/engine/scheduler'
import type { CombatState, Progress } from '@/types'
import { balance } from './balance'
import { createCombat, resolve, resolveIntro, runesKept } from './combat'

const T0 = new Date(2026, 9, 3, 12, 0).getTime()

function entries(ids: string[], kind: QueueEntry['kind'] = 'review'): QueueEntry[] {
  return ids.map((itemId) => ({ itemId, kind }))
}

function battle(ids: string[], kind: QueueEntry['kind'] = 'review', progress = new Map<string, Progress>()): CombatState {
  return createCombat(entries(ids, kind), progress, 42, balance.hero.maxHp)
}

const hit = { correct: true, crit: false, risked: false, debtClosed: false } as const
const miss = { correct: false, crit: false, risked: false, debtClosed: false } as const

describe('shadows', () => {
  it('die from one hit and the battle is won when the queue is empty', () => {
    let s = battle(['a', 'b'])
    expect(s.current?.itemId).toBe('a')
    let r = resolve(s, { ...hit, move: 'swipe' })
    expect(r.events.map((e) => e.type)).toEqual(['hit', 'enemyDown'])
    s = r.state
    expect(s.current?.itemId).toBe('b')
    r = resolve(s, { ...hit, move: 'swipe' })
    expect(r.state.status).toBe('won')
    expect(r.events.map((e) => e.type)).toContain('won')
    expect(r.state.hits).toBe(2)
  })
})

describe('debtors (SPEC §4.3, §5.4)', () => {
  it('a miss sends the enemy into the fog and it returns after 3–5 other answers', () => {
    let s = battle(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    const r = resolve(s, { ...miss, move: 'swipe' })
    const leave = r.events.find((e) => e.type === 'debtorLeaves')
    expect(leave).toBeDefined()
    if (!leave || leave.type !== 'debtorLeaves') throw new Error()
    expect(leave.returnsIn).toBeGreaterThanOrEqual(DEBT_RETURN_MIN)
    expect(leave.returnsIn).toBeLessThanOrEqual(DEBT_RETURN_MAX)
    s = r.state
    expect(s.hp).toBe(balance.hero.maxHp - 1)
    expect(s.current?.itemId).toBe('b')
    // Answer the others until it comes back.
    let others = 0
    while (s.current?.itemId !== 'a') {
      s = resolve(s, { ...hit, move: 'swipe' }).state
      others++
    }
    expect(others).toBe(leave.returnsIn)
    expect(s.current?.kind).toBe('debtor')
    expect(s.current?.hitsNeeded).toBe(2)
    expect(s.current?.movesUsed).toEqual(['swipe'])
  })

  it('needs two consecutive hits and records the move so the picker avoids it', () => {
    let s = battle(['a', 'b', 'c', 'd', 'e', 'f'])
    s = resolve(s, { ...miss, move: 'swipe' }).state
    while (s.current?.itemId !== 'a') s = resolve(s, { ...hit, move: 'swipe' }).state
    let r = resolve(s, { ...hit, move: 'build' })
    expect(r.events.map((e) => e.type)).toEqual(['hit'])
    s = r.state
    // Comes straight back for the second hit.
    expect(s.current?.itemId).toBe('a')
    expect(s.current?.hits).toBe(1)
    expect(s.current?.movesUsed).toEqual(['swipe', 'build'])
    r = resolve(s, { ...hit, move: 'gap', debtClosed: true })
    expect(r.events.map((e) => e.type)).toContain('enemyDown')
    expect(r.state.closedDebtIds).toEqual(['a'])
  })

  it('a half-beaten debtor comes back before other enemies that are also due', () => {
    // Two newcomers introduced back to back are both due at the same time as the debtor's second hit.
    let s = createCombat(
      [
        { itemId: 'd', kind: 'debt' },
        { itemId: 'n1', kind: 'new' },
        { itemId: 'n2', kind: 'new' },
        { itemId: 'x', kind: 'review' },
      ],
      new Map(),
      7,
      balance.hero.maxHp,
    )
    expect(s.current?.itemId).toBe('d')
    s = resolve(s, { ...hit, move: 'swipe' }).state // debtor hit 1 → comes back next
    expect(s.current?.itemId).toBe('d')
    expect(s.current?.hits).toBe(1)
  })

  it('comes back early when nothing else is left to fight', () => {
    let s = battle(['a', 'b'])
    s = resolve(s, { ...miss, move: 'swipe' }).state
    s = resolve(s, { ...hit, move: 'swipe' }).state
    expect(s.status).toBe('active')
    expect(s.current?.itemId).toBe('a')
    expect(s.current?.kind).toBe('debtor')
  })

  it('a debtor from a previous battle dies when the engine closes the debt', () => {
    let s = battle(['a'], 'debt')
    expect(s.current?.kind).toBe('debtor')
    const r = resolve(s, { ...hit, move: 'gap', debtClosed: true })
    expect(r.state.status).toBe('won')
    expect(r.state.closedDebtIds).toEqual(['a'])
    s = r.state
  })
})

describe('hero', () => {
  it('retreats at 0 hp, keeps half the runes, debts stay', () => {
    let s = battle(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    s = resolve(s, { ...hit, move: 'swipe' }).state
    const runesBefore = s.runes
    for (let i = 0; i < balance.hero.maxHp; i++) {
      expect(s.status).toBe('active')
      s = resolve(s, { ...miss, move: 'swipe' }).state
    }
    expect(s.status).toBe('retreated')
    expect(s.hp).toBe(0)
    expect(s.failedItemIds.length).toBe(balance.hero.maxHp)
    expect(runesKept(s)).toBe(Math.floor(runesBefore * balance.runes.retreatKeep))
  })

  it('combo multiplies runes and a crit doubles them', () => {
    let s = battle(['a', 'b', 'c', 'd', 'e', 'f'])
    const r1 = resolve(s, { ...hit, move: 'swipe' })
    const first = r1.events.find((e) => e.type === 'hit')
    expect(first).toMatchObject({ runes: balance.runes.perHit, combo: 1 })
    s = r1.state
    s = resolve(s, { ...hit, move: 'swipe' }).state
    s = resolve(s, { ...hit, move: 'swipe' }).state
    const r4 = resolve(s, { ...hit, move: 'swipe', crit: true })
    expect(r4.events.find((e) => e.type === 'hit')).toMatchObject({
      runes: balance.runes.perHit * 2 * balance.runes.critMultiplier,
      crit: true,
    })
    expect(resolve(r4.state, { ...miss, move: 'swipe' }).state.combo).toBe(0)
  })

  it('heals 1 hp at combo 10 when hurt', () => {
    let s = battle(Array.from({ length: 14 }, (_, i) => `i${i}`))
    s = resolve(s, { ...miss, move: 'swipe' }).state
    expect(s.hp).toBe(balance.hero.maxHp - 1)
    let healed = false
    for (let i = 0; i < 12; i++) {
      const r = resolve(s, { ...hit, move: 'swipe' })
      if (r.events.some((e) => e.type === 'comboHeal')) healed = true
      s = r.state
    }
    expect(healed).toBe(true)
    expect(s.hp).toBe(balance.hero.maxHp)
  })
})

describe('nemesis fights', () => {
  it('needs three hits; a miss means she won today and leaves', () => {
    let s = battle(['n', 'x'], 'nemesis')
    expect(s.current?.hitsNeeded).toBe(3)
    s = resolve(s, { ...hit, move: 'swipe' }).state
    s = resolve(s, { ...hit, move: 'build' }).state
    expect(s.current?.itemId).toBe('n')
    expect(s.current?.hits).toBe(2)
    const r = resolve(s, { ...miss, move: 'gap' })
    expect(r.events.map((e) => e.type)).toEqual(['miss', 'nemesisWon'])
    expect(r.state.current?.itemId).toBe('x')
    expect(r.state.pending).toEqual([])
  })

  it('three different hits defeat her', () => {
    let s = battle(['n'], 'nemesis')
    s = resolve(s, { ...hit, move: 'swipe' }).state
    s = resolve(s, { ...hit, move: 'build' }).state
    const r = resolve(s, { ...hit, move: 'translate' })
    expect(r.state.defeatedNemesisIds).toEqual(['n'])
    expect(r.state.status).toBe('won')
  })
})

describe('newcomers', () => {
  it('after Знакомство the item returns as a shadow for its first fight', () => {
    let s = battle(['n', 'a', 'b', 'c'], 'new')
    expect(s.current?.kind).toBe('newcomer')
    const r = resolveIntro(s)
    expect(r.events[0]?.type).toBe('newcomerReturns')
    s = r.state
    expect(s.current?.itemId).toBe('a')
    while (s.current?.itemId !== 'n') s = resolve(s, { ...hit, move: 'swipe' }).state
    expect(s.current?.kind).toBe('shadow')
    expect(s.current?.movesUsed).toEqual(['intro'])
  })
})

describe('law 2: game effects never change the learning grade', () => {
  it('the same answer yields the same progress whatever the combat state', () => {
    const p = applyIntro(newProgress('x', T0), T0)
    const input = { move: 'build' as const, correct: true, rating: grade({ correct: true, hintUsed: false, typo: false, windupRatio: 0.7 }), risked: false, now: T0 }
    const quiet = applyAnswer(p, input).progress
    const onFire = applyAnswer(p, input).progress
    expect(onFire).toEqual(quiet)
    // resolve() has no rating input and applyAnswer has no crit/combo/runes input: typed so.
    const s = battle(['x'])
    expect(resolve(s, { ...hit, move: 'build', crit: true }).state.runes).toBeGreaterThan(0)
  })
})
