import { Suspense, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { DEBUG } from '@/debug'
import { MOVE_LABEL_RU, STAGE_LABEL_RU, riskOptions } from '@/engine/moves'
import { enemiesLeft } from '@/game/combat'
import { MOVE_COMPONENTS, preloadMoves } from '@/moves'
import { canUse } from '@/moves/tasks'
import { IMPLEMENTED_MOVES, type MoveProps, type MoveTask } from '@/moves/types'
import { useBattleStore, type Feedback, type BattleSummary } from '@/store/battle'
import { Button } from '@/ui/Button'
import { EnemySprite } from '@/ui/EnemySprite'
import { Hearts } from '@/ui/Hearts'
import { WindupBar } from '@/ui/WindupBar'
import type { Combatant, EnemyKind, Item } from '@/types'

const KIND_LABEL: Record<EnemyKind, string> = {
  shadow: 'Тень',
  debtor: 'Должник',
  nemesis: 'Немезида',
  newcomer: 'Новая фраза',
}

/** For e2e: the expected answer of the current task. Compiled out of production builds. */
function debugAnswer(task: MoveTask | null): string | null {
  if (!task) return null
  switch (task.move) {
    case 'swipe':
      return task.matches ? 'right' : 'left'
    case 'build':
    case 'gap':
      return task.expected[0] ?? null
    case 'translate':
      return task.expected[0] ?? null
    default:
      return null
  }
}

function EnemyHeader({ c, item, shake, down }: { c: Combatant; item: Item; shake: number; down: boolean }) {
  const nemesis = c.kind === 'nemesis'
  return (
    <div className="flex flex-col items-center" data-testid="enemy" data-kind={c.kind} data-item={c.itemId}>
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
        <span className={nemesis ? 'text-danger' : c.kind === 'debtor' ? 'text-accent' : 'text-fg-muted'}>
          {KIND_LABEL[c.kind]}
        </span>
        {c.hitsNeeded > 1 ? (
          <span className="flex gap-1" aria-label={`Ударов ${c.hits} из ${c.hitsNeeded}`}>
            {Array.from({ length: c.hitsNeeded }).map((_, i) => (
              <span key={i} className={`h-2 w-2 rounded-full ${i < c.hits ? 'bg-accent' : 'bg-line'}`} />
            ))}
          </span>
        ) : null}
        {nemesis && c.winsOverHero > 0 ? <span className="text-danger">побед над тобой: {c.winsOverHero}</span> : null}
      </div>
      {nemesis ? (
        <p className="text-lg font-bold text-danger" data-testid="enemy-name">
          {item.en}
        </p>
      ) : null}
      <EnemySprite itemId={c.itemId} kind={c.kind} scars={c.winsOverHero} shake={shake} down={down} size={132} />
    </div>
  )
}

function FeedbackPanel({ f, onNext }: { f: Feedback; onNext: () => void }) {
  const closed = f.events.some((e) => e.type === 'enemyDown')
  const leaves = f.events.find((e): e is Extract<typeof e, { type: 'debtorLeaves' }> => e.type === 'debtorLeaves')
  const heal = f.events.some((e) => e.type === 'comboHeal')
  const nemesisWon = f.events.some((e) => e.type === 'nemesisWon')
  const stageUp = f.progressEvents.includes('stageUp')
  const debtClosed = f.progressEvents.includes('debtClosed')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNext])

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={`rounded-card border p-4 ${f.correct ? 'border-ok/40 bg-ok/10' : 'border-danger/40 bg-danger/10'}`}
      data-testid="feedback"
      data-correct={f.correct ? 'true' : 'false'}
    >
      <div className="flex items-baseline justify-between">
        <p className={`text-lg font-bold ${f.correct ? 'text-ok' : 'text-danger'}`}>
          {f.correct ? (f.crit ? 'Перехват! Крит' : 'Удар!') : 'Удар врага'}
        </p>
        {f.correct ? (
          <span className="text-lg font-bold text-accent" data-testid="feedback-runes">
            +{f.runes} ◆
          </span>
        ) : (
          <span className="text-danger">−1 ❤</span>
        )}
      </div>
      {f.correct ? (
        <div className="mt-1 text-sm">
          <p className="text-base font-semibold text-fg">{f.item.en}</p>
          <p className="text-fg-muted">{f.item.ru}</p>
          {f.typo ? <p className="mt-1 text-fg-muted">Опечатка, правильно: {f.expected}</p> : null}
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-1 text-sm">
          <p className="text-fg-muted">❌ {f.answer}</p>
          <p className="font-semibold text-fg" data-testid="feedback-expected">
            ✅ {f.expected}
          </p>
          <p className="text-fg-muted">{f.item.en} — {f.item.ru}</p>
          {f.item.noteRu ? <p className="text-fg-muted">{f.item.noteRu}</p> : null}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
        {f.risked && f.correct ? <span>Рискнул и попал</span> : null}
        {stageUp ? <span>Ступень ↑ {STAGE_LABEL_RU[f.stage]}</span> : null}
        {debtClosed ? <span className="text-ok">Долг закрыт</span> : null}
        {closed && !debtClosed ? <span>Враг повержен</span> : null}
        {leaves ? <span>Ушёл в туман, вернётся через {leaves.returnsIn} отв.</span> : null}
        {nemesisWon ? <span className="text-danger">Сегодня она победила. Вернётся завтра</span> : null}
        {heal ? <span className="text-ok">+1 ❤ за комбо</span> : null}
      </div>
      <Button full className="mt-3" data-testid="feedback-next" onClick={onNext} autoFocus>
        Дальше
      </Button>
    </motion.div>
  )
}

