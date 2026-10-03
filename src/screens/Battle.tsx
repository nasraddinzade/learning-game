import { Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { MOVE_LABEL_RU, STAGE_LABEL_RU, riskOptions } from '@/engine/moves'
import { enemiesLeft } from '@/game/combat'
import { NODE_ICON, NODE_LABEL_RU } from '@/game/map'
import { MOVE_COMPONENTS, preloadMoves } from '@/moves'
import { canUse } from '@/moves/tasks'
import { IMPLEMENTED_MOVES, type MoveProps } from '@/moves/types'
import { routeForRun, useRunStore, type Feedback } from '@/store/run'
import { now } from '@/store/clock'
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
  echo: 'Эхо',
}

function EnemyHeader({ c, item, shake, down, echoPhase }: { c: Combatant; item: Item; shake: number; down: boolean; echoPhase: string | null }) {
  const nemesis = c.kind === 'nemesis'
  const echo = c.kind === 'echo'
  return (
    <div className="flex flex-col items-center" data-testid="enemy" data-kind={c.kind} data-item={c.itemId}>
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
        <span className={nemesis || echo ? 'text-danger' : c.kind === 'debtor' ? 'text-accent' : 'text-fg-muted'}>
          {KIND_LABEL[c.kind]}
          {echoPhase ? ` · фаза ${echoPhase}` : ''}
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
      <EnemySprite itemId={c.itemId} kind={c.kind} scars={c.winsOverHero} shake={shake} down={down} size={echo ? 150 : 132} />
    </div>
  )
}

function FeedbackPanel({ f, onNext }: { f: Feedback; onNext: () => void }) {
  const closed = f.events.some((e) => e.type === 'enemyDown')
  const leaves = f.events.find((e): e is Extract<typeof e, { type: 'debtorLeaves' }> => e.type === 'debtorLeaves')
  const miss = f.events.find((e): e is Extract<typeof e, { type: 'miss' }> => e.type === 'miss')
  const heals = f.events.filter((e): e is Extract<typeof e, { type: 'comboHeal' | 'boonHeal' | 'secondWind' }> =>
    e.type === 'comboHeal' || e.type === 'boonHeal' || e.type === 'secondWind',
  )
  const chest = f.events.find((e): e is Extract<typeof e, { type: 'chest' }> => e.type === 'chest')
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
          <span className={miss?.spared ? 'text-fg-muted' : 'text-danger'}>{miss?.spared ? 'без урона' : '−1 ❤'}</span>
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
        {heals.map((h, i) => (
          <span key={i} className="text-ok">
            {h.type === 'secondWind' ? 'Второе дыхание!' : h.type === 'comboHeal' ? '+1 ❤ за комбо' : `+❤ ${h.boon === 'hunter' ? 'Охотник' : 'Упрямство'}`}
          </span>
        ))}
        {chest ? <span className="text-accent">Сундук +{chest.runes} ◆</span> : null}
      </div>
      <Button full className="mt-3" data-testid="feedback-next" onClick={onNext} autoFocus>
        Дальше
      </Button>
    </motion.div>
  )
}

function SortieClock({ endsAt, onTimeUp }: { endsAt: number; onTimeUp: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - now()))
  useEffect(() => {
    const id = setInterval(() => {
      const l = Math.max(0, endsAt - now())
      setLeft(l)
      if (l === 0) onTimeUp()
    }, 500)
    return () => clearInterval(id)
  }, [endsAt, onTimeUp])
  const s = Math.ceil(left / 1000)
  return (
    <span className={`tabular-nums ${s <= 15 ? 'text-danger' : 'text-fg-muted'}`} data-testid="sortie-clock">
      ⏱ {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  )
}

