import { AIError, type AIProvider, type AIRequest } from './types'

const URL = 'https://api.groq.com/openai/v1/chat/completions'

interface ChatResponse {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

/** Groq free tier through its OpenAI-compatible API (SPEC §10.1), the backup provider. */
export function createGroq(key: string, model: string, fetchFn: typeof fetch = fetch): AIProvider {
  return {
    id: 'groq',
    async complete(req: AIRequest): Promise<string> {
      let res: Response
      try {
        res = await fetchFn(URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            temperature: 0.4,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: `${req.system}\nAnswer with one JSON object matching this schema exactly:\n${JSON.stringify(req.schema)}` },
              { role: 'user', content: req.prompt },
            ],
          }),
        })
      } catch (e) {
        throw new AIError('network', e instanceof Error ? e.message : 'fetch failed')
      }
      let body: ChatResponse = {}
      try {
        body = (await res.json()) as ChatResponse
      } catch {
        /* handled by status */
      }
      if (res.status === 401 || res.status === 403) throw new AIError('auth', body.error?.message ?? `HTTP ${res.status}`)
      if (res.status === 429) {
        const h = res.headers.get('retry-after')
        throw new AIError('rate', body.error?.message ?? 'rate limited', h && Number.isFinite(Number(h)) ? Number(h) * 1000 : null)
      }
      if (!res.ok) throw new AIError('other', body.error?.message ?? `HTTP ${res.status}`)
      const text = body.choices?.[0]?.message?.content ?? ''
      if (!text) throw new AIError('bad-response', 'empty answer')
      return text
    },
  }
}
