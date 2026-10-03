// Pattern definitions (SPEC §9.1). Small and needed synchronously by Привал, so they stay
// in the main bundle; the big item seed is loaded lazily from ./seed.
import type { PatternDef } from '@/types'
import articles from './seed/patterns/articles.json'
import habitPresentSimple from './seed/patterns/habit-present-simple.json'
import adverbOrder from './seed/patterns/adverb-order.json'
import svAgreement from './seed/patterns/sv-agreement.json'
import calques from './seed/patterns/calques.json'

export const seedPatterns: PatternDef[] = [articles, habitPresentSimple, adverbOrder, svAgreement, calques] as PatternDef[]
