import { describe, expect, it } from 'vitest'
import { checkAnswer, containsTarget, levenshtein, normalize, wordOverlap } from './answerCheck'

describe('normalize', () => {
  it('ignores case and punctuation', () => {
    expect(normalize('  It DEPENDS on... the Weather!! ')).toBe('it depends on the weather')
  })
  it('expands contractions so they equal full forms', () => {
    expect(normalize("I'm on my way")).toBe(normalize('I am on my way'))
    expect(normalize("I can't wait")).toBe(normalize('I cannot wait'))
    expect(normalize("don't")).toBe('do not')
    expect(normalize("won't")).toBe('will not')
    expect(normalize("let's")).toBe('let us')
    expect(normalize('I’m')).toBe('i am')
  })
})

describe('checkAnswer', () => {
  const expected = ['it depends on', 'depends on']
  it('accepts exact and accept-list variants', () => {
    expect(checkAnswer('It depends on.', expected)).toEqual({ ok: true, typo: false, matched: 'it depends on' })
    expect(checkAnswer('depends on', expected).ok).toBe(true)
  })
  it('rejects a different answer', () => {
    expect(checkAnswer('it depends from', expected).ok).toBe(false)
    expect(checkAnswer('', expected).ok).toBe(false)
  })
  it('allows one typo in a word longer than 4 letters and flags it', () => {
    const r = checkAnswer('it depands on', expected)
    expect(r).toEqual({ ok: true, typo: true, matched: 'it depends on' })
  })
  it('does not allow a typo in a short word', () => {
    expect(checkAnswer('it depends in', expected).ok).toBe(false)
  })
  it('does not allow two typos', () => {
    expect(checkAnswer('ot depands on', expected).ok).toBe(false)
  })
  it('prefers an exact match over a typo match', () => {
    expect(checkAnswer('depends on', ['depands on', 'depends on']).typo).toBe(false)
  })
})

describe('containsTarget', () => {
  it('finds the phrase inside a sentence', () => {
    const r = containsTarget('Well, it depends on the weather.', ['it depends on'])
    expect(r.ok).toBe(true)
    expect(r.typo).toBe(false)
  })
  it('finds the phrase with one typo', () => {
    expect(containsTarget('I think it dependz on mood', ['it depends on'])).toMatchObject({ ok: true, typo: true })
  })
  it('does not find a missing phrase', () => {
    expect(containsTarget('It is up to the weather', ['it depends on']).ok).toBe(false)
  })
})

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('abc', 'abc')).toBe(0)
    expect(levenshtein('', 'ab')).toBe(2)
  })
})

describe('wordOverlap', () => {
  it('returns the share of reference words found', () => {
    expect(wordOverlap('it really depends on the weather', 'it depends on the weather')).toBe(1)
    expect(wordOverlap('it is cold', 'it depends on the weather')).toBeCloseTo(0.2)
  })
})
