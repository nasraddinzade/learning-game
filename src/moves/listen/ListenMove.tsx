import { useEffect } from 'react'
import { SpeakButton } from '@/ui/SpeakButton'
import { checkTask } from '../tasks'
import type { ListenTask, MoveProps } from '../types'

/** На слух (stage 1): the sentence is spoken, not shown; choose its meaning among three. */
export function ListenMove({ task, onSubmit, onInteract }: MoveProps<ListenTask>) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const i = Number(e.key) - 1
      if (i >= 0 && i < task.options.length) onSubmit(checkTask(task, String(i), false))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [task, onSubmit])

  return (
    <div className="flex flex-col gap-3" data-testid="move-listen">
      <div className="flex flex-col items-center gap-2 rounded-card bg-bg-card p-4">
        <p className="text-sm text-fg-muted">Слушай и выбери, о чём речь</p>
        <SpeakButton text={task.sentenceEn} auto size="lg" label="Прослушать" onPlay={onInteract} testId="listen-play" />
      </div>
      <div className="flex flex-col gap-2">
        {task.options.map((o, i) => (
          <button
            key={i}
            type="button"
            data-testid={`listen-option-${i}`}
            onClick={() => onSubmit(checkTask(task, String(i), false))}
            className="tap flex items-center gap-3 rounded-2xl border border-line bg-bg-card px-4 py-3 text-left text-base active:border-accent active:bg-bg-raised"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-raised text-xs text-fg-muted">{i + 1}</span>
            <span>{o}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
