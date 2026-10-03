// Run orchestration: creates and resumes runs, drives battle nodes (engine grades, game
// resolves), rests, boons and the summary. Persists after every answer. Nothing here touches
// the FSRS rating except passing the engine's own result through.
import { create } from 'zustand'
import { addDays, dayKey } from '@/engine/clock'
import { grade } from '@/engine/grading'
import { pickMove } from '@/engine/moves'
import { endRunForItem, recordNemesisFight } from '@/engine/nemesis'
import { recordTrap } from '@/engine/patterns'
import { applyAnswer, applyIntro, newProgress, type ProgressEvent } from '@/engine/progress'
import { mulberry32 } from '@/engine/rng'
import { buildQueue } from '@/engine/scheduler'
import { balance, levelForXp } from '@/game/balance'
import { hasBoon } from '@/game/boons'
import { advance, combatRng, endEarly, resolve, resolveIntro, type CombatEvent } from '@/game/combat'
import {
  answerRest,
  chooseBoon,
  createRun,
  createSortie,
  finishBattleNode,
  finishRestNode,
  nextRest,
  startBattleNode,
  startRestNode,
} from '@/game/run'
import { activeRun, addAttempt, allItems, newId, progressMap, saveProgress, saveRun } from '@/db/repos'
import { activePatterns, patternDef, savePatternStat } from '@/db/patternRepo'
import { buildTask, canUse } from '@/moves/tasks'
import { IMPLEMENTED_MOVES, type MoveResult, type MoveTask } from '@/moves/types'
import type { TrapResult } from '@/moves/trap/TrapMove'
import type { CombatState, Item, MoveId, PatternStat, Progress, Rating, Run } from '@/types'
import { now } from './clock'
import { useProfileStore } from './profile'

export type BattlePhase = 'idle' | 'loading' | 'task' | 'feedback'

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

export interface RunSummary {
  kind: 'run' | 'sortie'
  status: 'won' | 'retreated'
  runes: number
  xp: number
  hits: number
  misses: number
  crits: number
  maxCombo: number
  chests: number
  cleanRun: boolean
  closedDebts: Item[]
  stillInDebt: Item[]
  newNemeses: Item[]
  defeatedNemeses: Item[]
  stageUps: Item[]
  mastered: Item[]
  levelUp: number | null
  boons: Run['boons']
}

interface RunState {
  run: Run | null
  items: Record<string, Item>
  progress: Record<string, Progress>
  patternStats: PatternStat[]
  loaded: boolean
  error: string | null

  battlePhase: BattlePhase
  move: MoveId | null
  task: MoveTask | null
  risked: boolean
  windupStartedAt: number
  windupMs: number
  baseWindupMs: number
  feedback: Feedback | null
  shake: number
  summary: RunSummary | null

  load: () => Promise<void>
  startRun: (kind: 'run' | 'sortie') => Promise<void>
  enterNode: (step: number, node: number) => Promise<void>
  resumeBattle: () => void
  risk: (move: MoveId) => void
  submit: (result: MoveResult) => Promise<void>
  next: () => Promise<void>
  timeUp: () => Promise<void>
  answerTrap: (result: TrapResult) => Promise<void>
  nextTrap: () => Promise<void>
  leaveRest: () => Promise<void>
  pickBoon: (boon: Run['boons'][number]) => Promise<void>
  leaveSummary: () => void
}

export const AVAILABLE_MOVES = { voice: false }

/** Where the UI should be for this run. */
export function routeForRun(run: Run | null): string {
  if (!run || run.status !== 'active') return run?.phase === 'summary' ? '/summary' : '/'
  switch (run.phase) {
    case 'battle':
      return '/battle'
    case 'rest':
      return '/rest'
    case 'boon':
      return '/boon'
    case 'summary':
      return '/summary'
    default:
      return '/run'
  }
}

function combatOf(run: Run): CombatState {
  if (!run.combat) throw new Error('run without combat state')
  return run.combat
}

function withCombat(run: Run, combat: CombatState): Run {
  return { ...run, combat, hp: combat.hp, combo: combat.combo }
}

