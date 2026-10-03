import { create } from 'zustand'
import { activeNemeses } from '@/engine/nemesis'
import { queueCounts, type QueueCounts } from '@/engine/scheduler'
import { activeRun, allItems, allProgress } from '@/db/repos'
import type { Item, Progress } from '@/types'
import { now } from './clock'
import { useProfileStore } from './profile'

export interface NemesisCard {
  item: Item
  progress: Progress
}

interface CampState {
  counts: QueueCounts | null
  nemeses: NemesisCard[]
  hasActiveRun: boolean
  totalItems: number
  refresh: () => Promise<void>
}

export const useCampStore = create<CampState>((set) => ({
  counts: null,
  nemeses: [],
  hasActiveRun: false,
  totalItems: 0,
  refresh: async () => {
    const [items, progress, run] = await Promise.all([allItems(), allProgress(), activeRun()])
    const newPerDay = useProfileStore.getState().profile?.settings.newPerDay ?? 6
    const counts = queueCounts({ items, progress, now: now(), newPerDay })
    const byId = new Map(items.map((i) => [i.id, i]))
    const nemeses = activeNemeses(progress)
      .map((p) => {
        const item = byId.get(p.itemId)
        return item ? { item, progress: p } : null
      })
      .filter((x): x is NemesisCard => x !== null)
    set({ counts, nemeses, hasActiveRun: run !== undefined && run.status === 'active', totalItems: items.length })
  },
}))
