// A deterministic stand-in for the model (dev panel and Playwright). It reads the prompt the real
// provider would get and answers by simple rules, so tests can drive outcomes with the answer text:
//   - an answer containing "he work" has an sv-agreement error, "I can drink" a habit error,
//   - the word "mistake" is a generic error without a pattern,
//   - everything else is fine; usedTarget is a plain substring check.
// A script may replace the answer of any task with canned JSON.
import { normalize } from '@/engine/answerCheck'
import type { AIProvider, AIRequest, AITaskId, Correction } from './types'

export type FakeScript = Partial<Record<AITaskId, unknown>>

function line(prompt: string, label: string): string {
  const m = new RegExp(`^${label}:\\s*(.*)$`, 'm').exec(prompt)
  return m?.[1]?.trim() ?? ''
}

export function fakeCorrections(answer: string): Correction[] {
  const errors: Correction[] = []
  if (/\bhe work\b/i.test(answer)) errors.push({ wrong: 'he work', right: 'he works', ruleRu: 'После he, she, it к глаголу добавляется -s.', patternId: 'sv-agreement' })
  if (/\bI can drink\b/i.test(answer)) errors.push({ wrong: 'I can drink', right: 'I drink', ruleRu: 'Про привычку говорят без can.', patternId: 'habit-present-simple' })
  if (/\bmistake\b/i.test(answer)) errors.push({ wrong: 'mistake', right: 'slip', ruleRu: 'Здесь естественнее другое слово.', patternId: null })
  return errors
}

function usedTarget(answer: string, target: string): boolean {
  const a = normalize(answer)
  const t = normalize(target.split(' (also fine:')[0] ?? target)
  return t.length > 0 && a.includes(t)
}

function check(answer: string, target: string) {
  const errors = fakeCorrections(answer)
  let corrected = answer
  for (const e of errors) corrected = corrected.replace(new RegExp(e.wrong, 'i'), e.right)
  return { ok: errors.length === 0, usedTarget: usedTarget(answer, target), corrected, errors, moreNatural: /\bvery good\b/i.test(answer) ? answer.replace(/very good/i, 'great') : null }
}

function answerFor(req: AIRequest): unknown {
  const p = req.prompt
  switch (req.task) {
    case 'ping':
      return { ok: true }
    case 'checkProduction':
      return check(line(p, 'ANSWER'), line(p, 'TARGET PHRASE'))
    case 'sceneTurn': {
      const last = line(p, 'LAST LEARNER ANSWER TO CHECK')
      const heroLines = p
        .split('\n')
        .filter((l) => l.startsWith('LEARNER: '))
        .map((l) => l.slice('LEARNER: '.length))
      const closing = /final exchange/.test(p)
      const targets = line(p, "The learner tries to use these phrases").replace(/\.$/, '')
      const firstTarget = targets.split(';')[0]?.trim() ?? ''
      const fails = heroLines.filter((l) => l.trim() === '' || /mistake/i.test(l)).length
      const turn = /Exchange (\d+) of/.exec(p)?.[1] ?? '1'
      return {
        npcLine: closing ? 'Alright, thanks for talking. See you around.' : `Fake line ${turn}: and what do you think about it?`,
        check: last ? { ...check(last, firstTarget), usedTarget: targets.split(';').some((t) => usedTarget(last, t.trim())) } : null,
        outcome: closing ? (fails === 0 ? 'success' : fails === 1 ? 'partial' : 'fail') : null,
        whyRu: closing ? (fails === 0 ? 'Ты довёл разговор до цели.' : 'Часть реплик не сработала.') : null,
      }
    }
    case 'freshContexts': {
      const items = [...p.matchAll(/^- id=(\S+) \| ([^|]+) \| /gm)].map((m) => ({ id: m[1]!, en: m[2]!.trim() }))
      return {
        items: items.map((i) => ({
          id: i.id,
          contexts: [
            { en: `Fresh one: ${i.en}, you know.`, ru: `Свежий пример один: ${i.en}.` },
            { en: `Fresh two: honestly, ${i.en}.`, ru: `Свежий пример два: ${i.en}.` },
          ],
          promptRu: `Новая ситуация: скажи «${i.en}» другу.`,
        })),
      }
    }
    case 'fromLife': {
      const ru = line(p, 'RUSSIAN')
      const phrase = line(p, 'PHRASE')
      const sentence = line(p, 'SENTENCE')
      const draft = (en: string, ruText: string, ctx: string) => ({
        en,
        ru: ruText,
        accept: [],
        contexts: [
          { en: ctx, ru: `Контекст: ${ruText}` },
          { en: `Another day, ${en} again.`, ru: `Ещё раз: ${ruText}.` },
        ],
        promptsRu: [`Скажи «${ruText}» коллеге.`, `Скажи «${ruText}» другу.`],
        falseMeanings: ['совсем не то', 'и это не то'],
        noteRu: `Так говорят, когда нужно «${ruText}».`,
      })
      if (ru) return { items: [draft('as a matter of fact', ru, `As a matter of fact, ${ru}.`)] }
      if (phrase) return { items: [draft(phrase, `перевод: ${phrase}`, sentence || phrase)] }
      const textStart = p.indexOf('TEXT:\n')
      const text = textStart >= 0 ? p.slice(textStart + 6).split('\nReturn the items')[0] ?? '' : ''
      const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).slice(0, 5)
      return {
        items: sentences.map((s) => {
          const words = s.replace(/[^\p{L}\p{N}' ]/gu, ' ').trim().split(/\s+/).slice(0, 3).join(' ')
          return draft(words, `смысл: ${words}`, s.trim())
        }),
      }
    }
    case 'mnemonic': {
      const m = /phrase "([^"]+)"/.exec(p)
      return { mnemonicRu: `Мнемоника: представь «${m?.[1] ?? '...'}» как картинку.` }
    }
    default:
      return {}
  }
}

export function createFakeAI(script: FakeScript = {}): AIProvider {
  return {
    id: 'fake',
    async complete(req) {
      const canned = script[req.task]
      return JSON.stringify(canned !== undefined ? canned : answerFor(req))
    },
  }
}
