import { Link } from 'react-router-dom'
import { Screen } from '@/ui/Screen'

interface Entry {
  icon: string
  title: string
  text: string
  to?: string
  testId: string
}

const ENTRIES: Entry[] = [
  { icon: '🗣️', title: 'Не смог сказать', text: 'Напиши по-русски, что хотел сказать. ИИ подберёт естественную фразу. Этап 5.', testId: 'life-say' },
  { icon: '📄', title: 'Вставить текст', text: 'ИИ вытащит 5–10 полезных фраз из любого текста. Этап 5.', testId: 'life-extract' },
  { icon: '✍️', title: 'Вручную', text: 'Фраза, перевод и пример. Этап 5.', testId: 'life-manual' },
  { icon: '📖', title: 'Читать', text: 'Вставь статью, субтитры или переписку, читай и забирай фразы в поход. Работает без ИИ.', to: '/read', testId: 'life-read' },
]

/** "Из жизни" (SPEC §9.2): four entries; only the reading mode works before the AI stage. */
export function FromLifeScreen() {
  return (
    <Screen title="Из жизни" back="/" testId="screen-life">
      <p className="mb-3 text-sm text-fg-muted">Главный источник нового: фразы, которые тебе понадобились на самом деле.</p>
      <div className="flex flex-col gap-2">
        {ENTRIES.map((e) =>
          e.to ? (
            <Link
              key={e.testId}
              to={e.to}
              data-testid={e.testId}
              className="tap flex items-center gap-3 rounded-card border border-accent/40 bg-bg-card p-4 active:bg-bg-raised"
            >
              <span className="text-3xl" aria-hidden="true">
                {e.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{e.title}</span>
                <span className="block text-sm text-fg-muted">{e.text}</span>
              </span>
              <span className="text-fg-faint" aria-hidden="true">
                ›
              </span>
            </Link>
          ) : (
            <div key={e.testId} data-testid={e.testId} className="flex items-center gap-3 rounded-card border border-dashed border-line p-4 opacity-60">
              <span className="text-3xl" aria-hidden="true">
                {e.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{e.title}</span>
                <span className="block text-sm text-fg-muted">{e.text}</span>
              </span>
            </div>
          ),
        )}
      </div>
    </Screen>
  )
}
