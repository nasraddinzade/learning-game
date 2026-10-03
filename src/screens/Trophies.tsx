import { useEffect, useState } from 'react'
import { allItems } from '@/db/repos'
import { useCampStore } from '@/store/camp'
import { useProfileStore } from '@/store/profile'
import { EnemySprite } from '@/ui/EnemySprite'
import { Screen } from '@/ui/Screen'
import type { Item } from '@/types'

/** Зал трофеев (SPEC §7.2): destroyed nemeses, and the ones still hunting. */
export function TrophiesScreen() {
  const profile = useProfileStore((s) => s.profile)
  const camp = useCampStore()
  const [items, setItems] = useState<Record<string, Item>>({})

  useEffect(() => {
    void camp.refresh()
    void allItems().then((list) => {
      const map: Record<string, Item> = {}
      for (const i of list) map[i.id] = i
      setItems(map)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const log = profile?.trophyLog ?? []

  return (
    <Screen title="Зал трофеев" back="/" testId="screen-trophies">
      {camp.nemeses.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-danger uppercase">Сейчас охотятся</h2>
          {camp.nemeses.map(({ item, progress }) => (
            <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-danger/40 p-3" data-testid="nemesis-card">
              <EnemySprite itemId={item.id} kind="nemesis" scars={progress.nemesis?.winsOverHero ?? 0} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{item.en}</p>
                <p className="truncate text-xs text-fg-muted">
                  побед над тобой: {progress.nemesis?.winsOverHero ?? 0} · твоих: {progress.nemesis?.defeatedDays.length ?? 0} из 3
                </p>
                {progress.nemesis?.mnemonic ? (
                  <p className="text-xs text-fg-faint" data-testid="nemesis-mnemonic">
                    💡 {progress.nemesis.mnemonic}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-faint uppercase">Повержены навсегда</h2>
        {log.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line p-6 text-center">
            <span className="text-4xl" aria-hidden="true">
              🏺
            </span>
            <p className="text-fg-muted">Пока пусто. Немезида попадает сюда после побед над ней в три разных дня.</p>
          </div>
        ) : (
          [...log].reverse().map((t) => {
            const item = items[t.itemId]
            return (
              <div key={`${t.itemId}-${t.date}`} className="flex items-center gap-3 rounded-2xl bg-bg-card p-3" data-testid="trophy">
                <div className="relative">
                  <EnemySprite itemId={t.itemId} kind="shadow" size={48} />
                  <span className="absolute -right-1 -bottom-1 text-lg" aria-hidden="true">
                    🏆
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item?.en ?? t.itemId}</p>
                  <p className="truncate text-xs text-fg-muted">{item?.ru ?? ''}</p>
                  <p className="text-xs text-fg-faint">
                    {t.date} · побед над тобой: {t.winsOverHero} · дней борьбы: {t.daysFought}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </section>
    </Screen>
  )
}
