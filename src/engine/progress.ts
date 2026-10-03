// Applies one answer to an item's progress: FSRS card, stage, debt, mastery.
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  type Grade,
} from 'ts-fsrs'
import type { MoveId, Progress, Rating } from '@/types'
import { openDebt, payDebt } from './debt'
import { stageAfterHit, stageAfterMiss } from './moves'

export const MASTERED_MIN_INTERVAL_DAYS = 21

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }))

const TO_GRADE: Record<Rating, Grade> = {
  1: FsrsRating.Again,
  2: FsrsRating.Hard,
  3: FsrsRating.Good,
  4: FsrsRating.Easy,
}

export function newProgress(itemId: string, now: number): Progress {
  return {
    itemId,
    stage: 0,
    fsrs: createEmptyCard(new Date(now)),
    lapses: 0,
    failedRunsInRow: 0,
    lastMove: null,
    inDebt: false,
    debtStreak: 0,
    nemesis: null,
    mastered: false,
    introducedAt: null,
  }
}

/** Знакомство: the item is shown, not tested. Stage becomes 1, the FSRS card stays new. */
export function applyIntro(p: Progress, now: number): Progress {
  return {
    ...p,
    stage: p.stage === 0 ? 1 : p.stage,
    lastMove: 'intro',
    introducedAt: p.introducedAt ?? now,
  }
}

export interface AnswerInput {
  move: MoveId
  correct: boolean
  rating: Rating
  risked: boolean
  now: number
}

export type ProgressEvent = 'stageUp' | 'stageDown' | 'debtOpened' | 'debtClosed' | 'mastered'

export interface AnswerOutcome {
  progress: Progress
  events: ProgressEvent[]
}

export function applyAnswer(p: Progress, a: AnswerInput): AnswerOutcome {
  const events: ProgressEvent[] = []
  const { card } = scheduler.next(p.fsrs, new Date(a.now), TO_GRADE[a.rating])
  let next: Progress = {
    ...p,
    fsrs: card,
    lastMove: a.move,
    introducedAt: p.introducedAt ?? a.now,
  }

  if (a.correct) {
    const stage = stageAfterHit(p.stage, a.move, a.risked)
    if (stage > p.stage) events.push('stageUp')
    next = { ...next, stage }
    const paid = payDebt(next)
    next = paid.progress
    if (paid.closed) events.push('debtClosed')
  } else {
    const stage = stageAfterMiss(p.stage)
    if (stage < p.stage) events.push('stageDown')
    next = { ...next, stage, lapses: p.lapses + 1 }
    if (!p.inDebt) events.push('debtOpened')
    next = openDebt(next)
  }

  const mastered = next.stage === 5 && card.scheduled_days >= MASTERED_MIN_INTERVAL_DAYS
  if (mastered && !p.mastered) events.push('mastered')
  next = { ...next, mastered: mastered || (p.mastered && a.correct) }

  return { progress: next, events }
}

export function isDue(p: Progress, now: number): boolean {
  return p.fsrs.due.getTime() <= now
}
