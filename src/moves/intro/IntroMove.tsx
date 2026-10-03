import { useKeys } from '@/ui/keys'
import { Button } from '@/ui/Button'
import { SpeakButton } from '@/ui/SpeakButton'
import type { IntroTask, MoveProps } from '../types'

/**
 * Знакомство (stage 0): show the phrase, its meaning and a real-life example.
 * "Повторил вслух" moves the item to stage 1. "Знаю" is handled by the battle screen as a
 * risk with Перевод, so here it submits answer 'know'.
 */
export function IntroMove({ task, item, onSubmit }: MoveProps<IntroTask>) {
  // Enter = "Повторил вслух" on a keyboard (SPEC §12).
  useKeys({ Enter: () => onSubmit({ correct: true, hintUsed: false, typo: false, answer: 'repeat', expected: '' }) })
  return (
    <div className="flex flex-col gap-4" data-testid="move-intro">
      <div className="rounded-card bg-bg-card p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-2xl font-bold text-accent" data-testid="intro-en">
            {item.en}
          </p>
          <SpeakButton text={item.en} auto testId="intro-speak" />
        </div>
        <p className="mt-1 text-xl text-fg">{item.ru}</p>
        <p className="mt-4 text-lg leading-relaxed text-fg">{task.contextEn}</p>
        <p className="text-base text-fg-muted">{task.contextRu}</p>
        {item.noteRu ? <p className="mt-3 text-base leading-relaxed text-fg-muted">{item.noteRu}</p> : null}
      </div>
      {/* Sticks to the bottom edge while a long card scrolls, so the answer is always one tap away. */}
      <div className="sticky bottom-2 flex gap-2 rounded-2xl bg-bg/90 py-1 backdrop-blur-sm">
        <Button
          full
          data-testid="intro-repeat"
          onClick={() => onSubmit({ correct: true, hintUsed: false, typo: false, answer: 'repeat', expected: '' })}
        >
          Повторил вслух
        </Button>
        <Button
          variant="secondary"
          data-testid="intro-know"
          onClick={() => onSubmit({ correct: true, hintUsed: false, typo: false, answer: 'know', expected: '' })}
        >
          Знаю
        </Button>
      </div>
    </div>
  )
}
