// Battle state machine (SPEC §5.3). Pure: takes state and inputs, returns new state and
// events. It never grades answers; correctness arrives already decided by the engine.
// Boons change runes, hp and pacing here and nowhere near the FSRS rating (law 2).
import { debtReturnDelay } from '@/engine/debt'
import { NEMESIS_HITS } from '@/engine/nemesis'
import { moveStage } from '@/engine/moves'
import { mulberry32, rngInt, type Rng } from '@/engine/rng'
import type { QueueEntry } from '@/engine/scheduler'
import type { BoonId, Combatant, CombatState, EnemyKind, MoveId, NodeType, Progress, RunFlags } from '@/types'
import { balance, comboMultiplier } from './balance'
import { hasBoon } from './boons'

export type CombatEvent =
  | { type: 'hit'; runes: number; crit: boolean; combo: number }
  | { type: 'miss'; hp: number; spared: boolean }
  | { type: 'enemyDown'; itemId: string; kind: EnemyKind }
  | { type: 'debtorLeaves'; itemId: string; returnsIn: number }
  | { type: 'nemesisWon'; itemId: string }
  | { type: 'newcomerReturns'; itemId: string; returnsIn: number }
  | { type: 'comboHeal'; hp: number }
  | { type: 'boonHeal'; boon: BoonId; hp: number }
  | { type: 'secondWind'; hp: number }
  | { type: 'chest'; runes: number }
  | { type: 'retreat' }
  | { type: 'won' }

export interface CombatOptions {
  boons: readonly BoonId[]
  flags: RunFlags
}

export const NO_OPTIONS: CombatOptions = {
  boons: [],
  flags: { firstMissForgiven: false, secondWindUsed: false },
}

export function hitsFor(kind: EnemyKind): number {
  switch (kind) {
    case 'debtor':
      return balance.hits.debtor
    case 'nemesis':
      return NEMESIS_HITS
    default:
      return balance.hits.shadow
  }
}

export type CombatEntry = QueueEntry | { itemId: string; kind: 'echo' } | { itemId: string; kind: 'chameleon' }

function toCombatant(entry: CombatEntry, p: Progress | undefined): Combatant {
  const kind: EnemyKind =
    entry.kind === 'new'
      ? 'newcomer'
      : entry.kind === 'debt'
        ? 'debtor'
        : entry.kind === 'nemesis'
          ? 'nemesis'
          : entry.kind === 'echo'
            ? 'echo'
            : entry.kind === 'chameleon'
              ? 'chameleon'
              : 'shadow'
  return {
    itemId: entry.itemId,
    kind,
    hitsNeeded: hitsFor(kind),
    hits: 0,
    movesUsed: [],
    winsOverHero: p?.nemesis?.winsOverHero ?? 0,
  }
}

export function createCombat(
  entries: readonly CombatEntry[],
  progress: ReadonlyMap<string, Progress>,
  seed: number,
  hp: number,
  maxHp: number,
  nodeType: NodeType = 'skirmish',
): CombatState {
  const queue = entries.map((e) => toCombatant(e, progress.get(e.itemId)))
  const state: CombatState = {
    seed,
    nodeType,
    queue,
    current: null,
    last: null,
    pending: [],
    answers: 0,
    hp,
    maxHp,
    combo: 0,
    maxCombo: 0,
    runes: 0,
    xp: 0,
    hits: 0,
    misses: 0,
    crits: 0,
    failedItemIds: [],
    seenItemIds: entries.filter((e) => e.kind !== 'chameleon').map((e) => e.itemId),
    closedDebtIds: [],
    defeatedNemesisIds: [],
    typoShieldUsed: false,
    status: 'active',
  }
  return advance(state)
}

/** Rng for this battle at this point in time: deterministic per seed and answer count. */
export function combatRng(state: CombatState): Rng {
  return mulberry32((state.seed ^ (state.answers * 0x9e3779b9)) >>> 0)
}

/** Brings in the next enemy: a returning one if its time has come, else the next in line. */
export function advance(state: CombatState): CombatState {
  if (state.status !== 'active' || state.current !== null) return state
  const ready = state.pending.filter((p) => p.returnAt <= state.answers)
  if (ready.length > 0) {
    const first = ready[0] as CombatState['pending'][number]
    return { ...state, current: first.combatant, pending: state.pending.filter((p) => p !== first) }
  }
  if (state.queue.length > 0) {
    const [next, ...rest] = state.queue
    return { ...state, current: next as Combatant, queue: rest }
  }
  if (state.pending.length > 0) {
    // Nothing else to fight: the earliest pending enemy comes back early.
    const sorted = [...state.pending].sort((a, b) => a.returnAt - b.returnAt)
    const first = sorted[0] as CombatState['pending'][number]
    return { ...state, current: first.combatant, pending: state.pending.filter((p) => p !== first) }
  }
  return { ...state, status: 'won' }
}

