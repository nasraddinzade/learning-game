import { useEffect, useState } from 'react'
import { aiAvailable } from '@/ai/ai'
import { balance } from '@/game/balance'
import { listen, recognitionAvailable, stopListening } from '@/speech/recognition'
import { useProfileStore } from '@/store/profile'
import { Button } from '@/ui/Button'
import { SpeakButton } from '@/ui/SpeakButton'
import { TextAnswer } from '@/ui/TextAnswer'
import { useKeys } from '@/ui/keys'
import { checkWithAI } from '../production'
import { checkTask } from '../tasks'
import type { MoveProps, OwnPhraseTask } from '../types'

/**
 * Своя фраза (stage 4, SPEC §6): a question about the learner's life that needs the target phrase.
 * With AI the answer is judged by checkProduction. Without it: the phrase must be present, then
 * three model answers and an honest self-assessment.
 */
export function OwnPhraseMove({ task, item, onSubmit, onInteract }: MoveProps<OwnPhraseTask>) {
  const voice = useProfileStore((s) => s.profile?.settings.ttsVoice ?? 'en-US')
  const [answer, setAnswer] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [listening, setListening] = useState(false)
  const supported = recognitionAvailable()

  useEffect(() => () => stopListening(), [])

  async function submit(text: string) {
    const local = checkTask(task, text, false)
    if (!local.correct) {
      onSubmit(local)
      return
    }
    if (aiAvailable()) {
      setChecking(true)
      const r = await checkWithAI({ answer: text, target: task.targets[0] ?? '', accept: task.targets.slice(1), situation: task.questionEn }, local)
      setChecking(false)
      if (r) {
        onSubmit(r)
        return
      }
    }
    // No AI: the phrase is there; the learner judges the rest against the samples.
    setAnswer(text)
  }

  async function record() {
    onInteract?.()
    setListening(true)
    const result = await listen(voice, balance.voice.listenMs)
    setListening(false)
    if (!result) return
    void submit(result.transcripts[0] ?? '')
  }

  useKeys({ '1': () => selfAssess('ok'), '2': () => selfAssess('typo'), '3': () => selfAssess('fail') }, answer !== null)

  function selfAssess(v: 'ok' | 'typo' | 'fail') {
    const r = checkTask(task, `self:${v}`, false)
    onSubmit({ ...r, answer: answer ?? r.answer })
  }

  return (
    <div className="flex flex-col gap-3" data-testid="move-ownPhrase">
      <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Своя фраза · про тебя</p>
      <p className="text-xl font-medium leading-snug" data-testid="own-question">
        {task.questionEn}
      </p>
      <p className="text-sm text-fg-muted">
        Нужна фраза <span className="font-semibold text-fg">{item.en}</span> · {item.ru}
      </p>

      {answer === null ? (
        <>
          <div className="flex items-start gap-2">
            {supported ? (
              <button
                type="button"
                data-testid="own-record"
                aria-label="Говорить"
                disabled={listening || checking}
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
              <TextAnswer placeholder="Ответь по-английски, своими словами…" multiline onInteract={onInteract} onSubmit={(t) => void submit(t)} />
            </div>
          </div>
          {checking ? (
            <p className="text-sm text-fg-muted" data-testid="ai-checking">
              Проверяю…
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-2" data-testid="own-self">
          <p className="text-sm text-fg-muted">Ты сказал:</p>
          <p className="rounded-xl bg-bg px-3 py-2 text-base" data-testid="own-answer">
            {answer}
          </p>
          <p className="text-sm text-fg-muted">Так говорят носители:</p>
          <ul className="flex flex-col gap-1">
            {task.samples.map((s, i) => (
              <li key={i} className="flex items-start justify-between gap-2 rounded-xl bg-bg-card px-3 py-2 text-sm">
                <span>{s}</span>
                <SpeakButton text={s} testId={`own-sample-speak-${i}`} />
              </li>
            ))}
          </ul>
          <p className="text-sm text-fg-muted">Честно: как получилось?</p>
          <div className="flex gap-2">
            <Button data-testid="own-self-ok" onClick={() => selfAssess('ok')}>
              Верно
            </Button>
            <Button variant="secondary" data-testid="own-self-typo" onClick={() => selfAssess('typo')}>
              С ошибкой
            </Button>
            <Button variant="danger" data-testid="own-self-fail" onClick={() => selfAssess('fail')}>
              Не смог
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
