// Data model from SPEC §11. Shared by engine, game, db and UI.
import type { Card } from 'ts-fsrs'

export type ItemType = 'phrase' | 'word' | 'pattern'

export type Stage = 0 | 1 | 2 | 3 | 4 | 5

/** Answer formats (SPEC §6). Each move belongs to a minimum stage. */
export type MoveId =
  | 'intro' // Знакомство (0)
  | 'swipe' // Свайп (1)
  | 'listen' // На слух (1)
  | 'build' // Сборка (2)
  | 'gap' // Пропуск (2)
  | 'translate' // Перевод (3)
  | 'dictation' // Диктант (3)
  | 'voice' // Голос (4)
  | 'ownPhrase' // Своя фраза (4)
  | 'improv' // Экспромт (5)
  | 'trap' // Ловушка (pattern)

export type BoonId =
  | 'chiefVoice'
  | 'gamble'
  | 'kinMemory'
  | 'scribeShield'
  | 'coolHead'
  | 'hunter'
  | 'warmFire'
  | 'pathfinder'
  | 'cleanBlade'
  | 'echoCatcher'
  | 'stubbornness'
  | 'secondWind'

export type UpgradeId = 'maxHp' | 'fourthBoon' | 'startBoon' | 'freezes' | 'heroLook' | 'theme'

export type NodeType = 'ambush' | 'skirmish' | 'scout' | 'lair' | 'rest' | 'encounter' | 'echo'

export interface MapNode {
  type: NodeType
  /** Indices of reachable nodes on the next step. */
  next: number[]
  done: boolean
}

export interface Item {
  id: string
  type: ItemType
  land: string
  en: string
  ru: string
  accept: string[]
  contexts: { en: string; ru: string; source: 'seed' | 'ai' }[]
  /** Situations in Russian for Перевод and Экспромт. */
  promptsRu: string[]
  /** Question for Своя фраза. */
  questionEn: string
  falseMeanings: string[]
  source: 'seed' | 'life' | 'ai-correction'
  createdAt: number
}

export interface NemesisState {
  since: number
  winsOverHero: number
  defeatedDays: string[]
  mnemonic?: string
}

export interface Progress {
  itemId: string
  stage: Stage
  fsrs: Card
  lapses: number
  failedRunsInRow: number
  lastMove: MoveId | null
  inDebt: boolean
  /** 0..2 consecutive correct answers while in debt. */
  debtStreak: number
  nemesis: NemesisState | null
  mastered: boolean
}

export type Rating = 1 | 2 | 3 | 4

export interface Attempt {
  id: string
  itemId: string
  move: MoveId
  ts: number
  runId: string
  correct: boolean
  rating: Rating
  ms: number
  hintUsed: boolean
  risked: boolean
  answer: string
}

export type RunStatus = 'active' | 'won' | 'retreated'

export interface Run {
  id: string
  seed: number
  kind: 'run' | 'sortie'
  map: MapNode[][]
  position: { step: number; node: number } | null
  hp: number
  maxHp: number
  boons: BoonId[]
  runes: number
  combo: number
  failedItemIds: string[]
  status: RunStatus
  startedAt: number
}

export interface PatternStat {
  patternId: string
  last20: boolean[]
  activeDays: string[]
  active: boolean
}

export type TtsVoice = 'en-US' | 'en-GB'

export interface Settings {
  ttsVoice: TtsVoice
  newPerDay: number
  sound: boolean
  vibration: boolean
  ai: {
    geminiKey: string
    geminiModel: string
    groqKey: string
    groqModel: string
  }
}

export interface Profile {
  /** Single row, always id 'me'. */
  id: 'me'
  xp: number
  level: number
  runes: number
  streak: number
  freezes: number
  lastActiveDay: string
  camp: Partial<Record<UpgradeId, number>>
  trophies: string[]
  unlockedLands: string[]
  settings: Settings
}
