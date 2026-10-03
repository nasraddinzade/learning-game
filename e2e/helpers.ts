import { expect, type Page } from '@playwright/test'

export interface BattleInfo {
  url: string
  runPhase: string | null
  battlePhase: string
  move: string | null
  item: string | null
  kind: string | null
  hits: number | null
  hp: number | null
  answers: number | null
  runes: number | null
  status: string | null
  runId: string | null
  step: number | null
  nodeType: string | null
  feedback: { correct: boolean; events: string[]; progressEvents: string[]; runes: number } | null
}

interface HookState {
  battlePhase: string
  move: string | null
  run: {
    id: string
    phase: string
    position: { step: number; node: number } | null
    map: { type: string; next: number[]; done: boolean }[][]
    combat: { current: { itemId: string; kind: string; hits: number } | null; hp: number; answers: number; runes: number; status: string } | null
    rest: { done: boolean; feedback: unknown; index: number; exercises: number[]; correct: number } | null
    encounter: { phase: string; turn: number; outcome: string | null; chips: { itemId: string; used: boolean }[] } | null
    boonOffer: string[] | null
    echoItemIds: string[] | null
    status: string
  } | null
  feedback: { correct: boolean; events: { type: string }[]; progressEvents: string[]; runes: number } | null
}

/** Reads the run store through the e2e hook (compiled only in dev/e2e builds). */
export function battleInfo(page: Page): Promise<BattleInfo> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __nemesis?: { state: () => unknown } }).__nemesis
    const st = (hook?.state() ?? {}) as HookState
    const c = st.run?.combat ?? null
    const pos = st.run?.position ?? null
    return {
      url: location.pathname,
      runPhase: st.run?.phase ?? null,
      battlePhase: st.battlePhase,
      move: st.move ?? null,
      item: c?.current?.itemId ?? null,
      kind: c?.current?.kind ?? null,
      hits: c?.current?.hits ?? null,
      hp: c?.hp ?? null,
      answers: c?.answers ?? null,
      runes: c?.runes ?? null,
      status: c?.status ?? null,
      runId: st.run?.id ?? null,
      step: pos?.step ?? null,
      nodeType: pos && st.run ? (st.run.map[pos.step]?.[pos.node]?.type ?? null) : null,
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

export function mapTypes(page: Page): Promise<string[][]> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __nemesis?: { state: () => unknown } }).__nemesis
    const st = (hook?.state() ?? {}) as HookState
    return st.run?.map.map((step) => step.map((n) => n.type)) ?? []
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Waits until the battle shows a task or the run has left the battle. */
export async function waitForTask(page: Page): Promise<BattleInfo> {
  await expect
    .poll(async () => {
      const i = await battleInfo(page)
      // Ready: a task is on screen, or the run moved to another phase, or there is no run
      // and we are on a screen that legitimately has none (summary, camp). A null run on the
      // battle route means the store is still loading after a reload.
      if (i.runPhase === 'battle') return i.battlePhase === 'task' ? 'ready' : i.battlePhase
      if (i.runPhase !== null) return 'ready'
      return i.url === '/summary' || i.url === '/' ? 'ready' : 'loading'
    }, { timeout: 10_000 })
    .toBe('ready')
  const info = await battleInfo(page)
  // The move component is lazy; wait for it to render before interacting or taking screenshots.
  if (info.battlePhase === 'task' && info.runPhase === 'battle') {
    await expect(page.locator('[data-testid^="move-"]:not([data-testid="move-label"])').first()).toBeVisible()
  }
  return info
}

