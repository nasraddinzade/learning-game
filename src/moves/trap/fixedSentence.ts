import type { TrapExercise } from '@/types'

/** The sentence with the wrong token replaced by its fix (or removed when the fix is empty). */
export function fixedSentence(ex: TrapExercise): string {
  if (ex.correct) return ex.correct
  if (ex.wrongIndex === null || ex.fix === null) return ex.tokens.join(' ')
  return ex.tokens
    .map((t, i) => (i === ex.wrongIndex ? ex.fix : t))
    .filter((t) => t !== '')
    .join(' ')
}
