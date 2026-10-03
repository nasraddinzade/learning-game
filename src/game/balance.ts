// Every tunable number of the game lives here (SPEC §5.3). Expect to tweak after real play.
import type { MoveId } from '@/types'

export const balance = {
  hero: {
    startHp: 5,
    maxHp: 5,
    /** Combo length that heals 1 hp (every multiple). */
    comboHealEvery: 10,
  },
  battle: {
    /** Enemies pulled from the queue for a single battle (stage 1, no map yet). */
    size: 8,
    /** A newcomer comes back for its first fight this many answers after Знакомство. */
    newcomerReturnMin: 2,
    newcomerReturnMax: 3,
  },
  /** Base wind-up time per move in ms. Answering before the bar fills is a crit. */
  windupMs: {
    intro: 0,
    swipe: 7000,
    listen: 10000,
    build: 18000,
    gap: 14000,
    translate: 22000,
    dictation: 20000,
    voice: 15000,
    ownPhrase: 30000,
    improv: 6000,
    trap: 15000,
  } satisfies Record<MoveId, number>,
  runes: {
    perHit: 10,
    critMultiplier: 2,
    riskMultiplier: 1.5,
    debtorMultiplier: 1.5,
    nemesisMultiplier: 3,
    comboMax: 3,
    /** Combo multiplier grows by 1 every N consecutive hits. */
    comboStep: 3,
    /** Runes of a retreated run are halved. */
    retreatKeep: 0.5,
  },
  xp: {
    /** XP per hit = base × (move stage + 1). */
    base: 4,
    riskBonus: 4,
    /** Level n needs levelBase × n² xp. */
    levelBase: 60,
  },
  hits: {
    shadow: 1,
    debtor: 2,
    nemesis: 3,
  },
} as const

export function comboMultiplier(combo: number): number {
  return Math.min(balance.runes.comboMax, 1 + Math.floor(combo / balance.runes.comboStep))
}

export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / balance.xp.levelBase)) + 1)
}

export function xpForLevel(level: number): number {
  return balance.xp.levelBase * (level - 1) ** 2
}