export function BattleScreen() {
  const navigate = useNavigate()
  const s = useRunStore()

  useEffect(() => {
    preloadMoves()
    void s.load().then(() => s.resumeBattle())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Leave when the run moves to another phase (boon, map, summary).
  useEffect(() => {
    if (!s.loaded) return
    const route = routeForRun(s.run)
    if (route !== '/battle') navigate(route, { replace: true })
  }, [s.run, s.loaded, navigate])

  const run = s.run
  const combat = run?.combat ?? null
  // During feedback the enemy on screen is the one just fought, not the next in line.
  const current = (s.battlePhase === 'feedback' ? combat?.last : combat?.current) ?? null
  const item = current ? s.items[current.itemId] : undefined
  const progress = current ? s.progress[current.itemId] : undefined
  const node = run?.position ? run.map[run.position.step]?.[run.position.node] : undefined
  const options = useMemo(() => {
    if (!s.move || !item || s.risked || s.move === 'intro' || current?.kind === 'echo') return []
    return riskOptions(s.move, IMPLEMENTED_MOVES).filter((m) => canUse(m, item))
  }, [s.move, item, s.risked, current?.kind])

  const Move = s.move ? MOVE_COMPONENTS[s.move] : undefined
  const echoPhase =
    current?.kind === 'echo' && run?.echoItemIds ? `${run.echoItemIds.indexOf(current.itemId) + 1} из ${run.echoItemIds.length}` : null

  return (
    <main
      data-testid="screen-battle"
      data-phase={s.battlePhase}
      className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[440px] flex-col gap-3 px-4 pb-4"
    >
      <header className="flex h-12 items-center justify-between">
        <button
          type="button"
          aria-label="На карту"
          data-testid="battle-leave"
          onClick={() => navigate('/')}
          className="tap -ml-3 flex items-center justify-center rounded-full text-fg-muted"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        {node ? (
          <span className="text-sm text-fg-muted" data-testid="node-label">
            {NODE_ICON[node.type]} {NODE_LABEL_RU[node.type]}
          </span>
        ) : null}
        {combat && combat.status === 'active' ? (
          <div className="flex items-center gap-3 text-sm text-fg-muted">
            {run?.sortieEndsAt ? <SortieClock endsAt={run.sortieEndsAt} onTimeUp={() => void s.timeUp()} /> : null}
            <span data-testid="enemies-left">врагов: {enemiesLeft(combat)}</span>
            {combat.combo >= 2 ? (
              <span className="font-bold text-accent" data-testid="combo">
                ×{combat.combo}
              </span>
            ) : null}
            <span className="font-semibold text-accent" data-testid="battle-runes">
              ◆ {(run?.runes ?? 0) + combat.runes}
            </span>
          </div>
        ) : null}
      </header>

      {!s.loaded || s.battlePhase === 'idle' || s.battlePhase === 'loading' ? (
        <div className="flex flex-1 items-center justify-center text-fg-muted">Враги собираются…</div>
      ) : null}

      {s.error ? <p className="rounded-2xl bg-danger/10 p-3 text-sm text-danger">{s.error}</p> : null}

      {(s.battlePhase === 'task' || s.battlePhase === 'feedback') && current && item ? (
        <>
          <EnemyHeader
            c={current}
            item={item}
            shake={s.battlePhase === 'feedback' ? s.shake : 0}
            down={s.battlePhase === 'feedback' && (s.feedback?.events.some((e) => e.type === 'enemyDown') ?? false)}
            echoPhase={echoPhase}
          />
          {s.move !== 'intro' ? (
            <div className="flex items-center gap-2">
              <WindupBar startedAt={s.windupStartedAt} durationMs={s.windupMs} paused={s.battlePhase === 'feedback'} />
              <span className="shrink-0 text-xs text-fg-muted" data-testid="move-label">
                {s.move ? MOVE_LABEL_RU[s.move] : ''}
                {s.risked ? ' · риск' : ''}
              </span>
            </div>
          ) : null}

          <section className="flex flex-1 flex-col gap-3">
            {s.battlePhase === 'task' && Move && s.task ? (
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
            {s.battlePhase === 'feedback' && s.feedback ? <FeedbackPanel f={s.feedback} onNext={() => void s.next()} /> : null}
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
