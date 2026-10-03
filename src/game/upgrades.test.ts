import { describe, expect, it } from 'vitest'
import { defaultProfile } from '@/db/profileRepo'
import { balance } from './balance'
import { boonChoices, buyUpgrade, canBuy, hasStartBoon, heroMaxHp, nextCost, UPGRADES } from './upgrades'

const def = (id: string) => UPGRADES.find((u) => u.id === id)!

describe('camp upgrades (SPEC §7.2)', () => {
  it('max hp goes 5 → 8 over three purchases with rising cost', () => {
    let p = { ...defaultProfile(), runes: 10_000 }
    expect(heroMaxHp(p)).toBe(5)
    const costs: number[] = []
    for (let i = 0; i < 3; i++) {
      const c = nextCost(p, def('maxHp'))
      expect(c).not.toBeNull()
      costs.push(c as number)
      p = buyUpgrade(p, def('maxHp'))
    }
    expect(heroMaxHp(p)).toBe(8)
    expect(nextCost(p, def('maxHp'))).toBeNull()
    expect(canBuy(p, def('maxHp'))).toBe(false)
    expect(costs[1]).toBeGreaterThan(costs[0] as number)
    expect(p.runes).toBe(10_000 - costs.reduce((a, b) => a + b, 0))
  })

  it('refuses a purchase without runes and never charges', () => {
    const p = { ...defaultProfile(), runes: 1 }
    expect(canBuy(p, def('maxHp'))).toBe(false)
    expect(buyUpgrade(p, def('maxHp'))).toBe(p)
  })

  it('fourth boon and start boon are single-level flags', () => {
    let p = { ...defaultProfile(), runes: 10_000 }
    expect(boonChoices(p)).toBe(balance.map.boonChoices)
    expect(hasStartBoon(p)).toBe(false)
    p = buyUpgrade(p, def('fourthBoon'))
    p = buyUpgrade(p, def('startBoon'))
    expect(boonChoices(p)).toBe(balance.map.boonChoices + 1)
    expect(hasStartBoon(p)).toBe(true)
    expect(nextCost(p, def('fourthBoon'))).toBeNull()
  })

  it('freezes are consumables: each purchase adds one, cost stays flat', () => {
    let p = { ...defaultProfile(), runes: 10_000 }
    p = buyUpgrade(p, def('freezes'))
    p = buyUpgrade(p, def('freezes'))
    expect(p.freezes).toBe(2)
    expect(nextCost(p, def('freezes'))).toBe(balance.upgrades.freeze)
  })

  it('looks and themes unlock in order and apply at once', () => {
    let p = { ...defaultProfile(), runes: 10_000 }
    p = buyUpgrade(p, def('heroLook'))
    expect(p.heroLook).toBe('staff')
    p = buyUpgrade(p, def('theme'))
    expect(p.theme).toBe('tide')
    p = buyUpgrade(p, def('theme'))
    expect(p.theme).toBe('violet')
    expect(nextCost(p, def('theme'))).toBeNull()
  })
})
