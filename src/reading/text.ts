// Pure helpers for the reading mode (SPEC §9.3): splitting a pasted text into paragraphs and
// word tokens, extending a word selection, finding the sentence around a selection and
// locating phrases that are already items. No React, no storage.
import { normalize } from '@/engine/answerCheck'

export interface Token {
  /** Raw text of the token as it appears in the paragraph. */
  text: string
  /** True for a word (letters, digits, inner apostrophes or hyphens); false for spaces and punctuation. */
  word: boolean
  /** Index among the words of the paragraph; -1 for non-words. */
  wordIndex: number
  /** Character offsets inside the paragraph. */
  start: number
  end: number
}

export interface Paragraph {
  text: string
  tokens: Token[]
  wordCount: number
}

export interface Selection {
  paragraph: number
  from: number
  to: number
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

/** Splits a paragraph into word and non-word tokens. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  let wordIndex = 0
  for (const m of text.matchAll(WORD_RE)) {
    const start = m.index ?? 0
    if (start > last) tokens.push({ text: text.slice(last, start), word: false, wordIndex: -1, start: last, end: start })
    tokens.push({ text: m[0], word: true, wordIndex: wordIndex++, start, end: start + m[0].length })
    last = start + m[0].length
  }
  if (last < text.length) tokens.push({ text: text.slice(last), word: false, wordIndex: -1, start: last, end: text.length })
  return tokens
}

/** Splits a pasted text into non-empty paragraphs (blank lines or single newlines both count). */
export function parseText(body: string): Paragraph[] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((text) => {
      const tokens = tokenize(text)
      return { text, tokens, wordCount: tokens.filter((t) => t.word).length }
    })
}

/** A title for the library: the first line, or the first few words, trimmed. */
export function titleFor(body: string, maxLen = 48): string {
  const first = parseText(body)[0]?.text ?? ''
  if (first.length <= maxLen) return first
  const cut = first.slice(0, maxLen)
  const space = cut.lastIndexOf(' ')
  return `${cut.slice(0, space > 16 ? space : maxLen).trimEnd()}…`
}

/**
 * Selection rule: a tap selects one word; a tap on another word of the same paragraph extends
 * the range up to `maxWords`; a tap inside the range or beyond the limit restarts from that word.
 */
export function selectWord(current: Selection | null, paragraph: number, word: number, maxWords: number): Selection {
  if (!current || current.paragraph !== paragraph) return { paragraph, from: word, to: word }
  if (word >= current.from && word <= current.to) return { paragraph, from: word, to: word }
  const from = Math.min(current.from, word)
  const to = Math.max(current.to, word)
  if (to - from + 1 > maxWords) return { paragraph, from: word, to: word }
  return { paragraph, from, to }
}

/** Drag rule: the range runs from the anchor to the word under the finger, never past the limit. */
export function dragTo(anchor: number, paragraph: number, word: number, maxWords: number, current: Selection): Selection {
  const from = Math.min(anchor, word)
  const to = Math.max(anchor, word)
  if (to - from + 1 > maxWords) return current
  return { paragraph, from, to }
}

/** The selected words joined with single spaces (the phrase to add). */
export function selectedPhrase(p: Paragraph, sel: Selection): string {
  return p.tokens
    .filter((t) => t.word && t.wordIndex >= sel.from && t.wordIndex <= sel.to)
    .map((t) => t.text)
    .join(' ')
}

const SENTENCE_END = /[.!?…]+["'”’)\]]*\s+(?=[\p{Lu}\p{N}"'“([])/gu

/** The sentence of the paragraph that contains the selection (used as the item's first context). */
export function sentenceAround(p: Paragraph, sel: Selection): string {
  const first = p.tokens.find((t) => t.word && t.wordIndex === sel.from)
  const lastTok = p.tokens.find((t) => t.word && t.wordIndex === sel.to)
  if (!first || !lastTok) return p.text
  let start = 0
  let end = p.text.length
  for (const m of p.text.matchAll(SENTENCE_END)) {
    const boundary = (m.index ?? 0) + m[0].length
    if (boundary <= first.start) start = boundary
    else if (boundary >= lastTok.end) {
      end = (m.index ?? 0) + m[0].trimEnd().length
      break
    }
  }
  return p.text.slice(start, end).trim()
}

export interface PhraseHit {
  itemId: string
  from: number
  to: number
}

interface PhraseEntry {
  itemId: string
  words: string[]
}

/** Prepares items for matching: normalized word lists, longest first. */
export function indexPhrases(items: readonly { id: string; en: string }[], maxWords: number): Map<string, PhraseEntry[]> {
  const byFirst = new Map<string, PhraseEntry[]>()
  for (const item of items) {
    // Tokenize the phrase exactly like the text so apostrophes and hyphens compare equal.
    const words = tokenize(item.en)
      .filter((t) => t.word)
      .map((t) => normalize(t.text))
    if (words.length === 0 || words.length > maxWords) continue
    const key = words[0]!
    const list = byFirst.get(key) ?? []
    list.push({ itemId: item.id, words })
    byFirst.set(key, list)
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.words.length - a.words.length)
  return byFirst
}

/** Finds, in a paragraph, every run of words that equals an item's phrase (longest match wins, no overlaps). */
export function findPhrases(p: Paragraph, index: ReadonlyMap<string, PhraseEntry[]>): PhraseHit[] {
  const words = p.tokens.filter((t) => t.word).map((t) => normalize(t.text))
  const hits: PhraseHit[] = []
  let i = 0
  while (i < words.length) {
    const candidates = index.get(words[i]!) ?? []
    let matched: PhraseEntry | null = null
    for (const c of candidates) {
      if (i + c.words.length > words.length) continue
      let ok = true
      for (let k = 1; k < c.words.length; k++) {
        if (words[i + k] !== c.words[k]) {
          ok = false
          break
        }
      }
      if (ok) {
        matched = c
        break
      }
    }
    if (matched) {
      hits.push({ itemId: matched.itemId, from: i, to: i + matched.words.length - 1 })
      i += matched.words.length
    } else i++
  }
  return hits
}
