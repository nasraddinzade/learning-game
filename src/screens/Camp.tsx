import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { levelForXp, xpForLevel } from '@/game/balance'
import { useCampStore } from '@/store/camp'
import { useProfileStore } from '@/store/profile'
import { useRunStore } from '@/store/run'
import { Button } from '@/ui/Button'
import { EnemySprite } from '@/ui/EnemySprite'
import { HeroScene } from '@/ui/HeroScene'

function Counter({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl bg-bg-card px-2 py-3">
      <span className="text-2xl font-bold tabular-nums" data-testid={testId}>
        {value}
      </span>
      <span className="text-xs text-fg-muted">{label}</span>
    </div>
  )
}

function CampLink({ to, icon, label, hint, testId }: { to: string; icon: string; label: string; hint?: string; testId?: string }) {
  return (
    <Link to={to} data-testid={testId} className="tap flex items-center gap-3 rounded-2xl bg-bg-card px-4 py-3 active:bg-bg-raised">
      <span className="text-xl" aria-hidden="true">
        {icon}
      </span>
      <span className="font-medium">{label}</span>
      {hint ? <span className="ml-auto text-xs text-fg-muted">{hint}</span> : null}
      <span className={`${hint ? '' : 'ml-auto'} text-fg-faint`} aria-hidden="true">
        ›
      </span>
    </Link>
  )
}

export function CampScreen() {
  const navigate = useNavigate()
  const profile = useProfileStore((s) => s.profile)
  const camp = useCampStore()

  useEffect(() => {
    void camp.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.settings.newPerDay])

  if (!profile) return null
  const c = camp.counts
  const total = c ? c.debts + c.nemeses + c.reviews + c.newAllowed : 0
  const nothingToday = c !== null && total === 0 && !camp.hasActiveRun
  const canSortie = c !== null && !camp.hasActiveRun && c.debts + c.nemeses + c.reviews > 0

  const level = levelForXp(profile.xp)
  const levelStart = xpForLevel(level)
  const levelEnd = xpForLevel(level + 1)
  const levelPct = Math.round(((profile.xp - levelStart) / Math.max(1, levelEnd - levelStart)) * 100)

  async function go(kind: 'run' | 'sortie') {
    if (!camp.hasActiveRun) await useRunStore.getState().startRun(kind)
    navigate(kind === 'sortie' || camp.hasActiveRun ? routeAfterStart() : '/run')
  }
  function routeAfterStart() {
    const run = useRunStore.getState().run
    return run?.phase === 'battle' ? '/battle' : run?.phase === 'rest' ? '/rest' : run?.phase === 'boon' ? '/boon' : '/run'
  }

  return (
    <main data-testid="screen-camp" className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[440px] flex-col gap-4 px-4 pb-6">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Лагерь</h1>
        <div className="flex items-center gap-3 text-sm text-fg-muted">
          <span title="Серия дней" data-testid="camp-streak">
            🔥 {profile.streak}
            {profile.freezes > 0 ? <span className="text-fg-faint" data-testid="camp-freezes">{` · 🧊${profile.freezes}`}</span> : null}
          </span>
          <span title="Руны" data-testid="camp-runes">
            ◆ {profile.runes}
          </span>
        </div>
      </header>

      <HeroScene look={profile.heroLook} />

      <div className="flex items-center gap-3 rounded-2xl bg-bg-card px-4 py-2" data-testid="camp-level-card">
        <span className="text-sm font-semibold" data-testid="camp-level">
          ⭐ {level}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-raised" aria-label={`Опыт ${levelPct}%`}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${levelPct}%` }} />
        </div>
        <span className="text-xs text-fg-faint tabular-nums">{profile.xp - levelStart} / {levelEnd - levelStart}</span>
      </div>

      <div className="flex gap-2">
        <Counter label="должники" value={c?.debts ?? 0} testId="count-debts" />
        <Counter label="повторения" value={c?.reviews ?? 0} testId="count-reviews" />
        <Counter label="новые" value={c?.newAllowed ?? 0} testId="count-new" />
      </div>

      <div className="flex flex-col gap-2">
        <Button full className="h-14 text-lg" data-testid="btn-run" disabled={nothingToday} onClick={() => void go('run')}>
          {camp.hasActiveRun ? 'Продолжить поход' : 'В поход'}
        </Button>
        <Button full variant="secondary" data-testid="btn-sortie" disabled={!canSortie} onClick={() => void go('sortie')}>
          Вылазка · 2 минуты
        </Button>
        <p className="text-center text-xs text-fg-faint">
          {nothingToday
            ? 'На сегодня всё. Новые фразы и повторения придут завтра.'
            : camp.hasActiveRun
              ? 'Поход не закончен, враги ждут на карте.'
              : 'Поход это 6 узлов и Эхо, минут 10–15. Вылазка это одна Засада на две минуты.'}
        </p>
      </div>

      {camp.nemeses.length > 0 ? (
        <div className="rounded-2xl border border-danger/40 p-3" data-testid="camp-nemeses">
          <p className="text-xs font-semibold tracking-wide text-danger uppercase">Немезиды</p>
          <ul className="mt-2 flex flex-col gap-2">
            {camp.nemeses.map(({ item, progress }) => (
              <li key={item.id} className="flex items-center gap-3">
                <EnemySprite itemId={item.id} kind="nemesis" scars={progress.nemesis?.winsOverHero ?? 0} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.en}</p>
                  <p className="truncate text-xs text-fg-muted">
                    побед над тобой: {progress.nemesis?.winsOverHero ?? 0} · твоих побед: {progress.nemesis?.defeatedDays.length ?? 0} из 3
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-line p-4 text-sm text-fg-muted">
          <p className="font-medium text-fg">Немезид пока нет</p>
          <p>Фраза становится немезидой после трёх провалов. Она будет приходить, пока ты её не победишь.</p>
        </div>
      )}

      <nav className="flex flex-col gap-2" aria-label="Разделы лагеря">
        <CampLink to="/upgrades" icon="⛺" label="Улучшения" hint={`◆ ${profile.runes}`} testId="link-upgrades" />
        <CampLink to="/life" icon="✍️" label="Из жизни" />
        <CampLink to="/chronicle" icon="📜" label="Летопись и земли" hint={`${profile.unlockedLands.length} из 9`} />
        <CampLink to="/trophies" icon="🏆" label="Зал трофеев" hint={profile.trophies.length > 0 ? String(profile.trophies.length) : undefined} />
        <CampLink to="/stats" icon="📈" label="Статистика" />
        <CampLink to="/settings" icon="⚙️" label="Настройки" />
      </nav>
    </main>
  )
}
