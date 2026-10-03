import { useEffect, useState } from 'react'
import { aiStatus, ping, subscribeAI, type AIStatus } from '@/ai/ai'
import { useProfileStore } from '@/store/profile'
import { Screen } from '@/ui/Screen'
import { SpeakButton } from '@/ui/SpeakButton'
import { recognitionAvailable } from '@/speech/recognition'
import { ttsAvailable } from '@/speech/tts'
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

function KeyField({ label, value, placeholder, testId, onChange }: { label: string; value: string; placeholder: string; testId: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <label className="flex flex-col gap-1 rounded-2xl bg-bg-card px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          data-testid={testId}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-sm text-fg outline-none focus:border-accent"
        />
        <button type="button" aria-label={show ? 'Скрыть ключ' : 'Показать ключ'} onClick={() => setShow((v) => !v)} className="tap rounded-xl px-2 text-xs text-fg-muted">
          {show ? 'скрыть' : 'показать'}
        </button>
      </div>
    </label>
  )
}

function ModelField({ label, value, testId, onChange }: { label: string; value: string; testId: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-bg-card px-4 py-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="h-11 w-44 rounded-xl border border-line bg-bg px-3 text-sm text-fg outline-none focus:border-accent"
      />
    </label>
  )
}

/** AI keys and model ids (SPEC §10.1): kept only in IndexedDB on this device. */
function AISection() {
  const ai = useProfileStore((s) => s.profile?.settings.ai)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const [status, setStatus] = useState<AIStatus | null>(null)
  const [pingResult, setPingResult] = useState<string | null>(null)
  const [pinging, setPinging] = useState(false)

  useEffect(() => {
    let alive = true
    const refresh = () => void aiStatus().then((st) => alive && setStatus(st))
    refresh()
    const off = subscribeAI(refresh)
    return () => {
      alive = false
      off()
    }
  }, [ai])

  if (!ai) return null
  const set = (patch: Partial<typeof ai>) => void updateSettings({ ai: { ...ai, ...patch } })

  async function check() {
    setPinging(true)
    setPingResult(null)
    const err = await ping()
    setPingResult(err === null ? 'Ответил. ИИ работает.' : err)
    setPinging(false)
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-faint uppercase">ИИ</h2>
      <p className="px-1 text-xs text-fg-faint">
        Бесплатные ключи Google AI Studio и Groq. Хранятся только на этом устройстве. В запросы уходят только учебные фразы и твои ответы в сценах.
      </p>
      <KeyField label="Ключ Gemini (основной)" value={ai.geminiKey} placeholder="AIza…" testId="ai-gemini-key" onChange={(v) => set({ geminiKey: v })} />
      <ModelField label="Модель Gemini" value={ai.geminiModel} testId="ai-gemini-model" onChange={(v) => set({ geminiModel: v })} />
      <KeyField label="Ключ Groq (запасной)" value={ai.groqKey} placeholder="gsk_…" testId="ai-groq-key" onChange={(v) => set({ groqKey: v })} />
      <ModelField label="Модель Groq" value={ai.groqModel} testId="ai-groq-model" onChange={(v) => set({ groqModel: v })} />
      <Row label="Связь с ИИ">
        <button
          type="button"
          data-testid="ai-ping"
          disabled={!status?.configured || pinging}
          onClick={() => void check()}
          className="tap rounded-xl bg-accent px-4 text-sm font-semibold text-bg disabled:opacity-40"
        >
          {pinging ? 'Проверяю…' : 'Проверить'}
        </button>
      </Row>
      <p className="px-1 text-xs text-fg-muted" data-testid="ai-status">
        {!status
          ? '…'
          : !status.configured
            ? 'ИИ выключен: нет ключа. Игра полностью работает без него.'
            : `ИИ: ${status.provider ?? 'нет'} · сегодня ${status.usedToday} из ${status.limit}${status.available ? '' : status.lastError ? ` · пауза: ${status.lastError}` : ' · пауза'}`}
      </p>
      {pingResult ? (
        <p className="px-1 text-xs" data-testid="ai-ping-result">
          {pingResult}
        </p>
      ) : null}
    </section>
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
        <Row label="Проверить голос">
          {ttsAvailable() ? (
            <SpeakButton text="It depends on the weather, to be honest." label="Проверить" testId="settings-speak" />
          ) : (
            <span className="text-sm text-danger" data-testid="tts-missing">
              Озвучка недоступна
            </span>
          )}
        </Row>
        <p className="px-1 text-xs text-fg-faint" data-testid="speech-status">
          Озвучка: {ttsAvailable() ? 'есть' : 'нет'} · Распознавание речи: {recognitionAvailable() ? 'есть' : 'нет, Голос пойдёт через самооценку'}
        </p>
      </section>

      <AISection />

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-faint uppercase">Данные</h2>
        <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-fg-muted">
          Экспорт и импорт в JSON появятся на этапе 6.
        </div>
      </section>
    </Screen>
  )
}
