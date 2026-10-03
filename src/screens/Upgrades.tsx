import { HERO_LOOKS, THEMES, UPGRADES, canBuy, nextCost, upgradeLevel } from '@/game/upgrades'
import { useProfileStore } from '@/store/profile'
import { Screen } from '@/ui/Screen'
import { Button } from '@/ui/Button'

/** Лагерь: permanent upgrades bought with runes (SPEC §7.2). */
export function UpgradesScreen() {
  const profile = useProfileStore((s) => s.profile)
  const buy = useProfileStore((s) => s.buy)
  const setLook = useProfileStore((s) => s.setLook)
  const setTheme = useProfileStore((s) => s.setTheme)
  if (!profile) return null

  const lookLevel = upgradeLevel(profile, 'heroLook')
  const themeLevel = upgradeLevel(profile, 'theme')

  return (
    <Screen title="Улучшения" back="/" testId="screen-upgrades">
      <div className="flex items-center justify-between rounded-2xl bg-bg-card px-4 py-3">
        <span className="text-fg-muted">Руны</span>
        <span className="text-xl font-bold text-accent" data-testid="upgrades-runes">
          ◆ {profile.runes}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {UPGRADES.map((def) => {
          const level = upgradeLevel(profile, def.id)
          const cost = nextCost(profile, def)
          const affordable = canBuy(profile, def)
          const consumable = def.id === 'freezes'
          return (
            <div key={def.id} className="flex items-center gap-3 rounded-2xl bg-bg-card p-3" data-testid={`upgrade-${def.id}`}>
              <span className="text-2xl" aria-hidden="true">
                {def.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{def.name}</p>
                <p className="text-xs text-fg-muted">{def.text}</p>
                <p className="mt-1 text-xs text-fg-faint" data-testid={`upgrade-${def.id}-level`}>
                  {consumable ? `в запасе: ${profile.freezes}` : def.maxLevel === 1 ? (level > 0 ? 'куплено' : 'не куплено') : `уровень ${level} из ${def.maxLevel}`}
                </p>
              </div>
              {cost === null ? (
                <span className="text-sm text-ok">максимум</span>
              ) : (
                <Button
                  variant={affordable ? 'primary' : 'secondary'}
                  disabled={!affordable}
                  data-testid={`buy-${def.id}`}
                  onClick={() => void buy(def)}
                  className="shrink-0 px-3 text-sm"
                >
                  ◆ {cost}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-faint uppercase">Облик героя</h2>
        <div className="flex gap-2">
          {HERO_LOOKS.map((l) => {
            const open = l.level <= lookLevel
            const active = profile.heroLook === l.id
            return (
              <button
                key={l.id}
                type="button"
                disabled={!open}
                data-testid={`look-${l.id}`}
                aria-pressed={active}
                onClick={() => void setLook(l.id)}
                className={`tap flex-1 rounded-2xl border px-2 py-3 text-sm ${
                  active ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-bg-card text-fg'
                } disabled:opacity-40`}
              >
                {open ? l.name : '🔒'}
              </button>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-faint uppercase">Тема</h2>
        <div className="flex gap-2">
          {THEMES.map((t) => {
            const open = t.level <= themeLevel
            const active = profile.theme === t.id
            return (
              <button
                key={t.id}
                type="button"
                disabled={!open}
                data-testid={`theme-${t.id}`}
                aria-pressed={active}
                onClick={() => void setTheme(t.id)}
                className={`tap flex flex-1 items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-sm ${
                  active ? 'border-accent bg-accent/10' : 'border-line bg-bg-card'
                } disabled:opacity-40`}
              >
                <span className="h-4 w-4 rounded-full" style={{ background: t.accent }} aria-hidden="true" />
                {open ? t.name : '🔒'}
              </button>
            )
          })}
        </div>
      </section>
    </Screen>
  )
}
