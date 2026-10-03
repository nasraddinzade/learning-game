import { Link } from 'react-router-dom'
import { aiConfigured } from '@/ai/ai'
import { Screen } from '@/ui/Screen'

interface Entry {
  icon: string
  title: string
  text: string
  to: string
  testId: string
  /** Needs an AI key; shown dimmed without one, still opens with a note. */
  ai?: boolean
}

const ENTRIES: Entry[] = [
  { icon: '🗣️', title: 'Не смог сказать', text: 'Напиши по-русски, что хотел сказать. ИИ даст естественную фразу.', to: '/life/say', testId: 'life-say', ai: true },
  { icon: '📄', title: 'Вставить текст', text: 'ИИ вытащит 5–10 полезных фраз из любого текста, ты отметишь нужные.', to: '/life/extract', testId: 'life-extract', ai: true },
  { icon: '✍️', title: 'Вручную', text: 'Фраза, перевод и пример. Работает без ИИ.', to: '/life/manual', testId: 'life-manual' },
  { icon: '📖', title: 'Читать', text: 'Вставь статью, субтитры или переписку, читай и забирай фразы в поход. Работает без ИИ.', to: '/read', testId: 'life-read' },
]

/** "Из жизни" (SPEC §9.2): four entries; only the reading mode works before the AI stage. */
export function FromLifeScreen() {
  const ai = aiConfigured()
  return (
    <Screen title="Из жизни" back="/" testId="screen-life">
      <p className="mb-3 text-sm text-fg-muted">Главный источник нового: фразы, которые тебе понадобились на самом деле.</p>
      <div className="flex flex-col gap-2">
        {ENTRIES.map((e) => (
          <Link
            key={e.testId}
            to={e.to}
            data-testid={e.testId}
            data-ai={e.ai ? (ai ? 'on' : 'off') : undefined}
            className={`tap flex items-center gap-3 rounded-card border bg-bg-card p-4 active:bg-bg-raised ${e.ai && !ai ? 'border-dashed border-line opacity-70' : 'border-accent/40'}`}
          >
            <span className="text-3xl" aria-hidden="true">
              {e.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{e.title}</span>
              <span className="block text-sm text-fg-muted">{e.text}</span>
              {e.ai && !ai ? <span className="block text-xs text-fg-faint">Нужен ключ ИИ в настройках.</span> : null}
            </span>
            <span className="text-fg-faint" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </div>
    </Screen>
  )
}
