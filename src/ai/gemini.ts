import { AIError, type AIProvider, type AIRequest } from './types'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  error?: { message?: string; status?: string; details?: { retryDelay?: string }[] }
}

function retryAfterFrom(res: Response, body: GeminiResponse): number | null {
  const header = res.headers.get('retry-after')
  if (header && Number.isFinite(Number(header))) return Number(header) * 1000
  const delay = body.error?.details?.find((d) => d.retryDelay)?.retryDelay
  if (delay) {
    const s = Number(delay.replace(/s$/, ''))
    if (Number.isFinite(s)) return s * 1000
  }
  return null
}

/** Gemini API, free tier of Google AI Studio (SPEC §10.1). The key travels in a header, never in the URL. */
export function createGemini(key: string, model: string, fetchFn: typeof fetch = fetch): AIProvider {
  return {
    id: 'gemini',
    async complete(req: AIRequest): Promise<string> {
      let res: Response
      try {
        res = await fetchFn(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: req.schema, temperature: 0.4 },
          }),
        })
      } catch (e) {
        throw new AIError('network', e instanceof Error ? e.message : 'fetch failed')
      }
      let body: GeminiResponse = {}
      try {
        body = (await res.json()) as GeminiResponse
      } catch {
        /* a non-JSON body is handled by the status below */
      }
      if (res.status === 401 || res.status === 403 || res.status === 400 && /api key/i.test(body.error?.message ?? '')) {
        throw new AIError('auth', body.error?.message ?? `HTTP ${res.status}`)
      }
      if (res.status === 429) throw new AIError('rate', body.error?.message ?? 'rate limited', retryAfterFrom(res, body))
      if (!res.ok) throw new AIError('other', body.error?.message ?? `HTTP ${res.status}`)
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      if (!text) throw new AIError('bad-response', `empty answer (${body.candidates?.[0]?.finishReason ?? 'no candidates'})`)
      return text
    },
  }
}
