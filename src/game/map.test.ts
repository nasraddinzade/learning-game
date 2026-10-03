import { describe, expect, it } from 'vitest'
import { balance } from './balance'
import { generateMap, isValidMap, reachableNodes, visibleSteps } from './map'

describe('map generation (SPEC §5.2)', () => {
  it('produces 6 steps plus the Echo, 2–3 choices per step, every rule satisfied', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const input = { seed, hasDebts: seed % 2 === 0, hasNemesis: seed % 3 === 0 }
      const map = generateMap(input)
      expect(map).toHaveLength(balance.map.steps + 1)
      expect(isValidMap(map, input), `seed ${seed}`).toBe(true)
      for (let s = 1; s < map.length - 1; s++) {
        expect(map[s]!.length).toBeGreaterThanOrEqual(2)
        expect(map[s]!.length).toBeLessThanOrEqual(3)
      }
    }
  })

  it('starts with a single Ambush when there are debts, never otherwise', () => {
    expect(generateMap({ seed: 5, hasDebts: true, hasNemesis: false })[0]).toEqual([{ type: 'ambush', next: expect.any(Array), done: false }])
    for (let seed = 1; seed <= 50; seed++) {
      const map = generateMap({ seed, hasDebts: false, hasNemesis: false })
      expect(map.flat().some((n) => n.type === 'ambush')).toBe(false)
    }
  })

  it('has at least one Rest, exactly one Lair with a nemesis, never before step 3 or without one', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const map = generateMap({ seed, hasDebts: false, hasNemesis: true })
      expect(map.flat().filter((n) => n.type === 'rest').length).toBeGreaterThanOrEqual(1)
      expect(map.flat().filter((n) => n.type === 'lair').length).toBe(1)
      map.forEach((step, s) => {
        for (const n of step) if (n.type === 'lair') expect(s).toBeGreaterThanOrEqual(balance.map.lairMinStep)
      })
      const noNemesis = generateMap({ seed, hasDebts: false, hasNemesis: false })
      expect(noNemesis.flat().some((n) => n.type === 'lair')).toBe(false)
    }
  })

  it('never links two nodes of the same type in a row', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const map = generateMap({ seed, hasDebts: seed % 2 === 0, hasNemesis: true })
      for (let s = 0; s < map.length - 1; s++) {
        for (const n of map[s]!) for (const j of n.next) expect(map[s + 1]![j]!.type).not.toBe(n.type)
      }
    }
  })

  it('places at most one Encounter and only when allowed', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const off = generateMap({ seed, hasDebts: false, hasNemesis: false })
      expect(off.flat().some((n) => n.type === 'encounter')).toBe(false)
      const on = generateMap({ seed, hasDebts: false, hasNemesis: false, allowEncounter: true })
      expect(on.flat().filter((n) => n.type === 'encounter').length).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic per seed', () => {
    expect(generateMap({ seed: 42, hasDebts: false, hasNemesis: true })).toEqual(generateMap({ seed: 42, hasDebts: false, hasNemesis: true }))
  })

  it('reachable nodes follow the edges, all of step 0 at the start', () => {
    const map = generateMap({ seed: 7, hasDebts: false, hasNemesis: false })
    expect(reachableNodes(map, null)).toEqual(map[0]!.map((_, i) => i))
    expect(reachableNodes(map, { step: 0, node: 0 })).toEqual(map[0]![0]!.next)
  })

  it('Следопыт shows one more step', () => {
    expect(visibleSteps(false)).toBe(2)
    expect(visibleSteps(true)).toBe(3)
  })
})
