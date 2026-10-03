import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { patternDef } from '@/db/patternRepo'
import { TrapMove } from '@/moves/trap/TrapMove'
import { routeForRun, useRunStore } from '@/store/run'
import { Button } from '@/ui/Button'
import { Hearts } from '@/ui/Hearts'

function Fire() {
  return (
    <svg viewBox="0 0 120 90" className="mx-auto h-28 w-auto" role="img" aria-label="Костёр">
      <ellipse cx="60" cy="78" rx="40" ry="8" fill="#ffb547" opacity="0.25" />
      <path d="M30 76 L90 76" stroke="#2a3144" strokeWidth="6" strokeLinecap="round" />
      <motion.path
        d="M52 72 q-10 -22 8 -40 q0 16 12 20 q4 -12 12 -16 q-2 26 -14 36z"
        fill="#ffb547"
        animate={{ scaleY: [1, 1.08, 0.96, 1], scaleX: [1, 0.96, 1.04, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originX: '60px', originY: '72px' }}
      />
      <motion.path
        d="M56 72 q-3 -12 6 -22 q2 9 6 12 q0 -6 3 -9 q0 16 -9 22z"
        fill="#fff3d6"
        animate={{ scaleY: [1, 1.15, 0.9, 1] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originX: '60px', originY: '72px' }}
      />
    </svg>
  )
}

/** Привал (SPEC §5.2): heal and five Ловушка exercises on an active pattern. */
export function RestScreen() {
  const navigate = useNavigate()
  const s = useRunStore()

  useEffect(() => {
    void s.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!s.loaded) return
    const route = routeForRun(s.run)
    if (route !== '/rest') navigate(route, { replace: true })
  }, [s.run, s.loaded, navigate])

  useEffect(() => {
    if (!s.run?.rest?.feedback) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter') void s.nextTrap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.run?.rest?.feedback])

  const run = s.run
  const rest = run?.rest ?? null
  if (!run || !rest) {
    return (
      <main data-testid="screen-rest" className="flex min-h-full items-center justify-center text-fg-muted">
        …
      </main>
    )
  }
  const def = patternDef(rest.patternId)
  const exIndex = rest.exercises[rest.index]
  const exercise = def && exIndex !== undefined ? def.exercises[exIndex] : undefined
  const total = rest.exercises.length
  const clean = rest.done && total > 0 && rest.correct === total

  return (
    <main data-testid="screen-rest" className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[440px] flex-col gap-3 px-4 pb-6">
      <header className="flex h-12 items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">🔥 Привал</h1>
        <Hearts hp={run.hp} maxHp={run.maxHp} />
      </header>
      <Fire />
      <p className="text-center text-sm text-fg-muted" data-testid="rest-heal">
        Здоровье восстановлено.{' '}
        {def ? `Тренировка у костра: ${def.title.toLowerCase()}.` : 'Все правила уже выучены, просто отдохни.'}
      </p>

      {def && !rest.done ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-fg-faint">
            <span data-testid="rest-progress">
              {rest.index + 1} из {total}
            </span>
            <span>верно: {rest.correct}</span>
          </div>
          <p className="text-sm text-fg-muted">{def.explainRu}</p>
          {exercise && !rest.feedback ? (
            <TrapMove key={`${rest.index}`} exercise={exercise} onSubmit={(r) => void s.answerTrap(r)} />
          ) : null}
          {rest.feedback ? (
            <div
              className={`rounded-card border p-4 ${rest.feedback.correct ? 'border-ok/40 bg-ok/10' : 'border-danger/40 bg-danger/10'}`}
              data-testid="trap-feedback"
              data-correct={rest.feedback.correct ? 'true' : 'false'}
            >
              <p className={`font-bold ${rest.feedback.correct ? 'text-ok' : 'text-danger'}`}>{rest.feedback.correct ? 'Верно' : 'Мимо'}</p>
              <p className="mt-1 text-fg">{rest.feedback.fixed}</p>
              <p className="text-sm text-fg-muted">{rest.feedback.ruleRu}</p>
              <Button full className="mt-3" data-testid="trap-next" onClick={() => void s.nextTrap()} autoFocus>
                Дальше
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {rest.done ? (
        <section className="mt-auto flex flex-col gap-3" data-testid="rest-done">
          {total > 0 ? (
            <p className="text-center">
              {clean ? (
                <span className="font-semibold text-ok">Чистая тренировка! Бесплатное усиление ждёт.</span>
              ) : (
                <span className="text-fg-muted">
                  Верно {rest.correct} из {total}. Правило ещё вернётся.
                </span>
              )}
            </p>
          ) : null}
          <Button full className="h-14 text-lg" data-testid="rest-leave" onClick={() => void s.leaveRest()}>
            Идти дальше
          </Button>
        </section>
      ) : null}
    </main>
  )
}
