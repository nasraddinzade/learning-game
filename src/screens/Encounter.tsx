import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, MotionConfig } from 'motion/react'
import { aiAvailable } from '@/ai/ai'
import { seedScenes } from '@/content/scenes'
import { balance } from '@/game/balance'
import { listen, recognitionAvailable, stopListening } from '@/speech/recognition'
import { useProfileStore } from '@/store/profile'
import { routeForRun, useRunStore } from '@/store/run'
import { Button } from '@/ui/Button'
import { fx } from '@/ui/fx'
import { SpeakButton } from '@/ui/SpeakButton'
import { TextAnswer } from '@/ui/TextAnswer'
import { useKeys } from '@/ui/keys'
import type { SceneOutcome } from '@/types'

const OUTCOME_RU: Record<SceneOutcome, { title: string; emoji: string; cls: string }> = {
  success: { title: 'Успех', emoji: '🎉', cls: 'text-ok' },
  partial: { title: 'Частично', emoji: '🤝', cls: 'text-accent' },
  fail: { title: 'Не вышло', emoji: '💨', cls: 'text-danger' },
}

/** Countdown for one answer (SPEC §8: 25 seconds); on zero the answer is sent empty. */
function Clock({ startedAt, ms, onExpire }: { startedAt: number; ms: number; onExpire: () => void }) {
  const [left, setLeft] = useState(ms)
  const fired = useRef(false)
  useEffect(() => {
    fired.current = false
    let lastTick = 0
    const id = setInterval(() => {
      const l = Math.max(0, ms - (Date.now() - startedAt))
      setLeft(l)
      const sec = Math.ceil(l / 1000)
      if (sec !== lastTick && sec <= 5 && sec > 0) {
        lastTick = sec
        fx.tick()
      }
      if (l === 0 && !fired.current) {
        fired.current = true
        clearInterval(id)
        fx.timeUp()
        onExpire()
      }
    }, 200)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, ms])
  const sec = Math.ceil(left / 1000)
  return (
    <span className={`shrink-0 whitespace-nowrap text-sm font-bold tabular-nums ${sec <= 5 ? 'text-danger' : 'text-fg-muted'}`} data-testid="scene-clock">
      {sec} с
    </span>
  )
}

