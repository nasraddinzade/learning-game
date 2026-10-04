// Promo video: a real pass through the app at phone size, paced for a viewer. Run with
//   npx playwright test --config playwright.demo.config.ts
// The model is the rule-based test double (`__nemesis.fakeAI`), with a canned answer for the reader
// translation, because the recording has no real Gemini key. Everything else is the real game.
import { expect, test, type Page } from '@playwright/test'
import { answerCurrent, battleInfo, expectedAnswer } from './helpers.js'

const TEXT = `Honestly, I'm not sure about this plan. It sounds risky, but let's give it a shot and see what happens. We can always change course later if things go sideways.

Anyway, let's keep in touch.`

const READER_DRAFT = {
  items: [
    {
      en: 'give it a shot',
      ru: 'попробовать',
      accept: [],
      contexts: [
        { en: "It sounds risky, but let's give it a shot and see what happens.", ru: 'Звучит рискованно, но давай попробуем и посмотрим, что будет.' },
        { en: "I've never surfed, but I'll give it a shot.", ru: 'Я никогда не занимался сёрфингом, но попробую.' },
      ],
      promptsRu: ['Друг предлагает новое дело. Скажи, что готов попробовать.', 'Коллега сомневается в идее. Предложи всё-таки попробовать.'],
      falseMeanings: ['сделать снимок', 'выстрелить в упор'],
      noteRu: 'Так говорят, когда решаются на что-то без гарантии успеха.',
    },
  ],
}

/** A ripple where the finger lands, and no dev panel: the video should look like a phone in a hand. */
const STAGE_SCRIPT = `
  addEventListener('pointerdown', (e) => {
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;left:' + (e.clientX - 24) + 'px;top:' + (e.clientY - 24) + 'px;width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.28);border:2px solid rgba(255,255,255,.85);pointer-events:none;z-index:2147483647;transition:transform .5s ease-out,opacity .5s ease-out'
    document.documentElement.appendChild(d)
    requestAnimationFrame(() => { d.style.transform = 'scale(1.9)'; d.style.opacity = '0' })
    setTimeout(() => d.remove(), 600)
  }, true)
  const hide = () => {
    if (document.getElementById('demo-style')) return
    const s = document.createElement('style')
    s.id = 'demo-style'
    s.textContent = '[data-testid=dev-panel]{display:none!important}'
    document.head.appendChild(s)
  }
  if (document.head) hide(); else addEventListener('DOMContentLoaded', hide)
  // Phone layout (393 CSS px) shown at scale 2 in the 786 px window: crisp video, same layout.
  const phone = () => {
    const m = document.querySelector('meta[name=viewport]')
    if (m && m.getAttribute('content') !== 'width=393, initial-scale=2, maximum-scale=2, user-scalable=no') {
      m.setAttribute('content', 'width=393, initial-scale=2, maximum-scale=2, user-scalable=no')
    }
  }
  new MutationObserver(phone).observe(document, { childList: true, subtree: true })
  addEventListener('DOMContentLoaded', phone)
`

type Hook = {
  fakeSpeech: () => void
  fakeAI: (script?: unknown) => void
  realAI: () => void
  forceMove: (m: string) => void
  setNodeType: (s: number, n: number, t: string) => Promise<void>
  sceneSample: () => Promise<string | null>
  state: () => { run: { position: { step: number; node: number } | null; map: { next: number[]; type: string }[][]; encounter: { phase: string; turn: number } | null } | null }
}

const hook = <T>(page: Page, fn: (h: Hook, arg: unknown) => T | Promise<T>, arg?: unknown) =>
  page.evaluate(([src, a]) => new Function('h', 'a', `return (${src})(h, a)`)((window as unknown as { __nemesis: Hook }).__nemesis, a), [fn.toString(), arg] as const)

const pause = (page: Page, ms: number) => page.waitForTimeout(ms)

async function typeInto(page: Page, testId: string, text: string, delay = 35): Promise<void> {
  await page.getByTestId(testId).click()
  await page.keyboard.type(text, { delay })
}

const TYPED = new Set(['gap', 'translate', 'dictation', 'improv'])