/** Answers the current task through real UI actions. `correct` false gives a wrong answer. */
export async function answerCurrent(page: Page, correct: boolean): Promise<void> {
  const info = await waitForTask(page)
  if (info.battlePhase !== 'task' || info.runPhase !== 'battle') return
  const expected = await expectedAnswer(page)
  switch (info.move) {
    case 'intro': {
      // Знакомство has no feedback screen: wait for the store to count the answer.
      const prev = info.answers ?? 0
      await page.getByTestId('intro-repeat').click()
      await expect
        .poll(async () => {
          const i = await battleInfo(page)
          return i.runPhase !== 'battle' || (i.answers ?? 0) > prev
        })
        .toBe(true)
      return
    }
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
    case 'translate':
    case 'dictation':
    case 'improv': {
      if (!expected) throw new Error('no expected answer')
      await page.getByTestId('answer-input').fill(correct ? expected : 'blah blah blah')
      await page.getByTestId('answer-submit').click()
      break
    }
    case 'trap': {
      await clickTrap(page, correct)
      break
    }
    case 'ownPhrase': {
      // Without AI a present phrase leads to a self-assessment; with the fake AI the verdict is instant.
      if (!expected) throw new Error('no expected answer')
      await page.getByTestId('answer-input').fill(correct ? expected : 'blah blah blah')
      await page.getByTestId('answer-submit').click()
      const self = page.getByTestId('own-self-ok')
      await Promise.race([self.waitFor({ state: 'visible' }), page.getByTestId('feedback').waitFor({ state: 'visible' })])
      if (await self.isVisible()) await self.click()
      break
    }
    case 'listen': {
      const right = Number(expected)
      await page.getByTestId(`listen-option-${correct ? right : (right + 1) % 3}`).click()
      break
    }
    case 'voice': {
      // The fake recognizer (installed by wipeAll) returns whatever transcript is set.
      await page.evaluate((t) => (window as unknown as { __nemesis: { setTranscript: (s: string | null) => void } }).__nemesis.setTranscript(t), correct ? expected : 'nothing like it at all')
      await page.getByTestId('voice-record').click()
      break
    }
    default:
      throw new Error(`unknown move ${info.move}`)
  }
  await expect(page.getByTestId('feedback')).toBeVisible()
}

/**
 * Clicks a control that may leave the DOM while the click is in flight (a React re-render
 * after the store updates). Playwright would otherwise wait for the detached element forever,
 * so the click is best-effort and `settled` is what proves it worked.
 */
async function clickVolatile(locator: ReturnType<Page['locator']>, settled: () => Promise<boolean>): Promise<void> {
  await locator.click({ timeout: 3000 }).catch(() => undefined)
  await expect.poll(settled).toBe(true)
}

/**
 * Waits until the profile row in IndexedDB holds `settings[key] === value`. State in the store is
 * optimistic, so a reload right after a tap could race the write; persistence tests wait for it.
 */
export async function waitForSetting(page: Page, key: string, value: unknown): Promise<void> {
  await page.waitForFunction(
    ([k, v]) =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open('nemesis')
        req.onerror = () => resolve(false)
        req.onsuccess = () => {
          const db = req.result
          try {
            const get = db.transaction('profile').objectStore('profile').get('me')
            get.onsuccess = () => {
              const row = get.result as { settings?: Record<string, unknown> } | undefined
              db.close()
              resolve(row?.settings?.[k] === v)
            }
            get.onerror = () => {
              db.close()
              resolve(false)
            }
          } catch {
            db.close()
            resolve(false)
          }
        }
      }),
    [key, value] as [string, unknown],
  )
}

/** Closes any full-screen celebration overlays (tap to continue); returns their test ids. */
export async function dismissCelebrations(
  page: Page,
  onCelebration?: (id: string, page: Page) => Promise<void>,
): Promise<string[]> {
  const seen: string[] = []
  for (let i = 0; i < 6; i++) {
    const dialog = page.locator('[data-testid^="celebration"]')
    if ((await dialog.count()) === 0) break
    const id = (await dialog.first().getAttribute('data-testid')) ?? 'celebration'
    seen.push(id)
    if (onCelebration) await onCelebration(id, page)
    // Queued celebrations replace each other in place, so wait for this one to go, not for an empty screen.
    await page.getByTestId(id).click({ timeout: 3000 }).catch(() => undefined)
    await expect(page.getByTestId(id)).toHaveCount(0)
  }
  return seen
}

/**
 * Presses "Дальше" if feedback is showing. After the last enemy of a node the button leaves
 * the DOM while the click is in flight (the run moves to the boon screen), which Playwright
 * reports as a detached element, so the click is best-effort and the phase change is what is
 * verified.
 */
export async function next(page: Page): Promise<void> {
  await dismissCelebrations(page)
  const btn = page.getByTestId('feedback-next')
  if (!(await btn.isVisible())) return
  await btn.click({ timeout: 3000 }).catch(() => undefined)
  await expect
    .poll(async () => {
      const i = await battleInfo(page)
      return i.battlePhase !== 'feedback' || i.runPhase !== 'battle'
    })
    .toBe(true)
}

