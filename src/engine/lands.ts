// Lands (SPEC §7.2): decks by life sphere. A land opens when enough of the previous one has
// been met. The Летопись shows every item as a creature with a status.
import type { Item, Progress } from '@/types'

export type CreatureStatus = 'unseen' | 'met' | 'wounded' | 'tamed'

export const STATUS_LABEL_RU: Record<CreatureStatus, string> = {
  unseen: 'не встречал',
  met: 'встречал',
  wounded: 'ранен',
  tamed: 'приручён',
}

/** Not met: no progress. Met: introduced. Wounded: stage 2+. Tamed: mastered. */
export function creatureStatus(p: Progress | undefined): CreatureStatus {
  if (!p || p.stage === 0) return 'unseen'
  if (p.mastered) return 'tamed'
  return p.stage >= 2 ? 'wounded' : 'met'
}

export interface LandProgress {
  landId: string
  total: number
  met: number
  wounded: number
  tamed: number
  /** 0..1 share of items met at least once. */
  share: number
}

export function landProgress(landId: string, items: readonly Item[], progress: ReadonlyMap<string, Progress>): LandProgress {
  const own = items.filter((i) => i.land === landId)
  let met = 0
  let wounded = 0
  let tamed = 0
  for (const i of own) {
    const st = creatureStatus(progress.get(i.id))
    if (st !== 'unseen') met++
    if (st === 'wounded' || st === 'tamed') wounded++
    if (st === 'tamed') tamed++
  }
  return { landId, total: own.length, met, wounded, tamed, share: own.length === 0 ? 0 : met / own.length }
}

/**
 * Lands open in order: the first is always open; each next one opens once at least
 * `unlockAfter` items of the previous land have been met.
 */
export function unlockedLandIds(
  order: readonly string[],
  items: readonly Item[],
  progress: ReadonlyMap<string, Progress>,
  unlockAfter: number,
): string[] {
  const open: string[] = []
  for (let i = 0; i < order.length; i++) {
    const id = order[i] as string
    if (i === 0) {
      open.push(id)
      continue
    }
    const prev = landProgress(order[i - 1] as string, items, progress)
    if (prev.met >= Math.min(unlockAfter, prev.total)) open.push(id)
    else break
  }
  return open
}
