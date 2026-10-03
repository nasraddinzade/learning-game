import { describe, expect, it } from 'vitest'
import { seedItems } from '@/content/seed'
import { matchVoice } from '@/engine/answerCheck'
import { mulberry32 } from '@/engine/rng'
import { buildDictation, buildImprov, buildListen, buildTranslate, buildVoice, canUse, checkTask } from './tasks'

const item = seedItems.find((i) => i.id === 'opinion.it-depends-on')!

describe('На слух', () => {
  it('speaks a sentence of the item and offers three meanings with the right one among them', () => {
    const t = buildListen(item, mulberry32(3), seedItems)
    expect(item.contexts.map((c) => c.en)).toContain(t.sentenceEn)
    expect(t.options).toHaveLength(3)
    expect(new Set(t.options).size).toBe(3)
    const ctx = item.contexts.find((c) => c.en === t.sentenceEn)!
    expect(t.options[t.correctIndex]).toBe(ctx.ru)
    expect(checkTask(t, String(t.correctIndex), false).correct).toBe(true)
    expect(checkTask(t, String((t.correctIndex + 1) % 3), false).correct).toBe(false)
  })

  it('takes distractors from other items of the same land', () => {
    const t = buildListen(item, mulberry32(5), seedItems)
    const ownRu = new Set(item.contexts.map((c) => c.ru))
    const foreign = t.options.filter((o) => !ownRu.has(o))
    expect(foreign).toHaveLength(2)
    const landRu = new Set(seedItems.filter((i) => i.land === item.land).flatMap((i) => i.contexts.map((c) => c.ru)))
    for (const o of foreign) expect(landRu.has(o)).toBe(true)
  })

  it('still works with no pool: falls back to own sentences and false meanings', () => {
    const t = buildListen(item, mulberry32(1))
    expect(t.options).toHaveLength(3)
    expect(t.options[t.correctIndex]).toBeDefined()
  })
})

describe('Диктант', () => {
  it('expects the spoken sentence, one typo tolerated', () => {
    const t = buildDictation(item, mulberry32(1))
    expect(t.expected).toEqual([t.sentenceEn])
    expect(checkTask(t, t.sentenceEn.toLowerCase(), false).correct).toBe(true)
    const words = t.sentenceEn.split(' ')
    const long = words.findIndex((w) => w.replace(/[^a-z]/gi, '').length > 4)
    // One substituted letter inside a long word: the single-typo allowance.
    const typo = words.map((w, i) => (i === long ? w.slice(0, 2) + 'x' + w.slice(3) : w)).join(' ')
    expect(checkTask(t, typo, false)).toMatchObject({ correct: true, typo: true })
    expect(checkTask(t, 'something else entirely', false).correct).toBe(false)
  })
})

describe('Голос', () => {
  it('passes when the phrase is heard, flags a typo when most of it is heard', () => {
    const t = buildVoice(item, mulberry32(1))
    expect(checkTask(t, 'well it depends on the weather', false)).toMatchObject({ correct: true, typo: false })
    expect(checkTask(t, 'it is up to the weather', false).correct).toBe(false)
  })

  it('accepts alternatives: any transcript may contain the phrase', () => {
    const r = matchVoice(['it depends of the weather', 'it depends on the weather'], ['it depends on'])
    expect(r).toMatchObject({ ok: true, typo: false })
  })

  it('counts a mostly-heard long phrase as a typo', () => {
    // "concern" for "concerned": five of six target words heard.
    const r = matchVoice(['well as far as i am concern we can ship'], ["As far as I'm concerned"], 0.8)
    expect(r.ok).toBe(true)
    expect(r.typo).toBe(true)
    expect(matchVoice(['hello there'], ['it depends on']).ok).toBe(false)
  })

  it('self-assessment maps to right, typo and miss', () => {
    const t = buildVoice(item, mulberry32(1))
    expect(checkTask(t, 'self:ok', false)).toMatchObject({ correct: true, typo: false })
    expect(checkTask(t, 'self:typo', false)).toMatchObject({ correct: true, typo: true })
    expect(checkTask(t, 'self:fail', false).correct).toBe(false)
  })
})

describe('Экспромт', () => {
  it('uses a situation Перевод does not use, has a start window, empty answer is a miss', () => {
    const improv = buildImprov(item, mulberry32(1))
    expect(item.promptsRu).toContain(improv.promptRu)
    const translatePrompts = new Set<string>()
    const improvPrompts = new Set<string>()
    for (let seed = 0; seed < 30; seed++) {
      translatePrompts.add(buildTranslate(item, mulberry32(seed)).promptRu)
      improvPrompts.add(buildImprov(item, mulberry32(seed)).promptRu)
    }
    for (const p of improvPrompts) expect(translatePrompts.has(p)).toBe(false)
    expect(improv.startWindowMs).toBeGreaterThan(0)
    expect(checkTask(improv, '', false)).toMatchObject({ correct: false, answer: '(не начал)' })
    expect(checkTask(improv, 'It depends on my mood today', false).correct).toBe(true)
  })

  it('every seed item supports the new moves', () => {
    for (const i of seedItems) {
      for (const m of ['listen', 'dictation', 'voice', 'improv'] as const) expect(canUse(m, i), `${i.id} ${m}`).toBe(true)
    }
  })
})