/** Answers the current Ловушка exercise through the UI, right or wrong. */
/** Clicks through a Ловушка exercise (Привал or a Хамелеон in battle) without waiting for feedback. */
export async function clickTrap(page: Page, correct: boolean): Promise<void> {
  const ex = await page.evaluate(() => {
    const hook = (window as unknown as { __nemesis?: { trap: () => { wrongIndex: number | null; fix: string | null } | null } }).__nemesis
    return hook?.trap() ?? null
  })
  if (!ex) throw new Error('no trap exercise')
  await expect(page.getByTestId('move-trap')).toBeVisible()
  if (correct) {
    if (ex.wrongIndex === null) {
      await page.getByTestId('trap-all-right').click()
    } else {
      await page.getByTestId('trap-token').nth(ex.wrongIndex).click()
      if (ex.fix === '') await page.getByTestId('trap-remove').click()
      else {
        await page.getByTestId('answer-input').fill(ex.fix ?? '')
        await page.getByTestId('answer-submit').click()
      }
    }
  } else if (ex.wrongIndex === null) {
    await page.getByTestId('trap-token').nth(0).click()
    await page.getByTestId('answer-input').fill('wrong')
    await page.getByTestId('answer-submit').click()
  } else {
    await page.getByTestId('trap-all-right').click()
  }
}

export async function answerTrap(page: Page, correct: boolean): Promise<void> {
  await clickTrap(page, correct)
  await expect(page.getByTestId('trap-feedback')).toBeVisible()
}

export interface AutopilotOptions {
  /** Decide whether to answer the current task correctly. */
  decide?: (info: BattleInfo) => boolean | Promise<boolean>
  /** Node types to prefer on the map, first match wins; else the first reachable node. */
  prefer?: string[]
  /** Called on each map screen before choosing; return a [step,node] to force a choice. */
  choose?: (page: Page) => Promise<{ step: number; node: number } | null>
  /** Which boon to take (testid suffix) or null for the first one. */
  boon?: string | null
  /** Answer traps correctly? */
  traps?: boolean
  /** Stop when this returns true (checked on every loop). */
  stopWhen?: (info: BattleInfo) => boolean | Promise<boolean>
  maxSteps?: number
  /** Called with each celebration overlay before it is dismissed (e.g. to take a screenshot). */
  onCelebration?: (id: string, page: Page) => Promise<void>
}

export interface AutopilotResult {
  trail: string[]
  info: BattleInfo
}

