import { seedItems } from '@/content/seed'
import { db } from './db'

/**
 * Upserts seed items on every launch so content fixes in the repo reach the device.
 * Progress lives in its own table, so overwriting items never touches learning state.
 * Items added "from life" have other sources and are left alone.
 */
export async function ensureSeed(): Promise<void> {
  await db.items.bulkPut(seedItems)
}
