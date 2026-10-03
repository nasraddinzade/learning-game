import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCampStore } from '@/store/camp'
import { useProfileStore } from '@/store/profile'
import { useRunStore } from '@/store/run'
import { Button } from '@/ui/Button'
import { EnemySprite } from '@/ui/EnemySprite'

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

function CampLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <Link
      to={to}
      className="tap flex items-center gap-3 rounded-2xl bg-bg-card px-4 py-3 active:bg-bg-raised"
    >
      <span className="text-xl" aria-hidden="true">
        {icon}
      </span>
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-fg-faint" aria-hidden="true">
        ›
      </span>
    </Link>
  )
}

/** Hero silhouette: a lone wanderer by a fire, inline SVG only (SPEC §12). */
function HeroScene() {
  return (
    <svg viewBox="0 0 360 150" className="h-auto w-full" role="img" aria-label="Путник у костра">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2238" />
          <stop offset="1" stopColor="#0b0d12" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffb547" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="360" height="150" rx="20" fill="url(#sky)" />
      <circle cx="300" cy="34" r="13" fill="#e8ecf5" opacity="0.9" />
      <circle cx="60" cy="28" r="1.5" fill="#e8ecf5" opacity="0.7" />
      <circle cx="120" cy="48" r="1" fill="#e8ecf5" opacity="0.5" />
      <circle cx="210" cy="22" r="1.2" fill="#e8ecf5" opacity="0.6" />
      <circle cx="250" cy="64" r="1" fill="#e8ecf5" opacity="0.4" />
      <path d="M0 104 Q60 80 120 102 T240 96 T360 104 V150 H0Z" fill="#161c2b" />
      <path d="M0 124 Q90 104 180 126 T360 122 V150 H0Z" fill="#11151f" />
      <ellipse cx="230" cy="128" rx="60" ry="24" fill="url(#glow)" />
      <path d="M224 128 q-6 -14 6 -24 q0 10 8 12 q2 -8 8 -10 q-2 16 -10 24z" fill="#ffb547" />
      <path d="M228 130 q-2 -8 4 -14 q2 6 4 8 q0 -4 2 -6 q0 10 -6 14z" fill="#fff3d6" />
      <g fill="#0b0d12">
        <circle cx="150" cy="90" r="9" />
        <path d="M136 132 q0 -34 14 -36 q14 2 14 36z" />
        <path d="M133 104 l-8 12 M167 104 l10 10" stroke="#0b0d12" strokeWidth="5" strokeLinecap="round" />
      </g>
    </svg>
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

  async function go(kind: 'run' | 'sortie') {
    if (!camp.hasActiveRun) await useRunStore.getState().startRun(kind)
    navigate(kind === 'sortie' || camp.hasActiveRun ? routeAfterStart() : '/run')
  }
  function routeAfterStart() {
    const run = useRunStore.getState().run
    return run?.phase === 'battle' ? '/battle' : run?.phase === 'rest' ? '/rest' : run?.phase === 'boon' ? '/boon' : '/run'
  }

  return (
    <main
      data-testid="screen-camp"
      className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[440px] flex-col gap-4 px-4 pb-6"
    >
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Лагерь</h1>
        <div className="flex items-center gap-3 text-sm text-fg-muted">
          <span title="Серия дней" data-testid="camp-streak">
            🔥 {profile.streak}
          </span>
          <span title="Уровень" data-testid="camp-level">
            ⭐ {profile.level}
          </span>
          <span title="Руны" data-testid="camp-runes">
            ◆ {profile.runes}
          </span>
        </div>
      </header>

      <HeroScene />

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
        <CampLink to="/life" icon="✍️" label="Из жизни" />
        <CampLink to="/chronicle" icon="📜" label="Летопись и земли" />
        <CampLink to="/trophies" icon="🏆" label="Зал трофеев" />
        <CampLink to="/stats" icon="📈" label="Статистика" />
        <CampLink to="/settings" icon="⚙️" label="Настройки" />
      </nav>
    </main>
  )
}
