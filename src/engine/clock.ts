// Pure time helpers. The engine never reads Date.now() itself: callers pass `now`.

export const DAY_MS = 24 * 60 * 60 * 1000

/** Local calendar day as YYYY-MM-DD. Used for streaks and nemesis defeat days. */
export function dayKey(now: number): string {
  const d = new Date(now)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Shifts a timestamp by whole days, keeping the time of day. */
export function addDays(now: number, days: number): number {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

/** Whole local days between two timestamps (b - a). */
export function daysBetween(a: number, b: number): number {
  const da = new Date(a)
  const dbb = new Date(b)
  da.setHours(0, 0, 0, 0)
  dbb.setHours(0, 0, 0, 0)
  return Math.round((dbb.getTime() - da.getTime()) / DAY_MS)
}
