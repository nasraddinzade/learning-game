import { expect, type Page } from '@playwright/test'

export interface BattleInfo {
  phase: string
  move: string | null
  item: string | null
  kind: string | null
  hits: number | null
  hp: number | null
  answers: number | null
  runes: number | null
  status: string | null
  runId: string | null
  feedback: { correct: boolean; events: string[]; progressEvents: string[]; runes: number } | null
}

/** Reads the battle store through the e2e hook (compiled only in dev/e2e builds). */
export function battleInfo(page: Page): Promise<BattleInfo> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __nemesis?: { state: () => Record<string, unknown> } }).__nemesis
    const st = (hook?.state() ?? {}) as {
      phase: string
      move: string | null
      run: { id: string; combat: { current: { itemId: string; kind: string; hits: number } | null; hp: number; answers: number; runes: number; status: string } | null } | null
      feedback: { correct: boolean; events: { type: string }[]; progressEvents: string[]; runes: number } | null
    }
    const c = st.run?.combat ?? null
    return {
      phase: st.phase,
      move: st.move ?? null,
      item: c?.current?.itemId ?? null,
      kind: c?.current?.kind ?? null,
      hits: c?.current?.hits ?? null,
      hp: c?.hp ?? null,
      answers: c?.answers ?? null,
      runes: c?.runes ?? null,
      status: c?.status ?? null,
      runId: st.run?.id ?? null,
      feedback: st.feedback
        ? {
            correct: st.feedback.correct,
            events: st.feedback.events.map((e) => e.type),
            progressEvents: st.feedback.progressEvents,
            runes: st.feedback.runes,
          }
        : null,
    }
  })
}

export function expectedAnswer(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __nemesis?: { answer: () => string | null } }).__nemesis
    return hook?.answer() ?? null
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Waits until the battle shows a task or is over. */
export async function waitForTask(page: Page): Promise<BattleInfo> {
  await expect
    .poll(async () => (await battleInfo(page)).phase, { timeout: 10_000 })
    .toMatch(/task|done|empty/)
  const info = await battleInfo(page)
  // The move component is lazy; wait for it to render before interacting or taking screenshots.
  if (info.phase === 'task') await expect(page.locator('[data-testid^="move-"]:not([data-testid="move-label"])').first()).toBeVisible()
  return info
}

/**
 * Answers the current task through real UI actions. `correct` false gives a wrong answer
 * (intro has no wrong answer and is simply confirmed).
 */
export async function answerCurrent(page: Page, correct: boolean): Promise<void> {
  const info = await waitForTask(page)
  if (info.phase !== 'task') return
  const expected = await expectedAnswer(page)
  switch (info.move) {
    case 'intro':
      await page.getByTestId('intro-repeat').click()
      return
    case 'swipe': {
      const want = correct ? expected : expected === 'right' ? 'left' : 'right'
      await page.getByTestId(want === 'right' ? 'swipe-yes' : 'swipe-no').click()
      break
    }
    case 'build': {
      if (!expected) throw new Error('no expected answer for build')
      const words = expected.split(/\s+/).map((w) => w.replace(/[.,!?;:]+$/g, ''))
      const seq = correct ? words : [...words].reverse()
      for (const w of seq) {
        await page
          .locator('[data-testid=build-tile]', { hasText: new RegExp(`^${escapeRegExp(w)}$`) })
          .first()
          .click()
      }
      await page.getByTestId('build-submit').click()
      break
    }
    case 'gap':
    case 'translate': {
      if (!expected) throw new Error('no expected answer')
      await page.getByTestId('answer-input').fill(correct ? expected : 'blah blah blah')
      await page.getByTestId('answer-submit').click()
      break
    }
    default:
      throw new Error(`unknown move ${info.move}`)
  }
  await expect(page.getByTestId('feedback')).toBeVisible()
}

/** Presses "Дальше" if feedback is showing. */
export async function next(page: Page): Promise<void> {
  const btn = page.getByTestId('feedback-next')
  if (await btn.isVisible()) await btn.click()
}

/** Wipes IndexedDB and the dev clock through the dev panel, then lands on the camp. */
export async function wipeAll(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('screen-camp')).toBeVisible()
  await page.getByTestId('dev-toggle').click()
  await page.getByRole('button', { name: 'Стереть всё' }).click()
  await page.waitForLoadState('load')
  await expect(page.getByTestId('screen-camp')).toBeVisible()
  await expect(page.getByTestId('camp-runes')).toHaveText('◆ 0')
}

/** Shifts the dev clock by N days and reloads so every screen recomputes. */
export async function shiftDays(page: Page, days: number): Promise<void> {
  await page.goto('/')
  await page.getByTestId('dev-toggle').click()
  for (let i = 0; i < days; i++) await page.getByRole('button', { name: '+1 день' }).click()
  await page.reload()
  await expect(page.getByTestId('screen-camp')).toBeVisible()
}

/**
 * Chromium sometimes warns that a <link rel=modulepreload> was "not used because it is a
 * cross-world service worker resource mismatch" when the service worker serves the chunk from
 * its cache. It is a browser-internal notice about the preload hint, not an app error.
 */
export const IGNORED_CONSOLE = [/cross-world service worker resource mismatch/]

/** Collects console errors/warnings and failed requests. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    if (IGNORED_CONSOLE.some((re) => re.test(m.text()))) return
    problems.push(`[${m.type()}] ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))
  page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ''}`))
  return problems
}
