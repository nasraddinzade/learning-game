// Run logic (SPEC §5): pure helpers that build a run, decide what each node contains, merge
// battle results into the run and plan the Echo. Persistence and React live elsewhere.
import { mulberry32, rngInt, rngShuffle } from '@/engine/rng'
import type { QueueEntry } from '@/engine/scheduler'
import type { BoonId, CombatState, MapNode, Progress, Run, RunPool, RunStats, NodeType } from '@/types'
import { balance } from './balance'
import { hasBoon, offerBoons } from './boons'
import { createCombat, runesKept, type CombatEntry } from './combat'
import { planEcho } from './echo'
import { generateMap } from './map'

export function emptyStats(): RunStats {
  return {
    hits: 0,
    misses: 0,
    crits: 0,
    maxCombo: 0,
    closedDebtIds: [],
    defeatedNemesisIds: [],
    stageUpIds: [],
    masteredIds: [],
    seenItemIds: [],
    chests: 0,
    xp: 0,
  }
}

/** Splits the full priority queue into per-kind pools for the run's nodes. */
export function poolFromQueue(queue: readonly QueueEntry[]): RunPool {
  const pool: RunPool = { debts: [], nemeses: [], reviews: [], fresh: [], materialized: [], chameleons: [] }
  for (const e of queue) {
    if (e.kind === 'debt') pool.debts.push(e.itemId)
    else if (e.kind === 'nemesis') pool.nemeses.push(e.itemId)
    else if (e.kind === 'review') pool.reviews.push(e.itemId)
    else pool.fresh.push(e.itemId)
  }
  return pool
}

export interface CreateRunInput {
  id: string
  seed: number
  now: number
  queue: readonly QueueEntry[]
  maxHp: number
  startBoons?: BoonId[]
  allowEncounter?: boolean
}

export function createRun(input: CreateRunInput): Run {
  const pool = poolFromQueue(input.queue)
  const map = generateMap({
    seed: input.seed,
    hasDebts: pool.debts.length > 0,
    hasNemesis: pool.nemeses.length > 0,
    allowEncounter: input.allowEncounter ?? false,
  })
  return {
    id: input.id,
    seed: input.seed,
    kind: 'run',
    map,
    position: null,
    hp: input.maxHp,
    maxHp: input.maxHp,
    boons: input.startBoons ?? [],
    runes: 0,
    combo: 0,
    failedItemIds: [],
    status: 'active',
    startedAt: input.now,
    combat: null,
    phase: 'map',
    boonOffer: null,
    flags: { firstMissForgiven: false, secondWindUsed: false },
    rest: null,
    encounter: null,
    pool,
    stats: emptyStats(),
    echoItemIds: null,
    cleanRun: false,
    sortieEndsAt: null,
    endedAt: null,
  }
}

/** Вылазка: one Ambush with the debtors and one nemesis, two minutes on the clock. */
export function createSortie(input: CreateRunInput): Run {
  const pool = poolFromQueue(input.queue)
  const map: MapNode[][] = [[{ type: 'ambush', next: [], done: false }]]
  return {
    ...createRun({ ...input, queue: [] }),
    kind: 'sortie',
    map,
    pool,
    sortieEndsAt: input.now + balance.sortie.durationMs,
  }
}

function take(list: string[], n: number): string[] {
  return list.splice(0, n)
}

