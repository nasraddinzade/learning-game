import { describe, expect, it } from 'vitest'
import { lands, seedItems, seedPatterns } from './seed'

describe('seed content (SPEC §9.1)', () => {
  it('has at least 100 items for stage 1', () => {
    expect(seedItems.length).toBeGreaterThanOrEqual(100)
  })

  it('has unique ids that start with the land id', () => {
    const ids = new Set(seedItems.map((i) => i.id))
    expect(ids.size).toBe(seedItems.length)
    const landIds = new Set(lands.map((l) => l.id))
    for (const item of seedItems) {
      expect(landIds.has(item.land)).toBe(true)
      expect(item.id.startsWith(`${item.land}.`)).toBe(true)
    }
  })

  it('every item has the required fields', () => {
    for (const item of seedItems) {
      expect(item.en.trim().length, item.id).toBeGreaterThan(0)
      expect(item.ru.trim().length, item.id).toBeGreaterThan(0)
      expect(item.contexts.length, `${item.id} contexts`).toBeGreaterThanOrEqual(3)
      expect(item.promptsRu.length, `${item.id} promptsRu`).toBeGreaterThanOrEqual(2)
      expect(item.questionEn.trim().length, `${item.id} questionEn`).toBeGreaterThan(0)
      expect(item.falseMeanings.length, `${item.id} falseMeanings`).toBeGreaterThanOrEqual(2)
      expect(item.noteRu.trim().length, `${item.id} noteRu`).toBeGreaterThan(0)
      for (const c of item.contexts) {
        expect(c.en.trim().length, item.id).toBeGreaterThan(0)
        expect(c.ru.trim().length, item.id).toBeGreaterThan(0)
      }
    }
  })

  it('every item has a context that contains the phrase (needed for Пропуск)', () => {
    for (const item of seedItems) {
      const variants = [item.en, ...item.accept].map((v) => v.toLowerCase())
      const ok = item.contexts.some((c) => variants.some((v) => c.en.toLowerCase().includes(v)))
      expect(ok, `${item.id}: no context contains "${item.en}"`).toBe(true)
    }
  })

  it('false meanings differ from the real meaning', () => {
    for (const item of seedItems) {
      for (const f of item.falseMeanings) expect(f.toLowerCase(), item.id).not.toBe(item.ru.toLowerCase())
    }
  })

  it('patterns have at least 40 trap exercises with consistent fields', () => {
    expect(seedPatterns.length).toBeGreaterThanOrEqual(2)
    for (const p of seedPatterns) {
      expect(p.explainRu.length).toBeGreaterThan(0)
      expect(p.exercises.length, p.id).toBeGreaterThanOrEqual(40)
      let correct = 0
      for (const ex of p.exercises) {
        expect(ex.tokens.length).toBeGreaterThan(1)
        expect(ex.ruleRu.length).toBeGreaterThan(0)
        if (ex.wrongIndex === null) {
          correct++
          expect(ex.fix).toBeNull()
        } else {
          expect(ex.wrongIndex).toBeLessThan(ex.tokens.length)
          expect(typeof ex.fix).toBe('string')
        }
      }
      // Some sentences must be correct, otherwise "Всё правильно" is never the answer.
      expect(correct, `${p.id} correct sentences`).toBeGreaterThanOrEqual(8)
    }
  })
})
