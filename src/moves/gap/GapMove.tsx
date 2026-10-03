import { useState } from 'react'
import { TextAnswer } from '@/ui/TextAnswer'
import { checkTask } from '../tasks'
import type { GapTask, MoveProps } from '../types'

/** Пропуск (stage 2): type the missing phrase. The hint shows first letters and costs Hard. */
export function GapMove({ task, onSubmit, onInteract }: MoveProps<GapTask>) {
  const [hint, setHint] = useState(false)
  return (
    <div className="flex flex-col gap-3" data-testid="move-gap">
      <p className="text-lg leading-snug" data-testid="gap-sentence">
        {task.before}
        <span className="mx-1 inline-block min-w-20 rounded-lg border-b-2 border-accent bg-accent/10 px-2 text-center text-accent">
          {hint ? task.hint : '…'}
        </span>
        {task.after}
      </p>
      <p className="text-sm text-fg-muted">{task.sentenceRu}</p>
      <TextAnswer
        placeholder="Что пропущено?"
        onInteract={onInteract}
        onSubmit={(text) => onSubmit(checkTask(task, text, hint))}
        extra={
          !hint ? (
            <button
              type="button"
              data-testid="gap-hint"
              onClick={() => setHint(true)}
              className="tap rounded-xl px-3 text-sm text-fg-muted"
            >
              Подсказка
            </button>
          ) : null
        }
      />
    </div>
  )
}
