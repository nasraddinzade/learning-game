import { useEffect, useRef, useState } from 'react'
import { balance } from '@/game/balance'
import { listen, recognitionAvailable, stopListening } from '@/speech/recognition'
import { useProfileStore } from '@/store/profile'
import { Button } from '@/ui/Button'
import { SpeakButton } from '@/ui/SpeakButton'
import { checkTask } from '../tasks'
import type { MoveProps, VoiceTask } from '../types'

type Phase = 'idle' | 'listening' | 'heard' | 'nothing'

/**
 * Голос (stage 4): say the situation in English into the microphone. Without recognition
 * the model answer is shown and the player grades themselves (SPEC §6).
 */
export function VoiceMove({ task, onSubmit, onInteract }: MoveProps<VoiceTask>) {
  const voice = useProfileStore((s) => s.profile?.settings.ttsVoice ?? 'en-US')
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState<string[]>([])
  const [tries, setTries] = useState(0)
  const supported = recognitionAvailable()
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stopListening()
    }
  }, [])

  async function record() {
    onInteract?.()
    setPhase('listening')
    const result = await listen(voice, balance.voice.listenMs)
    if (!mounted.current) return
    setTries((t) => t + 1)
    if (!result) {
      setPhase('nothing')
      return
    }
    setHeard(result.transcripts)
    setPhase('heard')
    onSubmit(checkTask(task, result.transcripts.join('\n'), false))
  }

  return (
    <div className="flex flex-col gap-3" data-testid="move-voice" data-supported={supported ? 'true' : 'false'}>
      <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Скажи по-английски</p>
      <p className="text-xl font-medium leading-snug" data-testid="voice-prompt">
        {task.promptRu}
      </p>

      {supported ? (
        <div className="flex flex-col items-center gap-3 rounded-card bg-bg-card p-4">
          <button
            type="button"
            data-testid="voice-record"
            aria-label={phase === 'listening' ? 'Слушаю' : 'Говорить'}
            disabled={phase === 'listening'}
            onClick={() => void record()}
            className={`flex h-20 w-20 items-center justify-center rounded-full text-bg transition-transform active:scale-95 ${
              phase === 'listening' ? 'animate-pulse bg-danger' : 'bg-accent'
            }`}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <p className="text-sm text-fg-muted" data-testid="voice-status">
            {phase === 'idle' ? 'Нажми и говори' : phase === 'listening' ? 'Слушаю…' : phase === 'nothing' ? 'Ничего не расслышал. Попробуй ещё раз' : 'Услышал'}
          </p>
          {heard.length > 0 ? <p className="text-center text-sm text-fg">«{heard[0]}»</p> : null}
          {phase === 'nothing' && tries >= 2 ? (
            <Button variant="ghost" data-testid="voice-fallback" onClick={() => setPhase('idle')}>
              Оценю себя сам
            </Button>
          ) : null}
        </div>
      ) : null}

      {!supported || (phase === 'nothing' && tries >= 2) ? <SelfAssess task={task} onSubmit={onSubmit} /> : null}
    </div>
  )
}

/** Fallback: say it out loud, then compare with the model answer and grade yourself. */
function SelfAssess({ task, onSubmit }: { task: VoiceTask; onSubmit: MoveProps<VoiceTask>['onSubmit'] }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="flex flex-col gap-3 rounded-card bg-bg-card p-4" data-testid="voice-self">
      {!revealed ? (
        <>
          <p className="text-sm text-fg-muted">Распознавание речи недоступно. Скажи вслух, потом сравни с образцом.</p>
          <Button full data-testid="voice-reveal" onClick={() => setRevealed(true)}>
            Сказал, показать образец
          </Button>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold text-fg" data-testid="voice-sample">
            {task.sample}
          </p>
          <div>
            <SpeakButton text={task.sample} auto label="Озвучить образец" />
          </div>
          <p className="text-sm text-fg-muted">Честно: как получилось?</p>
          <div className="grid grid-cols-3 gap-2">
            <Button data-testid="voice-self-ok" onClick={() => onSubmit(checkTask(task, 'self:ok', false))}>
              Верно
            </Button>
            <Button variant="secondary" data-testid="voice-self-typo" onClick={() => onSubmit(checkTask(task, 'self:typo', false))}>
              С ошибкой
            </Button>
            <Button variant="danger" data-testid="voice-self-fail" onClick={() => onSubmit(checkTask(task, 'self:fail', false))}>
              Не смог
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
