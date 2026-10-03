// Run orchestration: creates and resumes runs, drives battle nodes (engine grades, game
// resolves), rests, boons and the summary. Persists after every answer. Nothing here touches
// the FSRS rating except passing the engine's own result through.
import { create } from 'zustand'
import { dayKey, daysBetween } from '@/engine/clock'
import { unlockedLandIds } from '@/engine/lands'
import { advanceStreak } from '@/engine/streak'
import { grade } from '@/engine/grading'
import { pickMove } from '@/engine/moves'
import { endRunForItem, recordNemesisFight } from '@/engine/nemesis'
import { recordTrap } from '@/engine/patterns'
import { applyAnswer, applyIntro, newProgress, type ProgressEvent } from '@/engine/progress'
import { mulberry32, rngInt } from '@/engine/rng'
import type { Correction } from '@/ai/types'
import { normalize } from '@/engine/answerCheck'
import { newPatternStat, reactivatePattern } from '@/engine/patterns'
import { addCorrectionItem } from '@/db/textRepo'
import { aiAvailable, sceneTurn } from '@/ai/ai'
import { enrichNemesis } from '@/ai/daily'
import { seedScenes } from '@/content/scenes'
import { applyTurn, chipsUsedIn, finishEncounterNode, scriptedLine, startEncounterNode, type TurnVerdict } from '@/game/encounter'
import type { SceneDef, SceneOutcome } from '@/types'
import { buildQueue } from '@/engine/scheduler'
import { balance, levelForXp } from '@/game/balance'
import { boonChoices, hasStartBoon, heroMaxHp } from '@/game/upgrades'
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
  offerStartBoon,
  startBattleNode,
  startRestNode,
} from '@/game/run'
import { activeRun, addAttempt, allItems, newId, progressMap, saveProgress, saveRun } from '@/db/repos'
import { activePatterns, patternDef, savePatternStat } from '@/db/patternRepo'
import { moveAvailable } from '@/moves/availability'
import { buildTask, canUse } from '@/moves/tasks'
import { IMPLEMENTED_MOVES, type MoveResult, type MoveTask } from '@/moves/types'
import type { TrapResult } from '@/moves/trap/TrapMove'
import { speak } from '@/speech/tts'
import { buzz, fx } from '@/ui/fx'
import type { CombatState, Item, MoveId, PatternStat, Progress, Rating, Run, Trophy, TrapExercise, RunPool } from '@/types'
import { lands as landDefs, type LandDef } from '@/content/seed'
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
  /** Outcome of a nemesis fight that ended with this answer. */
  nemesisResult: 'won' | 'destroyed' | 'lost' | null
  /** AI corrections for a production move (SPEC §8, §10.3). */
  corrections: Correction[]
  moreNatural: string | null
  aiChecked: boolean
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
  /** Lands opened by this run. */
  newLands: LandDef[]
  streak: number
  usedFreezes: number
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
  /** Dev/e2e only: the next prepared task uses this move when the item supports it. */
  forcedMove: MoveId | null

  load: () => Promise<void>
  forceMove: (move: MoveId | null) => void
  startRun: (kind: 'run' | 'sortie') => Promise<void>
  enterNode: (step: number, node: number) => Promise<void>
  resumeBattle: () => void
  risk: (move: MoveId) => void
  submit: (result: MoveResult) => Promise<void>
  /** Answer of a Хамелеон (trap) enemy inside a battle. */
  submitTrap: (result: { correct: boolean; fixed: string }) => Promise<void>
  next: () => Promise<void>
  timeUp: () => Promise<void>
  answerTrap: (result: TrapResult) => Promise<void>
  nextTrap: () => Promise<void>
  leaveRest: () => Promise<void>
  /** Встреча: the learner's answer (empty when the clock ran out). */
  answerScene: (text: string) => Promise<void>
  /** Self-assessment of the pending answer when the AI is off. */
  assessScene: (v: 'ok' | 'typo' | 'fail') => Promise<void>
  leaveEncounter: () => Promise<void>
  pickBoon: (boon: Run['boons'][number]) => Promise<void>
  leaveSummary: () => void
}

export const AVAILABLE_MOVES = { voice: true }

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
    case 'encounter':
      return '/encounter'
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

