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
  contexts: { en: string; ru: string; source: 'seed' | 'ai' | 'life' }[]
  /** Situations in Russian for Перевод and Экспромт. */
  promptsRu: string[]
  /** Question for Своя фраза. */
  questionEn: string
  falseMeanings: string[]
  /** One sentence in Russian shown after a miss: why this phrase, how it is used. */
  noteRu: string
  source: 'seed' | 'life' | 'ai-correction'
  createdAt: number
  /** The reading-mode text the phrase was taken from (SPEC §9.3). */
  textId?: string
}

/** A text pasted into the reading mode; the personal library (SPEC §9.3, table `Text`). */
export interface TextDoc {
  id: string
  title: string
  body: string
  createdAt: number
}

/** A Ловушка exercise for a pattern: tap the wrong word and fix it, or confirm it is correct. */
export interface TrapExercise {
  tokens: string[]
  /** Index of the token holding the error, or null when the sentence is correct. */
  wrongIndex: number | null
  /** Replacement for the wrong token (may contain several words, e.g. "a developer"); "" removes it. */
  fix: string | null
  /** Full correct sentence when it cannot be derived by replacing one token (moved words). */
  correct?: string
  ruleRu: string
}

export interface PatternDef {
  id: string
  title: string
  explainRu: string
  exercises: TrapExercise[]
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
  /** When the item was first shown (Знакомство or first answer). Drives the daily new cap. */
  introducedAt: number | null
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

export type RunPhase = 'map' | 'battle' | 'rest' | 'boon' | 'summary' | 'encounter'

export interface RunFlags {
  /** Память рода: the first miss of the run was forgiven. */
  firstMissForgiven: boolean
  /** Второе дыхание: already used this run. */
  secondWindUsed: boolean
}

/** Привал: five Ловушка exercises on an active pattern. */
export interface RestState {
  patternId: string
  /** Exercise indices into the pattern definition. */
  exercises: number[]
  index: number
  correct: number
  /** Last answered exercise feedback, null while answering. */
  feedback: { correct: boolean; ruleRu: string; fixed: string } | null
  healed: boolean
  done: boolean
}

/** A scene for the Встреча node (SPEC §8). */
export interface SceneTurnDef {
  /** The character's line after the learner's answer of this turn (the last one closes the scene). */
  npcLine: string
  /** What the learner should achieve with this answer. */
  hintRu: string
  /** Model answer for the scripted mode without AI. */
  sampleEn: string
}

export interface SceneDef {
  id: string
  title: string
  emoji: string
  settingRu: string
  settingEn: string
  goalRu: string
  goalEn: string
  character: string
  opening: string
  turns: SceneTurnDef[]
}

export type SceneOutcome = 'success' | 'partial' | 'fail'

export interface EncounterState {
  sceneId: string
  /** Index of the learner's answer being awaited. */
  turn: number
  history: { role: 'npc' | 'hero'; text: string }[]
  chips: { itemId: string; used: boolean }[]
  answers: { text: string; ok: boolean; typo: boolean; ai: boolean }[]
  corrections: { wrong: string; right: string; ruleRu: string; patternId: string | null }[]
  outcome: SceneOutcome | null
  whyRu: string | null
  /** talk: answering · checking: the AI replies · self: self-assessment without AI · result: the scene is over. */
  phase: 'talk' | 'checking' | 'self' | 'result'
  /** The answer waiting for the self-assessment. */
  pendingText: string | null
  turnStartedAt: number
  runes: number
}

/** Items still waiting for later nodes of this run, by queue kind. */
export interface RunPool {
  debts: string[]
  nemeses: string[]
  reviews: string[]
  fresh: string[]
  /** Items made from AI corrections this run; they open the next battle node (SPEC §8). */
  materialized: string[]
  /** Patterns the AI caught in free speech; a Хамелеон comes to the next battle node. */
  chameleons: string[]
}

export interface RunStats {
  hits: number
  misses: number
  crits: number
  maxCombo: number
  closedDebtIds: string[]
  defeatedNemesisIds: string[]
  /** Items whose stage went up at least once this run. */
  stageUpIds: string[]
  masteredIds: string[]
  /** Every item that took part in any node (for end-of-run bookkeeping). */
  seenItemIds: string[]
  chests: number
  xp: number
}

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
  /** Live state of the current battle, saved after every answer so a reload resumes it. */
  combat: CombatState | null
  phase: RunPhase
  boonOffer: BoonId[] | null
  flags: RunFlags
  rest: RestState | null
  encounter: EncounterState | null
  pool: RunPool
  stats: RunStats
  /** Items that form the final boss, decided when the Echo node starts. */
  echoItemIds: string[] | null
  /** No misses before the Echo: bonus and a boss built from the hardest items. */
  cleanRun: boolean
  /** Вылазка: the battle ends when this time is reached. */
  sortieEndsAt: number | null
  endedAt: number | null
}

export type EnemyKind = 'shadow' | 'debtor' | 'nemesis' | 'newcomer' | 'echo' | 'chameleon'

export interface Combatant {
  itemId: string
  kind: EnemyKind
  /** Hits needed to defeat: shadow 1, debtor 2, nemesis 3. */
  hitsNeeded: number
  hits: number
  /** Moves already used against this enemy in this battle (debtor/nemesis must differ). */
  movesUsed: MoveId[]
  /** Nemesis scars shown on the sprite. */
  winsOverHero: number
}

export interface PendingReturn {
  combatant: Combatant
  /** Answer count at which the enemy comes back. */
  returnAt: number
}

export interface CombatState {
  seed: number
  nodeType: NodeType
  queue: Combatant[]
  current: Combatant | null
  /** The enemy that was just answered, shown during feedback while `current` is already the next one. */
  last: Combatant | null
  pending: PendingReturn[]
  /** Answers given so far in this battle (intro counts as an answer for return timing). */
  answers: number
  hp: number
  maxHp: number
  combo: number
  maxCombo: number
  runes: number
  xp: number
  hits: number
  misses: number
  crits: number
  /** Items that were missed at least once in this battle. */
  failedItemIds: string[]
  /** Every item that took part (for end-of-run bookkeeping). */
  seenItemIds: string[]
  closedDebtIds: string[]
  defeatedNemesisIds: string[]
  /** Items missed in this battle but spared hp (Разведка grace, Память рода). */
  typoShieldUsed: boolean
  status: RunStatus
}

export interface PatternStat {
  patternId: string
  last20: boolean[]
  activeDays: string[]
  active: boolean
}

export type TtsVoice = 'en-US' | 'en-GB'

export type TextSize = 'normal' | 'large' | 'xlarge'

export interface Settings {
  /** Root font size: the whole interface scales with it (SPEC §12). */
  textSize: TextSize
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

export type HeroLook = 'wanderer' | 'staff' | 'hood'
export type ThemeId = 'ember' | 'tide' | 'violet'

/** A destroyed nemesis (SPEC §7.2 Зал трофеев). */
export interface Trophy {
  itemId: string
  /** YYYY-MM-DD of the final victory. */
  date: string
  winsOverHero: number
  /** Days it took from promotion to destruction. */
  daysFought: number
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
  /** Item ids of destroyed nemeses, oldest first. */
  trophies: string[]
  trophyLog: Trophy[]
  unlockedLands: string[]
  heroLook: HeroLook
  theme: ThemeId
  settings: Settings
}