/** Decides the enemies of a node and removes them from the pool. */
export function entriesForNode(run: Run, type: NodeType, progress: ReadonlyMap<string, Progress>): { entries: CombatEntry[]; pool: RunPool } {
  const pool: RunPool = {
    debts: [...run.pool.debts],
    nemeses: [...run.pool.nemeses],
    reviews: [...run.pool.reviews],
    fresh: [...run.pool.fresh],
    materialized: [...(run.pool.materialized ?? [])],
    chameleons: [...(run.pool.chameleons ?? [])],
  }
  const rng = mulberry32((run.seed ^ (run.stats.seenItemIds.length * 0x27d4eb2f)) >>> 0)
  const entries: CombatEntry[] = []
  switch (type) {
    case 'ambush': {
      for (const id of take(pool.debts, pool.debts.length)) entries.push({ itemId: id, kind: 'debt' })
      if (run.kind === 'sortie') {
        for (const id of take(pool.nemeses, balance.sortie.nemeses)) entries.push({ itemId: id, kind: 'nemesis' })
        // A sortie with nothing owed still gives a short fight.
        if (entries.length === 0) {
          for (const id of take(pool.reviews, balance.battle.size)) entries.push({ itemId: id, kind: 'review' })
          for (const id of take(pool.fresh, Math.max(0, balance.battle.size - entries.length))) entries.push({ itemId: id, kind: 'new' })
        }
      }
      break
    }
    case 'skirmish': {
      const size = rngInt(rng, balance.nodes.skirmishMin, balance.nodes.skirmishMax)
      for (const id of take(pool.reviews, size)) entries.push({ itemId: id, kind: 'review' })
      // Not enough reviews: top up with new items, then with debts.
      for (const id of take(pool.fresh, size - entries.length)) entries.push({ itemId: id, kind: 'new' })
      for (const id of take(pool.debts, size - entries.length)) entries.push({ itemId: id, kind: 'debt' })
      break
    }
    case 'scout': {
      for (const id of take(pool.fresh, balance.nodes.scoutSize)) entries.push({ itemId: id, kind: 'new' })
      // No new items left today: a scout becomes a light review of the least stable items.
      if (entries.length === 0) {
        for (const id of take(pool.reviews, balance.nodes.scoutSize)) entries.push({ itemId: id, kind: 'review' })
      }
      break
    }
    case 'lair': {
      for (const id of take(pool.nemeses, 1)) entries.push({ itemId: id, kind: 'nemesis' })
      break
    }
    case 'echo': {
      const plan = planEcho({ failedItemIds: run.failedItemIds, seenItemIds: run.stats.seenItemIds, progress })
      for (const id of plan.itemIds) entries.push({ itemId: id, kind: 'echo' })
      break
    }
    default:
      break
  }
  // Materialized errors open the next ordinary battle (SPEC §8): fixed phrases as shadows,
  // caught patterns as a Хамелеон.
  if (type === 'ambush' || type === 'skirmish' || type === 'scout') {
    const extra: CombatEntry[] = [
      ...take(pool.materialized, pool.materialized.length).map((id): CombatEntry => ({ itemId: id, kind: 'review' })),
      ...take(pool.chameleons, pool.chameleons.length).map((id): CombatEntry => ({ itemId: `pattern:${id}`, kind: 'chameleon' })),
    ]
    entries.unshift(...extra)
  }
  // A battle node must have someone to fight; fall back to anything left (never a nemesis,
  // she belongs to the Lair and the sortie), then to a light review of items not met this run.
  if (entries.length === 0 && type !== 'rest' && type !== 'encounter') {
    const any = [...pool.debts.splice(0), ...pool.reviews.splice(0, 4), ...pool.fresh.splice(0, 3)]
    for (const id of any) entries.push({ itemId: id, kind: 'review' })
    if (entries.length === 0) {
      // Prefer items not met in this run yet, least stable first; then anything.
      const seen = new Set([...run.stats.seenItemIds, ...pool.nemeses])
      const known = [...progress.values()].filter((p) => p.stage > 0 && !pool.nemeses.includes(p.itemId))
      const unseen = known.filter((p) => !seen.has(p.itemId)).sort((a, b) => a.fsrs.stability - b.fsrs.stability)
      const source = unseen.length > 0 ? unseen : rngShuffle(rng, known)
      for (const p of source.slice(0, 3)) entries.push({ itemId: p.itemId, kind: 'review' })
    }
  }
  return { entries, pool }
}

/** Starts a battle node: builds the combat from the pool and moves the hero onto the node. */
export function startBattleNode(run: Run, position: { step: number; node: number }, progress: ReadonlyMap<string, Progress>): Run {
  const node = run.map[position.step]?.[position.node]
  if (!node) throw new Error('startBattleNode: no such node')
  const { entries, pool } = entriesForNode(run, node.type, progress)
  const seed = (run.seed ^ ((position.step + 1) * 0x9e3779b9) ^ ((position.node + 1) * 0x85ebca6b)) >>> 0
  const combat = createCombat(entries, progress, seed, run.hp, run.maxHp, node.type)
  const echoItemIds = node.type === 'echo' ? entries.map((e) => e.itemId) : run.echoItemIds
  const cleanRun = node.type === 'echo' ? run.failedItemIds.length === 0 : run.cleanRun
  return { ...run, position, pool, combat, phase: 'battle', echoItemIds, cleanRun }
}

