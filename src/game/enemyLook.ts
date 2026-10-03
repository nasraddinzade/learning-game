// Procedural enemy appearance derived from the item id (SPEC §5.4). Same item, same face.
import { hashString, mulberry32, rngInt } from '@/engine/rng'

export type BodyShape = 'blob' | 'tall' | 'wide' | 'spiky'
export type EyeStyle = 'round' | 'slit' | 'dot'

export interface EnemyLook {
  hue: number
  shape: BodyShape
  eyes: 1 | 2 | 3
  eyeStyle: EyeStyle
  horns: 0 | 1 | 2
  spikes: number
  /** 0.9–1.1 size jitter. */
  scale: number
  /** Little marks on the body, 0–3. */
  marks: number
}

const SHAPES: BodyShape[] = ['blob', 'tall', 'wide', 'spiky']
const EYE_STYLES: EyeStyle[] = ['round', 'slit', 'dot']

export function enemyLook(itemId: string): EnemyLook {
  const rng = mulberry32(hashString(itemId))
  return {
    hue: rngInt(rng, 0, 359),
    shape: SHAPES[rngInt(rng, 0, SHAPES.length - 1)] as BodyShape,
    eyes: rngInt(rng, 1, 3) as 1 | 2 | 3,
    eyeStyle: EYE_STYLES[rngInt(rng, 0, EYE_STYLES.length - 1)] as EyeStyle,
    horns: rngInt(rng, 0, 2) as 0 | 1 | 2,
    spikes: rngInt(rng, 0, 5),
    scale: 0.9 + rngInt(rng, 0, 20) / 100,
    marks: rngInt(rng, 0, 3),
  }
}
