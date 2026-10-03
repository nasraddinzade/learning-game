// The Echo (SPEC §5.4): the final boss built from this run's mistakes. Each phase is one of
// those items with the hardest available move. A clean run faces the three hardest items of
// the day instead and gets a bonus.
import type { Progress } from '@/types'
import { balance } from './balance'

export interface EchoInput {
  failedItemIds: readonly string[]
  seenItemIds: readonly string[]
  progress: ReadonlyMap<string, Progress>
}

export interface EchoPlan {
  itemIds: string[]
  clean: boolean
}

/** Lower stability means harder to remember. Unknown progress counts as hardest. */
function stability(p: Progress | undefined): number {
  return p ? p.fsrs.stability : -1
}

export function planEcho({ failedItemIds, seenItemIds, progress }: EchoInput): EchoPlan {
  if (failedItemIds.length > 0) {
    return { itemIds: [...new Set(failedItemIds)].slice(0, balance.echo.maxPhases), clean: false }
  }
  const hardest = [...new Set(seenItemIds)]
    .sort((a, b) => stability(progress.get(a)) - stability(progress.get(b)))
    .slice(0, balance.echo.cleanPhases)
  return { itemIds: hardest, clean: true }
}
