import { useProfileStore } from '@/store/profile'
import { Screen } from '@/ui/Screen'
import type { TtsVoice } from '@/types'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 rounded-2xl bg-bg-card px-4 py-2">
      <span className="font-medium">{label}</span>
      {children}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  testId: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-line'
      }`}
    >
      <span
        className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-fg transition-transform ${
          checked ? 'translate-x-6' : ''
        }`}
      />
    </button>
  )
}

export function SettingsScreen() {
  const profile = useProfileStore((s) => s.profile)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  if (!profile) return null
  const s = profile.settings

  return (
    <Screen title="Настройки" back="/" testId="screen-settings">
      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-faint uppercase">Игра</h2>
        <Row label="Новых фраз в день">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Меньше"
              data-testid="newPerDay-minus"
              disabled={s.newPerDay <= 0}
              onClick={() => void updateSettings({ newPerDay: s.newPerDay - 1 })}
              className="tap rounded-full bg-bg-raised text-lg disabled:opacity-30"
            >
              −
            </button>
            <span className="w-6 text-center text-lg font-bold tabular-nums" data-testid="newPerDay">
              {s.newPerDay}
            </span>
            <button
              type="button"
              aria-label="Больше"
              data-testid="newPerDay-plus"
              disabled={s.newPerDay >= 12}
              onClick={() => void updateSettings({ newPerDay: s.newPerDay + 1 })}
              className="tap rounded-full bg-bg-raised text-lg disabled:opacity-30"
            >
              +
            </button>
          </div>
        </Row>
        <Row label="Звук">
          <Toggle
            label="Звук"
            testId="toggle-sound"
            checked={s.sound}
            onChange={(v) => void updateSettings({ sound: v })}
          />
        </Row>
        <Row label="Вибрация">
          <Toggle
            label="Вибрация"
            testId="toggle-vibration"
            checked={s.vibration}
            onChange={(v) => void updateSettings({ vibration: v })}
          />
        </Row>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-faint uppercase">Озвучка</h2>
        <Row label="Голос">
          <div className="flex rounded-xl bg-bg-raised p-1" role="radiogroup" aria-label="Голос">
            {(['en-US', 'en-GB'] as TtsVoice[]).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={s.ttsVoice === v}
                data-testid={`voice-${v}`}
                onClick={() => void updateSettings({ ttsVoice: v })}
                className={`tap rounded-lg px-3 text-sm font-medium ${
                  s.ttsVoice === v ? 'bg-accent text-bg' : 'text-fg-muted'
                }`}
              >
                {v === 'en-US' ? 'US' : 'UK'}
              </button>
            ))}
          </div>
        </Row>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-faint uppercase">ИИ</h2>
        <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-fg-muted">
          Ключи Gemini и Groq появятся на этапе 5. Они хранятся только на этом устройстве.
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-faint uppercase">Данные</h2>
        <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-fg-muted">
          Экспорт и импорт в JSON появятся на этапе 6.
        </div>
      </section>
    </Screen>
  )
}
