import { describe, expect, it } from 'vitest'
import { seedScenes } from '@/content/scenes'
import { mulberry32 } from '@/engine/rng'
import { newProgress, applyIntro, applyAnswer } from '@/engine/progress'
import type { Item, Progress, Run } from '@/types'
import { balance } from './balance'
import { applyTurn, chipsUsedIn, finishEncounterNode, outcomeFromAnswers, pickChips, startEncounterNode } from './encounter'
import { createRun } from './run'

const T0 = new Date(2026, 9, 4, 12).getTime()

function item(id: string, en: string): Item {
  return { id, type: 'phrase', land: 'x', en, ru: en, accept: [], contexts: [], promptsRu: [], questionEn: '', falseMeanings: [], noteRu: '', source: 'seed', createdAt: 0 }
}

function staged(id: string, stage: number): Progress {
  let p = applyIntro(newProgress(id, T0), T0)
  for (let i = 1; i < stage; i++) p = applyAnswer(p, { move: 'translate', correct: true, rating: 3, risked: false, now: T0 + i }).progress
  return p
}

function baseRun(seen: string[]): Run {
  const run = createRun({ id: 'r', seed: 7, now: T0, queue: [], maxHp: 5, allowEncounter: true })
  return { ...run, stats: { ...run.stats, seenItemIds: seen } }
}

describe('seed scenes', () => {
  it('nine scenes with an opening and three exchanges each', () => {
    expect(seedScenes).toHaveLength(9)
    for (const s of seedScenes) {
      expect(s.turns).toHaveLength(balance.encounter.turns)
      expect(s.opening.length).toBeGreaterThan(10)
      for (const t of s.turns) expect(t.sampleEn.length).toBeGreaterThan(10)
    }
  })
})

describe('encounter node', () => {
  const items = new Map([
    ['a', item('a', 'to be honest')],
    ['b', item('b', 'it depends')],
    ['c', item('c', 'end up')],
    ['d', item('d', 'in the long run')],
  ])
  const progress = new Map<string, Progress>([
    ['a', staged('a', 1)],
    ['b', staged('b', 3)],
    ['c', staged('c', 4)],
    ['d', staged('d', 2)],
  ])

  it('chips are the most advanced phrases met today, up to three, never pattern enemies', () => {
    const run = baseRun(['a', 'b', 'c', 'd', 'pattern:articles'])
    expect(pickChips(run, items, progress)).toEqual(['c', 'b', 'd'])
    expect(pickChips(baseRun([]), items, progress)).toEqual([])
  })

  it('starts with the opening line, finds used chips, closes after three turns with a reward', () => {
    const run = startEncounterNode(baseRun(['a', 'b', 'c']), { step: 2, node: 0 }, seedScenes, items, progress, T0)
    const scene = seedScenes.find((s) => s.id === run.encounter!.sceneId)!
    expect(run.phase).toBe('encounter')
    expect(run.encounter!.history).toEqual([{ role: 'npc', text: scene.opening }])
    expect(chipsUsedIn(run.encounter!, "Well, it depends, to be honest.", items).sort()).toEqual(['a', 'b'])

    let st = run.encounter!
    const ok = { ok: true, typo: false, corrections: [], ai: false }
    st = applyTurn(st, scene, { text: 'First.', verdict: ok, npcLine: 'Reply one.', usedChipIds: ['b'], outcome: null, whyRu: null, now: T0 + 1 })
    expect(st.turn).toBe(1)
    expect(st.phase).toBe('talk')
    expect(st.chips.find((c) => c.itemId === 'b')!.used).toBe(true)
    expect(st.history.map((h) => h.role)).toEqual(['npc', 'hero', 'npc'])
    st = applyTurn(st, scene, { text: '', verdict: { ...ok, ok: false }, npcLine: 'Reply two.', usedChipIds: [], outcome: null, whyRu: null, now: T0 + 2 })
    expect(st.history[3]!.text).toBe('(молчание)')
    st = applyTurn(st, scene, { text: 'Last.', verdict: ok, npcLine: 'Bye.', usedChipIds: [], outcome: null, whyRu: null, now: T0 + 3 })
    expect(st.phase).toBe('result')
    expect(st.outcome).toBe('partial')
    expect(st.runes).toBe(balance.encounter.runes.partial)

    const done = finishEncounterNode({ ...run, encounter: st })
    expect(done.phase).toBe('map')
    expect(done.encounter).toBeNull()
    expect(done.runes).toBe(balance.encounter.runes.partial)
    expect(done.map[2]![0]!.done).toBe(true)
  })

  it('an AI outcome on the closing turn wins over the computed one', () => {
    const run = startEncounterNode(baseRun(['a']), { step: 1, node: 0 }, seedScenes, items, progress, T0)
    const scene = seedScenes.find((s) => s.id === run.encounter!.sceneId)!
    let st = run.encounter!
    const bad = { ok: false, typo: false, corrections: [], ai: true }
    for (let i = 0; i < 2; i++) st = applyTurn(st, scene, { text: 'x', verdict: bad, npcLine: 'r', usedChipIds: [], outcome: null, whyRu: null, now: T0 })
    st = applyTurn(st, scene, { text: 'x', verdict: bad, npcLine: 'r', usedChipIds: [], outcome: 'partial', whyRu: 'Почти.', now: T0 })
    expect(st.outcome).toBe('partial')
    expect(st.whyRu).toBe('Почти.')
    expect(outcomeFromAnswers(st.answers)).toBe('fail')
  })

  it('the map can hold one encounter when allowed', () => {
    const run = createRun({ id: 'r', seed: 3, now: T0, queue: [], maxHp: 5, allowEncounter: true })
    const encounters = run.map.flat().filter((n) => n.type === 'encounter').length
    expect(encounters).toBeLessThanOrEqual(1)
    const rng = mulberry32(1)
    expect(rng()).toBeGreaterThanOrEqual(0)
  })
})