export interface ResolveInput {
  move: MoveId
  correct: boolean
  /** Answered before the wind-up bar filled. */
  crit: boolean
  risked: boolean
  /** Correct only thanks to the one-typo allowance. */
  typo: boolean
  /** Progress after the engine applied the answer; used to know whether the debt closed. */
  debtClosed: boolean
}

export interface ResolveOutcome {
  state: CombatState
  events: CombatEvent[]
  flags: RunFlags
}

function runesForHit(c: Combatant, input: ResolveInput, state: CombatState, options: CombatOptions): { runes: number; typoShield: boolean } {
  let r = balance.runes.perHit * comboMultiplier(state.combo)
  if (input.crit) r *= balance.runes.critMultiplier
  if (input.risked) {
    r *= balance.runes.riskMultiplier
    if (hasBoon(options.boons, 'gamble')) r *= balance.runes.gambleBonus
  }
  if (c.kind === 'debtor') r *= balance.runes.debtorMultiplier
  if (c.kind === 'nemesis') r *= balance.runes.nemesisMultiplier
  if (c.kind === 'echo') {
    r *= hasBoon(options.boons, 'echoCatcher') ? balance.echo.echoCatcherMultiplier : balance.echo.phaseMultiplier
  }
  if (state.nodeType === 'scout') r *= balance.runes.scoutMultiplier
  let typoShield = false
  if (input.typo) {
    if (hasBoon(options.boons, 'scribeShield') && !state.typoShieldUsed) typoShield = true
    else r *= balance.runes.typoKeep
  }
  return { runes: Math.round(r), typoShield }
}

function xpForHit(input: ResolveInput): number {
  return balance.xp.base * (moveStage(input.move) + 1) + (input.risked ? balance.xp.riskBonus : 0)
}

/** Знакомство done: the newcomer steps back and returns shortly for its first real fight. */
export function resolveIntro(state: CombatState): ResolveOutcome {
  const c = state.current
  if (!c || state.status !== 'active') return { state, events: [], flags: NO_OPTIONS.flags }
  const rng = combatRng(state)
  const returnsIn = rngInt(rng, balance.battle.newcomerReturnMin, balance.battle.newcomerReturnMax)
  const answers = state.answers + 1
  const shadow: Combatant = { ...c, kind: 'shadow', hitsNeeded: hitsFor('shadow'), hits: 0, movesUsed: ['intro'] }
  const next: CombatState = {
    ...state,
    answers,
    current: null,
    last: c,
    pending: [...state.pending, { combatant: shadow, returnAt: answers + returnsIn }],
  }
  return { state: advance(next), events: [{ type: 'newcomerReturns', itemId: c.itemId, returnsIn }], flags: NO_OPTIONS.flags }
}

function heal(state: CombatState, amount: number): CombatState {
  return { ...state, hp: Math.min(state.maxHp, state.hp + amount) }
}

