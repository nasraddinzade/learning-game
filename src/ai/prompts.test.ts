import { describe, expect, it } from 'vitest'
import { createFakeAI, fakeCorrections } from './fake'
import { parseFreshContexts, parseLifeItems, parseProductionCheck, parseSceneTurn, productionPrompt, scenePrompt, SYSTEM, productionCheckSchema } from './prompts'

describe('validators turn untrusted JSON into typed values', () => {
  it('accepts a proper production check and whitelists pattern ids', () => {
    const v = parseProductionCheck({
      ok: true,
      usedTarget: true,
      corrected: 'I ended up staying home.',
      errors: [{ wrong: 'he work', right: 'he works', ruleRu: 'После he нужно -s.', patternId: 'sv-agreement' }, { wrong: 'x', right: 'y', ruleRu: '', patternId: 'made-up' }],
      moreNatural: '',
    })
    expect(v).not.toBeNull()
    // Errors present means ok is false whatever the model said.
    expect(v!.ok).toBe(false)
    expect(v!.errors.map((e) => e.patternId)).toEqual(['sv-agreement', null])
    expect(v!.moreNatural).toBeNull()
  })

  it('rejects shapes without the booleans and drops empty corrections', () => {
    expect(parseProductionCheck({ corrected: 'x' })).toBeNull()
    expect(parseProductionCheck('nope')).toBeNull()
    const v = parseProductionCheck({ ok: true, usedTarget: false, corrected: '', errors: [{ wrong: 'same', right: 'same', ruleRu: '' }], moreNatural: null })
    expect(v!.errors).toEqual([])
    expect(v!.ok).toBe(true)
  })

  it('parses a scene turn with a nullable check and a known outcome', () => {
    const v = parseSceneTurn({ npcLine: 'Sure.', check: null, outcome: 'weird', whyRu: '' })
    expect(v).toEqual({ npcLine: 'Sure.', check: null, outcome: null, whyRu: null })
    const w = parseSceneTurn({ npcLine: 'Bye', check: { ok: true, usedTarget: true, corrected: 'x', errors: [], moreNatural: null }, outcome: 'partial', whyRu: 'Почти.' })
    expect(w!.outcome).toBe('partial')
    expect(w!.check!.ok).toBe(true)
  })

  it('keeps only items with an id and at least one context; life items need en and ru', () => {
    const f = parseFreshContexts({ items: [{ id: 'a', contexts: [{ en: 'A one.', ru: 'А.' }, { en: 'A two.', ru: '' }, { en: 'A three.', ru: '' }], promptRu: 'Скажи.' }, { id: '', contexts: [] }, { id: 'b', contexts: [] }] })
    expect(f!.map((x) => x.id)).toEqual(['a'])
    expect(f![0]!.contexts).toHaveLength(2)
    const items = parseLifeItems({ items: [{ en: 'end up', ru: 'в итоге', accept: ['wind up'], contexts: [{ en: 'I ended up here.', ru: 'Я оказался здесь.' }], promptsRu: ['a', 'b', 'c', 'd'], falseMeanings: [], noteRu: 'n' }, { en: 'no ru' }] })
    expect(items).toHaveLength(1)
    expect(items![0]!.promptsRu).toHaveLength(3)
    expect(parseLifeItems({ items: [] })).toBeNull()
  })
})

describe('prompts carry the inputs the fake and the model need', () => {
  it('production prompt names the target, situation and answer', () => {
    const p = productionPrompt({ answer: 'I ended up at home.', target: 'end up', accept: ['wind up'], situation: 'Как прошли выходные?' })
    expect(p).toContain('TARGET PHRASE: end up (also fine: wind up)')
    expect(p).toContain('ANSWER: I ended up at home.')
    expect(SYSTEM).toContain('JSON')
    expect(productionCheckSchema).toHaveProperty('required')
  })

  it('scene prompt marks the final exchange and the last learner answer', () => {
    const p = scenePrompt({ title: 'Bar', settingEn: 'a bar', goalEn: 'make small talk', character: 'a stranger', targets: ['how have you been'], history: [{ role: 'npc', text: 'Hi' }, { role: 'hero', text: 'Hey, how have you been?' }], turn: 3, totalTurns: 3 })
    expect(p).toContain('final exchange')
    expect(p).toContain('LAST LEARNER ANSWER TO CHECK: Hey, how have you been?')
  })
})

describe('fake provider rules', () => {
  it('finds the scripted errors and the target', async () => {
    expect(fakeCorrections('he work here and I can drink coffee').map((e) => e.patternId)).toEqual(['sv-agreement', 'habit-present-simple'])
    const fake = createFakeAI()
    const raw = await fake.complete({ task: 'checkProduction', system: SYSTEM, schema: {}, prompt: productionPrompt({ answer: 'I guess he work a lot.', target: 'I guess', accept: [], situation: 's' }) })
    const v = parseProductionCheck(JSON.parse(raw))
    expect(v!.usedTarget).toBe(true)
    expect(v!.ok).toBe(false)
    expect(v!.corrected).toBe('I guess he works a lot.')
  })

  it('a script replaces the answer of a task', async () => {
    const fake = createFakeAI({ mnemonic: { mnemonicRu: 'Заученная.' } })
    expect(JSON.parse(await fake.complete({ task: 'mnemonic', system: '', schema: {}, prompt: 'phrase "x"' }))).toEqual({ mnemonicRu: 'Заученная.' })
  })
})
