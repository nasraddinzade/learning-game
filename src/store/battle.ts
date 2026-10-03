// Battle orchestration: pulls the queue, asks the engine to grade and the game to resolve,
// persists after every answer. The engine's rating is never touched by anything here.
import { create } from 'zustand'
import { addDays, dayKey } from '@/engine/clock'
import { grade } from '@/engine/grading'
import { pickMove } from '@/engine/moves'
import { endRunForItem, recordNemesisFight } from '@/engine/nemesis'
import { applyAnswer, applyIntro, newProgress, type ProgressEvent } from '@/engine/progress'
import { mulberry32 } from '@/engine/rng'
import { buildQueue } from '@/engine/scheduler'
import { balance, levelForXp } from '@/game/balance'
import {
  advance,
  combatRng,
  createCombat,
  resolve,
  resolveIntro,
  runesKept,
  type CombatEvent,
} from '@/game/combat'
import { activeRun, addAttempt, allItems, newId, progressMap, saveProgress, saveRun } from '@/db/repos'
import { buildTask, canUse } from '@/moves/tasks'
import { IMPLEMENTED_MOVES, type MoveResult, type MoveTask } from '@/moves/types'
import type { CombatState, Item, MoveId, Progress, Rating, Run } from '@/types'
import { now } from './clock'
import { useProfileStore } from './profile'

export type BattlePhase = 'idle' | 'loading' | 'task' | 'feedback' | 'done' | 'empty'

export interface Feedback {
  correct: boolean
  crit: boolean
  rating: Rating
  typo: boolean
  runes: number
  answer: string
  expected: string
  item: Item
  move: MoveId
  risked: boolean
  events: CombatEvent[]
  progressEvents: ProgressEvent[]
  stage: Progress['stage']
}

export interface BattleSummary {
  status: 'won' | 'retreated'
  runes: number
  xp: number
  hits: number
  misses: number
  crits: number
  maxCombo: number
  closedDebts: Item[]
  newNemeses: Item[]
  defeatedNemeses: Item[]
  stillInDebt: Item[]
  levelUp: number | null
}

interface BattleState {
  run: Run | null
  items: Record<string, Item>
  progress: Record<string, Progress>
  phase: BattlePhase
  move: MoveId | null
  task: MoveTask | null
  risked: boolean
  windupStartedAt: number
  windupMs: number
  baseWindupMs: number
  feedback: Feedback | null
  summary: BattleSummary | null
  error: string | null
  /** Increments on every answer so the enemy sprite can replay its shake. */
  shake: number

  load: () => Promise<void>
  risk: (move: MoveId) => void
  submit: (result: MoveResult) => Promise<void>
  next: () => Promise<void>
  reset: () => void
}

function combatOf(run: Run): CombatState {
  if (!run.combat) throw new Error('run without combat state')
  return run.combat
}

function withCombat(run: Run, combat: CombatState): Run {
  return {
    ...run,
    combat,
    hp: combat.hp,
    maxHp: combat.maxHp,
    runes: combat.runes,
    combo: combat.combo,
    failedItemIds: combat.failedItemIds,
    status: combat.status,
  }
}

