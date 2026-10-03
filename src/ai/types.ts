// AI layer contracts (SPEC §10). The game never depends on these answers: every call may return null.

export type AITaskId = 'checkProduction' | 'sceneTurn' | 'freshContexts' | 'fromLife' | 'mnemonic' | 'ping'

/** A JSON schema in the small dialect both Gemini (responseSchema) and Groq (json_object hint) accept. */
export type JsonSchema = Record<string, unknown>

export interface AIRequest {
  task: AITaskId
  system: string
  prompt: string
  schema: JsonSchema
}

export type AIProviderId = 'gemini' | 'groq' | 'fake'

export interface AIProvider {
  id: AIProviderId
  /** Returns the raw JSON text of the model answer. Throws AIError. */
  complete(req: AIRequest): Promise<string>
}

export type AIErrorKind = 'auth' | 'rate' | 'network' | 'bad-response' | 'other'

export class AIError extends Error {
  kind: AIErrorKind
  retryAfterMs: number | null
  constructor(kind: AIErrorKind, message: string, retryAfterMs: number | null = null) {
    super(message)
    this.name = 'AIError'
    this.kind = kind
    this.retryAfterMs = retryAfterMs
  }
}

/** One correction from checkProduction (SPEC §10.3). */
export interface Correction {
  wrong: string
  right: string
  ruleRu: string
  patternId: string | null
}

export interface ProductionCheck {
  ok: boolean
  usedTarget: boolean
  corrected: string
  errors: Correction[]
  moreNatural: string | null
}

export type SceneOutcome = 'success' | 'partial' | 'fail'

export interface SceneTurnResult {
  /** The character's next line (empty on the closing turn). */
  npcLine: string
  /** Check of the hero's last answer; null on the opening turn. */
  check: ProductionCheck | null
  outcome: SceneOutcome | null
  whyRu: string | null
}

export interface FreshContext {
  id: string
  contexts: { en: string; ru: string }[]
  promptRu: string
}

/** An item in seed format produced from the user's life (SPEC §9.2). */
export interface LifeItemDraft {
  en: string
  ru: string
  accept: string[]
  contexts: { en: string; ru: string }[]
  promptsRu: string[]
  falseMeanings: string[]
  noteRu: string
}
