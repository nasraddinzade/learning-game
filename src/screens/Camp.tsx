import { Link } from 'react-router-dom'
import { useProfileStore } from '@/store/profile'
import { Button } from '@/ui/Button'

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
    <svg
      viewBox="0 0 360 170"
      className="h-auto w-full"
      role="img"
      aria-label="Путник у костра"
    >
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
      <rect width="360" height="170" rx="20" fill="url(#sky)" />
      <circle cx="300" cy="38" r="14" fill="#e8ecf5" opacity="0.9" />
      <circle cx="60" cy="30" r="1.5" fill="#e8ecf5" opacity="0.7" />
      <circle cx="120" cy="52" r="1" fill="#e8ecf5" opacity="0.5" />
      <circle cx="210" cy="24" r="1.2" fill="#e8ecf5" opacity="0.6" />
      <circle cx="250" cy="70" r="1" fill="#e8ecf5" opacity="0.4" />
      <path d="M0 120 Q60 95 120 118 T240 112 T360 120 V170 H0Z" fill="#161c2b" />
      <path d="M0 140 Q90 120 180 142 T360 138 V170 H0Z" fill="#11151f" />
      <ellipse cx="230" cy="146" rx="60" ry="26" fill="url(#glow)" />
      <path d="M224 146 q-6 -14 6 -24 q0 10 8 12 q2 -8 8 -10 q-2 16 -10 24z" fill="#ffb547" />
      <path d="M228 148 q-2 -8 4 -14 q2 6 4 8 q0 -4 2 -6 q0 10 -6 14z" fill="#fff3d6" />
      <g fill="#0b0d12">
        <circle cx="150" cy="104" r="9" />
        <path d="M136 148 q0 -34 14 -36 q14 2 14 36z" />
        <path d="M133 118 l-8 12 M167 118 l10 10" stroke="#0b0d12" strokeWidth="5" strokeLinecap="round" />
      </g>
    </svg>
  )
}

export function CampScreen() {
  const profile = useProfileStore((s) => s.profile)
  if (!profile) return null

  return (
    <main
      data-testid="screen-camp"
      className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[440px] flex-col gap-4 px-4 pb-6"
    >
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Лагерь</h1>
        <div className="flex items-center gap-3 text-sm text-fg-muted">
          <span title="Серия дней">🔥 {profile.streak}</span>
          <span title="Уровень">⭐ {profile.level}</span>
          <span title="Руны" data-testid="camp-runes">
            ◆ {profile.runes}
          </span>
        </div>
      </header>

      <HeroScene />

      <div className="flex gap-2">
        <Counter label="должники" value={0} testId="count-debts" />
        <Counter label="повторения" value={0} testId="count-reviews" />
        <Counter label="новые" value={0} testId="count-new" />
      </div>

      <div className="flex flex-col gap-2">
        <Button full className="h-14 text-lg" data-testid="btn-run" disabled title="Появится на этапе 1">
          В поход
        </Button>
        <Button full variant="secondary" data-testid="btn-sortie" disabled title="Появится на этапе 2">
          Вылазка · 2 минуты
        </Button>
        <p className="text-center text-xs text-fg-faint">Бой появится на этапе 1, поход на этапе 2</p>
      </div>

      <div className="rounded-2xl border border-line p-4 text-sm text-fg-muted">
        <p className="font-medium text-fg">Немезид пока нет</p>
        <p>Фраза становится немезидой после трёх провалов. Она будет приходить, пока ты её не победишь.</p>
      </div>

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
