import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'motion/react'
import { checkTask } from '../tasks'
import type { MoveProps, SwipeTask } from '../types'

const THRESHOLD = 90

function highlight(sentence: string, phrase: string) {
  const idx = sentence.toLowerCase().indexOf(phrase.toLowerCase())
  if (idx < 0) return <>{sentence}</>
  return (
    <>
      {sentence.slice(0, idx)}
      <mark className="rounded bg-accent/25 px-1 text-accent">{sentence.slice(idx, idx + phrase.length)}</mark>
      {sentence.slice(idx + phrase.length)}
    </>
  )
}

/** Свайп (stage 1): right if the Russian meaning matches the highlighted phrase, left if not. */
export function SwipeMove({ task, onSubmit, onInteract }: MoveProps<SwipeTask>) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-12, 12])
  const yesOpacity = useTransform(x, [20, THRESHOLD], [0, 1])
  const noOpacity = useTransform(x, [-THRESHOLD, -20], [1, 0])
  const [done, setDone] = useState(false)
  const doneRef = useRef(false)

  function decide(dir: 'left' | 'right') {
    if (doneRef.current) return
    doneRef.current = true
    setDone(true)
    void animate(x, dir === 'right' ? 500 : -500, { duration: 0.25 }).then(() => {
      onSubmit(checkTask(task, dir, false))
    })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') decide('right')
      if (e.key === 'ArrowLeft') decide('left')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-3" data-testid="move-swipe">
      <p className="text-center text-sm text-fg-muted">Совпадает ли смысл? Вправо — да, влево — нет</p>
      <div className="relative">
        <motion.div
          drag={done ? false : 'x'}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.9}
          style={{ x, rotate }}
          onDragStart={() => onInteract?.()}
          onDragEnd={(_, info) => {
            if (info.offset.x > THRESHOLD) decide('right')
            else if (info.offset.x < -THRESHOLD) decide('left')
          }}
          className="relative cursor-grab touch-pan-y rounded-card bg-bg-card p-5 shadow-lg active:cursor-grabbing"
          data-testid="swipe-card"
        >
          <motion.span
            style={{ opacity: yesOpacity }}
            className="absolute top-3 right-3 rounded-lg border-2 border-ok px-2 py-0.5 text-sm font-bold text-ok"
          >
            ДА
          </motion.span>
          <motion.span
            style={{ opacity: noOpacity }}
            className="absolute top-3 left-3 rounded-lg border-2 border-danger px-2 py-0.5 text-sm font-bold text-danger"
          >
            НЕТ
          </motion.span>
          <p className="text-lg leading-snug" data-testid="swipe-sentence">
            {highlight(task.sentenceEn, task.phraseEn)}
          </p>
          <p className="mt-4 text-xl font-semibold text-fg" data-testid="swipe-meaning">
            {task.meaningRu}
          </p>
        </motion.div>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          data-testid="swipe-no"
          onClick={() => decide('left')}
          className="tap flex-1 rounded-2xl border border-danger/40 bg-danger/10 py-3 text-lg font-bold text-danger active:scale-95"
        >
          ✕ Нет
        </button>
        <button
          type="button"
          data-testid="swipe-yes"
          onClick={() => decide('right')}
          className="tap flex-1 rounded-2xl border border-ok/40 bg-ok/10 py-3 text-lg font-bold text-ok active:scale-95"
        >
          ✓ Да
        </button>
      </div>
    </div>
  )
}
