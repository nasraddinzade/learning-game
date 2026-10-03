import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BOONS } from '@/game/boons'
import { useRunStore, type RunSummary } from '@/store/run'
import { Button } from '@/ui/Button'
import type { Item } from '@/types'

function Section({ title, items, tone }: { title: string; items: Item[]; tone: 'ok' | 'accent' | 'danger' | 'muted' }) {
  if (items.length === 0) return null
  const color = tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : 'text-fg-muted'
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

function Stat({ value, label, accent = false }: { value: number | string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-bg-card p-3 text-center">
      <p className={`text-2xl font-bold ${accent ? 'text-accent' : ''}`}>{value}</p>
      <p className="text-xs text-fg-muted">{label}</p>
    </div>
  )
}

function Body({ s, onLeave }: { s: RunSummary; onLeave: () => void }) {
  const won = s.status === 'won'
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="summary" data-status={s.status}>
      <div className="text-center">
        <p className="text-5xl" aria-hidden="true">
          {won ? (s.kind === 'sortie' ? '⚡' : '🏕️') : '🌫️'}
        </p>
        <h2 className="mt-2 text-2xl font-bold">
          {won ? (s.kind === 'sortie' ? 'Вылазка окончена' : 'Поход пройден') : 'Отступление'}
        </h2>
        <p className="text-fg-muted">
          {won
            ? s.cleanRun
              ? 'Чистый поход: ни одной ошибки до Эха. Бонус получен.'
              : 'Эхо развеяно. Выученное остаётся с тобой.'
            : 'Здоровье кончилось. Руны делятся пополам, долги остаются, прогресс по фразам сохранён.'}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={s.runes} label="рун" accent />
        <Stat value={s.hits} label="ударов" />
        <Stat value={s.maxCombo} label="комбо" />
      </div>
      {s.levelUp ? (
        <p className="text-center font-semibold text-accent" data-testid="summary-levelup">
          Новый уровень {s.levelUp}
        </p>
      ) : null}
      {s.boons.length > 0 ? (
        <p className="text-center text-xs text-fg-muted">{s.boons.map((b) => `${BOONS[b].icon} ${BOONS[b].name}`).join(' · ')}</p>
      ) : null}
      <Section title="Выучено (ступень выросла)" items={s.stageUps} tone="muted" />
      <Section title="Приручено" items={s.mastered} tone="ok" />
      <Section title="Долги закрыты" items={s.closedDebts} tone="ok" />
      <Section title="Должники ждут" items={s.stillInDebt} tone="accent" />
      <Section title="Стали немезидами" items={s.newNemeses} tone="danger" />
      <Section title="Немезиды побеждены сегодня" items={s.defeatedNemeses} tone="ok" />
      <div className="mt-auto pt-2">
        <Button full className="h-14 text-lg" data-testid="summary-leave" onClick={onLeave}>
          В лагерь
        </Button>
      </div>
    </div>
  )
}

/** Итог похода (SPEC §13.7). */
export function SummaryScreen() {
  const navigate = useNavigate()
  const s = useRunStore()

  useEffect(() => {
    void s.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Nothing to show (reloaded after leaving): back to the camp.
    if (s.loaded && !s.summary) navigate('/', { replace: true })
  }, [s.loaded, s.summary, navigate])

  return (
    <main data-testid="screen-summary" className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[440px] flex-col gap-3 px-4 pb-6">
      <header className="flex h-12 items-center">
        <h1 className="text-xl font-bold tracking-tight">Итог</h1>
      </header>
      {s.summary ? (
        <Body
          s={s.summary}
          onLeave={() => {
            s.leaveSummary()
            navigate('/')
          }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-fg-muted">…</div>
      )}
    </main>
  )
}
