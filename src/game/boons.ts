// Boons for one run (SPEC §7.1). They change runes, hp and pacing. They never touch grading.
import { rngShuffle, type Rng } from '@/engine/rng'
import type { BoonId } from '@/types'

export interface BoonDef {
  id: BoonId
  name: string
  text: string
  icon: string
  /** Boons that need a move not implemented yet are not offered. */
  requires?: 'voice'
}

export const BOONS: Record<BoonId, BoonDef> = {
  chiefVoice: { id: 'chiefVoice', name: 'Голос вождя', text: 'Удары Голосом дают двойные руны, крит Голосом лечит 1 ❤', icon: '📣', requires: 'voice' },
  gamble: { id: 'gamble', name: 'Азарт', text: 'Рискнуть даёт +50% рун', icon: '🎲' },
  kinMemory: { id: 'kinMemory', name: 'Память рода', text: 'Первая ошибка в походе не отнимает здоровье', icon: '🧿' },
  scribeShield: { id: 'scribeShield', name: 'Щит переписчика', text: 'Первая опечатка в каждом бою не снижает награду', icon: '📜' },
  coolHead: { id: 'coolHead', name: 'Холодная голова', text: 'Шкала замаха заполняется на 30% медленнее', icon: '🧊' },
  hunter: { id: 'hunter', name: 'Охотник', text: 'Победа над немезидой даёт +2 ❤', icon: '🏹' },
  warmFire: { id: 'warmFire', name: 'Тёплый костёр', text: 'Привал лечит 3 вместо 2', icon: '🔥' },
  pathfinder: { id: 'pathfinder', name: 'Следопыт', text: 'На карте видно на один шаг дальше', icon: '🧭' },
  cleanBlade: { id: 'cleanBlade', name: 'Чистый клинок', text: 'Каждый бой без ошибок даёт сундук', icon: '🗡️' },
  echoCatcher: { id: 'echoCatcher', name: 'Эхо-ловец', text: 'Каждая фаза Эхо даёт тройные руны', icon: '🪞' },
  stubbornness: { id: 'stubbornness', name: 'Упрямство', text: 'Закрытый долг лечит 1 ❤', icon: '🪨' },
  secondWind: { id: 'secondWind', name: 'Второе дыхание', text: 'Один раз за поход при 0 ❤ подняться с 1', icon: '🌬️' },
}

export const ALL_BOONS = Object.keys(BOONS) as BoonId[]

export function offerBoons(rng: Rng, owned: readonly BoonId[], count: number, available: { voice: boolean }): BoonId[] {
  const pool = ALL_BOONS.filter((id) => !owned.includes(id)).filter((id) => {
    const def = BOONS[id]
    return def.requires !== 'voice' || available.voice
  })
  return rngShuffle(rng, pool).slice(0, count)
}

export function hasBoon(boons: readonly BoonId[], id: BoonId): boolean {
  return boons.includes(id)
}
