// Queue building and the load regulator (SPEC §4.6).
// Priority: debts → nemeses → reviews → new. New items are capped per day and dropped
// entirely when debts + reviews exceed the overload threshold.
import type { Item, Progress } from '@/types'
import { dayKey } from './clock'
import { activeNemeses } from './nemesis'
import { isDue } from './progress'

export const OVERLOAD_THRESHOLD = 30
export const DEFAULT_NEW_PER_DAY = 6

export type QueueKind = 'debt' | 'nemesis' | 'review' | 'new'

export interface QueueEntry {
  itemId: string
  kind: QueueKind
}

export interface SchedulerInput {
  items: readonly Item[]
  progress: readonly Progress[]
  now: number
  newPerDay: number
  /** Battle size. Omit for the whole queue. */
  limit?: number
  /** Only items of these lands may be introduced as new. Omit for all lands. */
  unlockedLands?: readonly string[]
}

export interface QueueCounts {
  debts: number
  nemeses: number
  reviews: number
  /** New items that may still be introduced today after the regulator. */
  newAllowed: number
  newIntroducedToday: number
}

function byId(progress: readonly Progress[]): Map<string, Progress> {
  const m = new Map<string, Progress>()
  for (const p of progress) m.set(p.itemId, p)
  return m
}

export function newIntroducedToday(progress: readonly Progress[], now: number): number {
  const today = dayKey(now)
  let n = 0
  for (const p of progress) {
    if (p.introducedAt !== null && dayKey(p.introducedAt) === today) n++
  }
  return n
}

export function newAllowedToday(input: {
  newPerDay: number
  introducedToday: number
  debts: number
  reviews: number
}): number {
  if (input.debts + input.reviews > OVERLOAD_THRESHOLD) return 0
  return Math.max(0, input.newPerDay - input.introducedToday)
}

export function buildQueue(input: SchedulerInput): QueueEntry[] {
  const { items, progress, now, newPerDay, limit, unlockedLands } = input
  const today = dayKey(now)
  const itemIds = new Set(items.map((i) => i.id))
  const known = byId(progress)

  const nemesisIds = new Set(
    activeNemeses(progress)
      .filter((p) => itemIds.has(p.itemId) && !(p.nemesis?.defeatedDays.includes(today) ?? false))
      .map((p) => p.itemId),
  )

  const debts: QueueEntry[] = []
  const reviews: { entry: QueueEntry; due: number }[] = []
  for (const p of progress) {
    if (!itemIds.has(p.itemId) || nemesisIds.has(p.itemId) || p.stage === 0) continue
    if (p.inDebt) debts.push({ itemId: p.itemId, kind: 'debt' })
    else if (isDue(p, now)) reviews.push({ entry: { itemId: p.itemId, kind: 'review' }, due: p.fsrs.due.getTime() })
  }
  reviews.sort((a, b) => a.due - b.due)

  const nemeses: QueueEntry[] = [...nemesisIds].map((itemId) => ({ itemId, kind: 'nemesis' }))

  const allowed = newAllowedToday({
    newPerDay,
    introducedToday: newIntroducedToday(progress, now),
    debts: debts.length,
    reviews: reviews.length,
  })
  const fresh: QueueEntry[] = []
  // Items "from life" go first (SPEC §9.2), then authored order (createdAt).
  const candidates = [...items].sort(
    (a, b) => Number(b.source === 'life') - Number(a.source === 'life') || a.createdAt - b.createdAt,
  )
  for (const item of candidates) {
    if (fresh.length >= allowed) break
    if (unlockedLands && item.source === 'seed' && !unlockedLands.includes(item.land)) continue
    const p = known.get(item.id)
    if (!p || p.stage === 0) fresh.push({ itemId: item.id, kind: 'new' })
  }

  const queue = [...debts, ...nemeses, ...reviews.map((r) => r.entry), ...fresh]
  return limit === undefined ? queue : queue.slice(0, limit)
}

export function queueCounts(input: Omit<SchedulerInput, 'limit'>): QueueCounts {
  const full = buildQueue(input)
  const count = (kind: QueueKind) => full.filter((e) => e.kind === kind).length
  const debts = count('debt')
  const reviews = count('review')
  const introducedToday = newIntroducedToday(input.progress, input.now)
  return {
    debts,
    nemeses: count('nemesis'),
    reviews,
    newAllowed: count('new'),
    newIntroducedToday: introducedToday,
  }
}
