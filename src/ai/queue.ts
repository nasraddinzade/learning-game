// Request queue (SPEC §10.2): one request at a time, a minimum gap between requests, a daily cap,
// and on 429 a pause with a growing interval. Time and sleeping are injected so tests run instantly.
import { AIError } from './types'

export interface QueueOptions {
  minGapMs: number
  dailyLimit: number
  /** Backoff waits after a rate limit, one per retry; after the last one the error propagates. */
  backoffMs: readonly number[]
  now: () => number
  sleep: (ms: number) => Promise<void>
  /** Requests already counted for `day` (persisted by the caller). */
  usage: { get(day: string): Promise<number>; add(day: string): Promise<void> }
  dayOf: (t: number) => string
}

export class DailyLimitError extends Error {
  constructor() {
    super('daily AI limit reached')
    this.name = 'DailyLimitError'
  }
}

export class AIQueue {
  private chain: Promise<unknown> = Promise.resolve()
  private lastStartedAt = -Infinity
  private readonly o: QueueOptions
  constructor(o: QueueOptions) {
    this.o = o
  }

  /** Runs `fn` after the previous request, respecting the gap and the cap. Resolves with its value. */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(
      () => this.execute(fn),
      () => this.execute(fn),
    )
    this.chain = run.catch(() => undefined)
    return run
  }

  async remainingToday(): Promise<number> {
    const used = await this.o.usage.get(this.o.dayOf(this.o.now()))
    return Math.max(0, this.o.dailyLimit - used)
  }

  private async execute<T>(fn: () => Promise<T>): Promise<T> {
    const day = this.o.dayOf(this.o.now())
    if ((await this.o.usage.get(day)) >= this.o.dailyLimit) throw new DailyLimitError()
    const wait = this.lastStartedAt + this.o.minGapMs - this.o.now()
    if (wait > 0) await this.o.sleep(wait)
    for (let attempt = 0; ; attempt++) {
      this.lastStartedAt = this.o.now()
      await this.o.usage.add(day)
      try {
        return await fn()
      } catch (e) {
        const backoff = this.o.backoffMs[attempt]
        if (e instanceof AIError && e.kind === 'rate' && backoff !== undefined) {
          await this.o.sleep(Math.max(backoff, e.retryAfterMs ?? 0))
          continue
        }
        throw e
      }
    }
  }
}
