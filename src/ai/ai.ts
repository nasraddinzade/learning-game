// The AI facade (SPEC §10): the only entry point the game uses. Every task returns null when the AI
// is not configured, paused, offline, over quota or answered nonsense; callers fall back silently.
import { dayKey } from '@/engine/clock'
import { balance } from '@/game/balance'
import { now } from '@/store/clock'
import { useProfileStore } from '@/store/profile'
import { addUsage, cacheKey, getCached, putCached, usageFor } from './cache'
import { createGemini } from './gemini'
import { createGroq } from './groq'
import * as P from './prompts'
import { AIQueue, DailyLimitError } from './queue'
import { AIError, type AIProvider, type AIProviderId, type AITaskId, type FreshContext, type JsonSchema, type LifeItemDraft, type ProductionCheck, type SceneTurnResult } from './types'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const realQueue = new AIQueue({
  minGapMs: balance.ai.minGapMs,
  dailyLimit: balance.ai.dailyLimit,
  backoffMs: balance.ai.backoffMs,
  now: () => now(),
  sleep,
  usage: { get: usageFor, add: (d) => addUsage(d, now()) },
  dayOf: dayKey,
})

// A test double answers instantly and does not count against the quota.
const fakeQueue = new AIQueue({
  minGapMs: 0,
  dailyLimit: Number.MAX_SAFE_INTEGER,
  backoffMs: [],
  now: () => now(),
  sleep: async () => undefined,
  usage: { get: async () => 0, add: async () => undefined },
  dayOf: dayKey,
})

let override: AIProvider | null = null
const broken = new Set<AIProviderId>()
let pausedUntil = 0
let lastError: string | null = null
const log: AITaskId[] = []
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

export function subscribeAI(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function aiSettings() {
  return useProfileStore.getState().profile?.settings.ai ?? null
}

function providerFor(): AIProvider | null {
  if (override) return override
  const s = aiSettings()
  if (!s) return null
  if (s.geminiKey.trim() && !broken.has('gemini')) return createGemini(s.geminiKey.trim(), s.geminiModel.trim() || 'gemini-2.5-flash')
  if (s.groqKey.trim() && !broken.has('groq')) return createGroq(s.groqKey.trim(), s.groqModel.trim() || 'llama-3.3-70b-versatile')
  return null
}

/** A key is entered (or a test double is installed). */
export function aiConfigured(): boolean {
  if (override) return true
  const s = aiSettings()
  return !!s && (s.geminiKey.trim().length > 0 || s.groqKey.trim().length > 0)
}

/** Configured, not paused after an error and online. Cheap and synchronous: call it before building UI. */
export function aiAvailable(): boolean {
  if (providerFor() === null) return false
  if (now() < pausedUntil) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  return true
}

export interface AIStatus {
  configured: boolean
  available: boolean
  provider: AIProviderId | null
  usedToday: number
  limit: number
  pausedUntil: number
  lastError: string | null
}

export async function aiStatus(): Promise<AIStatus> {
  return {
    configured: aiConfigured(),
    available: aiAvailable(),
    provider: providerFor()?.id ?? null,
    usedToday: await usageFor(dayKey(now())),
    limit: balance.ai.dailyLimit,
    pausedUntil,
    lastError,
  }
}

function stripFences(text: string): string {
  const t = text.trim()
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t)
  return m ? (m[1] ?? '') : t
}

function handleError(e: unknown, provider: AIProvider): void {
  if (e instanceof DailyLimitError) {
    const d = new Date(now())
    d.setHours(24, 0, 0, 0)
    pausedUntil = d.getTime()
    lastError = 'Дневной лимит запросов исчерпан, ИИ вернётся завтра'
  } else if (e instanceof AIError) {
    switch (e.kind) {
      case 'auth':
        broken.add(provider.id)
        lastError = `${provider.id}: ключ не принят (${e.message})`
        break
      case 'rate':
        pausedUntil = now() + balance.ai.pauseAfterRateMs
        lastError = `${provider.id}: лимит запросов, пауза ${Math.round(balance.ai.pauseAfterRateMs / 60000)} мин`
        break
      case 'network':
        pausedUntil = now() + balance.ai.pauseAfterNetworkMs
        lastError = 'Нет связи, игра идёт без ИИ'
        break
      default:
        lastError = `${provider.id}: ${e.message}`
    }
  } else {
    lastError = e instanceof Error ? e.message : String(e)
  }
  notify()
}

async function call<T>(task: AITaskId, prompt: string, schema: JsonSchema, parse: (v: unknown) => T | null, useCache = true): Promise<T | null> {
  if (!aiAvailable()) return null
  const key = cacheKey(task, prompt)
  if (useCache) {
    const cached = await getCached(key)
    if (cached !== null) {
      try {
        const v = parse(JSON.parse(cached))
        if (v !== null) return v
      } catch {
        /* a stale bad entry is simply regenerated */
      }
    }
  }
  const provider = providerFor()
  if (!provider) return null
  log.push(task)
  try {
    const text = await (provider.id === 'fake' ? fakeQueue : realQueue).enqueue(() => provider.complete({ task, system: P.SYSTEM, prompt, schema }))
    let value: T | null
    try {
      value = parse(JSON.parse(stripFences(text)))
    } catch {
      value = null
    }
    if (value === null) {
      lastError = `${provider.id}: ответ не по схеме`
      notify()
      return null
    }
    if (useCache) await putCached(key, task, stripFences(text), now())
    lastError = null
    return value
  } catch (e) {
    handleError(e, provider)
    return null
  }
}

// ---- tasks (SPEC §10.3) ----

export function checkProduction(input: P.ProductionInput): Promise<ProductionCheck | null> {
  return call('checkProduction', P.productionPrompt(input), P.productionCheckSchema, P.parseProductionCheck)
}

export function sceneTurn(input: P.SceneInput): Promise<SceneTurnResult | null> {
  return call('sceneTurn', P.scenePrompt(input), P.sceneTurnSchema, P.parseSceneTurn)
}

export function freshContexts(items: readonly { id: string; en: string; ru: string }[]): Promise<FreshContext[] | null> {
  if (items.length === 0) return Promise.resolve([])
  return call('freshContexts', P.freshContextsPrompt(items), P.freshContextsSchema, P.parseFreshContexts)
}

export function fromLife(mode: P.LifeMode, text: string, sentence?: string): Promise<LifeItemDraft[] | null> {
  return call('fromLife', P.fromLifePrompt(mode, text, sentence), P.fromLifeSchema, P.parseLifeItems)
}

export function mnemonic(input: { en: string; ru: string; errors: readonly string[] }): Promise<string | null> {
  return call('mnemonic', P.mnemonicPrompt(input), P.mnemonicSchema, P.parseMnemonic)
}

/** A live round trip for the settings screen; never cached. Resolves with null on success or the error text. */
export async function ping(): Promise<string | null> {
  const before = lastError
  const ok = await call('ping', P.PING_PROMPT, P.pingSchema, (v) => (P.parsePing(v) ? true : null), false)
  if (ok) return null
  return lastError ?? before ?? 'ИИ не ответил'
}

// ---- test and dev support ----

/** Installs a provider double (tests) or removes it. Also clears pauses and broken marks. */
export function setAIOverride(p: AIProvider | null): void {
  override = p
  resetAIState()
}

export function resetAIState(): void {
  broken.clear()
  pausedUntil = 0
  lastError = null
  log.length = 0
  notify()
}

export function aiCallLog(): AITaskId[] {
  return [...log]
}
