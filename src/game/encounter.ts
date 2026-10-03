// Встреча node (SPEC §8): a short scene where language decides the outcome. Pure: the AI verdicts
// (or the self-assessment without AI) arrive as inputs; this module keeps the dialogue state,
// the chips and the outcome. Rewards live in balance.encounter.
import { containsTarget } from '@/engine/answerCheck'
import { mulberry32, rngPick, type Rng } from '@/engine/rng'
import type { Correction } from '@/ai/types'
import type { EncounterState, Item, Progress, Run, SceneDef, SceneOutcome } from '@/types'
import { balance } from './balance'

export interface TurnVerdict {
  ok: boolean
  typo: boolean
  corrections: Correction[]
  /** The answer with the errors fixed (context for materialized phrases). */
  corrected?: string
  /** True when the AI judged the answer. */
  ai: boolean
}

export function pickScene(scenes: readonly SceneDef[], rng: Rng): SceneDef {
  if (scenes.length === 0) throw new Error('no scenes')
  return rngPick(rng, scenes)
}

/** Two or three phrases met today, the most advanced first: using one in the scene is a stage-5 hit. */
export function pickChips(run: Run, items: ReadonlyMap<string, Item>, progress: ReadonlyMap<string, Progress>): string[] {
  const seen = [...new Set(run.stats.seenItemIds)].filter((id) => items.has(id) && !id.startsWith('pattern:'))
  const stageOf = (id: string) => progress.get(id)?.stage ?? 0
  const ranked = seen.filter((id) => stageOf(id) >= balance.encounter.chipStageMin).sort((a, b) => stageOf(b) - stageOf(a))
  const fallback = seen.filter((id) => !ranked.includes(id))
  return [...ranked, ...fallback].slice(0, balance.encounter.chips)
}

export function startEncounterNode(
  run: Run,
  position: { step: number; node: number },
  scenes: readonly SceneDef[],
  items: ReadonlyMap<string, Item>,
  progress: ReadonlyMap<string, Progress>,
  now: number,
): Run {
  const rng = mulberry32((run.seed ^ ((position.step + 1) * 0x7f4a7c15)) >>> 0)
  const scene = pickScene(scenes, rng)
  const encounter: EncounterState = {
    sceneId: scene.id,
    turn: 0,
    history: [{ role: 'npc', text: scene.opening }],
    chips: pickChips(run, items, progress).map((itemId) => ({ itemId, used: false })),
    answers: [],
    corrections: [],
    outcome: null,
    whyRu: null,
    phase: 'talk',
    pendingText: null,
    turnStartedAt: now,
    runes: 0,
  }
  return { ...run, position, phase: 'encounter', encounter }
}

/** Chips whose phrase appears in the answer (not yet used). */
export function chipsUsedIn(state: EncounterState, text: string, items: ReadonlyMap<string, Item>): string[] {
  return state.chips
    .filter((c) => !c.used)
    .map((c) => items.get(c.itemId))
    .filter((i): i is Item => i !== undefined && containsTarget(text, [i.en, ...i.accept]).ok)
    .map((i) => i.id)
}

/** Without AI the outcome follows the self-assessments: no fails is a success, one is partial. */
export function outcomeFromAnswers(answers: readonly { ok: boolean }[]): SceneOutcome {
  const fails = answers.filter((a) => !a.ok).length
  return fails === 0 ? 'success' : fails === 1 ? 'partial' : 'fail'
}

export interface TurnInput {
  text: string
  verdict: TurnVerdict
  npcLine: string
  usedChipIds: readonly string[]
  /** The AI's outcome on the closing turn; computed from the answers when null. */
  outcome: SceneOutcome | null
  whyRu: string | null
  now: number
}

/** Applies the learner's answer and the character's reply; closes the scene after the last turn. */
export function applyTurn(state: EncounterState, scene: SceneDef, input: TurnInput): EncounterState {
  const answers = [...state.answers, { text: input.text, ok: input.verdict.ok, typo: input.verdict.typo, ai: input.verdict.ai }]
  const history = [...state.history, { role: 'hero' as const, text: input.text || '(молчание)' }]
  if (input.npcLine) history.push({ role: 'npc' as const, text: input.npcLine })
  const chips = state.chips.map((c) => (input.usedChipIds.includes(c.itemId) ? { ...c, used: true } : c))
  const corrections = [...state.corrections, ...input.verdict.corrections]
  const turn = state.turn + 1
  const closing = turn >= scene.turns.length
  const outcome = closing ? (input.outcome ?? outcomeFromAnswers(answers)) : null
  return {
    ...state,
    turn,
    history,
    chips,
    answers,
    corrections,
    outcome,
    whyRu: closing ? input.whyRu : null,
    phase: closing ? 'result' : 'talk',
    pendingText: null,
    turnStartedAt: input.now,
    runes: closing && outcome ? balance.encounter.runes[outcome] : state.runes,
  }
}

/** The scripted line that follows the learner's current answer (also the closing line). */
export function scriptedLine(scene: SceneDef, turn: number): string {
  return scene.turns[turn]?.npcLine ?? ''
}

/** Leaves the scene: the node is done, runes join the run, the map continues. */
export function finishEncounterNode(run: Run): Run {
  const map = run.map.map((step, s) =>
    step.map((n, i) => (run.position && s === run.position.step && i === run.position.node ? { ...n, done: true } : n)),
  )
  const runes = run.runes + (run.encounter?.runes ?? 0)
  return { ...run, map, runes, encounter: null, phase: 'map' }
}
