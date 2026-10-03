import { useState } from 'react'
import { checkAnswer } from '@/engine/answerCheck'
import { Button } from '@/ui/Button'
import { TextAnswer } from '@/ui/TextAnswer'
import type { TrapExercise } from '@/types'
import { fixedSentence } from './fixedSentence'

export interface TrapResult {
  correct: boolean
  /** What the sentence should read. */
  fixed: string
}

interface Props {
  exercise: TrapExercise
  onSubmit: (result: TrapResult) => void
}

/**
 * Ловушка (pattern): tap the wrong word and type the fix, or confirm the sentence is right.
 * Tapping the right place but fixing it wrongly still counts as a miss: the rule was not applied.
 */
export function TrapMove({ exercise, onSubmit }: Props) {
  const [picked, setPicked] = useState<number | null>(null)
  const fixed = fixedSentence(exercise)

  function allRight() {
    onSubmit({ correct: exercise.wrongIndex === null, fixed })
  }

  function submitFix(text: string) {
    if (picked === null) return
    const placeRight = picked === exercise.wrongIndex
    const fixRight = exercise.fix !== null && exercise.fix !== '' && checkAnswer(text, [exercise.fix]).ok
    onSubmit({ correct: placeRight && fixRight, fixed })
  }

  function removeWord() {
    if (picked === null) return
    onSubmit({ correct: picked === exercise.wrongIndex && exercise.fix === '', fixed })
  }

  return (
    <div className="flex flex-col gap-3" data-testid="move-trap">
      <p className="text-sm text-fg-muted">Найди ошибку и исправь. Если ошибки нет, так и скажи.</p>
      <p className="flex flex-wrap gap-x-1 gap-y-2 text-xl leading-relaxed" data-testid="trap-sentence">
        {exercise.tokens.map((t, i) => (
          <button
            key={i}
            type="button"
            data-testid="trap-token"
            aria-pressed={picked === i}
            onClick={() => setPicked(picked === i ? null : i)}
            className={`rounded-lg px-1.5 py-1 ${
              picked === i ? 'bg-danger/25 text-danger ring-2 ring-danger' : 'active:bg-bg-raised'
            }`}
          >
            {t}
          </button>
        ))}
      </p>
      {picked !== null ? (
        <div className="flex flex-col gap-2 rounded-card bg-bg-card p-3">
          <p className="text-sm text-fg-muted">
            Вместо <span className="font-semibold text-danger">{exercise.tokens[picked]}</span> должно быть:
          </p>
          <TextAnswer
            key={picked}
            placeholder="Как правильно?"
            onSubmit={submitFix}
            extra={
              <button
                type="button"
                data-testid="trap-remove"
                onClick={removeWord}
                className="tap rounded-xl px-3 text-sm text-fg-muted"
              >
                Лишнее слово
              </button>
            }
          />
        </div>
      ) : (
        <Button full variant="secondary" data-testid="trap-all-right" onClick={allRight}>
          Всё правильно
        </Button>
      )}
    </div>
  )
}
