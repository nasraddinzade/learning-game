// Land definitions (SPEC §9.1): a few bytes needed by the camp, the map and the chronicle.
// The 303 items live in ./seed and load lazily; seed.test.ts checks the two stay in sync.

export interface LandDef {
  id: string
  name: string
  emoji: string
}

export const lands: LandDef[] = [
  { id: 'smalltalk', name: 'Знакомства и small talk', emoji: '👋' },
  { id: 'opinion', name: 'Мнение, согласие, спор, сомнение', emoji: '💬' },
  { id: 'daily', name: 'Быт и повседневность', emoji: '☕' },
  { id: 'emotions', name: 'Эмоции и состояния', emoji: '🌦️' },
  { id: 'stories', name: 'Истории, планы, пересказ', emoji: '📖' },
  { id: 'work', name: 'Работа и разработка', emoji: '💻' },
  { id: 'travel', name: 'Дорога и переезд', emoji: '✈️' },
  { id: 'phrasal', name: 'Фразовые глаголы в живых контекстах', emoji: '🔧' },
  { id: 'fillers', name: 'Связки и заполнители пауз', emoji: '🧩' },
]
