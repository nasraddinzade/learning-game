import { useEffect, useState } from 'react'
import { patternDef } from '@/db/patternRepo'
import { db } from '@/db/db'
import { allItems, allProgress } from '@/db/repos'
import { allPatternStats } from '@/db/patternRepo'
import { weeklyReport, type WeeklyReport } from '@/engine/stats'
import { now } from '@/store/clock'
import { useProfileStore } from '@/store/profile'
import { EnemySprite } from '@/ui/EnemySprite'
import { Screen } from '@/ui/Screen'
import type { Item } from '@/types'

const DAY_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`
}

function Tile({ value, label, testId }: { value: string; label: string; testId: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-bg-card px-2 py-3">
      <span className="text-2xl font-bold" data-testid={testId}>
        {value}
      </span>
      <span className="text-xs text-fg-muted">{label}</span>
    </div>
  )
}

/** Статистика (SPEC §13): the week at a glance, accuracy by pattern, the most stubborn nemesis. */
export function StatsScreen() {
  const profile = useProfileStore((s) => s.profile)
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [items, setItems] = useState<Map<string, Item>>(new Map())

  useEffect(() => {
    void Promise.all([db.attempts.toArray(), allProgress(), allPatternStats(), db.runs.toArray(), allItems()]).then(([attempts, progress, patternStats, runs, list]) => {
      setItems(new Map(list.map((i) => [i.id, i])))
      setReport(weeklyReport({ attempts, progress, patternStats, runs, trophyLog: useProfileStore.getState().profile?.trophyLog ?? [], now: now() }))
    })
  }, [])

  if (!report) {
    return (
      <Screen title="Статистика" back="/" testId="screen-stats">
        <p className="text-fg-muted">…</p>
      </Screen>
    )
  }

  const max = Math.max(1, ...report.days.map((d) => d.answers))
  const stubbornItem = report.stubborn ? items.get(report.stubborn.itemId) : undefined

  return (
    <Screen title="Статистика" back="/" testId="screen-stats">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-fg-faint uppercase">Неделя</h2>
      <div className="grid grid-cols-3 gap-2">
        <Tile value={String(report.answers)} label="ответов" testId="stats-answers" />
        <Tile value={pct(report.accuracy)} label="точность" testId="stats-accuracy" />
        <Tile value={String(profile?.streak ?? 0)} label="серия дней" testId="stats-streak" />
      </div>

      <div className="mt-2 rounded-2xl bg-bg-card p-3" data-testid="stats-days">
        <div className="flex h-24 items-end gap-1">
          {report.days.map((d) => {
            const h = d.answers === 0 ? 2 : Math.max(6, Math.round((d.answers / max) * 88))
            const acc = d.answers === 0 ? 0 : d.correct / d.answers
            return (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1" data-testid="stats-day" title={`${d.day}: ${d.correct} из ${d.answers}`}>
                <div className="w-full rounded-t-md bg-line" style={{ height: h }}>
                  <div className="w-full rounded-t-md bg-accent" style={{ height: `${Math.round(acc * 100)}%` }} />
                </div>
                <span className="text-[10px] text-fg-faint">{DAY_RU[new Date(d.day).getDay()]}</span>
              </div>
            )
          })}
        </div>
        <p className="mt-1 text-xs text-fg-muted">Высота столбца это ответы за день, жёлтая часть верные.</p>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Tile value={String(report.introduced)} label="новых фраз" testId="stats-introduced" />
        <Tile value={String(report.tamed)} label="приручено" testId="stats-tamed" />
        <Tile value={`${report.runs.won} из ${report.runs.total}`} label="походов пройдено" testId="stats-runs" />
      </div>

      <h2 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-fg-faint uppercase">Точность по pattern</h2>
      <ul className="flex flex-col gap-2" data-testid="stats-patterns">
        {report.patterns.map((p) => (
          <li key={p.patternId} className="rounded-2xl bg-bg-card px-3 py-2" data-testid="stats-pattern" data-pattern={p.patternId}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{patternDef(p.patternId)?.title ?? p.patternId}</span>
              <span className={p.accuracy !== null && p.accuracy >= 0.9 ? 'text-ok' : 'text-fg-muted'}>
                {pct(p.accuracy)}
                {p.attempts > 0 ? ` · ${p.attempts}` : ''}
                {!p.active ? ' · выучен' : ''}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-line">
              <div className={`h-1.5 rounded-full ${p.accuracy !== null && p.accuracy >= 0.9 ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${Math.round((p.accuracy ?? 0) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-fg-faint uppercase">Самая упорная немезида</h2>
      {report.stubborn && stubbornItem ? (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/40 p-3" data-testid="stats-nemesis">
          <EnemySprite itemId={stubbornItem.id} kind="nemesis" scars={report.stubborn.winsOverHero} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{stubbornItem.en}</p>
            <p className="text-xs text-fg-muted">
              побед над тобой: {report.stubborn.winsOverHero} · дней борьбы: {report.stubborn.days}
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-3 text-sm text-fg-muted" data-testid="stats-nemesis-none">
          Сейчас никто не охотится. {report.trophies > 0 ? `За неделю уничтожено: ${report.trophies}.` : ''}
        </p>
      )}
    </Screen>
  )
}
