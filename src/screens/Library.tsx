import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addText, allTexts, deleteText, itemCountsByText } from '@/db/textRepo'
import { now } from '@/store/clock'
import { Button } from '@/ui/Button'
import { Screen } from '@/ui/Screen'
import type { TextDoc } from '@/types'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

/** The reading-mode library (SPEC §9.3): paste a text, keep it, come back to it. */
export function LibraryScreen() {
  const navigate = useNavigate()
  const [texts, setTexts] = useState<TextDoc[] | null>(null)
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function reload() {
    const [t, c] = await Promise.all([allTexts(), itemCountsByText()])
    setTexts(t)
    setCounts(c)
  }

  useEffect(() => {
    void Promise.all([allTexts(), itemCountsByText()]).then(([t, c]) => {
      setTexts(t)
      setCounts(c)
    })
  }, [])

  async function save() {
    if (body.trim().length === 0) return
    const doc = await addText(body, now(), title)
    navigate(`/read/${doc.id}`)
  }

  async function remove(id: string) {
    await deleteText(id)
    setConfirmId(null)
    await reload()
  }

  return (
    <Screen title="Читать" back="/life" testId="screen-library">
      <section className="rounded-card bg-bg-card p-4" aria-label="Новый текст">
        <label className="block text-sm text-fg-muted" htmlFor="library-body">
          Вставь любой английский текст: статью, субтитры, переписку, пост
        </label>
        <textarea
          id="library-body"
          data-testid="library-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Paste text here…"
          className="mt-2 w-full resize-y rounded-xl border border-line bg-bg px-3 py-2 text-base text-fg outline-none focus:border-accent"
        />
        <input
          data-testid="library-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Название (необязательно)"
          className="mt-2 h-12 w-full rounded-xl border border-line bg-bg px-3 text-base text-fg outline-none focus:border-accent"
        />
        <Button full className="mt-3" data-testid="library-save" disabled={body.trim().length === 0} onClick={() => void save()}>
          Сохранить и читать
        </Button>
      </section>

      <h2 className="mt-5 mb-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">Библиотека</h2>
      {texts === null ? (
        <p className="text-fg-muted">…</p>
      ) : texts.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-4 text-center text-sm text-fg-muted" data-testid="library-empty">
          Пока пусто. Только то, что вставишь сам: никаких чужих библиотек и ссылок.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="library-list">
          {texts.map((t) => (
            <li key={t.id} data-testid="text-card" data-id={t.id} className="rounded-card bg-bg-card p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="text-open"
                  onClick={() => navigate(`/read/${t.id}`)}
                  className="tap min-w-0 flex-1 text-left"
                >
                  <span className="block truncate font-semibold">{t.title}</span>
                  <span className="block text-xs text-fg-muted">
                    {formatDate(t.createdAt)} · фраз взято: <span data-testid="text-count">{counts.get(t.id) ?? 0}</span>
                  </span>
                </button>
                {confirmId === t.id ? (
                  <>
                    <Button variant="secondary" onClick={() => setConfirmId(null)}>
                      Нет
                    </Button>
                    <Button variant="danger" data-testid="text-delete-confirm" onClick={() => void remove(t.id)}>
                      Удалить
                    </Button>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label="Удалить текст"
                    data-testid="text-delete"
                    onClick={() => setConfirmId(t.id)}
                    className="tap flex items-center justify-center rounded-full text-fg-faint active:bg-bg-raised"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M6 7h12M9 7V5h6v2M8 7l1 13h6l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
              {confirmId === t.id ? (
                <p className="mt-2 text-xs text-fg-muted">Текст уйдёт из библиотеки, взятые из него фразы останутся в игре.</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