export const useBattleStore = create<BattleState>((set, get) => {
  async function startNew(items: Record<string, Item>, progress: Record<string, Progress>): Promise<Run | null> {
    const profile = useProfileStore.getState().profile
    const newPerDay = profile?.settings.newPerDay ?? balance.hero.maxHp
    const t = now()
    const queue = buildQueue({
      items: Object.values(items),
      progress: Object.values(progress),
      now: t,
      newPerDay,
      limit: balance.battle.size,
    })
    if (queue.length === 0) return null
    const seed = (t ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
    const pm = new Map(Object.entries(progress))
    const combat = createCombat(queue, pm, seed, balance.hero.maxHp)
    const run: Run = withCombat(
      {
        id: newId('run'),
        seed,
        kind: 'run',
        map: [],
        position: null,
        hp: combat.hp,
        maxHp: combat.maxHp,
        boons: [],
        runes: 0,
        combo: 0,
        failedItemIds: [],
        status: 'active',
        startedAt: t,
        combat,
      },
      combat,
    )
    await saveRun(run)
    return run
  }

  /** Chooses the move and task for the current enemy. */
  function prepare(run: Run) {
    const combat = combatOf(run)
    const c = combat.current
    if (!c) return
    const { items, progress } = get()
    const item = items[c.itemId]
    if (!item) {
      set({ error: `Нет элемента ${c.itemId}` })
      return
    }
    const p = progress[c.itemId] ?? newProgress(c.itemId, now())
    const rng = combatRng(combat)
    let move: MoveId
    if (c.kind === 'newcomer') {
      move = 'intro'
    } else {
      const enabled = IMPLEMENTED_MOVES.filter((m) => canUse(m, item))
      const excluded: MoveId[] = [...c.movesUsed]
      if (p.lastMove) excluded.push(p.lastMove)
      move = pickMove({ stage: p.stage, enabled, excluded, rng })
    }
    const task = buildTask(move, item, rng)
    const windup = balance.windupMs[move]
    set({
      run,
      phase: 'task',
      move,
      task,
      risked: false,
      windupStartedAt: Date.now(),
      windupMs: windup,
      baseWindupMs: windup,
      feedback: null,
    })
  }

  async function finish(combat: CombatState, extraProgress: Record<string, Progress>): Promise<BattleSummary> {
    const t = now()
    const { items } = get()
    const progress = { ...get().progress, ...extraProgress }
    const newNemeses: Item[] = []
    const stillInDebt: Item[] = []
    for (const id of combat.seenItemIds) {
      const p = progress[id]
      if (!p) continue
      const hadNemesis = p.nemesis !== null
      const next = endRunForItem(p, combat.failedItemIds.includes(id), t)
      progress[id] = next
      await saveProgress(next)
      const item = items[id]
      if (item && !hadNemesis && next.nemesis !== null) newNemeses.push(item)
      if (item && next.inDebt) stillInDebt.push(item)
    }

    const kept = runesKept(combat)
    const profileStore = useProfileStore.getState()
    const profile = profileStore.profile
    let levelUp: number | null = null
    if (profile) {
      const today = dayKey(t)
      const yesterday = dayKey(addDays(t, -1))
      const streak = profile.lastActiveDay === today ? profile.streak : profile.lastActiveDay === yesterday ? profile.streak + 1 : 1
      const xp = profile.xp + combat.xp
      const level = levelForXp(xp)
      if (level > profile.level) levelUp = level
      await profileStore.update({ runes: profile.runes + kept, xp, level, streak, lastActiveDay: today })
    }

    const pick = (ids: string[]) => ids.map((id) => items[id]).filter((i): i is Item => i !== undefined)
    set({ progress })
    return {
      status: combat.status === 'retreated' ? 'retreated' : 'won',
      runes: kept,
      xp: combat.xp,
      hits: combat.hits,
      misses: combat.misses,
      crits: combat.crits,
      maxCombo: combat.maxCombo,
      closedDebts: pick(combat.closedDebtIds),
      newNemeses,
      defeatedNemeses: pick(combat.defeatedNemesisIds),
      stillInDebt,
      levelUp,
    }
  }

  let loading: Promise<void> | null = null

  async function doLoad(): Promise<void> {
    set({ phase: 'loading', error: null, summary: null, feedback: null })
    try {
      const items: Record<string, Item> = {}
      for (const i of await allItems()) items[i.id] = i
      const progress: Record<string, Progress> = {}
      for (const [id, p] of await progressMap()) progress[id] = p
      set({ items, progress })
      let run = await activeRun()
      if (!run || !run.combat) run = (await startNew(items, progress)) ?? undefined
      if (!run) {
        set({ phase: 'empty', run: null })
        return
      }
      prepare(run)
    } catch (e) {
      set({ phase: 'idle', error: e instanceof Error ? e.message : String(e) })
    }
  }

  return {
    run: null,
    items: {},
    progress: {},
    phase: 'idle',
    move: null,
    task: null,
    risked: false,
    windupStartedAt: 0,
    windupMs: 0,
    baseWindupMs: 0,
    feedback: null,
    summary: null,
    error: null,
    shake: 0,

    reset: () =>
      set({ run: null, phase: 'idle', move: null, task: null, feedback: null, summary: null, error: null, risked: false }),

    load: async () => {
      // React StrictMode mounts twice in dev; a second concurrent load must not create a second run.
      if (loading) return loading
      loading = (async () => {
        try {
          await doLoad()
        } finally {
          loading = null
        }
      })()
      return loading
    },

    risk: (move) => {
      const { run, items, phase } = get()
      if (!run || phase !== 'task') return
      const combat = combatOf(run)
      const c = combat.current
      if (!c) return
      const item = items[c.itemId]
      if (!item || !canUse(move, item)) return
      // A different stream than the base task so the risked task is not the same sentence.
      const rng = mulberry32((combat.seed ^ (combat.answers * 0x85ebca6b) ^ 0x5bd1e995) >>> 0)
      const windup = balance.windupMs[move]
      set({
        move,
        task: buildTask(move, item, rng),
        risked: true,
        windupStartedAt: Date.now(),
        windupMs: windup,
        baseWindupMs: windup,
      })
    },

    submit: async (result) => {
      const { run, move, items, progress, risked, windupStartedAt, baseWindupMs, phase } = get()
      if (!run || !move || phase !== 'task') return
      const combat = combatOf(run)
      const c = combat.current
      if (!c) return
      const item = items[c.itemId]
      if (!item) return
      const t = now()
      const p = progress[c.itemId] ?? newProgress(c.itemId, t)

      if (move === 'intro') {
        if (result.answer === 'know') {
          get().risk('translate')
          return
        }
        const nextP = applyIntro(p, t)
        await saveProgress(nextP)
        await addAttempt({
          id: newId('att'),
          itemId: item.id,
          move,
          ts: t,
          runId: run.id,
          correct: true,
          rating: 3,
          ms: Date.now() - windupStartedAt,
          hintUsed: false,
          risked: false,
          answer: result.answer,
        })
        const { state } = resolveIntro(combat)
        const nextRun = withCombat(run, state)
        await saveRun(nextRun)
        set({ progress: { ...progress, [item.id]: nextP } })
        prepare(nextRun)
        return
      }

      const ms = Date.now() - windupStartedAt
      const ratio = baseWindupMs > 0 ? ms / baseWindupMs : 1
      // Law 2: the rating depends only on learning inputs.
      const rating = grade({ correct: result.correct, hintUsed: result.hintUsed, typo: result.typo, windupRatio: ratio })
      const crit = result.correct && ratio < 1

      let outcome = applyAnswer(p, { move, correct: result.correct, rating, risked, now: t })
      let nextP = outcome.progress
      if (c.kind === 'nemesis') {
        const won = result.correct && c.hits + 1 >= c.hitsNeeded
        if (won || !result.correct) nextP = recordNemesisFight(nextP, won, dayKey(t)).progress
      }
      await saveProgress(nextP)
      await addAttempt({
        id: newId('att'),
        itemId: item.id,
        move,
        ts: t,
        runId: run.id,
        correct: result.correct,
        rating,
        ms,
        hintUsed: result.hintUsed,
        risked,
        answer: result.answer,
      })

      const { state, events } = resolve(combat, {
        move,
        correct: result.correct,
        crit,
        risked,
        debtClosed: outcome.events.includes('debtClosed'),
      })
      let nextRun = withCombat(run, state)
      const nextProgress = { ...progress, [item.id]: nextP }
      let summary: BattleSummary | null = null
      if (state.status !== 'active') {
        summary = await finish(state, nextProgress)
      }
      await saveRun(nextRun)
      const hitEvent = events.find((e): e is Extract<CombatEvent, { type: 'hit' }> => e.type === 'hit')
      set((s) => ({
        run: nextRun,
        progress: state.status !== 'active' ? get().progress : nextProgress,
        phase: 'feedback',
        summary,
        shake: s.shake + 1,
        feedback: {
          correct: result.correct,
          crit,
          rating,
          typo: result.typo,
          runes: hitEvent?.runes ?? 0,
          answer: result.answer,
          expected: result.expected,
          item,
          move,
          risked,
          events,
          progressEvents: outcome.events,
          stage: nextP.stage,
        },
      }))
      outcome = { progress: nextP, events: outcome.events }
    },

    next: async () => {
      const { run, phase, summary } = get()
      if (!run || phase !== 'feedback') return
      const combat = combatOf(run)
      if (combat.status !== 'active') {
        set({ phase: 'done', summary, feedback: null, task: null, move: null })
        return
      }
      const advanced = advance(combat)
      const nextRun = withCombat(run, advanced)
      if (advanced !== combat) await saveRun(nextRun)
      prepare(nextRun)
    },
  }
})