/** Sounds, vibration and the correct-answer voice after an answer (SPEC §7.3, §5.3). */
function playFeedbackFx(events: CombatEvent[], progressEvents: ProgressEvent[], crit: boolean, item: Item, voice: 'en-US' | 'en-GB'): void {
  const types = new Set(events.map((e) => e.type))
  if (types.has('miss')) {
    fx.miss()
    buzz.miss()
    // After a miss the right phrase is spoken so the ear learns it too.
    void speak(item.en, voice)
  } else if (types.has('hit')) {
    if (crit) fx.crit()
    else fx.hit()
    buzz.hit()
  }
  if (progressEvents.includes('debtClosed')) {
    fx.debtClosed()
    buzz.debtClosed()
  } else if (progressEvents.includes('stageUp')) {
    fx.stageUp()
  }
  const down = events.find((e) => e.type === 'enemyDown')
  if (down && down.type === 'enemyDown' && (down.kind === 'nemesis' || down.kind === 'echo')) {
    fx.big()
    buzz.big()
  }
  if (types.has('won')) fx.win()
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
  /** A pattern enemy is shown through a transient item: the pattern title and its rule. */
  function chameleonItem(patternId: string): Item {
    const def = patternDef(patternId)
    return {
      id: `pattern:${patternId}`,
      type: 'pattern',
      land: 'life',
      en: `Хамелеон · ${def?.title ?? patternId}`,
      ru: def?.explainRu ?? '',
      accept: [],
      contexts: [],
      promptsRu: [],
      questionEn: '',
      falseMeanings: [],
      noteRu: '',
      source: 'seed',
      createdAt: 0,
    }
  }

  function prepareTrap(run: Run, patternId: string) {
    const combat = combatOf(run)
    const def = patternDef(patternId)
    const { items } = get()
    if (!def || def.exercises.length === 0) {
      set({ error: `Нет упражнений для ${patternId}` })
      return
    }
    const rng = combatRng(combat)
    const exerciseIndex = rngInt(rng, 0, def.exercises.length - 1)
    const exercise = def.exercises[exerciseIndex] as TrapExercise
    const base = balance.windupMs.trap
    const shown = hasBoon(run.boons, 'coolHead') ? Math.round(base * balance.boons.coolHeadSlowdown) : base
    set({
      run,
      items: items[`pattern:${patternId}`] ? items : { ...items, [`pattern:${patternId}`]: chameleonItem(patternId) },
      battlePhase: 'task',
      move: 'trap',
      task: { move: 'trap', patternId, exerciseIndex, exercise },
      risked: false,
      windupStartedAt: Date.now(),
      windupMs: shown,
      baseWindupMs: base,
      feedback: null,
    })
  }

  function prepare(run: Run) {
    const combat = combatOf(run)
    const c = combat.current
    if (!c) return
    if (c.kind === 'chameleon') {
      prepareTrap(run, c.itemId.slice('pattern:'.length))
      return
    }
    const { items, progress } = get()
    const item = items[c.itemId]
    if (!item) {
      set({ error: `Нет элемента ${c.itemId}` })
      return
    }
    const p = progress[c.itemId] ?? newProgress(c.itemId, now())
    const rng = combatRng(combat)
    let move: MoveId
    const enabled = IMPLEMENTED_MOVES.filter((m) => canUse(m, item) && moveAvailable(m))
    const excluded: MoveId[] = [...c.movesUsed]
    if (p.lastMove && c.kind !== 'echo') excluded.push(p.lastMove)
    const forced = get().forcedMove
    if (c.kind === 'newcomer') move = 'intro'
    else if (forced && enabled.includes(forced)) {
      move = forced
      set({ forcedMove: null })
    }
    // The Echo always strikes with the hardest move available, even if it was the last one used.
    else if (c.kind === 'echo') move = pickMove({ stage: 5, enabled, excluded, rng })
    else move = pickMove({ stage: p.stage, enabled, excluded, rng })
    const task = buildTask(move, item, rng, Object.values(items))
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
    let streakNow = 0
    let usedFreezes = 0
    const newLands: LandDef[] = []
    if (profile) {
      const streak = advanceStreak({ streak: profile.streak, freezes: profile.freezes, lastActiveDay: profile.lastActiveDay }, t)
      streakNow = streak.streak
      usedFreezes = streak.usedFreezes
      const xp = profile.xp + run.stats.xp
      const level = levelForXp(xp)
      if (level > profile.level) levelUp = level
      const pm = new Map(Object.entries(progress))
      const unlocked = unlockedLandIds(landDefs.map((l) => l.id), Object.values(items), pm, balance.lands.unlockAfter)
      for (const id of unlocked) {
        if (!profile.unlockedLands.includes(id)) {
          const def = landDefs.find((l) => l.id === id)
          if (def) newLands.push(def)
        }
      }
      await profileStore.update({
        runes: profile.runes + run.runes,
        xp,
        level,
        streak: streak.streak,
        freezes: streak.freezes,
        lastActiveDay: streak.lastActiveDay,
        unlockedLands: unlocked,
      })
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
      newLands,
      streak: streakNow,
      usedFreezes,
    }
    const ended: Run = { ...run, endedAt: t }
    await saveRun(ended)
    set({ progress, summary, run: ended })
    return ended
  }

  /** After a battle node ends: merge into the run and move on (boon, map or summary). */
  /** Records one scene exchange: chips used are stage-5 hits, corrections materialize, the state moves on. */
  async function applySceneTurn(
    run: Run,
    scene: SceneDef,
    text: string,
    verdict: TurnVerdict,
    npcLine: string,
    usedChipIds: readonly string[],
    outcome: SceneOutcome | null,
    whyRu: string | null,
    t: number,
  ): Promise<void> {
    if (!run.encounter) return
    const { items, progress } = get()
    const nextProgress = { ...progress }
    for (const id of usedChipIds) {
      const item = items[id]
      if (!item) continue
      const p = progress[id] ?? newProgress(id, t)
      const rating: Rating = verdict.typo ? 2 : 3
      const out = applyAnswer(p, { move: 'improv', correct: true, rating, risked: false, now: t })
      nextProgress[id] = out.progress
      await saveProgress(out.progress)
      await addAttempt({ id: newId('att'), itemId: id, move: 'improv', ts: t, runId: run.id, correct: true, rating, ms: 0, hintUsed: false, risked: false, answer: text })
    }
    const encounter = applyTurn(run.encounter, scene, { text, verdict, npcLine, usedChipIds, outcome, whyRu, now: t })
    let next: Run = { ...run, encounter }
    if (verdict.corrections.length > 0) {
      next = await materialize(next, { correct: true, hintUsed: false, typo: false, answer: text, expected: text, corrections: verdict.corrections }, t)
    }
    await saveRun(next)
    set({ run: next, progress: nextProgress })
    if (encounter.phase === 'result') fx.win()
  }

  /** Errors the AI caught become enemies of the next battle node (SPEC §8). */
  async function materialize(run: Run, result: MoveResult, t: number): Promise<Run> {
    const corrections = result.corrections ?? []
    if (corrections.length === 0) return run
    const pool: RunPool = { ...run.pool, materialized: [...(run.pool.materialized ?? [])], chameleons: [...(run.pool.chameleons ?? [])] }
    const { items, patternStats } = get()
    const nextItems = { ...items }
    const stats = [...patternStats]
    for (const c of corrections) {
      if (c.patternId) {
        if (!pool.chameleons.includes(c.patternId)) pool.chameleons.push(c.patternId)
        const i = stats.findIndex((st) => st.patternId === c.patternId)
        const woken = reactivatePattern(i >= 0 ? (stats[i] as PatternStat) : newPatternStat(c.patternId))
        if (i >= 0) stats[i] = woken
        else stats.push(woken)
        await savePatternStat(woken)
        continue
      }
      const existing = Object.values(nextItems).find((it) => normalize(it.en) === normalize(c.right))
      let id: string
      if (existing) id = existing.id
      else {
        const made = await addCorrectionItem({ wrong: c.wrong, right: c.right, ruleRu: c.ruleRu, sentence: result.expected, now: t })
        nextItems[made.id] = made
        id = made.id
      }
      if (!pool.materialized.includes(id)) pool.materialized.push(id)
    }
    const next: Run = { ...run, pool }
    await saveRun(next)
    set({ items: nextItems, patternStats: stats })
    return next
  }

  async function afterBattle(run: Run, combat: CombatState): Promise<void> {
    const rng = mulberry32((run.seed ^ (run.stats.seenItemIds.length + combat.answers) * 0x6c078965) >>> 0)
    let next = finishBattleNode(run, combat, rng, AVAILABLE_MOVES, boonChoices(useProfileStore.getState().profile))
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
    forcedMove: null,

    forceMove: (move) => set({ forcedMove: move }),

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
      const pm = new Map(Object.entries(progress))
      const queue = buildQueue({
        items: Object.values(items),
        progress: Object.values(progress),
        now: t,
        newPerDay: profile?.settings.newPerDay ?? balance.hero.maxHp,
        unlockedLands: unlockedLandIds(landDefs.map((l) => l.id), Object.values(items), pm, balance.lands.unlockAfter),
      })
      const seed = (t ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
      const input = { id: newId(kind), seed, now: t, queue, maxHp: heroMaxHp(profile), allowEncounter: kind === 'run' }
      let run = kind === 'sortie' ? createSortie(input) : createRun(input)
      if (kind === 'sortie') {
        run = startBattleNode(run, { step: 0, node: 0 }, pm)
      } else if (hasStartBoon(profile)) {
        run = offerStartBoon(run, undefined, AVAILABLE_MOVES, boonChoices(profile))
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
      if (target.type === 'encounter') {
        const { items } = get()
        const next = startEncounterNode(run, { step, node }, seedScenes, new Map(Object.entries(items)), new Map(Object.entries(progress)), now())
        await persist(next)
        return
      }
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

    submitTrap: async (result) => {
      const { run, move, task, patternStats, battlePhase, windupStartedAt } = get()
      if (!run || !run.combat || move !== 'trap' || !task || task.move !== 'trap' || battlePhase !== 'task') return
      const combat = run.combat
      const c = combat.current
      if (!c) return
      const t = now()
      const idx = patternStats.findIndex((st) => st.patternId === task.patternId)
      const stat = recordTrap(idx >= 0 ? (patternStats[idx] as PatternStat) : newPatternStat(task.patternId), result.correct, t)
      await savePatternStat(stat)
      const stats = [...patternStats]
      if (idx >= 0) stats[idx] = stat
      else stats.push(stat)
      const { state, events, flags } = resolve(
        combat,
        { move: 'trap', correct: result.correct, crit: false, risked: false, typo: false, debtClosed: false },
        { boons: run.boons, flags: run.flags },
      )
      const nextRun: Run = { ...withCombat(run, state), flags }
      await saveRun(nextRun)
      const item = get().items[c.itemId] ?? chameleonItem(task.patternId)
      const hitEvent = events.find((e): e is Extract<CombatEvent, { type: 'hit' }> => e.type === 'hit')
      playFeedbackFx(events, [], false, { ...item, en: result.fixed }, useProfileStore.getState().profile?.settings.ttsVoice ?? 'en-US')
      set((s) => ({
        run: nextRun,
        patternStats: stats,
        battlePhase: 'feedback',
        shake: s.shake + 1,
        feedback: {
          correct: result.correct,
          crit: false,
          rating: result.correct ? 3 : 1,
          typo: false,
          runes: hitEvent?.runes ?? 0,
          answer: result.correct ? result.fixed : task.exercise.tokens.join(' '),
          expected: result.fixed,
          item: { ...item, en: result.fixed, ru: task.exercise.ruleRu },
          move: 'trap',
          risked: false,
          events,
          progressEvents: [],
          stage: 2,
          nemesisResult: null,
          corrections: [],
          moreNatural: null,
          aiChecked: false,
        },
      }))
      void windupStartedAt
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
      set({ move, task: buildTask(move, item, rng, Object.values(items)), risked: true, windupStartedAt: Date.now(), windupMs: shown, baseWindupMs: base })
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
      let nemesisResult: Feedback['nemesisResult'] = null
      if (c.kind === 'nemesis') {
        const won = result.correct && c.hits + 1 >= c.hitsNeeded
        if (won || !result.correct) {
          const since = nextP.nemesis?.since ?? t
          const wins = nextP.nemesis?.winsOverHero ?? 0
          const fight = recordNemesisFight(nextP, won, dayKey(t))
          nextP = fight.progress
          nemesisResult = fight.destroyed ? 'destroyed' : won ? 'won' : 'lost'
          if (fight.destroyed) {
            const ps = useProfileStore.getState()
            if (ps.profile) {
              const trophy: Trophy = { itemId: item.id, date: dayKey(t), winsOverHero: wins, daysFought: Math.max(1, daysBetween(since, t) + 1) }
              await ps.update({ trophies: [...ps.profile.trophies, item.id], trophyLog: [...ps.profile.trophyLog, trophy] })
            }
          }
        }
      }
      await saveProgress(nextP)
      await addAttempt({ id: newId('att'), itemId: item.id, move, ts: t, runId: run.id, correct: result.correct, rating, ms, hintUsed: result.hintUsed, risked, answer: result.answer })
      if (!p.nemesis && nextP.nemesis) {
        // A new nemesis gets a mnemonic and fresh contexts when the AI is on (SPEC §4.4), in the background.
        void enrichNemesis(item, nextP).then((upd) => {
          set((s) => ({
            progress: upd.progress && s.progress[item.id]?.nemesis ? { ...s.progress, [item.id]: { ...(s.progress[item.id] as Progress), nemesis: { ...(s.progress[item.id] as Progress).nemesis!, mnemonic: upd.progress.nemesis?.mnemonic } } } : s.progress,
            items: upd.item ? { ...s.items, [item.id]: upd.item } : s.items,
          }))
        })
      }

      const { state, events, flags } = resolve(
        combat,
        { move, correct: result.correct, crit, risked, typo: result.typo, debtClosed: outcome.events.includes('debtClosed') },
        { boons: run.boons, flags: run.flags },
      )
      const stats = { ...run.stats }
      if (outcome.events.includes('stageUp') && !stats.stageUpIds.includes(item.id)) stats.stageUpIds = [...stats.stageUpIds, item.id]
      if (outcome.events.includes('mastered') && !stats.masteredIds.includes(item.id)) stats.masteredIds = [...stats.masteredIds, item.id]
      const savedRun: Run = { ...withCombat(run, state), flags, stats }
      await saveRun(savedRun)
      const nextRun = await materialize(savedRun, result, t)
      const hitEvent = events.find((e): e is Extract<CombatEvent, { type: 'hit' }> => e.type === 'hit')
      playFeedbackFx(events, outcome.events, crit, item, useProfileStore.getState().profile?.settings.ttsVoice ?? 'en-US')
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
          corrections: result.corrections ?? [],
          moreNatural: result.moreNatural ?? null,
          aiChecked: result.aiChecked ?? false,
          item,
          move,
          risked,
          events,
          progressEvents: outcome.events,
          stage: nextP.stage,
          nemesisResult,
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
      await persist(finishRestNode(run, rng, AVAILABLE_MOVES, boonChoices(useProfileStore.getState().profile)))
    },

    answerScene: async (text) => {
      const { run, items } = get()
      const enc = run?.encounter
      if (!run || run.phase !== 'encounter' || !enc || enc.phase !== 'talk') return
      const scene = seedScenes.find((sc) => sc.id === enc.sceneId)
      if (!scene) return
      const itemMap = new Map(Object.entries(items))
      const usedChipIds = chipsUsedIn(enc, text, itemMap)
      const targets = enc.chips.map((c) => items[c.itemId]?.en ?? '').filter(Boolean)
      const t = now()
      const closing = enc.turn + 1 >= scene.turns.length
      if (text.trim().length > 0 && aiAvailable()) {
        await persist({ ...run, encounter: { ...enc, phase: 'checking', pendingText: text } })
        const reply = await sceneTurn({
          title: scene.title,
          settingEn: scene.settingEn,
          goalEn: scene.goalEn,
          character: scene.character,
          targets,
          history: [...enc.history, { role: 'hero', text }],
          turn: enc.turn + 1,
          totalTurns: scene.turns.length,
        })
        const current = get().run
        if (!current || current.phase !== 'encounter' || !current.encounter) return
        if (reply) {
          const check = reply.check
          const verdict: TurnVerdict = {
            ok: check ? check.ok || (check.usedTarget && check.errors.length === 0) : true,
            typo: check ? check.errors.length > 0 : false,
            corrections: check?.errors ?? [],
            ai: true,
          }
          // An answer with errors still counts as a step forward when the character understood it.
          if (check && check.errors.length > 0) verdict.ok = true
          const outcome: SceneOutcome | null = closing ? reply.outcome : null
          await applySceneTurn(current, scene, text, verdict, reply.npcLine || scriptedLine(scene, enc.turn), usedChipIds, outcome, closing ? reply.whyRu : null, t)
          return
        }
        // The AI did not answer: fall back to the script and the self-assessment.
        await persist({ ...current, encounter: { ...current.encounter, phase: 'self', pendingText: text } })
        return
      }
      if (text.trim().length === 0) {
        await applySceneTurn(run, scene, '', { ok: false, typo: false, corrections: [], ai: false }, scriptedLine(scene, enc.turn), [], null, null, t)
        return
      }
      await persist({ ...run, encounter: { ...enc, phase: 'self', pendingText: text } })
    },

    assessScene: async (v) => {
      const { run } = get()
      const enc = run?.encounter
      if (!run || run.phase !== 'encounter' || !enc || enc.phase !== 'self') return
      const scene = seedScenes.find((sc) => sc.id === enc.sceneId)
      if (!scene) return
      const text = enc.pendingText ?? ''
      const usedChipIds = chipsUsedIn(enc, text, new Map(Object.entries(get().items)))
      await applySceneTurn(run, scene, text, { ok: v !== 'fail', typo: v === 'typo', corrections: [], ai: false }, scriptedLine(scene, enc.turn), usedChipIds, null, null, now())
    },

    leaveEncounter: async () => {
      const { run } = get()
      if (!run || run.phase !== 'encounter' || !run.encounter || run.encounter.phase !== 'result') return
      await persist(finishEncounterNode(run))
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
