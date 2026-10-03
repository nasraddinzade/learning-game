// Run map generation (SPEC §5.2). Six steps of 2–3 nodes plus the Echo. Rules: Ambush first
// without a choice when debts exist, at least one Rest, exactly one Lair when a nemesis is
// active (never before step 3), no two equal types in a row along a path, Encounter at most once.
import { mulberry32, rngInt, rngPick, rngShuffle, type Rng } from '@/engine/rng'
import type { MapNode, NodeType } from '@/types'
import { balance } from './balance'

export interface MapInput {
  seed: number
  hasDebts: boolean
  hasNemesis: boolean
  /** Встречи need scenes (stage 5); until then they are not placed. */
  allowEncounter?: boolean
}

export const NODE_LABEL_RU: Record<NodeType, string> = {
  ambush: 'Засада',
  skirmish: 'Стычка',
  scout: 'Разведка',
  lair: 'Логово',
  rest: 'Привал',
  encounter: 'Встреча',
  echo: 'Эхо',
}

export const NODE_ICON: Record<NodeType, string> = {
  ambush: '🌫️',
  skirmish: '⚔️',
  scout: '🔭',
  lair: '🩸',
  rest: '🔥',
  encounter: '💬',
  echo: '👁️',
}

export const NODE_HINT_RU: Record<NodeType, string> = {
  ambush: 'Должники из прошлого похода',
  skirmish: '4–5 врагов из повторений',
  scout: 'Новые фразы, меньше риска',
  lair: 'Немезида. Три удара без ошибки',
  rest: '+2 здоровья и тренировка у костра',
  encounter: 'Сцена, где язык решает исход',
  echo: 'Финальный босс из твоих ошибок',
}

function stepTypes(rng: Rng, step: number, input: MapInput, used: { lair: boolean; encounter: boolean }): NodeType[] {
  const count = rngInt(rng, 2, 3)
  const types: NodeType[] = []
  for (let i = 0; i < count; i++) {
    const pool: NodeType[] = ['skirmish', 'skirmish', 'scout', 'rest']
    if (input.hasNemesis && !used.lair && step >= balance.map.lairMinStep) pool.push('lair', 'lair')
    if (input.allowEncounter && !used.encounter && step >= 1) pool.push('encounter')
    let t = rngPick(rng, pool)
    // No duplicates within a step so every choice is a real choice.
    let tries = 0
    while (types.includes(t) && tries < 10) {
      t = rngPick(rng, pool)
      tries++
    }
    if (types.includes(t)) continue
    types.push(t)
    if (t === 'lair') used.lair = true
    if (t === 'encounter') used.encounter = true
  }
  return types
}

/** Connects each node to 1–2 nodes of the next step, never to the same type. */
function connect(rng: Rng, from: MapNode[], to: MapNode[]): void {
  for (const node of from) {
    const candidates = to.map((n, i) => ({ n, i })).filter(({ n }) => n.type !== node.type)
    const picks = rngShuffle(rng, candidates).slice(0, rngInt(rng, 1, Math.min(2, candidates.length)))
    node.next = picks.map((p) => p.i).sort((a, b) => a - b)
  }
  // Every node of the next step must be reachable.
  to.forEach((n, i) => {
    if (from.some((f) => f.next.includes(i))) return
    const donors = from.filter((f) => f.type !== n.type)
    const donor = donors.length > 0 ? rngPick(rng, donors) : null
    if (donor) donor.next = [...donor.next, i].sort((a, b) => a - b)
  })
}

export function generateMap(input: MapInput): MapNode[][] {
  const rng = mulberry32(input.seed)
  for (let attempt = 0; attempt < 50; attempt++) {
    const used = { lair: false, encounter: false }
    const steps: MapNode[][] = []
    for (let step = 0; step < balance.map.steps; step++) {
      let types: NodeType[]
      if (step === 0 && input.hasDebts) types = ['ambush']
      else types = stepTypes(rng, step, input, used)
      steps.push(types.map((type) => ({ type, next: [], done: false })))
    }
    steps.push([{ type: 'echo', next: [], done: false }])
    for (let i = 0; i < steps.length - 1; i++) connect(rng, steps[i] as MapNode[], steps[i + 1] as MapNode[])
    if (isValidMap(steps, input)) return steps
  }
  throw new Error('generateMap: could not satisfy the rules')
}

/** Checks every rule; used by generation and by tests. */
export function isValidMap(steps: MapNode[][], input: MapInput): boolean {
  if (steps.length !== balance.map.steps + 1) return false
  const last = steps[steps.length - 1]
  if (!last || last.length !== 1 || last[0]?.type !== 'echo') return false
  const first = steps[0]
  if (!first) return false
  if (input.hasDebts && (first.length !== 1 || first[0]?.type !== 'ambush')) return false
  if (!input.hasDebts && first.some((n) => n.type === 'ambush')) return false
  let rests = 0
  let lairs = 0
  let encounters = 0
  for (let s = 0; s < steps.length - 1; s++) {
    const step = steps[s] as MapNode[]
    if (s > 0 && (step.length < 2 || step.length > 3)) return false
    for (let i = 0; i < step.length; i++) {
      const node = step[i] as MapNode
      if (node.type === 'rest') rests++
      if (node.type === 'lair') {
        lairs++
        if (s < balance.map.lairMinStep || !input.hasNemesis) return false
      }
      if (node.type === 'encounter') encounters++
      if (node.next.length === 0) return false
      const nextStep = steps[s + 1] as MapNode[]
      for (const j of node.next) {
        const target = nextStep[j]
        if (!target) return false
        if (target.type === node.type) return false
      }
    }
    // Reachability: every node in the next step has an incoming edge.
    const nextStep = steps[s + 1] as MapNode[]
    for (let j = 0; j < nextStep.length; j++) if (!step.some((n) => n.next.includes(j))) return false
  }
  if (input.hasNemesis && lairs !== 1) return false
  return rests >= 1 && lairs <= 1 && encounters <= 1
}

/** The nodes the hero can walk to from `position` (or any node of step 0 at the start). */
export function reachableNodes(map: MapNode[][], position: { step: number; node: number } | null): number[] {
  if (position === null) return (map[0] ?? []).map((_, i) => i)
  const node = map[position.step]?.[position.node]
  return node ? node.next : []
}

/** How many steps ahead are visible (2 by default, Следопыт adds one). */
export function visibleSteps(hasPathfinder: boolean): number {
  return balance.map.visibleSteps + (hasPathfinder ? 1 : 0)
}
