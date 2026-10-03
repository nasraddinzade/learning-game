// Once-a-day AI work (SPEC §10.2, §4.4): fresh contexts for tomorrow's reviews, missing fields of
// phrases added without AI, mnemonics for nemeses. Everything is optional and silent.
import { lands } from '@/content/lands'
import { db } from '@/db/db'
import { allItems, allProgress, saveProgress } from '@/db/repos'
import { mergeDraft, mergeFresh } from '@/db/textRepo'
import { addDays, dayKey } from '@/engine/clock'
import { unlockedLandIds } from '@/engine/lands'
import { buildQueue } from '@/engine/scheduler'
import { balance } from '@/game/balance'
import { now } from '@/store/clock'
import type { Item, Progress } from '@/types'
import { aiAvailable, freshContexts, fromLife, mnemonic } from './ai'
import { hasMarker, setMarker } from './cache'

/** A phrase from life or a correction that still lacks what the moves need. */
export function isIncomplete(item: Item): boolean {
  if (item.source !== 'life' && item.source !== 'ai-correction') return false
  return item.promptsRu.length < 2 || item.falseMeanings.length < 2 || item.ru.trim() === '' || item.ru.startsWith('вместо «')
}

let running: Promise<void> | null = null

/** Runs the daily batch at most once per day; safe to call on every camp visit. */
export function runDailyAI(): Promise<void> {
  if (running) return running
  running = (async () => {
    try {
      await dailyBatch()
    } finally {
      running = null
    }
  })()
  return running
}

async function dailyBatch(): Promise<void> {
  if (!aiAvailable()) return
  const t = now()
  const marker = `daily:${dayKey(t)}`
  if (await hasMarker(marker)) return
  await setMarker(marker, t)
  const [items, progress] = await Promise.all([allItems(), allProgress()])
  const byId = new Map(items.map((i) => [i.id, i]))
  const pm = new Map(progress.map((p) => [p.itemId, p]))

  // 1. Tomorrow's reviews get two new sentences and a new situation each, in one request.
  const unlocked = unlockedLandIds(lands.map((l) => l.id), items, pm, balance.lands.unlockAfter)
  const queue = buildQueue({ items, progress, now: addDays(t, 1), newPerDay: 0, unlockedLands: unlocked })
  const due = queue
    .filter((q) => q.kind !== 'new')
    .map((q) => byId.get(q.itemId))
    .filter((i): i is Item => i !== undefined)
    .slice(0, balance.ai.freshContextsPerDay)
  if (due.length > 0) {
    const fresh = await freshContexts(due.map((i) => ({ id: i.id, en: i.en, ru: i.ru })))
    for (const f of fresh ?? []) {
      const it = byId.get(f.id)
      if (!it) continue
      const next = mergeFresh(it, f)
      byId.set(it.id, next)
      await db.items.put(next)
    }
  }

  // 2. Phrases added without AI get their translation, contexts, situations and false meanings.
  for (const it of items.filter(isIncomplete).slice(0, balance.ai.enrichPerDay)) {
    const drafts = await fromLife('phrase', it.en, it.contexts[0]?.en)
    const d = drafts?.[0]
    if (d) await db.items.put(mergeDraft(byId.get(it.id) ?? it, d))
  }

  // 3. Nemeses without a mnemonic.
  for (const p of progress) {
    if (!p.nemesis || p.nemesis.mnemonic) continue
    const it = byId.get(p.itemId)
    if (it) await enrichNemesis(it, p)
  }
}

export interface NemesisEnrichment {
  progress: Progress | null
  item: Item | null
}

/** A new nemesis gets a mnemonic and fresh contexts (SPEC §4.4); returns what changed, or nulls. */
export async function enrichNemesis(item: Item, p: Progress): Promise<NemesisEnrichment> {
  const out: NemesisEnrichment = { progress: null, item: null }
  if (!aiAvailable() || !p.nemesis) return out
  const wrong = (await db.attempts.where('itemId').equals(item.id).toArray())
    .filter((a) => !a.correct && a.answer.trim().length > 0 && !a.answer.startsWith('('))
    .slice(-5)
    .map((a) => a.answer)
  const [m, fresh] = await Promise.all([
    mnemonic({ en: item.en, ru: item.ru, errors: wrong }),
    freshContexts([{ id: item.id, en: item.en, ru: item.ru }]),
  ])
  if (m) {
    const cur = await db.progress.get(item.id)
    if (cur?.nemesis) {
      const next: Progress = { ...cur, nemesis: { ...cur.nemesis, mnemonic: m } }
      await saveProgress(next)
      out.progress = next
    }
  }
  const f = fresh?.[0]
  if (f) {
    const cur = await db.items.get(item.id)
    if (cur) {
      const next = mergeFresh(cur, f)
      await db.items.put(next)
      out.item = next
    }
  }
  return out
}