export const useRunStore = create<RunState>((set, get) => {
  let loading: Promise<void> | null = null

  async function loadData(): Promise<void> {
    const items: Record<string, Item> = {}
    for (const i of await allItems()) items[i.id] = i
    const progress: Record<string, Progress> = {}
    for (const [id, p] of await progressMap()) progress[id] = p
    const patternStats = await activePatterns()
    set({ items, progress, patternStats })
  }

  async function persist(run: Run): Promise<void> {
    await saveRun(run)
    set({ run })
  }

  /** Chooses the move and task for the current enemy and shows it. */
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
    const enabled = IMPLEMENTED_MOVES.filter((m) => canUse(m, item))
    const excluded: MoveId[] = [...c.movesUsed]
    if (p.lastMove && c.kind !== 'echo') excluded.push(p.lastMove)
    if (c.kind === 'newcomer') move = 'intro'
    // The Echo always strikes with the hardest move available, even if it was the last one used.
    else if (c.kind === 'echo') move = pickMove({ stage: 5, enabled, excluded, rng })
    else move = pickMove({ stage: p.stage, enabled, excluded, rng })
    const task = buildTask(move, item, rng)
    const base = balance.windupMs[move]
    const shown = hasBoon(run.boons, 'coolHead') ? Math.round(base * balance.boons.coolHeadSlowdown) : base
    set({
      run,
      battlePhase: 'task',
      move,
      task,
      risked: false,
      windupStartedAt: Date.now(),
      windupMs: shown,
      baseWindupMs: base,
      feedback: null,
    })
  }

  /** End-of-run bookkeeping: failed runs, nemeses, profile. Idempotent per run via endedAt. */
  async function finishRun(run: Run): Promise<Run> {
    if (run.endedAt !== null) return run
    const t = now()
    const { items } = get()
    const progress = { ...get().progress }
    const newNemeses: Item[] = []
    const stillInDebt: Item[] = []
    for (const id of run.stats.seenItemIds) {
      const p = progress[id]
      if (!p) continue
      const hadNemesis = p.nemesis !== null
      const nextP = endRunForItem(p, run.failedItemIds.includes(id), t)
      progress[id] = nextP
      await saveProgress(nextP)
      const item = items[id]
      if (item && !hadNemesis && nextP.nemesis !== null) newNemeses.push(item)
      if (item && nextP.inDebt) stillInDebt.push(item)
    }

    const profileStore = useProfileStore.getState()
    const profile = profileStore.profile
    let levelUp: number | null = null
    if (profile) {
      const today = dayKey(t)
      const yesterday = dayKey(addDays(t, -1))
      const streak = profile.lastActiveDay === today ? profile.streak : profile.lastActiveDay === yesterday ? profile.streak + 1 : 1
      const xp = profile.xp + run.stats.xp
      const level = levelForXp(xp)
      if (level > profile.level) levelUp = level
      await profileStore.update({ runes: profile.runes + run.runes, xp, level, streak, lastActiveDay: today })
    }

    const pick = (ids: string[]) => ids.map((id) => items[id]).filter((i): i is Item => i !== undefined)
    const summary: RunSummary = {
      kind: run.kind,
      status: run.status === 'retreated' ? 'retreated' : 'won',
      runes: run.runes,
      xp: run.stats.xp,
      hits: run.stats.hits,
      misses: run.stats.misses,
      crits: run.stats.crits,
      maxCombo: run.stats.maxCombo,
      chests: run.stats.chests,
      cleanRun: run.cleanRun,
      closedDebts: pick(run.stats.closedDebtIds),
      stillInDebt,
      newNemeses,
      defeatedNemeses: pick(run.stats.defeatedNemesisIds),
      stageUps: pick(run.stats.stageUpIds),
      mastered: pick(run.stats.masteredIds),
      levelUp,
      boons: run.boons,
    }
    const ended: Run = { ...run, endedAt: t }
    await saveRun(ended)
    set({ progress, summary, run: ended })
    return ended
  }

  /** After a battle node ends: merge into the run and move on (boon, map or summary). */
  async function afterBattle(run: Run, combat: CombatState): Promise<void> {
    const rng = mulberry32((run.seed ^ (run.stats.seenItemIds.length + combat.answers) * 0x6c078965) >>> 0)
    let next = finishBattleNode(run, combat, rng, AVAILABLE_MOVES)
    if (next.phase === 'summary') next = await finishRun(next)
    else await saveRun(next)
    set({ run: next, battlePhase: 'idle', move: null, task: null, feedback: null })
  }

  return {
    run: null,
    items: {},
    progress: {},
    patternStats: [],
    loaded: false,
    error: null,
    battlePhase: 'idle',
    move: null,
    task: null,
    risked: false,
    windupStartedAt: 0,
    windupMs: 0,
    baseWindupMs: 0,
    feedback: null,
    shake: 0,
    summary: null,

    load: async () => {
      if (loading) return loading
      loading = (async () => {
        try {
          await loadData()
          const run = await activeRun()
          set({ run: run ?? null, loaded: true, error: null })
        } catch (e) {
          set({ loaded: true, error: e instanceof Error ? e.message : String(e) })
        } finally {
          loading = null
        }
      })()
      return loading
    },

    startRun: async (kind) => {
      await get().load()
      const existing = get().run
      if (existing && existing.status === 'active') return
      const { items, progress } = get()
      const profile = useProfileStore.getState().profile
      const t = now()
      const queue = buildQueue({
        items: Object.values(items),
        progress: Object.values(progress),
        now: t,
        newPerDay: profile?.settings.newPerDay ?? balance.hero.maxHp,
      })
      const seed = (t ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
      const input = { id: newId(kind), seed, now: t, queue, maxHp: balance.hero.maxHp }
      let run = kind === 'sortie' ? createSortie(input) : createRun(input)
      if (kind === 'sortie') {
        const pm = new Map(Object.entries(progress))
        run = startBattleNode(run, { step: 0, node: 0 }, pm)
      }
      await saveRun(run)
      set({ run, summary: null, battlePhase: 'idle', feedback: null, task: null, move: null })
      if (run.phase === 'battle') prepare(run)
    },

    enterNode: async (step, node) => {
      const { run, progress, patternStats } = get()
      if (!run || run.phase !== 'map') return
      const target = run.map[step]?.[node]
      if (!target) return
      if (target.type === 'rest') {
        const stat = patternStats[0] ?? null
        const def = stat ? patternDef(stat.patternId) : undefined
        const next = startRestNode(run, { step, node }, def ? def.id : null, def ? def.exercises.length : 0)
        await persist(next)
        return
      }
      const pm = new Map(Object.entries(progress))
      const next = startBattleNode(run, { step, node }, pm)
      await saveRun(next)
      set({ run: next })
      prepare(next)
    },

    resumeBattle: () => {
      const { run, battlePhase } = get()
      if (!run || run.phase !== 'battle' || !run.combat) return
      if (battlePhase === 'task' || battlePhase === 'feedback') return
      if (run.combat.status !== 'active') {
        void afterBattle(run, run.combat)
        return
      }
      prepare(run)
    },

    risk: (move) => {
      const { run, items, battlePhase } = get()
      if (!run || !run.combat || battlePhase !== 'task') return
      const combat = run.combat
      const c = combat.current
      if (!c) return
      const item = items[c.itemId]
      if (!item || !canUse(move, item)) return
      const rng = mulberry32((combat.seed ^ (combat.answers * 0x85ebca6b) ^ 0x5bd1e995) >>> 0)
      const base = balance.windupMs[move]
      const shown = hasBoon(run.boons, 'coolHead') ? Math.round(base * balance.boons.coolHeadSlowdown) : base
      set({ move, task: buildTask(move, item, rng), risked: true, windupStartedAt: Date.now(), windupMs: shown, baseWindupMs: base })
    },

    submit: async (result) => {
      const { run, move, items, progress, risked, windupStartedAt, baseWindupMs, battlePhase } = get()
      if (!run || !run.combat || !move || battlePhase !== 'task') return
      const combat = run.combat
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
        await addAttempt({ id: newId('att'), itemId: item.id, move, ts: t, runId: run.id, correct: true, rating: 3, ms: Date.now() - windupStartedAt, hintUsed: false, risked: false, answer: result.answer })
        const { state } = resolveIntro(combat)
        const nextRun = withCombat(run, state)
        await saveRun(nextRun)
        set({ progress: { ...progress, [item.id]: nextP } })
        prepare(nextRun)
        return
      }

      const ms = Date.now() - windupStartedAt
      const ratio = baseWindupMs > 0 ? ms / baseWindupMs : 1
      // Law 2: the rating depends only on learning inputs (base wind-up, not the boon-slowed one).
      const rating = grade({ correct: result.correct, hintUsed: result.hintUsed, typo: result.typo, windupRatio: ratio })
      const crit = result.correct && ms < get().windupMs

      const outcome = applyAnswer(p, { move, correct: result.correct, rating, risked, now: t })
      let nextP = outcome.progress
      if (c.kind === 'nemesis') {
        const won = result.correct && c.hits + 1 >= c.hitsNeeded
        if (won || !result.correct) nextP = recordNemesisFight(nextP, won, dayKey(t)).progress
      }
      await saveProgress(nextP)
      await addAttempt({ id: newId('att'), itemId: item.id, move, ts: t, runId: run.id, correct: result.correct, rating, ms, hintUsed: result.hintUsed, risked, answer: result.answer })

      const { state, events, flags } = resolve(
        combat,
        { move, correct: result.correct, crit, risked, typo: result.typo, debtClosed: outcome.events.includes('debtClosed') },
        { boons: run.boons, flags: run.flags },
      )
      const stats = { ...run.stats }
      if (outcome.events.includes('stageUp') && !stats.stageUpIds.includes(item.id)) stats.stageUpIds = [...stats.stageUpIds, item.id]
      if (outcome.events.includes('mastered') && !stats.masteredIds.includes(item.id)) stats.masteredIds = [...stats.masteredIds, item.id]
      const nextRun: Run = { ...withCombat(run, state), flags, stats }
      await saveRun(nextRun)
      const hitEvent = events.find((e): e is Extract<CombatEvent, { type: 'hit' }> => e.type === 'hit')
      set((s) => ({
        run: nextRun,
        progress: { ...progress, [item.id]: nextP },
        battlePhase: 'feedback',
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
    },

    next: async () => {
      const { run, battlePhase } = get()
      if (!run || !run.combat || battlePhase !== 'feedback') return
      const combat = run.combat
      if (combat.status !== 'active') {
        await afterBattle(run, combat)
        return
      }
      if (run.sortieEndsAt !== null && now() >= run.sortieEndsAt) {
        await afterBattle(run, endEarly(combat))
        return
      }
      const advanced = advance(combat)
      const nextRun = withCombat(run, advanced)
      if (advanced !== combat) await saveRun(nextRun)
      prepare(nextRun)
    },

    timeUp: async () => {
      const { run, battlePhase } = get()
      if (!run || !run.combat || run.sortieEndsAt === null) return
      if (battlePhase === 'feedback') return
      await afterBattle(run, endEarly(run.combat))
    },

    answerTrap: async (result) => {
      const { run, patternStats } = get()
      if (!run || run.phase !== 'rest' || !run.rest || run.rest.feedback) return
      const def = patternDef(run.rest.patternId)
      const exIndex = run.rest.exercises[run.rest.index]
      const ex = def && exIndex !== undefined ? def.exercises[exIndex] : undefined
      if (!ex) return
      const stat = patternStats.find((s) => s.patternId === run.rest?.patternId)
      if (stat) {
        const nextStat = recordTrap(stat, result.correct, now())
        await savePatternStat(nextStat)
        set({ patternStats: patternStats.map((s) => (s.patternId === nextStat.patternId ? nextStat : s)) })
      }
      await persist(answerRest(run, result.correct, ex.ruleRu, result.fixed))
    },

    nextTrap: async () => {
      const { run } = get()
      if (!run || run.phase !== 'rest') return
      await persist(nextRest(run))
    },

    leaveRest: async () => {
      const { run } = get()
      if (!run || run.phase !== 'rest') return
      const rng = mulberry32((run.seed ^ ((run.position?.step ?? 0) + 7) * 0x2545f491) >>> 0)
      await persist(finishRestNode(run, rng, AVAILABLE_MOVES))
    },

    pickBoon: async (boon) => {
      const { run } = get()
      if (!run || run.phase !== 'boon') return
      await persist(chooseBoon(run, boon))
    },

    leaveSummary: () => {
      const { run } = get()
      if (run && run.status !== 'active') set({ run: null, summary: null })
    },
  }
})
