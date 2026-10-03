import { useEffect, useRef, useState } from 'react'
import { balance } from '@/game/balance'
import { listen, recognitionAvailable, stopListening } from '@/speech/recognition'
import { useProfileStore } from '@/store/profile'
import { fx } from '@/ui/fx'
import { TextAnswer } from '@/ui/TextAnswer'
import { checkWithAI } from '../production'
import { checkTask } from '../tasks'
import type { ImprovTask, MoveProps } from '../types'

/**
 * Экспромт (stage 5): a situation the item has not shown before, a few seconds to start
 * answering by voice or typing. Not starting in time is a miss.
 */
export function ImprovMove({ task, onSubmit, onInteract }: MoveProps<ImprovTask>) {
  const voice = useProfileStore((s) => s.profile?.settings.ttsVoice ?? 'en-US')
  const [left, setLeft] = useState(task.startWindowMs)
  const [started, setStarted] = useState(false)
  const [listening, setListening] = useState(false)
  const [checking, setChecking] = useState(false)
  const startedRef = useRef(false)
  const submitted = useRef(false)
  const supported = recognitionAvailable()

  function start() {
    if (startedRef.current) return
    startedRef.current = true
    setStarted(true)
    onInteract?.()
  }

  function submit(result: ReturnType<typeof checkTask>) {
    if (submitted.current) return
    submitted.current = true
    // With AI the answer is judged for real errors (SPEC §10.3); the local check stays the gate.
    if (!result.correct || result.answer === '(не начал)') {
      onSubmit(result)
      return
    }
    setChecking(true)
    void checkWithAI({ answer: result.answer, target: task.targets[0] ?? '', accept: task.targets.slice(1), situation: task.promptRu }, result).then((r) => {
      setChecking(false)
      onSubmit(r ?? result)
    })
  }

  useEffect(() => {
    const t0 = Date.now()
    let lastTick = 0
    const id = setInterval(() => {
      if (startedRef.current) {
        clearInterval(id)
        return
      }
      const l = Math.max(0, task.startWindowMs - (Date.now() - t0))
      setLeft(l)
      const sec = Math.ceil(l / 1000)
      if (sec !== lastTick && sec <= 3 && sec > 0) {
        lastTick = sec
        fx.tick()
      }
      if (l === 0) {
        clearInterval(id)
        fx.timeUp()
        submit(checkTask(task, '', false))
      }
    }, 100)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task])

  useEffect(() => () => stopListening(), [])

  async function record() {
    start()
    setListening(true)
    const result = await listen(voice, balance.voice.listenMs)
    setListening(false)
    if (!result) return
    submit(checkTask(task, result.transcripts.join('\n'), false))
  }

  const sec = Math.ceil(left / 1000)

  return (
    <div className="flex flex-col gap-3" data-testid="move-improv" data-started={started ? 'true' : 'false'}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Экспромт · новая ситуация</p>
        {!started ? (
          <span className={`text-sm font-bold tabular-nums ${sec <= 3 ? 'text-danger' : 'text-fg-muted'}`} data-testid="improv-clock">
            {sec} с
          </span>
        ) : null}
      </div>
      <p className="text-xl font-medium leading-snug" data-testid="improv-prompt">
        {task.promptRu}
      </p>
      {checking ? (
        <p className="text-sm text-fg-muted" data-testid="ai-checking">
          Проверяю…
        </p>
      ) : null}
      <div className="flex items-start gap-2">
        {supported ? (
          <button
            type="button"
            data-testid="improv-record"
            aria-label="Говорить"
            disabled={listening}
            onClick={() => void record()}
            className={`tap flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-bg ${listening ? 'animate-pulse bg-danger' : 'bg-accent'}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
        <div className="flex-1">
          <TextAnswer
            placeholder={supported ? 'Или напечатай…' : 'По-английски, быстро…'}
            multiline
            onInteract={start}
            onSubmit={(text) => submit(checkTask(task, text, false))}
          />
        </div>
      </div>
    </div>
  )
}
