import { SpeakButton } from '@/ui/SpeakButton'
import { TextAnswer } from '@/ui/TextAnswer'
import { checkTask } from '../tasks'
import type { DictationTask, MoveProps } from '../types'

/** Диктант (stage 3): the sentence is spoken; type it whole. One replay allowed. */
export function DictationMove({ task, onSubmit, onInteract }: MoveProps<DictationTask>) {
  return (
    <div className="flex flex-col gap-3" data-testid="move-dictation">
      <div className="flex items-center justify-between gap-3 rounded-card bg-bg-card p-4">
        <p className="text-sm text-fg-muted">Напечатай, что услышал. Переслушать можно один раз.</p>
        <SpeakButton text={task.sentenceEn} auto limit={2} label="Ещё раз" testId="dictation-play" />
      </div>
      <TextAnswer
        placeholder="Что прозвучало?"
        multiline
        onInteract={onInteract}
        onSubmit={(text) => onSubmit(checkTask(task, text, false))}
      />
    </div>
  )
}