/** Merges a finished battle into the run and decides what comes next. */
export function finishBattleNode(
  run: Run,
  combat: CombatState,
  rng = mulberry32(run.seed ^ run.stats.seenItemIds.length),
  available = { voice: false },
  choices: number = balance.map.boonChoices,
): Run {
  const stats: RunStats = {
    ...run.stats,
    hits: run.stats.hits + combat.hits,
    misses: run.stats.misses + combat.misses,
    crits: run.stats.crits + combat.crits,
    maxCombo: Math.max(run.stats.maxCombo, combat.maxCombo),
    closedDebtIds: [...new Set([...run.stats.closedDebtIds, ...combat.closedDebtIds])],
    defeatedNemesisIds: [...new Set([...run.stats.defeatedNemesisIds, ...combat.defeatedNemesisIds])],
    seenItemIds: [...new Set([...run.stats.seenItemIds, ...combat.seenItemIds])],
    chests: run.stats.chests + (combat.status === 'won' && hasBoon(run.boons, 'cleanBlade') && combat.misses === 0 ? 1 : 0),
    xp: run.stats.xp + combat.xp,
  }
  const failedItemIds = [...new Set([...run.failedItemIds, ...combat.failedItemIds])]
  const node = run.position ? run.map[run.position.step]?.[run.position.node] : undefined
  const map = run.map.map((step, s) =>
    step.map((n, i) => (run.position && s === run.position.step && i === run.position.node ? { ...n, done: true } : n)),
  )
  let runes = run.runes + combat.runes
  if (combat.status === 'retreated') {
    return {
      ...run,
      map,
      stats,
      failedItemIds,
      hp: 0,
      runes: Math.floor(runes * balance.runes.retreatKeep),
      combat: null,
      status: 'retreated',
      phase: 'summary',
    }
  }
  if (node?.type === 'echo' && run.cleanRun) runes += balance.echo.cleanBonusRunes
  if (node?.type === 'echo' || run.kind === 'sortie') {
    return { ...run, map, stats, failedItemIds, hp: combat.hp, runes, combat: null, status: 'won', phase: 'summary' }
  }
  const boonOffer = offerBoons(rng, run.boons, choices, available)
  return {
    ...run,
    map,
    stats,
    failedItemIds,
    hp: combat.hp,
    runes,
    combat: null,
    phase: boonOffer.length > 0 ? 'boon' : 'map',
    boonOffer: boonOffer.length > 0 ? boonOffer : null,
  }
}

/** В путь с подарком: the run opens with a boon choice before the first node. */
export function offerStartBoon(run: Run, rng = mulberry32(run.seed ^ 0x51ed270b), available = { voice: false }, choices: number = balance.map.boonChoices): Run {
  const boonOffer = offerBoons(rng, run.boons, choices, available)
  if (boonOffer.length === 0) return run
  return { ...run, phase: 'boon', boonOffer }
}

export function chooseBoon(run: Run, boon: BoonId): Run {
  if (run.phase !== 'boon' || !run.boonOffer?.includes(boon)) return run
  return { ...run, boons: [...run.boons, boon], boonOffer: null, phase: 'map' }
}

/** Привал heals and sets up five Ловушка exercises; the caller picks the pattern. */
export function startRestNode(
  run: Run,
  position: { step: number; node: number },
  patternId: string | null,
  exerciseCount: number,
): Run {
  const heal = hasBoon(run.boons, 'warmFire') ? balance.nodes.restHealWarmFire : balance.nodes.restHeal
  const hp = Math.min(run.maxHp, run.hp + heal)
  const rng = mulberry32((run.seed ^ ((position.step + 1) * 0x2545f491)) >>> 0)
  const exercises = patternId
    ? rngShuffle(
        rng,
        Array.from({ length: exerciseCount }, (_, i) => i),
      ).slice(0, balance.nodes.restTraps)
    : []
  return {
    ...run,
    position,
    hp,
    phase: 'rest',
    rest: { patternId: patternId ?? '', exercises, index: 0, correct: 0, feedback: null, healed: true, done: exercises.length === 0 },
  }
}

export function answerRest(run: Run, correct: boolean, ruleRu: string, fixed: string): Run {
  if (!run.rest || run.rest.done) return run
  return { ...run, rest: { ...run.rest, correct: run.rest.correct + (correct ? 1 : 0), feedback: { correct, ruleRu, fixed } } }
}

export function nextRest(run: Run): Run {
  if (!run.rest) return run
  const index = run.rest.index + 1
  const done = index >= run.rest.exercises.length
  return { ...run, rest: { ...run.rest, index, feedback: null, done } }
}

/** Leaves the Привал. A clean training (every trap right) earns a free boon. */
export function finishRestNode(
  run: Run,
  rng = mulberry32(run.seed ^ (run.position?.step ?? 0)),
  available = { voice: false },
  choices: number = balance.map.boonChoices,
): Run {
  const map = run.map.map((step, s) =>
    step.map((n, i) => (run.position && s === run.position.step && i === run.position.node ? { ...n, done: true } : n)),
  )
  const clean = run.rest !== null && run.rest.exercises.length > 0 && run.rest.correct === run.rest.exercises.length
  const boonOffer = clean ? offerBoons(rng, run.boons, choices, available) : []
  return {
    ...run,
    map,
    rest: null,
    encounter: null,
    phase: boonOffer.length > 0 ? 'boon' : 'map',
    boonOffer: boonOffer.length > 0 ? boonOffer : null,
  }
}

/** Runes to add to the profile when the run ends. */
export function runRunes(run: Run): number {
  return run.runes
}

export { runesKept }
