// Stages and moves (SPEC §4.2 and §6). A stage defines the weakest move that can hit an enemy.
import type { MoveId, Stage } from '@/types'
import type { Rng } from './rng'
import { rngPick } from './rng'

export const MOVE_STAGE: Record<MoveId, Stage> = {
  intro: 0,
  swipe: 1,
  listen: 1,
  build: 2,
  gap: 2,
  translate: 3,
  dictation: 3,
  voice: 4,
  ownPhrase: 4,
  improv: 5,
  trap: 2, // pattern-only, never picked for items
}

export const MOVE_LABEL_RU: Record<MoveId, string> = {
  intro: 'Знакомство',
  swipe: 'Свайп',
  listen: 'На слух',
  build: 'Сборка',
  gap: 'Пропуск',
  translate: 'Перевод',
  dictation: 'Диктант',
  voice: 'Голос',
  ownPhrase: 'Своя фраза',
  improv: 'Экспромт',
  trap: 'Ловушка',
}

export const STAGE_LABEL_RU: Record<Stage, string> = {
  0: 'новый',
  1: 'узнаю',
  2: 'собираю',
  3: 'вспоминаю',
  4: 'говорю',
  5: 'использую',
}

/** Moves that can be used against an item enemy (not intro, not pattern traps). */
export const ITEM_MOVES: readonly MoveId[] = [
  'swipe',
  'listen',
  'build',
  'gap',
  'translate',
  'dictation',
  'voice',
  'ownPhrase',
  'improv',
]

export function moveStage(move: MoveId): Stage {
  return MOVE_STAGE[move]
}

/** Stage after a successful hit with `move`, from `current`. Risking jumps to the move's stage. */
export function stageAfterHit(current: Stage, move: MoveId, risked: boolean): Stage {
  const up = Math.min(5, current + 1)
  const jump = risked ? Math.max(up, moveStage(move)) : up
  return jump as Stage
}

export function stageAfterMiss(current: Stage): Stage {
  return Math.max(1, current - 1) as Stage
}

export interface PickMoveInput {
  stage: Stage
  /** Moves implemented and allowed right now. */
  enabled: readonly MoveId[]
  /** Moves that must not be used (last move for this item, moves already used on this enemy). */
  excluded?: readonly MoveId[]
  rng: Rng
}

/**
 * Picks a move for an item at `stage`, never one from `excluded` when any alternative exists.
 * Prefers moves of exactly that stage, then the nearest stages (one up before one down),
 * so a debtor always returns in a different shape even when a stage has a single move.
 */
export function pickMove({ stage, enabled, excluded = [], rng }: PickMoveInput): MoveId {
  const pool = enabled.filter((m) => ITEM_MOVES.includes(m))
  if (pool.length === 0) throw new Error('pickMove: no enabled item moves')
  const fresh = pool.filter((m) => !excluded.includes(m))
  const candidates = fresh.length > 0 ? fresh : pool

  const order: number[] = [stage]
  for (let d = 1; d <= 5; d++) {
    if (stage + d <= 5) order.push(stage + d)
    if (stage - d >= 1) order.push(stage - d)
  }
  for (const s of order) {
    const atStage = candidates.filter((m) => moveStage(m) === s)
    if (atStage.length > 0) return rngPick(rng, atStage)
  }
  return rngPick(rng, candidates)
}

/** Moves the player may risk with: enabled item moves above the current move's stage. */
export function riskOptions(current: MoveId, enabled: readonly MoveId[]): MoveId[] {
  const s = moveStage(current)
  return enabled.filter((m) => ITEM_MOVES.includes(m) && moveStage(m) > s)
}
