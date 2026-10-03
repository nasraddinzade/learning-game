// Test hooks on window for the dev panel session and Playwright (dev and e2e builds only).
import { seedPatterns } from '@/content/patterns'
import { expectedAnswerOf } from '@/moves/tasks'
import { useRunStore } from '@/store/run'
import { fixedSentence } from '@/moves/trap/fixedSentence'
import type { TrapExercise } from '@/types'

export interface DebugHooks {
  state: () => ReturnType<typeof useRunStore.getState>
  answer: () => string | null
  /** The current Привал exercise with its solution. */
  trap: () => (TrapExercise & { fixed: string }) | null
}

export function installDebugHooks(): void {
  const hooks: DebugHooks = {
    state: () => useRunStore.getState(),
    answer: () => expectedAnswerOf(useRunStore.getState().task),
    trap: () => {
      const rest = useRunStore.getState().run?.rest
      if (!rest) return null
      const def = seedPatterns.find((p) => p.id === rest.patternId)
      const idx = rest.exercises[rest.index]
      const ex = def && idx !== undefined ? def.exercises[idx] : undefined
      return ex ? { ...ex, fixed: fixedSentence(ex) } : null
    },
  }
  ;(window as unknown as { __nemesis: DebugHooks }).__nemesis = hooks
}