/** Встреча (SPEC §8): a scene where the answer changes the outcome. */
export function EncounterScreen() {
  const navigate = useNavigate()
  const s = useRunStore()
  const voice = useProfileStore((p) => p.profile?.settings.ttsVoice ?? 'en-US')
  const [listening, setListening] = useState(false)
  const supported = recognitionAvailable()

  useEffect(() => {
    void s.load()
    return () => stopListening()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!s.loaded) return
    const route = routeForRun(s.run)
    if (route !== '/encounter') navigate(route, { replace: true })
  }, [s.run, s.loaded, navigate])

  const run = s.run
  const enc = run?.encounter ?? null
  useKeys({ '1': () => void s.assessScene('ok'), '2': () => void s.assessScene('typo'), '3': () => void s.assessScene('fail') }, enc?.phase === 'self')
  const scene = enc ? seedScenes.find((sc) => sc.id === enc.sceneId) : undefined
  if (!run || run.phase !== 'encounter' || !enc || !scene) {
    return (
      <main data-testid="screen-encounter" className="flex min-h-full items-center justify-center text-fg-muted">
        …
      </main>
    )
  }

  const total = scene.turns.length
  const turnDef = scene.turns[enc.turn]
  const withAI = aiAvailable()

  async function record() {
    setListening(true)
    const r = await listen(voice, balance.voice.listenMs)
    setListening(false)
    if (r) void s.answerScene(r.transcripts[0] ?? '')
  }

  return (
    <MotionConfig reducedMotion="user">
    <main data-testid="screen-encounter" className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[440px] flex-col gap-3 px-4 pb-6">
      <header className="flex h-14 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            {scene.emoji}
          </span>
          <h1 className="min-w-0 truncate text-lg font-bold" data-testid="scene-title">
            {scene.title}
          </h1>
        </div>
        <span className="shrink-0 whitespace-nowrap text-xs text-fg-muted" data-testid="scene-turn">
          {enc.phase === 'result' ? 'итог' : `реплика ${enc.turn + 1} из ${total}`}
        </span>
      </header>

      <div className="rounded-card bg-bg-card p-3 text-base">
        <p className="text-fg-muted">{scene.settingRu}</p>
        <p className="mt-1 font-semibold">Цель: {scene.goalRu}</p>
      </div>

      {enc.chips.length > 0 ? (
        <div className="flex flex-wrap gap-1" data-testid="scene-chips">
          {enc.chips.map((c) => {
            const it = s.items[c.itemId]
            return (
              <span
                key={c.itemId}
                data-testid="scene-chip"
                data-used={c.used ? 'true' : 'false'}
                className={`rounded-full px-3 py-1 text-sm ${c.used ? 'bg-ok/20 text-ok line-through' : 'bg-accent/15 text-accent'}`}
              >
                {c.used ? '✓ ' : ''}
                {it?.en ?? c.itemId}
              </span>
            )
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-2" data-testid="scene-history">
        {enc.history.map((h, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            data-testid={h.role === 'npc' ? 'npc-line' : 'hero-line'}
            className={`max-w-[88%] rounded-2xl px-3 py-2 text-lg leading-snug ${h.role === 'npc' ? 'self-start bg-bg-card' : 'self-end bg-accent/20'}`}
          >
            {h.role === 'npc' ? (
              <span className="flex items-start gap-2">
                <span>{h.text}</span>
                <SpeakButton text={h.text} auto={i === enc.history.length - 1 && enc.phase === 'talk'} testId={`npc-speak-${i}`} />
              </span>
            ) : (
              h.text
            )}
          </motion.div>
        ))}
      </div>

      {enc.phase === 'talk' && turnDef ? (
        <section className="mt-auto flex flex-col gap-2" data-testid="scene-answer">
          <div className="flex items-center justify-between">
            <p className="min-w-0 flex-1 text-base text-fg-muted" data-testid="scene-hint">
              {turnDef.hintRu}
            </p>
            <Clock startedAt={enc.turnStartedAt} ms={balance.encounter.answerMs} onExpire={() => void s.answerScene('')} />
          </div>
          <div className="flex items-start gap-2">
            {supported ? (
              <button
                type="button"
                data-testid="scene-record"
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
              <TextAnswer placeholder="Ответь по-английски…" multiline submitLabel="Сказать" onSubmit={(t) => void s.answerScene(t)} />
            </div>
          </div>
          {!withAI ? <p className="text-xs text-fg-faint">Без ИИ сцена идёт по сценарию: после ответа сравни себя с образцом.</p> : null}
        </section>
      ) : null}

      {enc.phase === 'checking' ? (
        <p className="mt-auto text-center text-sm text-fg-muted" data-testid="ai-checking">
          Проверяю…
        </p>
      ) : null}

      {enc.phase === 'self' && turnDef ? (
        <section className="mt-auto flex flex-col gap-2 rounded-card bg-bg-card p-3" data-testid="scene-self">
          <p className="text-sm text-fg-muted">Ты сказал:</p>
          <p className="rounded-xl bg-bg px-3 py-2 text-base" data-testid="scene-pending">
            {enc.pendingText || '(молчание)'}
          </p>
          <p className="text-sm text-fg-muted">Образец:</p>
          <p className="flex items-start justify-between gap-2 rounded-xl bg-bg px-3 py-2 text-base">
            <span data-testid="scene-sample">{turnDef.sampleEn}</span>
            <SpeakButton text={turnDef.sampleEn} testId="scene-sample-speak" />
          </p>
          <p className="text-sm text-fg-muted">Честно: как получилось?</p>
          <div className="grid grid-cols-3 gap-2">
            <Button className="min-w-0 px-1! text-sm leading-tight" data-testid="scene-self-ok" onClick={() => void s.assessScene('ok')}>
              Верно
            </Button>
            <Button variant="secondary" className="min-w-0 px-1! text-sm leading-tight" data-testid="scene-self-typo" onClick={() => void s.assessScene('typo')}>
              С ошибкой
            </Button>
            <Button variant="danger" className="min-w-0 px-1! text-sm leading-tight" data-testid="scene-self-fail" onClick={() => void s.assessScene('fail')}>
              Не смог
            </Button>
          </div>
        </section>
      ) : null}

      {enc.phase === 'result' && enc.outcome ? (
        <section className="mt-auto flex flex-col gap-3" data-testid="scene-result" data-outcome={enc.outcome}>
          <div className="rounded-card bg-bg-card p-4 text-center">
            <p className="text-5xl" aria-hidden="true">
              {OUTCOME_RU[enc.outcome].emoji}
            </p>
            <p className={`mt-1 text-2xl font-bold ${OUTCOME_RU[enc.outcome].cls}`}>{OUTCOME_RU[enc.outcome].title}</p>
            {enc.whyRu ? <p className="mt-1 text-base text-fg-muted">{enc.whyRu}</p> : null}
            <p className="mt-2 font-semibold text-accent" data-testid="scene-runes">
              +{enc.runes} ◆
            </p>
            {enc.chips.some((c) => c.used) ? (
              <p className="mt-1 text-xs text-fg-muted">Использованные фразы получили удар ступени 5.</p>
            ) : null}
          </div>
          {enc.corrections.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-card bg-bg-card p-3 text-sm" data-testid="scene-corrections">
              <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Исправления</p>
              {enc.corrections.map((c, i) => (
                <div key={i} data-testid="correction">
                  <p>
                    <span className="text-danger">❌ {c.wrong}</span> <span className="text-ok">✅ {c.right}</span>
                  </p>
                  {c.ruleRu ? <p className="text-sm text-fg-muted">{c.ruleRu}</p> : null}
                </div>
              ))}
              <p className="text-xs text-fg-muted">Эти ошибки придут врагами в следующий бой.</p>
            </div>
          ) : null}
          <Button full className="h-14 text-lg" data-testid="scene-leave" onClick={() => void s.leaveEncounter()} autoFocus>
            Дальше
          </Button>
        </section>
      ) : null}
    </main>
    </MotionConfig>
  )
}
