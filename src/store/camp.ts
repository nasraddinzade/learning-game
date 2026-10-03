import { create } from 'zustand'
import { lands as landDefs } from '@/content/seed'
import { unlockedLandIds } from '@/engine/lands'
import { activeNemeses } from '@/engine/nemesis'
import { queueCounts, type QueueCounts } from '@/engine/scheduler'
import { balance } from '@/game/balance'
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
    const pm = new Map(progress.map((p) => [p.itemId, p]))
    const unlockedLands = unlockedLandIds(landDefs.map((l) => l.id), items, pm, balance.lands.unlockAfter)
    const counts = queueCounts({ items, progress, now: now(), newPerDay, unlockedLands })
    const byId = new Map(items.map((i) => [i.id, i]))
    const nemeses = activeNemeses(progress)
      .map((p) => {
        const item = byId.get(p.itemId)
        return item ? { item, progress: p } : null
      })
      .filter((x): x is NemesisCard => x !== null)
    set({ counts, nemeses, hasActiveRun: run !== undefined && run.status === 'active', totalItems: items.length })
    // Tomorrow's contexts, unfinished life phrases and nemesis mnemonics, once a day (SPEC §10.2).
    void import('@/ai/daily').then((m) => m.runDailyAI())
  },
}))
