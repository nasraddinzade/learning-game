// Shared AI check for production moves (Своя фраза, Экспромт, Встреча): maps checkProduction to a
// MoveResult. Returns null when the AI is off or failed, so the caller keeps its local verdict.
import { checkProduction } from '@/ai/ai'
import type { ProductionCheck } from '@/ai/types'
import type { ProductionInput } from '@/ai/prompts'
import type { MoveResult } from './types'

/** Law 2 stays intact: the verdict is still "correct / typo / miss"; the AI only decides which. */
export function resultFromCheck(check: ProductionCheck, answer: string, expected: string): MoveResult {
  const correct = check.usedTarget
  return {
    correct,
    hintUsed: false,
    // Real errors with the phrase still used count as a hit with a slip (Hard), like a typo.
    typo: correct && check.errors.length > 0,
    answer,
    expected: check.corrected && correct ? check.corrected : expected,
    corrections: check.errors,
    moreNatural: check.moreNatural,
    aiChecked: true,
  }
}

export async function checkWithAI(input: ProductionInput, local: MoveResult): Promise<MoveResult | null> {
  const check = await checkProduction(input)
  if (!check) return null
  return resultFromCheck(check, local.answer, local.expected)
}
