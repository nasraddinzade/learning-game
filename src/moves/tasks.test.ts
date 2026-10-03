import { describe, expect, it } from 'vitest'
import { seedItems } from '@/content/seed'
import { normalize } from '@/engine/answerCheck'
import { mulberry32 } from '@/engine/rng'
import { buildBuild, buildGap, buildSwipe, buildTranslate, canUse, checkTask, hintFor } from './tasks'
import { IMPLEMENTED_MOVES } from './types'

const item = seedItems.find((i) => i.id === 'opinion.it-depends-on')!

describe('task builders', () => {
  it('every seed item supports every implemented move', () => {
    for (const i of seedItems) {
      for (const m of IMPLEMENTED_MOVES) expect(canUse(m, i), `${i.id} ${m}`).toBe(true)
    }
  })

  it('swipe: real meaning when matches, a false meaning otherwise', () => {
    let sawTrue = false
    let sawFalse = false
    for (let seed = 0; seed < 20; seed++) {
      const t = buildSwipe(item, mulberry32(seed))
      if (t.matches) {
        sawTrue = true
        expect(t.meaningRu).toBe(item.ru)
      } else {
        sawFalse = true
        expect(item.falseMeanings).toContain(t.meaningRu)
      }
      expect(checkTask(t, t.matches ? 'right' : 'left', false).correct).toBe(true)
      expect(checkTask(t, t.matches ? 'left' : 'right', false).correct).toBe(false)
    }
    expect(sawTrue && sawFalse).toBe(true)
  })

  it('build: tiles contain every word of the sentence plus 2–3 distractors', () => {
    const t = buildBuild(item, mulberry32(7))
    const sentence = t.expected[0]!
    const words = sentence.split(/\s+/).map((w) => w.replace(/[.,!?;:]+$/g, ''))
    for (const w of words) expect(t.tiles).toContain(w)
    expect(t.tiles.length - words.length).toBeGreaterThanOrEqual(2)
    expect(t.tiles.length - words.length).toBeLessThanOrEqual(3)
    expect(checkTask(t, words.join(' '), false).correct).toBe(true)
    expect(checkTask(t, [...words, 'the'].join(' '), false).correct).toBe(false)
  })

  it('gap: before + phrase + after rebuilds the sentence; hint shows first letters', () => {
    const t = buildGap(item)
    const full = `${t.before}${item.en}${t.after}`
    expect(item.contexts.some((c) => normalize(c.en) === normalize(full))).toBe(true)
    expect(t.hint).toBe(hintFor(item.en))
    expect(hintFor('it depends on')).toBe('i· d······ o·')
    expect(checkTask(t, 'It depends on', true)).toMatchObject({ correct: true, hintUsed: true })
    expect(checkTask(t, 'it depands on', false)).toMatchObject({ correct: true, typo: true })
  })

  it('translate (situation): accepts any sentence that contains the phrase', () => {
    const t = buildTranslate(item, mulberry32(1))
    expect(t.mode).toBe('situation')
    expect(item.promptsRu).toContain(t.promptRu)
    expect(checkTask(t, 'Well, it depends on the weather', false).correct).toBe(true)
    expect(checkTask(t, 'It is up to the weather', false).correct).toBe(false)
  })

  it('translate (phrase): exact match when the item has no situations', () => {
    const t = buildTranslate({ ...item, promptsRu: [] }, mulberry32(1))
    expect(t.mode).toBe('phrase')
    expect(t.promptRu).toBe(item.ru)
    expect(checkTask(t, 'depends on', false).correct).toBe(true)
    expect(checkTask(t, 'it depends on the weather', false).correct).toBe(false)
  })

  it('is deterministic for the same seed', () => {
    expect(buildBuild(item, mulberry32(3))).toEqual(buildBuild(item, mulberry32(3)))
  })
})
