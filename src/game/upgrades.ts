// Camp upgrades bought with runes (SPEC §7.2). Permanent, between runs.
import type { HeroLook, Profile, ThemeId, UpgradeId } from '@/types'
import { balance } from './balance'

export interface UpgradeDef {
  id: UpgradeId
  name: string
  icon: string
  /** Text for the next level; `{n}` is the level being bought. */
  text: string
  maxLevel: number
  /** Cost per level, index = level being bought (1-based level → costs[level-1]). */
  costs: number[]
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'maxHp', name: 'Крепкое сердце', icon: '❤️', text: 'Максимум здоровья +1 (до 8)', maxLevel: 3, costs: [...balance.upgrades.maxHp] },
  { id: 'fourthBoon', name: 'Широкий выбор', icon: '🃏', text: 'Четвёртый вариант при выборе усиления', maxLevel: 1, costs: [...balance.upgrades.fourthBoon] },
  { id: 'startBoon', name: 'В путь с подарком', icon: '🎁', text: 'Усиление уже на старте похода', maxLevel: 1, costs: [...balance.upgrades.startBoon] },
  { id: 'freezes', name: 'Заморозка серии', icon: '🧊', text: 'Пропущенный день не ломает серию (расходуется)', maxLevel: 99, costs: [balance.upgrades.freeze] },
  { id: 'heroLook', name: 'Облик героя', icon: '🧥', text: 'Открыть следующий облик путника', maxLevel: 2, costs: [...balance.upgrades.heroLook] },
  { id: 'theme', name: 'Цвет костра', icon: '🎨', text: 'Открыть следующую тему оформления', maxLevel: 2, costs: [...balance.upgrades.theme] },
]

export const HERO_LOOKS: { id: HeroLook; name: string; level: number }[] = [
  { id: 'wanderer', name: 'Путник', level: 0 },
  { id: 'staff', name: 'С посохом', level: 1 },
  { id: 'hood', name: 'В капюшоне', level: 2 },
]

export const THEMES: { id: ThemeId; name: string; accent: string; level: number }[] = [
  { id: 'ember', name: 'Уголь', accent: '#ffb547', level: 0 },
  { id: 'tide', name: 'Прилив', accent: '#4fd1c5', level: 1 },
  { id: 'violet', name: 'Фиалка', accent: '#b794f4', level: 2 },
]

export function upgradeLevel(profile: Profile, id: UpgradeId): number {
  return profile.camp[id] ?? 0
}

/** Cost of the next level, or null when maxed. Freezes always cost the same. */
export function nextCost(profile: Profile, def: UpgradeDef): number | null {
  const level = upgradeLevel(profile, def.id)
  if (level >= def.maxLevel) return null
  return def.costs[Math.min(level, def.costs.length - 1)] ?? null
}

export function canBuy(profile: Profile, def: UpgradeDef): boolean {
  const cost = nextCost(profile, def)
  return cost !== null && profile.runes >= cost
}

/** Applies a purchase: spends runes, raises the level, hands out freezes. */
export function buyUpgrade(profile: Profile, def: UpgradeDef): Profile {
  const cost = nextCost(profile, def)
  if (cost === null || profile.runes < cost) return profile
  const level = upgradeLevel(profile, def.id) + 1
  const next: Profile = { ...profile, runes: profile.runes - cost, camp: { ...profile.camp, [def.id]: level } }
  if (def.id === 'freezes') return { ...next, freezes: profile.freezes + 1, camp: profile.camp }
  if (def.id === 'heroLook') return { ...next, heroLook: HERO_LOOKS[level]?.id ?? profile.heroLook }
  if (def.id === 'theme') return { ...next, theme: THEMES[level]?.id ?? profile.theme }
  return next
}

export function heroMaxHp(profile: Profile | null): number {
  return balance.hero.maxHp + (profile ? upgradeLevel(profile, 'maxHp') : 0)
}

export function boonChoices(profile: Profile | null): number {
  return balance.map.boonChoices + (profile && upgradeLevel(profile, 'fourthBoon') > 0 ? 1 : 0)
}

export function hasStartBoon(profile: Profile | null): boolean {
  return profile !== null && upgradeLevel(profile, 'startBoon') > 0
}
