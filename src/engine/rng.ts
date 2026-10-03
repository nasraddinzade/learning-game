// Seeded pseudo-random helpers. Everything that needs randomness takes an Rng so tests
// and run seeds are reproducible.

export type Rng = () => number

/** mulberry32: small, fast, good enough for games. Returns numbers in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a 32-bit hash of a string. Used to derive stable looks and seeds from ids. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Integer in [min, max], inclusive. */
export function rngInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function rngPick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('rngPick: empty array')
  return arr[Math.floor(rng() * arr.length)] as T
}

export function rngShuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i] as T
    out[i] = out[j] as T
    out[j] = tmp
  }
  return out
}
