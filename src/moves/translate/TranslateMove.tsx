import { TextAnswer } from '@/ui/TextAnswer'
import { checkTask } from '../tasks'
import type { MoveProps, TranslateTask } from '../types'

/** Перевод (stage 3): say it in English from scratch. */
export function TranslateMove({ task, onSubmit, onInteract }: MoveProps<TranslateTask>) {
  return (
    <div className="flex flex-col gap-3" data-testid="move-translate">
      <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">
        {task.mode === 'situation' ? 'Скажи по-английски' : 'Переведи'}
      </p>
      <p className="text-xl font-medium leading-snug" data-testid="translate-prompt">
        {task.promptRu}
      </p>
      <TextAnswer
        placeholder="По-английски…"
        multiline={task.mode === 'situation'}
        onInteract={onInteract}
        onSubmit={(text) => onSubmit(checkTask(task, text, false))}
      />
    </div>
  )
}