function SummaryPanel({ s, onLeave }: { s: BattleSummary; onLeave: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="summary" data-status={s.status}>
      <div className="text-center">
        <p className="text-5xl" aria-hidden="true">
          {s.status === 'won' ? '🏕️' : '🌫️'}
        </p>
        <h2 className="mt-2 text-2xl font-bold">{s.status === 'won' ? 'Бой выигран' : 'Отступление'}</h2>
        <p className="text-fg-muted">
          {s.status === 'won' ? 'Все враги повержены.' : 'Здоровье кончилось. Руны делятся пополам, долги остаются.'}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-bg-card p-3">
          <p className="text-2xl font-bold text-accent" data-testid="summary-runes">
            {s.runes}
          </p>
          <p className="text-xs text-fg-muted">рун</p>
        </div>
        <div className="rounded-2xl bg-bg-card p-3">
          <p className="text-2xl font-bold">{s.hits}</p>
          <p className="text-xs text-fg-muted">ударов</p>
        </div>
        <div className="rounded-2xl bg-bg-card p-3">
          <p className="text-2xl font-bold">{s.maxCombo}</p>
          <p className="text-xs text-fg-muted">комбо</p>
        </div>
      </div>
      {s.levelUp ? <p className="text-center font-semibold text-accent">Новый уровень {s.levelUp}</p> : null}
      {s.closedDebts.length > 0 ? (
        <Section title="Долги закрыты" items={s.closedDebts} tone="ok" />
      ) : null}
      {s.stillInDebt.length > 0 ? <Section title="Должники ждут" items={s.stillInDebt} tone="accent" /> : null}
      {s.newNemeses.length > 0 ? <Section title="Стали немезидами" items={s.newNemeses} tone="danger" /> : null}
      {s.defeatedNemeses.length > 0 ? <Section title="Немезиды побеждены сегодня" items={s.defeatedNemeses} tone="ok" /> : null}
      <div className="mt-auto">
        <Button full className="h-14 text-lg" data-testid="summary-leave" onClick={onLeave}>
          В лагерь
        </Button>
      </div>
    </div>
  )
}