export function resolve(state: CombatState, input: ResolveInput, options: CombatOptions = NO_OPTIONS): ResolveOutcome {
  const c = state.current
  if (!c || state.status !== 'active') return { state, events: [], flags: options.flags }
  const events: CombatEvent[] = []
  const rng = combatRng(state)
  const answers = state.answers + 1
  let flags: RunFlags = { ...options.flags }
  let next: CombatState = { ...state, answers, current: null, last: c }

  if (input.correct) {
    const combo = state.combo + 1
    const { runes, typoShield } = runesForHit(c, input, state, options)
    next = {
      ...next,
      combo,
      maxCombo: Math.max(state.maxCombo, combo),
      runes: state.runes + runes,
      xp: state.xp + xpForHit(input),
      hits: state.hits + 1,
      crits: state.crits + (input.crit ? 1 : 0),
      typoShieldUsed: state.typoShieldUsed || typoShield,
    }
    events.push({ type: 'hit', runes, crit: input.crit, combo })
    if (combo % balance.hero.comboHealEvery === 0 && next.hp < next.maxHp) {
      next = heal(next, 1)
      events.push({ type: 'comboHeal', hp: next.hp })
    }
    const hit: Combatant = { ...c, hits: c.hits + 1, movesUsed: [...c.movesUsed, input.move] }
    next = { ...next, last: hit }
    const down = hit.hits >= hit.hitsNeeded || (c.kind === 'debtor' && input.debtClosed)
    if (down) {
      events.push({ type: 'enemyDown', itemId: c.itemId, kind: c.kind })
      if (input.debtClosed && !next.closedDebtIds.includes(c.itemId)) {
        next = { ...next, closedDebtIds: [...next.closedDebtIds, c.itemId] }
        if (hasBoon(options.boons, 'stubbornness') && next.hp < next.maxHp) {
          next = heal(next, balance.boons.stubbornnessHeal)
          events.push({ type: 'boonHeal', boon: 'stubbornness', hp: next.hp })
        }
      }
      if (c.kind === 'nemesis') {
        next = { ...next, defeatedNemesisIds: [...next.defeatedNemesisIds, c.itemId] }
        if (hasBoon(options.boons, 'hunter') && next.hp < next.maxHp) {
          next = heal(next, balance.boons.hunterHeal)
          events.push({ type: 'boonHeal', boon: 'hunter', hp: next.hp })
        }
      }
    } else {
      // Needs more hits: comes straight back (ahead of anything else that is due), with a
      // different move, which the picker guarantees via movesUsed.
      next = { ...next, pending: [{ combatant: hit, returnAt: answers }, ...next.pending] }
    }
  } else {
    // Hp is spared on the first miss with Память рода, and in Разведка on an item's first miss.
    const firstMissHere = !state.failedItemIds.includes(c.itemId)
    // A pattern enemy is not an item: it never joins the Echo or comes back as a debtor.
    const isItem = c.kind !== 'chameleon'
    let spared = false
    if (hasBoon(options.boons, 'kinMemory') && !flags.firstMissForgiven) {
      spared = true
      flags = { ...flags, firstMissForgiven: true }
    } else if (state.nodeType === 'scout' && balance.nodes.scoutGrace && firstMissHere && c.kind !== 'debtor') {
      spared = true
    }
    let hp = spared ? state.hp : state.hp - 1
    next = {
      ...next,
      combo: 0,
      misses: state.misses + 1,
      failedItemIds: firstMissHere && isItem ? [...state.failedItemIds, c.itemId] : state.failedItemIds,
    }
    if (hp <= 0 && hasBoon(options.boons, 'secondWind') && !flags.secondWindUsed) {
      hp = balance.boons.secondWindHp
      flags = { ...flags, secondWindUsed: true }
      events.push({ type: 'miss', hp: 0, spared: false })
      events.push({ type: 'secondWind', hp })
    } else {
      events.push({ type: 'miss', hp, spared })
    }
    next = { ...next, hp }
    if (c.kind === 'nemesis') {
      // She won today. She leaves and will be back tomorrow, bigger.
      events.push({ type: 'nemesisWon', itemId: c.itemId })
    } else if (c.kind === 'chameleon') {
      // The pattern stays active; the Привал will bring the exercises back.
    } else {
      const returnsIn = debtReturnDelay(rng)
      const debtor: Combatant = {
        ...c,
        kind: 'debtor',
        hitsNeeded: hitsFor('debtor'),
        hits: 0,
        movesUsed: [...c.movesUsed, input.move],
      }
      next = { ...next, pending: [...next.pending, { combatant: debtor, returnAt: answers + returnsIn }] }
      events.push({ type: 'debtorLeaves', itemId: c.itemId, returnsIn })
    }
    if (hp <= 0) {
      events.push({ type: 'retreat' })
      return { state: { ...next, status: 'retreated' }, events, flags }
    }
  }

  next = advance(next)
  if (next.status === 'won') {
    if (hasBoon(options.boons, 'cleanBlade') && next.misses === 0) {
      next = { ...next, runes: next.runes + balance.runes.chestRunes }
      events.push({ type: 'chest', runes: balance.runes.chestRunes })
    }
    events.push({ type: 'won' })
  }
  return { state: next, events, flags }
}

/** Ends the battle early (Вылазка timer). Pending and queued enemies are simply left alone. */
export function endEarly(state: CombatState): CombatState {
  if (state.status !== 'active') return state
  return { ...state, current: null, queue: [], pending: [], status: 'won' }
}

/** Runes the hero keeps after the battle ends. */
export function runesKept(state: CombatState): number {
  return state.status === 'retreated' ? Math.floor(state.runes * balance.runes.retreatKeep) : state.runes
}

/** Enemies still to come (queue plus pending), for the battle progress indicator. */
export function enemiesLeft(state: CombatState): number {
  return state.queue.length + state.pending.length + (state.current ? 1 : 0)
}
