// Lazy registry of move components. Each move lives in its own folder (SPEC §14).
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { MoveId } from '@/types'
import type { MoveProps } from './types'

type MoveComponent = LazyExoticComponent<ComponentType<MoveProps<never>>>

const loaders = {
  intro: () => import('./intro/IntroMove').then((m) => ({ default: m.IntroMove })),
  swipe: () => import('./swipe/SwipeMove').then((m) => ({ default: m.SwipeMove })),
  build: () => import('./build/BuildMove').then((m) => ({ default: m.BuildMove })),
  gap: () => import('./gap/GapMove').then((m) => ({ default: m.GapMove })),
  translate: () => import('./translate/TranslateMove').then((m) => ({ default: m.TranslateMove })),
  listen: () => import('./listen/ListenMove').then((m) => ({ default: m.ListenMove })),
  dictation: () => import('./dictation/DictationMove').then((m) => ({ default: m.DictationMove })),
  voice: () => import('./voice/VoiceMove').then((m) => ({ default: m.VoiceMove })),
  ownPhrase: () => import('./ownPhrase/OwnPhraseMove').then((m) => ({ default: m.OwnPhraseMove })),
  improv: () => import('./improv/ImprovMove').then((m) => ({ default: m.ImprovMove })),
}

export const MOVE_COMPONENTS: Partial<Record<MoveId, MoveComponent>> = {
  intro: lazy(loaders.intro),
  swipe: lazy(loaders.swipe),
  build: lazy(loaders.build),
  gap: lazy(loaders.gap),
  translate: lazy(loaders.translate),
  listen: lazy(loaders.listen),
  dictation: lazy(loaders.dictation),
  voice: lazy(loaders.voice),
  ownPhrase: lazy(loaders.ownPhrase),
  improv: lazy(loaders.improv),
}

/** Warms up every move chunk when the battle opens so the first task of each kind does not flash a spinner. */
export function preloadMoves(): void {
  for (const load of Object.values(loaders)) void load().catch(() => undefined)
}
