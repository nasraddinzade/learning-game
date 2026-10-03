import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addLifeItem, getText } from '@/db/textRepo'
import { allItems, progressMap } from '@/db/repos'
import { creatureStatus } from '@/engine/lands'
import { balance } from '@/game/balance'
import { dragTo, findPhrases, indexPhrases, parseText, selectWord, selectedPhrase, sentenceAround, type Paragraph, type Selection } from '@/reading/text'
import { speak, ttsAvailable } from '@/speech/tts'
import { now } from '@/store/clock'
import { useProfileStore } from '@/store/profile'
import { Button } from '@/ui/Button'
import type { Item, Progress, TextDoc } from '@/types'

type WordStatus = 'new' | 'fight' | 'nemesis' | 'tamed'

const STATUS_RU: Record<WordStatus, string> = {
  new: 'новая, ждёт Разведки',
  fight: 'в бою',
  nemesis: 'немезида',
  tamed: 'приручена',
}

const STATUS_CLASS: Record<WordStatus, string> = {
  new: 'bg-accent/20 underline decoration-accent decoration-2 underline-offset-4',
  fight: 'bg-ok/15 underline decoration-ok decoration-2 underline-offset-4',
  nemesis: 'bg-danger/20 underline decoration-danger decoration-2 underline-offset-4',
  tamed: 'underline decoration-fg-faint decoration-2 underline-offset-4 text-fg-muted',
}

function statusOf(p: Progress | undefined): WordStatus {
  if (p?.nemesis) return 'nemesis'
  const s = creatureStatus(p)
  if (s === 'tamed') return 'tamed'
  if (s === 'unseen') return 'new'
  return 'fight'
}

interface WordMark {
  itemId: string
  status: WordStatus
  from: number
  to: number
}

interface ToolbarPos {
  top: number
  left: number
  width: number
}

const TOOLBAR_H = 56

/**
 * The reader (SPEC §9.3): big type, nothing but the text. A tap selects a word, a second tap or a
 * drag from the selection extends it to a phrase of up to `balance.reading.maxWords` words. A toolbar
 * above the selection offers listening, the translation and sending the phrase into the run.
 */
