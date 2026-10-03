import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { aiAvailable, aiConfigured, fromLife } from '@/ai/ai'
import type { LifeItemDraft } from '@/ai/types'
import { addDraftItems, addLifeItem } from '@/db/textRepo'
import { now } from '@/store/clock'
import { Button } from '@/ui/Button'
import { Screen } from '@/ui/Screen'

type Mode = 'say' | 'extract' | 'manual'

const TITLE: Record<Mode, string> = { say: 'Не смог сказать', extract: 'Вставить текст', manual: 'Вручную' }

const inputCls = 'w-full rounded-xl border border-line bg-bg px-3 py-2 text-base text-fg outline-none focus:border-accent'

function DraftCard({ d, checked, onToggle }: { d: LifeItemDraft; checked?: boolean; onToggle?: () => void }) {
  return (
    <label className={`flex items-start gap-3 rounded-card bg-bg-card p-3 ${onToggle ? 'cursor-pointer' : ''}`} data-testid="life-draft">
      {onToggle ? (
        <input type="checkbox" checked={checked} onChange={onToggle} data-testid="life-draft-check" className="mt-1 h-5 w-5 accent-[var(--color-accent)]" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold text-accent" data-testid="life-draft-en">
          {d.en}
        </span>
        <span className="block text-fg">{d.ru}</span>
        {d.contexts[0] ? <span className="mt-1 block text-sm text-fg-muted">{d.contexts[0].en}</span> : null}
        {d.noteRu ? <span className="block text-xs text-fg-faint">{d.noteRu}</span> : null}
      </span>
    </label>
  )
}

/** "Из жизни" entries (SPEC §9.2): two with AI (a Russian thought, an English text) and one manual. */
export function LifeAddScreen() {
  const { mode: raw = 'manual' } = useParams()
  const mode: Mode = raw === 'say' || raw === 'extract' ? raw : 'manual'
  const [text, setText] = useState('')
  const [en, setEn] = useState('')
  const [ru, setRu] = useState('')
  const [example, setExample] = useState('')
  const [drafts, setDrafts] = useState<LifeItemDraft[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<number | null>(null)
  const ai = aiConfigured()

  async function ask() {
    setBusy(true)
    setError(null)
    const result = await fromLife(mode === 'say' ? 'ru' : 'text', text)
    setBusy(false)
    if (!result) {
      setError(aiAvailable() ? 'ИИ не ответил по схеме. Попробуй ещё раз или добавь вручную.' : 'ИИ сейчас недоступен (нет ключа, связи или лимит). Добавь вручную.')
      return
    }
    setDrafts(result)
    setPicked(new Set(result.map((_, i) => i)))
  }

  async function addDrafts() {
    if (!drafts) return
    const chosen = drafts.filter((_, i) => picked.has(i))
    if (chosen.length === 0) return
    setBusy(true)
    const items = await addDraftItems(chosen, now())
    setBusy(false)
    setAdded(items.length)
  }

  async function addManual() {
    if (!en.trim() || !ru.trim()) return
    setBusy(true)
    await addLifeItem({ en, ru, contextEn: example.trim() || en.trim(), now: now() })
    setBusy(false)
    setAdded(1)
  }

  return (
    <Screen title={TITLE[mode]} back="/life" testId={`screen-life-${mode}`}>
      {added !== null ? (
        <div className="flex flex-col items-center gap-3 rounded-card bg-bg-card p-6 text-center" data-testid="life-added">
          <span className="text-4xl" aria-hidden="true">
            ⚔️
          </span>
          <p className="text-lg font-bold">Добавлено: {added}</p>
          <p className="text-sm text-fg-muted">Фразы из жизни идут в Разведку первыми.</p>
          <Link to="/" className="tap flex items-center justify-center rounded-2xl bg-accent px-5 font-semibold text-bg" data-testid="life-to-camp">
            В лагерь
          </Link>
          <button type="button" className="tap text-sm text-fg-muted" onClick={() => { setAdded(null); setDrafts(null); setText(''); setEn(''); setRu(''); setExample('') }}>
            Добавить ещё
          </button>
        </div>
      ) : mode === 'manual' ? (
        <div className="flex flex-col gap-2">
          <input value={en} onChange={(e) => setEn(e.target.value)} placeholder="Фраза по-английски" data-testid="life-manual-en" autoCorrect="off" autoCapitalize="off" spellCheck={false} className={`h-12 ${inputCls}`} />
          <input value={ru} onChange={(e) => setRu(e.target.value)} placeholder="Перевод по-русски" data-testid="life-manual-ru" autoCorrect="off" autoCapitalize="off" spellCheck={false} className={`h-12 ${inputCls}`} />
          <textarea value={example} onChange={(e) => setExample(e.target.value)} placeholder="Пример предложения (необязательно)" data-testid="life-manual-example" rows={2} autoCorrect="off" autoCapitalize="off" spellCheck={false} className={inputCls} />
          <p className="text-xs text-fg-faint">Остальное (ситуации, ложные смыслы) досоздаст ИИ, когда будет доступен. До этого фраза ходит по приёмам, которым хватает примера.</p>
          <Button full data-testid="life-manual-add" disabled={busy || !en.trim() || !ru.trim()} onClick={() => void addManual()}>
            Добавить
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {!ai ? (
            <p className="rounded-card border border-dashed border-line p-3 text-sm text-fg-muted" data-testid="life-no-ai">
              Для этого входа нужен ключ ИИ (Настройки → ИИ). Без него есть «Вручную» и «Читать».
            </p>
          ) : null}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="life-text"
            rows={mode === 'say' ? 3 : 7}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={mode === 'say' ? 'Что хотел сказать? По-русски, как есть.' : 'Вставь английский текст: статью, субтитры, переписку, вакансию…'}
            className={inputCls}
          />
          {drafts === null ? (
            <Button full data-testid="life-ask" disabled={!ai || busy || text.trim().length === 0} onClick={() => void ask()}>
              {busy ? 'Спрашиваю ИИ…' : mode === 'say' ? 'Как это сказать?' : 'Вытащить фразы'}
            </Button>
          ) : (
            <>
              <p className="text-sm text-fg-muted">{mode === 'say' ? 'Так это звучит по-английски. Фраза для запоминания выделена.' : `ИИ нашёл фраз: ${drafts.length}. Отметь нужные.`}</p>
              <div className="flex flex-col gap-2">
                {drafts.map((d, i) => (
                  <DraftCard
                    key={i}
                    d={d}
                    checked={picked.has(i)}
                    onToggle={
                      mode === 'extract'
                        ? () =>
                            setPicked((prev) => {
                              const next = new Set(prev)
                              if (next.has(i)) next.delete(i)
                              else next.add(i)
                              return next
                            })
                        : undefined
                    }
                  />
                ))}
              </div>
              <Button full data-testid="life-draft-add" disabled={busy || picked.size === 0} onClick={() => void addDrafts()}>
                {mode === 'say' ? 'Добавить в поход' : `Добавить выбранные (${picked.size})`}
              </Button>
              <button type="button" className="tap text-sm text-fg-muted" onClick={() => setDrafts(null)}>
                Назад к тексту
              </button>
            </>
          )}
          {error ? (
            <p className="text-sm text-danger" data-testid="life-error">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Screen>
  )
}
