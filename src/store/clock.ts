// App clock. The only place that reads Date.now(). The dev panel can shift it by whole days
// so "tomorrow" can be tested without waiting. The offset is kept in localStorage so it
// survives reloads during a test session; it is never used in production builds.
import { create } from 'zustand'
import { addDays } from '@/engine/clock'
import { DEBUG } from '@/debug'

const STORAGE_KEY = 'nemesis.dev.timeOffsetDays'

function readOffset(): number {
  if (!DEBUG) return 0
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const n = raw === null ? 0 : Number(raw)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

interface ClockState {
  offsetDays: number
  shiftDays: (delta: number) => void
  resetOffset: () => void
}

export const useClockStore = create<ClockState>((set, get) => ({
  offsetDays: readOffset(),
  shiftDays: (delta) => {
    const next = get().offsetDays + delta
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      /* ignore */
    }
    set({ offsetDays: next })
  },
  resetOffset: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    set({ offsetDays: 0 })
  },
}))

/** Current app time in ms, including the dev offset. Pass this into the engine. */
export function now(): number {
  const offset = useClockStore.getState().offsetDays
  return offset === 0 ? Date.now() : addDays(Date.now(), offset)
}