test('promo video', async ({ page }) => {
  await page.addInitScript(STAGE_SCRIPT)
  await page.goto('/')
  await expect(page.getByTestId('screen-camp')).toBeVisible()
  // The phone layout must be in place, or the video would show a stretched desktop page.
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(393)
  await hook(page, (h) => {
    h.fakeSpeech()
    h.fakeAI()
    h.forceMove('build')
  })
  await pause(page, 2500)

  // ---- 1. A run: the map, then a scout node with new phrases.
  await page.getByTestId('btn-run').click()
  await expect(page.getByTestId('screen-map')).toBeVisible()
  await pause(page, 1800)
  // A battle node: a scout (new phrases) if there is one, else a skirmish.
  let node = page.locator('[data-testid="map-node-go"][data-type="scout"]')
  for (const type of ['skirmish', 'ambush']) {
    if ((await node.count()) > 0) break
    node = page.locator(`[data-testid="map-node-go"][data-type="${type}"]`)
  }
  await node.first().click()
  await pause(page, 900)
  await page.getByTestId('map-go').click()
  await expect.poll(async () => (await battleInfo(page)).runPhase).toBe('battle')

  let firstIntro = true
  let task = 0
  for (let guard = 0; guard < 40; guard++) {
    const info = await battleInfo(page)
    if (info.runPhase !== 'battle') break
    if (info.battlePhase !== 'task') {
      await pause(page, 150)
      continue
    }
    if (info.move === 'intro') {
      await pause(page, firstIntro ? 2600 : 1200)
      firstIntro = false
      await answerCurrent(page, true)
      continue
    }
    const showcase = task < 4
    await pause(page, showcase ? 1000 : 300)
    if (info.move === 'ownPhrase') {
      // A real sentence with one slip: the model double flags it and shows the rule.
      const sample = (await expectedAnswer(page)) ?? ''
      await typeInto(page, 'answer-input', `${sample} I think he work too much, though.`, 28)
      await pause(page, 500)
      await page.getByTestId('answer-submit').click()
    } else if (task === 2) {
      await answerCurrent(page, false)
    } else if (showcase && info.move && TYPED.has(info.move)) {
      const expected = (await expectedAnswer(page)) ?? ''
      await typeInto(page, 'answer-input', expected, 45)
      await page.getByTestId('answer-submit').click()
    } else {
      await answerCurrent(page, true)
    }
    await expect(page.getByTestId('feedback')).toBeVisible()
    await pause(page, info.move === 'ownPhrase' ? 5000 : showcase ? 2400 : 700)
    if (task === 0) await hook(page, (h) => h.forceMove('ownPhrase'))
    task++
    const next = page.getByTestId('feedback-next')
    if (await next.isVisible()) await next.click()
  }

  // A boon after the battle.
  if ((await battleInfo(page)).runPhase === 'boon') {
    await expect(page.getByTestId('screen-boon')).toBeVisible()
    await pause(page, 2200)
    await page.locator('[data-testid^="boon-"]').first().click()
  }
  await expect(page.getByTestId('screen-map')).toBeVisible()
  await pause(page, 1200)

  // ---- 2. A scene (Встреча): the scripted mode without the model, so the lines are the real ones.
  await hook(page, (h) => h.realAI())
  const target = await hook(page, async (h) => {
    const run = h.state().run!
    const pos = run.position!
    const j = run.map[pos.step]![pos.node]!.next[0]!
    await h.setNodeType(pos.step + 1, j, 'encounter')
    return { step: pos.step + 1, node: j }
  })
  await page.locator(`[data-testid="map-node-go"][data-step="${target.step}"][data-node="${target.node}"]`).click()
  await pause(page, 900)
  await page.getByTestId('map-go').click()
  await expect(page.getByTestId('screen-encounter')).toBeVisible()
  await pause(page, 3200)
  for (let turn = 0; turn < 3; turn++) {
    const sample = (await hook(page, (h) => h.sceneSample())) ?? 'Okay.'
    await typeInto(page, 'answer-input', sample, 22)
    await pause(page, 400)
    await page.getByTestId('answer-submit').click()
    await expect(page.getByTestId('scene-self')).toBeVisible()
    await pause(page, 1800)
    await page.getByTestId('scene-self-ok').click()
    await pause(page, turn < 2 ? 1500 : 800)
  }
  await expect(page.getByTestId('scene-result')).toBeVisible()
  await page.getByTestId('scene-result').scrollIntoViewIfNeeded()
  await pause(page, 3200)
  await page.getByTestId('scene-leave').click()
  await expect(page.getByTestId('screen-map')).toBeVisible()
  await pause(page, 900)

  // ---- 3. Reading mode: your own text becomes enemies; the model fills the translation.
  await hook(page, (h, script) => h.fakeAI(script), { fromLife: READER_DRAFT })
  await page.getByRole('button', { name: 'В лагерь' }).click()
  await expect(page.getByTestId('screen-camp')).toBeVisible()
  await pause(page, 1500)
  await page.getByRole('link', { name: /Из жизни/ }).click()
  await expect(page.getByTestId('screen-life')).toBeVisible()
  await pause(page, 1800)
  await page.getByTestId('life-read').click()
  await expect(page.getByTestId('screen-library')).toBeVisible()
  await page.getByTestId('library-body').click()
  await page.getByTestId('library-body').fill(TEXT)
  await pause(page, 900)
  await page.getByTestId('library-save').click()
  await expect(page.getByTestId('screen-reader')).toBeVisible()
  await pause(page, 2200)
  await page.locator('[data-testid="reader-word"]', { hasText: /^give$/ }).click()
  await pause(page, 700)
  await page.locator('[data-testid="reader-word"]', { hasText: /^shot$/ }).click()
  await expect(page.getByTestId('reader-toolbar')).toBeVisible()
  await pause(page, 1500)
  await page.getByTestId('tb-add').click()
  await expect(page.getByTestId('add-ru')).toHaveValue('попробовать')
  await pause(page, 3000)
  await page.getByTestId('add-submit').click()
  await expect(page.getByTestId('reader-toast')).toBeVisible()
  await pause(page, 2500)

  // ---- 4. Back to camp.
  await page.getByRole('button', { name: 'К библиотеке' }).click()
  await page.getByRole('button', { name: 'Назад' }).click()
  await page.getByRole('button', { name: 'Назад' }).click()
  await expect(page.getByTestId('screen-camp')).toBeVisible()
  await pause(page, 2500)
})
