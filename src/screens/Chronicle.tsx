import { useEffect, useMemo, useState } from 'react'
import { lands } from '@/content/seed'
import { allItems, allProgress } from '@/db/repos'
import { creatureStatus, landProgress, STATUS_LABEL_RU, unlockedLandIds, type CreatureStatus } from '@/engine/lands'
import { STAGE_LABEL_RU } from '@/engine/moves'
import { balance } from '@/game/balance'
import { EnemySprite } from '@/ui/EnemySprite'
import { Screen } from '@/ui/Screen'
import type { Item, Progress } from '@/types'

const STATUS_COLOR: Record<CreatureStatus, string> = {
  unseen: 'text-fg-faint',
  met: 'text-fg-muted',
  wounded: 'text-accent',
  tamed: 'text-ok',
}

/** Летопись и Земли (SPEC §7.2): every creature with a status, per-land progress. */
export function ChronicleScreen() {
  const [items, setItems] = useState<Item[]>([])
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map())
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([allItems(), allProgress()]).then(([i, p]) => {
      setItems(i)
      setProgress(new Map(p.map((x) => [x.itemId, x])))
    })
  }, [])

  const unlocked = useMemo(
    () => unlockedLandIds(lands.map((l) => l.id), items, progress, balance.lands.unlockAfter),
    [items, progress],
  )
  const stats = useMemo(() => lands.map((l) => ({ land: l, p: landProgress(l.id, items, progress) })), [items, progress])
  const totals = stats.reduce(
    (acc, s) => ({ total: acc.total + s.p.total, met: acc.met + s.p.met, tamed: acc.tamed + s.p.tamed }),
    { total: 0, met: 0, tamed: 0 },
  )

  return (
    <Screen title="Летопись" back="/" testId="screen-chronicle">
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col items-center rounded-2xl bg-bg-card px-2 py-3">
          <span className="text-2xl font-bold" data-testid="chronicle-met">
            {totals.met}
          </span>
          <span className="text-xs text-fg-muted">встречено из {totals.total}</span>
        </div>
        <div className="flex flex-1 flex-col items-center rounded-2xl bg-bg-card px-2 py-3">
          <span className="text-2xl font-bold text-ok" data-testid="chronicle-tamed">
            {totals.tamed}
          </span>
          <span className="text-xs text-fg-muted">приручено</span>
        </div>
        <div className="flex flex-1 flex-col items-center rounded-2xl bg-bg-card px-2 py-3">
          <span className="text-2xl font-bold text-accent" data-testid="chronicle-lands">
            {unlocked.length}
          </span>
          <span className="text-xs text-fg-muted">земель из {lands.length}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {stats.map(({ land, p }) => {
          const isOpen = unlocked.includes(land.id)
          const expanded = open === land.id
          const pct = Math.round(p.share * 100)
          return (
            <div key={land.id} className={`rounded-2xl bg-bg-card ${isOpen ? '' : 'opacity-60'}`} data-testid={`land-${land.id}`} data-open={isOpen ? 'true' : 'false'}>
              <button
                type="button"
                disabled={!isOpen}
                onClick={() => setOpen(expanded ? null : land.id)}
                className="tap flex w-full items-center gap-3 px-4 py-3 text-left"
                aria-expanded={expanded}
              >
                <span className="text-2xl" aria-hidden="true">
                  {isOpen ? land.emoji : '🔒'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{land.name}</span>
                  <span className="block text-xs text-fg-muted">
                    {isOpen ? `${p.met} из ${p.total} встречено · ${p.tamed} приручено` : `откроется, когда предыдущая земля встречена на ${balance.lands.unlockAfter} фраз`}
                  </span>
                  <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-bg-raised">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </span>
                </span>
                <span className="text-sm text-fg-muted" data-testid={`land-${land.id}-pct`}>
                  {pct}%
                </span>
              </button>
              {expanded ? (
                <ul className="grid grid-cols-1 gap-1 px-3 pb-3">
                  {items
                    .filter((i) => i.land === land.id)
                    .map((i) => {
                      const pr = progress.get(i.id)
                      const st = creatureStatus(pr)
                      return (
                        <li key={i.id} className="flex items-center gap-2 rounded-xl px-1 py-1" data-status={st}>
                          <span className={st === 'unseen' ? 'opacity-30 grayscale' : ''}>
                            <EnemySprite itemId={i.id} kind={pr?.nemesis ? 'nemesis' : 'shadow'} size={32} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{st === 'unseen' ? '???' : i.en}</span>
                            <span className="block truncate text-xs text-fg-faint">{st === 'unseen' ? '' : i.ru}</span>
                          </span>
                          <span className={`shrink-0 text-xs ${STATUS_COLOR[st]}`}>
                            {STATUS_LABEL_RU[st]}
                            {st === 'wounded' && pr ? ` · ${STAGE_LABEL_RU[pr.stage]}` : ''}
                          </span>
                        </li>
                      )
                    })}
                </ul>
              ) : null}
            </div>
          )
        })}
      </div>
    </Screen>
  )
}
