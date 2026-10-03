// Every tunable number of the game lives here (SPEC §5.3). Expect to tweak after real play.
import type { MoveId } from '@/types'

export const balance = {
  hero: {
    startHp: 5,
    maxHp: 5,
    /** Combo length that heals 1 hp (every multiple). */
    comboHealEvery: 10,
  },
  map: {
    steps: 6,
    /** Lair (nemesis) nodes never appear before this step index (0-based). */
    lairMinStep: 2,
    /** Steps visible ahead of the hero. */
    visibleSteps: 2,
    /** Boons offered after a node. */
    boonChoices: 3,
  },
  nodes: {
    skirmishMin: 4,
    skirmishMax: 5,
    /** New items introduced in one Разведка. */
    scoutSize: 3,
    /** Привал: hp restored and Ловушка exercises. */
    restHeal: 2,
    restHealWarmFire: 3,
    restTraps: 5,
    /** Разведка: a miss on an item's first fight does not cost hp. */
    scoutGrace: true,
  },
  sortie: {
    durationMs: 2 * 60 * 1000,
    /** Nemeses pulled into a sortie besides the debtors. */
    nemeses: 1,
  },
  voice: {
    /** Share of target words that must be heard when the phrase is not found verbatim. */
    overlapMin: 0.8,
    /** How long the microphone listens. */
    listenMs: 8000,
  },
  improv: {
    /** Time to start answering (type or press the mic) before it counts as a miss. */
    startWindowMs: 6000,
  },
  echo: {
    maxPhases: 6,
    cleanPhases: 3,
    cleanBonusRunes: 60,
    phaseMultiplier: 2,
    echoCatcherMultiplier: 3,
  },
  battle: {
    /** Enemies pulled from the queue for a single battle (sortie fallback). */
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
    /** A typo keeps this share of the runes (Щит переписчика restores the first one per battle). */
    typoKeep: 0.5,
    scoutMultiplier: 0.7,
    /** Чистый клинок: runes for a battle without a miss. */
    chestRunes: 40,
    gambleBonus: 1.5,
  },
  boons: {
    coolHeadSlowdown: 1.3,
    hunterHeal: 2,
    stubbornnessHeal: 1,
    secondWindHp: 1,
  },
  upgrades: {
    /** Rune cost per level of each camp upgrade (SPEC §7.2). */
    maxHp: [300, 500, 800],
    fourthBoon: [600],
    startBoon: [900],
    freeze: 150,
    heroLook: [250, 450],
    theme: [250, 450],
  },
  lands: {
    /** Items of a land that must be met before the next land opens. */
    unlockAfter: 12,
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
  /** Встреча (SPEC §8). */
  encounter: {
    turns: 3,
    answerMs: 25000,
    chips: 3,
    /** Phrases at this stage or above are offered as chips first. */
    chipStageMin: 2,
    runes: { success: 60, partial: 30, fail: 10 },
  },
  /** AI layer quota and pauses (SPEC §10.2). */
  ai: {
    dailyLimit: 100,
    minGapMs: 5000,
    /** Pauses after a 429, one per retry. */
    backoffMs: [5000, 10000, 20000],
    /** After the retries fail the AI stays off for this long. */
    pauseAfterRateMs: 10 * 60_000,
    pauseAfterNetworkMs: 60_000,
    /** Items prepared one day ahead by freshContexts, per daily request. */
    freshContextsPerDay: 10,
    /** Life items completed per day when they were added without AI. */
    enrichPerDay: 5,
  },
  /** Reading mode (SPEC §9.3). */
  reading: {
    /** Longest phrase that can be selected, in words. */
    maxWords: 8,
    /** Paragraphs rendered per batch while scrolling a long text. */
    paragraphsPerBatch: 30,
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
