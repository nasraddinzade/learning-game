// Which moves the device can run right now (SPEC §6). Content checks live in tasks.ts.
import { ttsAvailable } from '@/speech/tts'
import type { MoveId } from '@/types'

export function moveAvailable(move: MoveId): boolean {
  switch (move) {
    case 'listen':
    case 'dictation':
      return ttsAvailable()
    default:
      // Голос falls back to self-assessment without recognition; Экспромт can be typed.
      return true
  }
}
