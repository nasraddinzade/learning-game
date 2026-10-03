import { db } from './db'

/**
 * Upserts seed items on every launch so content fixes in the repo reach the device.
 * Progress lives in its own table, so overwriting items never touches learning state.
 * Items added "from life" have other sources and are left alone.
 */
export async function ensureSeed(): Promise<void> {
  // The seed is ~300 items of text; it lives in its own chunk so the first screen stays small.
  const { seedItems } = await import('@/content/seed')
  await db.items.bulkPut(seedItems)
}