function Section({ title, items, tone }: { title: string; items: Item[]; tone: 'ok' | 'accent' | 'danger' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : 'text-accent'
  return (
    <div className="rounded-2xl bg-bg-card p-3">
      <p className={`text-xs font-semibold tracking-wide uppercase ${color}`}>{title}</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-sm">
        {items.map((i) => (
          <li key={i.id}>
            <span className="font-medium">{i.en}</span> <span className="text-fg-muted">— {i.ru}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BattleScreen() {
  const navigate = useNavigate()
  const s = useBattleStore()

  useEffect(() => {
    preloadMoves()
    void s.load()
    return () => s.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!DEBUG) return
    ;(window as unknown as { __nemesis?: unknown }).__nemesis = {
      answer: () => debugAnswer(useBattleStore.getState().task),
      state: () => useBattleStore.getState(),
    }
  }, [s.task])

  const combat = s.run?.combat ?? null
  // During feedback the enemy on screen is the one just fought, not the next in line.
  const current = (s.phase === 'feedback' ? combat?.last : combat?.current) ?? null
  const item = current ? s.items[current.itemId] : undefined
  const progress = current ? s.progress[current.itemId] : undefined
  const options = useMemo(() => {
    if (!s.move || !item || s.risked || s.move === 'intro') return []
    return riskOptions(s.move, IMPLEMENTED_MOVES).filter((m) => canUse(m, item))
  }, [s.move, item, s.risked])

  const Move = s.move ? MOVE_COMPONENTS[s.move] : undefined

  return (
    <main
      data-testid="screen-battle"
      data-phase={s.phase}
      className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[440px] flex-col gap-3 px-4 pb-4"
    >
      <header className="flex h-12 items-center justify-between">
        <button
          type="button"
          aria-label="В лагерь"
          data-testid="battle-leave"
          onClick={() => navigate('/')}
          className="tap -ml-3 flex items-center justify-center rounded-full text-fg-muted"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        {combat && combat.status === 'active' ? (
          <div className="flex items-center gap-3 text-sm text-fg-muted">
            <span data-testid="enemies-left">врагов: {enemiesLeft(combat)}</span>
            {combat.combo >= 2 ? (
              <span className="font-bold text-accent" data-testid="combo">
                ×{combat.combo}
              </span>
            ) : null}
            <span className="font-semibold text-accent" data-testid="battle-runes">
              ◆ {combat.runes}
            </span>
          </div>
        ) : null}
      </header>

      {s.phase === 'loading' || s.phase === 'idle' ? (
        <div className="flex flex-1 items-center justify-center text-fg-muted">Враги собираются…</div>
      ) : null}

      {s.error ? <p className="rounded-2xl bg-danger/10 p-3 text-sm text-danger">{s.error}</p> : null}

      {s.phase === 'empty' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center" data-testid="battle-empty">
          <span className="text-5xl" aria-hidden="true">
            🌙
          </span>
          <p className="text-lg font-semibold">Сегодня врагов нет</p>
          <p className="text-sm text-fg-muted">Все повторения сделаны, а новых фраз на сегодня больше нет. Загляни завтра.</p>
          <Button onClick={() => navigate('/')}>В лагерь</Button>
        </div>
      ) : null}

      {s.phase === 'done' && s.summary ? <SummaryPanel s={s.summary} onLeave={() => navigate('/')} /> : null}

      {(s.phase === 'task' || s.phase === 'feedback') && current && item ? (
        <>
          <EnemyHeader
            c={current}
            item={item}
            shake={s.phase === 'feedback' ? s.shake : 0}
            down={s.phase === 'feedback' && (s.feedback?.events.some((e) => e.type === 'enemyDown') ?? false)}
          />
          {s.move !== 'intro' ? (
            <div className="flex items-center gap-2">
              <WindupBar startedAt={s.windupStartedAt} durationMs={s.windupMs} paused={s.phase === 'feedback'} />
              <span className="shrink-0 text-xs text-fg-muted" data-testid="move-label">
                {s.move ? MOVE_LABEL_RU[s.move] : ''}
                {s.risked ? ' · риск' : ''}
              </span>
            </div>
          ) : null}

          <section className="flex flex-1 flex-col gap-3">
            {s.phase === 'task' && Move && s.task ? (
              <motion.div
                key={`${current.itemId}-${s.move}-${s.risked}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <Suspense fallback={<div className="py-6 text-center text-fg-muted">…</div>}>
                  <Move {...({ task: s.task, item, onSubmit: (r) => void s.submit(r) } as MoveProps<never>)} />
                </Suspense>
                {options.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="risk-row">
                    <span className="text-xs text-fg-faint">Рискнуть:</span>
                    {options.map((m) => (
                      <button
                        key={m}
                        type="button"
                        data-testid={`risk-${m}`}
                        onClick={() => s.risk(m)}
                        className="tap rounded-full border border-accent/40 px-3 text-sm text-accent active:bg-accent/10"
                      >
                        {MOVE_LABEL_RU[m]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </motion.div>
            ) : null}
            {s.phase === 'feedback' && s.feedback ? <FeedbackPanel f={s.feedback} onNext={() => void s.next()} /> : null}
          </section>

          <footer className="flex items-center justify-between pt-1">
            <Hearts hp={combat?.hp ?? 0} maxHp={combat?.maxHp ?? 0} />
            <span className="text-xs text-fg-faint" data-testid="stage-label">
              ступень {progress?.stage ?? 0} · {STAGE_LABEL_RU[progress?.stage ?? 0]}
            </span>
          </footer>
        </>
      ) : null}
    </main>
  )
}
