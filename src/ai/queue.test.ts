import { describe, expect, it } from 'vitest'
import { AIQueue, DailyLimitError } from './queue'
import { AIError } from './types'

function harness(opts: { dailyLimit?: number; minGapMs?: number; backoffMs?: number[] } = {}) {
  let t = 0
  const sleeps: number[] = []
  const usage = new Map<string, number>()
  const q = new AIQueue({
    minGapMs: opts.minGapMs ?? 5000,
    dailyLimit: opts.dailyLimit ?? 100,
    backoffMs: opts.backoffMs ?? [5000, 10000],
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms)
      t += ms
    },
    usage: {
      get: async (d) => usage.get(d) ?? 0,
      add: async (d) => {
        usage.set(d, (usage.get(d) ?? 0) + 1)
      },
    },
    dayOf: (x) => `day${Math.floor(x / 86_400_000)}`,
  })
  return { q, sleeps, usage, tick: (ms: number) => (t += ms) }
}

describe('AIQueue (SPEC §10.2)', () => {
  it('runs requests one after another with the minimum gap', async () => {
    const h = harness()
    const order: string[] = []
    const a = h.q.enqueue(async () => order.push('a'))
    const b = h.q.enqueue(async () => order.push('b'))
    await Promise.all([a, b])
    expect(order).toEqual(['a', 'b'])
    expect(h.sleeps).toEqual([5000])
  })

  it('does not wait when enough time has passed', async () => {
    const h = harness()
    await h.q.enqueue(async () => 1)
    h.tick(6000)
    await h.q.enqueue(async () => 2)
    expect(h.sleeps).toEqual([])
  })

  it('stops at the daily limit and counts every attempt', async () => {
    const h = harness({ dailyLimit: 2, minGapMs: 0 })
    await h.q.enqueue(async () => 1)
    await h.q.enqueue(async () => 2)
    await expect(h.q.enqueue(async () => 3)).rejects.toBeInstanceOf(DailyLimitError)
    expect(await h.q.remainingToday()).toBe(0)
  })

  it('retries a 429 with growing pauses, honouring retry-after, then gives up', async () => {
    const h = harness({ minGapMs: 0, backoffMs: [5000, 10000] })
    let calls = 0
    const value = await h.q.enqueue(async () => {
      calls++
      if (calls < 3) throw new AIError('rate', 'slow down', calls === 1 ? 7000 : null)
      return 'ok'
    })
    expect(value).toBe('ok')
    expect(h.sleeps).toEqual([7000, 10000])
    expect(calls).toBe(3)

    let again = 0
    await expect(
      h.q.enqueue(async () => {
        again++
        throw new AIError('rate', 'still')
      }),
    ).rejects.toMatchObject({ kind: 'rate' })
    expect(again).toBe(3)
  })

  it('does not retry other errors and keeps serving the next request', async () => {
    const h = harness({ minGapMs: 0 })
    await expect(h.q.enqueue(async () => Promise.reject(new AIError('auth', 'bad key')))).rejects.toMatchObject({ kind: 'auth' })
    expect(await h.q.enqueue(async () => 'next')).toBe('next')
  })
})