export function ReaderScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const voice = useProfileStore((s) => s.profile?.settings.ttsVoice ?? 'en-US')
  const [doc, setDoc] = useState<TextDoc | null | undefined>(undefined)
  const [items, setItems] = useState<Item[]>([])
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map())
  const [shown, setShown] = useState<number>(balance.reading.paragraphsPerBatch)
  const [sel, setSel] = useState<Selection | null>(null)
  const [sheet, setSheet] = useState<'none' | 'add' | 'translate'>('none')
  const [ru, setRu] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [pos, setPos] = useState<ToolbarPos | null>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ anchor: number; paragraph: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  const reloadItems = useCallback(async () => {
    const [all, pm] = await Promise.all([allItems(), progressMap()])
    setItems(all)
    setProgress(pm)
  }, [])

  useEffect(() => {
    void getText(id).then((d) => setDoc(d ?? null))
    void Promise.all([allItems(), progressMap()]).then(([all, pm]) => {
      setItems(all)
      setProgress(pm)
    })
  }, [id])

  const paragraphs = useMemo(() => (doc ? parseText(doc.body) : []), [doc])
  const index = useMemo(() => indexPhrases(items, balance.reading.maxWords), [items])
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const takenHere = useMemo(() => items.filter((i) => i.textId === id).length, [items, id])

  /** Per paragraph: word index → the item phrase covering it. */
  const marks = useMemo(() => {
    const out: Map<number, WordMark>[] = []
    paragraphs.slice(0, shown).forEach((p, pi) => {
      const m = new Map<number, WordMark>()
      for (const hit of findPhrases(p, index)) {
        const mark: WordMark = { itemId: hit.itemId, status: statusOf(progress.get(hit.itemId)), from: hit.from, to: hit.to }
        for (let w = hit.from; w <= hit.to; w++) m.set(w, mark)
      }
      out[pi] = m
    })
    return out
  }, [paragraphs, shown, index, progress])

  // Long texts render in batches as the reader scrolls (SPEC §9.3).
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || shown >= paragraphs.length) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => Math.min(paragraphs.length, n + balance.reading.paragraphsPerBatch))
    })
    io.observe(el)
    return () => io.disconnect()
  }, [shown, paragraphs.length])

  const selParagraph: Paragraph | undefined = sel ? paragraphs[sel.paragraph] : undefined
  const phrase = sel && selParagraph ? selectedPhrase(selParagraph, sel) : ''
  const sentence = sel && selParagraph ? sentenceAround(selParagraph, sel) : ''
  /** The item whose phrase is exactly the selection, if any. */
  const selectedItem = useMemo(() => {
    if (!sel) return null
    const mark = marks[sel.paragraph]?.get(sel.from)
    if (!mark || mark.from !== sel.from || mark.to !== sel.to) return null
    return itemsById.get(mark.itemId) ?? null
  }, [sel, marks, itemsById])

  // Toolbar: above the selection, clamped to the viewport; below it when there is no room on top.
  const placeToolbar = useCallback(() => {
    if (!sel || !textRef.current) {
      setPos(null)
      return
    }
    const spans = textRef.current.querySelectorAll<HTMLElement>(`[data-p="${sel.paragraph}"][data-selected="true"]`)
    if (spans.length === 0) {
      setPos(null)
      return
    }
    let top = Infinity
    let bottom = -Infinity
    let left = Infinity
    let right = -Infinity
    spans.forEach((s) => {
      const r = s.getBoundingClientRect()
      top = Math.min(top, r.top)
      bottom = Math.max(bottom, r.bottom)
      left = Math.min(left, r.left)
      right = Math.max(right, r.right)
    })
    const vw = window.innerWidth
    const width = Math.min(344, vw - 16)
    const center = (left + right) / 2
    const x = Math.max(8, Math.min(vw - width - 8, center - width / 2))
    const above = top - TOOLBAR_H - 10
    const y = above >= 8 ? above : bottom + 10
    setPos({ top: y, left: x, width })
  }, [sel])

  useLayoutEffect(() => {
    placeToolbar()
  }, [placeToolbar, shown])

  useEffect(() => {
    if (!sel) return
    const onMove = () => placeToolbar()
    window.addEventListener('scroll', onMove, { passive: true })
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove)
      window.removeEventListener('resize', onMove)
    }
  }, [sel, placeToolbar])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  function onWordClick(pi: number, wi: number) {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    setSheet('none')
    // A second tap on a lone selected word clears it; everything else follows the selection rule.
    setSel((cur) => (cur && cur.paragraph === pi && cur.from === wi && cur.to === wi ? null : selectWord(cur, pi, wi, balance.reading.maxWords)))
  }

  /** A tap anywhere but a word, the toolbar or a sheet drops the selection. */
  function onBackgroundClick(e: ReactMouseEvent<HTMLElement>) {
    const t = e.target as HTMLElement
    if (t.closest('[data-w], [data-testid="reader-toolbar"], [role="dialog"], button')) return
    if (sel) clear()
  }

  function onWordPointerDown(e: ReactPointerEvent<HTMLSpanElement>, pi: number, wi: number) {
    // Dragging starts only from the current selection, so the page still scrolls elsewhere.
    if (!sel || sel.paragraph !== pi || wi < sel.from || wi > sel.to) return
    const anchor = sel.from === sel.to ? wi : wi === sel.from ? sel.to : sel.from
    drag.current = { anchor, paragraph: pi, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-w]')
    if (!el) return
    const pi = Number(el.dataset.p)
    const wi = Number(el.dataset.w)
    if (pi !== d.paragraph || Number.isNaN(wi)) return
    setSel((cur) => {
      if (!cur) return cur
      const next = dragTo(d.anchor, pi, wi, balance.reading.maxWords, cur)
      if (next !== cur && (next.from !== cur.from || next.to !== cur.to)) d.moved = true
      return next
    })
  }

  function onPointerUp() {
    if (drag.current?.moved) suppressClick.current = true
    drag.current = null
  }

  function clear() {
    setSel(null)
    setSheet('none')
  }

  async function add() {
    if (!doc || !sel || phrase.length === 0 || ru.trim().length === 0) return
    const item = await addLifeItem({ en: phrase, ru, contextEn: sentence, textId: doc.id, now: now() })
    await reloadItems()
    setRu('')
    setSheet('none')
    setSel(null)
    setToast(`«${item.en}» ждёт тебя в ближайшей Разведке`)
  }

  if (doc === undefined) {
    return (
      <main data-testid="screen-reader" className="flex min-h-full items-center justify-center text-fg-muted">
        …
      </main>
    )
  }
  if (doc === null) {
    return (
      <main data-testid="screen-reader" className="safe-top mx-auto flex min-h-full w-full max-w-[440px] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-fg-muted">Текста больше нет в библиотеке.</p>
        <Button variant="secondary" onClick={() => navigate('/read')}>
          К библиотеке
        </Button>
      </main>
    )
  }

  return (
    <main data-testid="screen-reader" className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[560px] flex-col px-4 pb-24" onClick={onBackgroundClick}>
      <header className="flex h-14 items-center gap-2">
        <button
          type="button"
          aria-label="К библиотеке"
          onClick={() => navigate('/read')}
          className="tap -ml-3 flex items-center justify-center rounded-full text-fg-muted active:bg-bg-raised"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-fg-muted" data-testid="reader-title">
          {doc.title}
        </h1>
        <span className="shrink-0 text-xs text-fg-faint" data-testid="reader-count" title="Фраз взято из этого текста">
          ⚔️ {takenHere}
        </span>
      </header>

      <p className="mb-3 text-xs text-fg-faint" data-testid="reader-hint">Тапни слово. Второй тап или протяжка от выделения расширяют его до фразы (до {balance.reading.maxWords} слов).</p>

      <div
        ref={textRef}
        data-testid="reader-text"
        className="select-none text-[19px] leading-[1.75] text-fg"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {paragraphs.slice(0, shown).map((p, pi) => (
          <p key={pi} className="mb-4" data-testid="reader-paragraph">
            {p.tokens.map((t, ti) => {
              if (!t.word) return <span key={ti}>{t.text}</span>
              const selected = sel !== null && sel.paragraph === pi && t.wordIndex >= sel.from && t.wordIndex <= sel.to
              const mark = marks[pi]?.get(t.wordIndex)
              return (
                <span
                  key={ti}
                  data-testid="reader-word"
                  data-p={pi}
                  data-w={t.wordIndex}
                  data-selected={selected ? 'true' : undefined}
                  data-status={mark?.status}
                  data-item={mark?.itemId}
                  title={mark ? STATUS_RU[mark.status] : undefined}
                  onClick={() => onWordClick(pi, t.wordIndex)}
                  onPointerDown={(e) => onWordPointerDown(e, pi, t.wordIndex)}
                  style={selected ? { touchAction: 'none' } : undefined}
                  className={`cursor-pointer rounded-sm px-[1px] ${selected ? 'bg-accent text-bg' : mark ? STATUS_CLASS[mark.status] : ''}`}
                >
                  {t.text}
                </span>
              )
            })}
          </p>
        ))}
        {shown < paragraphs.length ? (
          <div ref={sentinelRef} className="py-4 text-center text-sm text-fg-faint" data-testid="reader-more">
            …
          </div>
        ) : null}
      </div>

      {sel && pos ? (
        <div
          role="toolbar"
          aria-label="Выделенная фраза"
          data-testid="reader-toolbar"
          className="fixed z-40 flex items-stretch gap-1 rounded-2xl border border-line bg-bg-raised p-1 shadow-xl"
          style={{ top: pos.top, left: pos.left, width: pos.width, height: TOOLBAR_H }}
        >
          <button
            type="button"
            data-testid="tb-speak"
            disabled={!ttsAvailable()}
            onClick={() => void speak(phrase, voice)}
            className="tap flex flex-1 flex-col items-center justify-center rounded-xl text-xs text-fg active:bg-bg-card disabled:opacity-40"
          >
            <span aria-hidden="true">🔊</span>
            Послушать
          </button>
          <button
            type="button"
            data-testid="tb-translate"
            onClick={() => setSheet('translate')}
            className="tap flex flex-1 flex-col items-center justify-center rounded-xl text-xs text-fg active:bg-bg-card"
          >
            <span aria-hidden="true">📖</span>
            Перевод
          </button>
          {selectedItem ? (
            <div data-testid="tb-added" className="flex flex-1 flex-col items-center justify-center rounded-xl text-xs text-fg-muted">
              <span aria-hidden="true">✓</span>
              {STATUS_RU[statusOf(progress.get(selectedItem.id))].split(',')[0]}
            </div>
          ) : (
            <button
              type="button"
              data-testid="tb-add"
              onClick={() => {
                setRu('')
                setSheet('add')
              }}
              className="tap flex flex-1 flex-col items-center justify-center rounded-xl bg-accent text-xs font-semibold text-bg active:opacity-90"
            >
              <span aria-hidden="true">⚔️</span>В поход
            </button>
          )}
        </div>
      ) : null}

      {sel && sheet !== 'none' ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-bg/70" onClick={() => setSheet('none')}>
          <div
            role="dialog"
            aria-label={sheet === 'add' ? 'В поход' : 'Перевод'}
            data-testid={sheet === 'add' ? 'add-sheet' : 'translate-sheet'}
            onClick={(e) => e.stopPropagation()}
            className="safe-bottom mx-auto w-full max-w-[560px] rounded-t-3xl border-t border-line bg-bg-raised px-4 pt-4 pb-6"
          >
            <p className="text-xl font-bold text-accent" data-testid="sheet-phrase">
              {phrase}
            </p>
            <p className="mt-1 text-sm text-fg-muted" data-testid="sheet-context">
              {sentence}
            </p>
            {sheet === 'translate' ? (
              selectedItem ? (
                <>
                  <p className="mt-3 text-lg" data-testid="sheet-ru">
                    {selectedItem.ru}
                  </p>
                  <p className="text-sm text-fg-muted">Статус: {STATUS_RU[statusOf(progress.get(selectedItem.id))]}</p>
                  <Button variant="secondary" full className="mt-4" onClick={() => setSheet('none')}>
                    Закрыть
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-3 text-sm text-fg-muted">
                    Перевод в контексте появится, когда подключится ИИ (этап 5). Пока переведи сам и отправь фразу в поход.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="secondary" onClick={() => setSheet('none')}>
                      Закрыть
                    </Button>
                    <Button full data-testid="sheet-to-add" onClick={() => setSheet('add')}>
                      В поход
                    </Button>
                  </div>
                </>
              )
            ) : (
              <>
                <label className="mt-3 block text-sm text-fg-muted" htmlFor="add-ru">
                  Перевод по-русски. Без ИИ его вводишь ты; контексты и ситуации досоздадутся позже.
                </label>
                <input
                  id="add-ru"
                  data-testid="add-ru"
                  value={ru}
                  onChange={(e) => setRu(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void add()
                  }}
                  autoFocus
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="Как ты всё это время?"
                  className="mt-2 h-12 w-full rounded-xl border border-line bg-bg px-3 text-base text-fg outline-none focus:border-accent"
                />
                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" data-testid="add-cancel" onClick={() => setSheet('none')}>
                    Отмена
                  </Button>
                  <Button full data-testid="add-submit" disabled={ru.trim().length === 0} onClick={() => void add()}>
                    Добавить
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          data-testid="reader-toast"
          className="fixed inset-x-4 bottom-6 z-40 mx-auto max-w-[520px] rounded-2xl border border-line bg-bg-raised px-4 py-3 text-center text-sm shadow-xl"
        >
          {toast}
        </div>
      ) : null}

    </main>
  )
}
