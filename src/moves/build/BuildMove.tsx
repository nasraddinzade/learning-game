import { useEffect, useState } from 'react'
import { Button } from '@/ui/Button'
import { checkTask } from '../tasks'
import type { BuildTask, MoveProps } from '../types'

interface Tile {
  id: number
  text: string
}

/** Сборка (stage 2): assemble the English sentence from tiles; some tiles are traps. */
export function BuildMove({ task, onSubmit, onInteract }: MoveProps<BuildTask>) {
  const [pool, setPool] = useState<Tile[]>(() => task.tiles.map((text, id) => ({ id, text })))
  const [chosen, setChosen] = useState<Tile[]>([])

  function pick(t: Tile) {
    onInteract?.()
    setPool((p) => p.filter((x) => x.id !== t.id))
    setChosen((c) => [...c, t])
  }
  function unpick(t: Tile) {
    setChosen((c) => c.filter((x) => x.id !== t.id))
    setPool((p) => [...p, t])
  }
  function submit() {
    if (chosen.length === 0) return
    onSubmit(checkTask(task, chosen.map((t) => t.text).join(' '), false))
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter') submit()
      if (e.key === 'Backspace' && chosen.length > 0) unpick(chosen[chosen.length - 1] as Tile)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen])

  return (
    <div className="flex flex-col gap-3" data-testid="move-build">
      <p className="text-lg font-medium" data-testid="build-ru">
        {task.sentenceRu}
      </p>
      <div
        className="flex min-h-16 flex-wrap gap-2 rounded-card border border-dashed border-line bg-bg-raised p-2"
        data-testid="build-answer"
        aria-label="Собранное предложение"
      >
        {chosen.length === 0 ? <span className="self-center px-2 text-sm text-fg-faint">Нажимай на слова ниже</span> : null}
        {chosen.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => unpick(t)}
            className="tap rounded-xl bg-accent px-3 text-base font-semibold text-bg active:scale-95"
          >
            {t.text}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" data-testid="build-pool">
        {pool.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid="build-tile"
            onClick={() => pick(t)}
            className="tap rounded-xl border border-line bg-bg-card px-3 text-base font-medium active:scale-95"
          >
            {t.text}
          </button>
        ))}
      </div>
      <Button full data-testid="build-submit" disabled={chosen.length === 0} onClick={submit}>
        Удар
      </Button>
    </div>
  )
}
