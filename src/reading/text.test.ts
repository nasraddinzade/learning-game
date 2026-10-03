import { describe, expect, it } from 'vitest'
import { dragTo, findPhrases, indexPhrases, parseText, selectWord, selectedPhrase, sentenceAround, titleFor, tokenize } from './text'

const BODY = `Hi there! How have you been? I didn't catch your name.\n\nIt's been a while, hasn't it? Let's keep in touch, e.g. by mail.`

describe('parseText and tokenize', () => {
  it('splits paragraphs on newlines and drops empty ones', () => {
    const ps = parseText(BODY)
    expect(ps).toHaveLength(2)
    expect(ps[0]!.wordCount).toBe(11)
  })

  it('keeps apostrophes and hyphens inside words, punctuation outside', () => {
    const t = tokenize("I didn't catch your well-known name.")
    const words = t.filter((x) => x.word).map((x) => x.text)
    expect(words).toEqual(['I', "didn't", 'catch', 'your', 'well-known', 'name'])
    expect(t[t.length - 1]).toMatchObject({ text: '.', word: false })
    expect(t.map((x) => x.text).join('')).toBe("I didn't catch your well-known name.")
  })

  it('handles Windows newlines and leading spaces', () => {
    expect(parseText('  one\r\n\r\n two ').map((p) => p.text)).toEqual(['one', 'two'])
  })

  it('titleFor takes the first line and trims long ones at a space', () => {
    expect(titleFor('Short title\nbody')).toBe('Short title')
    const long = titleFor('A very long first line that goes on and on and on and on forever')
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(49)
  })
})

describe('selection rules (1..8 words of one paragraph)', () => {
  it('a tap selects one word, a second tap extends the range', () => {
    const a = selectWord(null, 0, 3, 8)
    expect(a).toEqual({ paragraph: 0, from: 3, to: 3 })
    expect(selectWord(a, 0, 6, 8)).toEqual({ paragraph: 0, from: 3, to: 6 })
    expect(selectWord(a, 0, 1, 8)).toEqual({ paragraph: 0, from: 1, to: 3 })
  })

  it('a tap in another paragraph, inside the range, or past 8 words restarts', () => {
    const a = { paragraph: 0, from: 3, to: 6 }
    expect(selectWord(a, 1, 2, 8)).toEqual({ paragraph: 1, from: 2, to: 2 })
    expect(selectWord(a, 0, 4, 8)).toEqual({ paragraph: 0, from: 4, to: 4 })
    expect(selectWord(a, 0, 11, 8)).toEqual({ paragraph: 0, from: 11, to: 11 })
    expect(selectWord(a, 0, 10, 8)).toEqual({ paragraph: 0, from: 3, to: 10 })
  })

  it('dragging keeps the anchor and ignores moves past the limit', () => {
    const cur = { paragraph: 0, from: 2, to: 2 }
    expect(dragTo(2, 0, 5, 8, cur)).toEqual({ paragraph: 0, from: 2, to: 5 })
    expect(dragTo(5, 0, 1, 8, cur)).toEqual({ paragraph: 0, from: 1, to: 5 })
    expect(dragTo(2, 0, 10, 8, cur)).toBe(cur)
  })

  it('selectedPhrase joins the words without punctuation', () => {
    const p = parseText(BODY)[0]!
    expect(selectedPhrase(p, { paragraph: 0, from: 2, to: 5 })).toBe('How have you been')
  })
})

describe('sentenceAround', () => {
  const ps = parseText(BODY)

  it('returns the sentence containing the selection', () => {
    expect(sentenceAround(ps[0]!, { paragraph: 0, from: 2, to: 5 })).toBe('How have you been?')
    expect(sentenceAround(ps[0]!, { paragraph: 0, from: 0, to: 0 })).toBe('Hi there!')
    expect(sentenceAround(ps[0]!, { paragraph: 0, from: 6, to: 8 })).toBe("I didn't catch your name.")
  })

  it('does not split on an abbreviation followed by a lowercase word', () => {
    expect(sentenceAround(ps[1]!, { paragraph: 1, from: 7, to: 10 })).toBe("Let's keep in touch, e.g. by mail.")
  })

  it('spans the whole selection when it crosses a sentence boundary', () => {
    expect(sentenceAround(ps[0]!, { paragraph: 0, from: 1, to: 2 })).toBe('Hi there! How have you been?')
  })
})

describe('findPhrases', () => {
  const items = [
    { id: 'a', en: 'How have you been?' },
    { id: 'b', en: "I didn't catch your name" },
    { id: 'c', en: 'keep in touch' },
    { id: 'd', en: 'keep' },
  ]
  const index = indexPhrases(items, 8)

  it('matches items case- and punctuation-insensitively, longest first, without overlaps', () => {
    const ps = parseText(BODY)
    expect(findPhrases(ps[0]!, index)).toEqual([
      { itemId: 'a', from: 2, to: 5 },
      { itemId: 'b', from: 6, to: 10 },
    ])
    expect(findPhrases(ps[1]!, index)).toEqual([{ itemId: 'c', from: 7, to: 9 }])
  })

  it('finds a single word item when the longer phrase is absent', () => {
    expect(findPhrases(parseText('Keep going.')[0]!, index)).toEqual([{ itemId: 'd', from: 0, to: 0 }])
  })
})