/** Plays a run through the UI until the summary (or stopWhen). */
export async function autopilot(page: Page, opts: AutopilotOptions = {}): Promise<AutopilotResult> {
  const trail: string[] = []
  const max = opts.maxSteps ?? 200
  for (let i = 0; i < max; i++) {
    for (const id of await dismissCelebrations(page, opts.onCelebration)) trail.push(`celebration:${id}`)
    const info = await battleInfo(page)
    if (opts.stopWhen && (await opts.stopWhen(info))) return { trail, info }
    if (info.url === '/summary' || (info.runPhase === 'summary')) {
      await expect(page.getByTestId('summary')).toBeVisible()
      for (const id of await dismissCelebrations(page, opts.onCelebration)) trail.push(`celebration:${id}`)
      trail.push('summary')
      return { trail, info }
    }
    if (info.runPhase === 'battle') {
      if (info.battlePhase === 'feedback') {
        await next(page)
        continue
      }
      const t = await waitForTask(page)
      if (t.runPhase !== 'battle' || t.battlePhase !== 'task') continue
      const correct = opts.decide ? await opts.decide(t) : true
      trail.push(`${t.step}:${t.nodeType}:${t.kind}:${t.move}${correct ? '' : '✗'}`)
      await answerCurrent(page, correct)
      continue
    }
    if (info.runPhase === 'boon') {
      await expect(page.getByTestId('screen-boon')).toBeVisible()
      const btn = opts.boon ? page.getByTestId(`boon-${opts.boon}`) : page.locator('[data-testid^="boon-"]').first()
      const id = await btn.getAttribute('data-testid')
      trail.push(`boon:${id}`)
      await clickVolatile(btn, async () => (await battleInfo(page)).runPhase !== 'boon')
      continue
    }
    if (info.runPhase === 'encounter') {
      await expect(page.getByTestId('screen-encounter')).toBeVisible()
      const enc = await page.evaluate(() => {
        const hook = (window as unknown as { __nemesis?: { state: () => HookState; sceneSample: () => string | null } }).__nemesis
        const e = hook?.state().run?.encounter ?? null
        return e ? { ...e, sample: hook?.sceneSample() ?? '' } : null
      })
      if (!enc) continue
      if (enc.phase === 'result') {
        trail.push(`encounter:${enc.outcome}`)
        await clickVolatile(page.getByTestId('scene-leave'), async () => (await battleInfo(page)).runPhase !== 'encounter')
        continue
      }
      if (enc.phase === 'self') {
        const ok = opts.decide ? await opts.decide(info) : true
        await clickVolatile(page.getByTestId(ok ? 'scene-self-ok' : 'scene-self-fail'), async () => {
          const st = await page.evaluate(() => (window as unknown as { __nemesis: { state: () => HookState } }).__nemesis.state().run?.encounter?.phase ?? null)
          return st !== 'self'
        })
        continue
      }
      if (enc.phase === 'talk') {
        const ok = opts.decide ? await opts.decide(info) : true
        const turnBefore = enc.turn
        await page.getByTestId('answer-input').fill(ok ? enc.sample : 'blah blah mistake')
        await page.getByTestId('answer-submit').click()
        await expect
          .poll(async () => {
            const e = await page.evaluate(() => (window as unknown as { __nemesis: { state: () => HookState } }).__nemesis.state().run?.encounter ?? null)
            return !e || e.phase !== 'talk' || e.turn !== turnBefore
          })
          .toBe(true)
        continue
      }
      await page.waitForTimeout(100)
      continue
    }
    if (info.runPhase === 'rest') {
      await expect(page.getByTestId('screen-rest')).toBeVisible()
      const rest = await page.evaluate(() => {
        const hook = (window as unknown as { __nemesis?: { state: () => HookState } }).__nemesis
        return hook?.state().run?.rest ?? null
      })
      if (!rest) continue
      if (rest.done) {
        trail.push(`rest:${rest.correct}/${rest.exercises.length}`)
        await clickVolatile(page.getByTestId('rest-leave'), async () => (await battleInfo(page)).runPhase !== 'rest')
        continue
      }
      if (rest.feedback) {
        const index = rest.index
        await clickVolatile(page.getByTestId('trap-next'), async () => {
          const r = await page.evaluate(() => {
            const hook = (window as unknown as { __nemesis?: { state: () => HookState } }).__nemesis
            return hook?.state().run?.rest ?? null
          })
          return r === null || r.index !== index || r.done
        })
        continue
      }
      await answerTrap(page, opts.traps ?? true)
      continue
    }
    if (info.runPhase === 'map') {
      await expect(page.getByTestId('screen-map')).toBeVisible()
      let target = opts.choose ? await opts.choose(page) : null
      if (!target) {
        const nodes = page.locator('[data-testid=map-node-go]')
        await expect(nodes.first()).toBeVisible()
        let pick = nodes.first()
        for (const type of opts.prefer ?? []) {
          const candidate = page.locator(`[data-testid=map-node-go][data-type="${type}"]`)
          if ((await candidate.count()) > 0) {
            pick = candidate.first()
            break
          }
        }
        target = { step: Number(await pick.getAttribute('data-step')), node: Number(await pick.getAttribute('data-node')) }
      }
      const node = page.locator(`[data-testid=map-node-go][data-step="${target.step}"][data-node="${target.node}"]`)
      await node.click()
      await expect(page.getByTestId('map-pick')).toBeVisible()
      trail.push(`map:${await node.getAttribute('data-type')}`)
      await clickVolatile(page.getByTestId('map-go'), async () => (await battleInfo(page)).runPhase !== 'map')
      continue
    }
    await page.waitForTimeout(150)
  }
  throw new Error(`autopilot: no end after ${max} steps\n${trail.join('\n')}`)
}

/** Wipes IndexedDB and the dev clock, reloads, lands on the camp with fake speech installed. */
export async function wipeAll(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('screen-camp')).toBeVisible()
  await page.evaluate(() => (window as unknown as { __nemesis: { wipe: () => Promise<void> } }).__nemesis.wipe())
  await page.goto('/')
  await expect(page.getByTestId('screen-camp')).toBeVisible()
  await expect(page.getByTestId('camp-runes')).toHaveText('◆ 0')
  await expect(page.getByTestId('count-new')).toHaveText('6')
  // Headless Chromium has a mute speech engine and no working microphone: fake both so every
  // move stays deterministic. Spoken texts are recorded, the mic returns the set transcript.
  await page.evaluate(() => (window as unknown as { __nemesis: { fakeSpeech: () => void } }).__nemesis.fakeSpeech())
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
