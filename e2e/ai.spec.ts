import { expect, test, type Page } from '@playwright/test'
import { answerCurrent, autopilot, expectedAnswer, watchConsole, wipeAll } from './helpers.js'

const SHOTS = 'docs/verification/screenshots/_scratch/stage-5'

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` })
}

/** Installs the rule-based model double (persists in sessionStorage across reloads). */
async function fakeAI(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __nemesis: { fakeAI: () => void } }).__nemesis.fakeAI())
}

async function realAI(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __nemesis: { realAI: () => void } }).__nemesis.realAI())
}

async function aiLog(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __nemesis: { aiLog: () => string[] } }).__nemesis.aiLog())
}

async function dbItems(page: Page): Promise<{ id: string; en: string; ru: string; source: string; promptsRu: string[]; falseMeanings: string[]; contexts: { en: string }[] }[]> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('nemesis')
        req.onsuccess = () => {
          const db = req.result
          const get = db.transaction('items').objectStore('items').getAll()
          get.onsuccess = () => {
            db.close()
            resolve(get.result)
          }
        }
      }),
  )
}

const TEXT = `Honestly, I'm not sure about this plan. It sounds risky, but let's give it a shot and see what happens. We can always change course later if things go sideways. Nobody will blame us for trying something new. Anyway, let's keep in touch.`

test.describe('stage 5: the AI layer (with the model double)', () => {
  test.beforeEach(async ({ page }) => {
    await wipeAll(page)
    await fakeAI(page)
  })

  test('settings: keys stay on the device, the status and a live check', async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto('/settings')
    await expect(page.getByTestId('ai-status')).toContainText('fake')
    await page.getByTestId('ai-ping').click()
    await expect(page.getByTestId('ai-ping-result')).toContainText('Ответил')
    await shot(page, 'settings-ai')

    // A key typed here is persisted in IndexedDB and masked by default.
    await page.getByTestId('ai-gemini-key').fill('test-key-not-real-123')
    await expect(page.getByTestId('ai-gemini-key')).toHaveAttribute('type', 'password')
    await page.waitForTimeout(300)
    await realAI(page)
    await page.reload()
    await expect(page.getByTestId('ai-gemini-key')).toHaveValue('test-key-not-real-123')
    await expect(page.getByTestId('ai-status')).toContainText('gemini')
    await page.getByTestId('ai-gemini-key').fill('')
    await page.waitForTimeout(300)
    await page.reload()
    await expect(page.getByTestId('ai-status')).toContainText('нет ключа')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('Своя фраза: the AI judges the answer, a caught pattern wakes up and sends a Хамелеон into the next battle', async ({ page }) => {
    const problems = watchConsole(page)
    await page.getByTestId('btn-run').click()
    await page.evaluate(() => (window as unknown as { __nemesis: { forceMove: (m: string) => void } }).__nemesis.forceMove('ownPhrase'))
    const first = await autopilot(page, {
      prefer: ['skirmish', 'scout', 'ambush'],
      stopWhen: (info) => info.runPhase === 'battle' && info.battlePhase === 'task' && info.move === 'ownPhrase',
    })
    expect(first.info.move).toBe('ownPhrase')
    await expect(page.getByTestId('own-question')).toBeVisible()
    const sample = await expectedAnswer(page)
    await page.getByTestId('answer-input').fill(`${sample} And he work a lot, you know.`)
    await page.getByTestId('answer-submit').click()
    await expect(page.getByTestId('feedback')).toBeVisible()
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
    await expect(page.getByTestId('ai-checked')).toBeVisible()
    await expect(page.getByTestId('feedback-corrections')).toContainText('he work')
    await expect(page.getByTestId('feedback-corrections')).toContainText('he works')
    await shot(page, 'own-phrase-corrections')
    const stats = await page.evaluate(() => (window as unknown as { __nemesis: { state: () => { patternStats: { patternId: string; active: boolean }[] } } }).__nemesis.state().patternStats)
    expect(stats.find((s) => s.patternId === 'sv-agreement')?.active).toBe(true)

    // The Хамелеон opens the next ordinary battle with a trap on that pattern.
    const second = await autopilot(page, {
      prefer: ['skirmish', 'scout', 'ambush'],
      stopWhen: (info) => info.runPhase === 'battle' && info.battlePhase === 'task' && info.kind === 'chameleon',
    })
    expect(second.info.kind, `trail: ${second.trail.join(' | ')}`).toBe('chameleon')
    await expect(page.getByTestId('enemy')).toHaveAttribute('data-kind', 'chameleon')
    await expect(page.getByTestId('move-trap')).toBeVisible()
    await shot(page, 'chameleon')
    await answerCurrent(page, true)
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('Встреча with the AI: chips, turns, corrections and a materialized error', async ({ page }) => {
    const problems = watchConsole(page)
    await page.getByTestId('btn-run').click()
    // Play the first node, then turn a reachable node of step 1 into a Встреча.
    const toMap = await autopilot(page, { prefer: ['skirmish', 'scout'], stopWhen: (info) => info.runPhase === 'map' && info.step === 0 })
    expect(toMap.info.runPhase).toBe('map')
    const target = await page.evaluate(async () => {
      const hook = (window as unknown as { __nemesis: { state: () => { run: { position: { step: number; node: number }; map: { next: number[] }[][] } }; setNodeType: (s: number, n: number, t: string) => Promise<void> } }).__nemesis
      const run = hook.state().run
      const j = run.map[run.position.step]![run.position.node]!.next[0]!
      await hook.setNodeType(1, j, 'encounter')
      return j
    })
    await autopilot(page, { choose: async () => ({ step: 1, node: target }), stopWhen: (info) => info.runPhase === 'encounter' })
    await expect(page.getByTestId('screen-encounter')).toBeVisible()
    await expect(page.getByTestId('npc-line')).toHaveCount(1)
    await expect(page.getByTestId('scene-clock')).toBeVisible()
    const chips = page.getByTestId('scene-chip')
    expect(await chips.count()).toBeGreaterThanOrEqual(1)
    const chip = (await chips.first().textContent())?.trim() ?? ''
    await shot(page, 'scene-start')

    // Turn 1: the chip phrase is used, the chip goes out.
    await page.getByTestId('answer-input').fill(`Well, ${chip}, to be honest.`)
    await page.getByTestId('answer-submit').click()
    await expect(chips.first()).toHaveAttribute('data-used', 'true')
    await expect(page.getByTestId('npc-line')).toHaveCount(2)
    await expect(page.getByTestId('scene-turn')).toContainText('2 из 3')
    // Turn 2: a wrong word the double flags as an error.
    await page.getByTestId('answer-input').fill('I think this is a mistake, sorry.')
    await page.getByTestId('answer-submit').click()
    await expect(page.getByTestId('npc-line')).toHaveCount(3)
    // Turn 3: closing.
    await page.getByTestId('answer-input').fill('Okay, thank you, see you.')
    await page.getByTestId('answer-submit').click()
    await expect(page.getByTestId('scene-result')).toBeVisible()
    await expect(page.getByTestId('scene-result')).toHaveAttribute('data-outcome', 'partial')
    await expect(page.getByTestId('scene-runes')).toHaveText('+30 ◆')
    await expect(page.getByTestId('scene-corrections')).toContainText('mistake')
    await shot(page, 'scene-result')
    const runRunes = () => page.evaluate(() => (window as unknown as { __nemesis: { state: () => { run: { runes: number } | null } } }).__nemesis.state().run?.runes ?? 0)
    const runesBefore = await runRunes()
    await page.getByTestId('scene-leave').click()
    await expect(page.getByTestId('screen-map')).toBeVisible()
    expect(await runRunes()).toBe(runesBefore + 30)
    const items = await dbItems(page)
    const fix = items.find((i) => i.source === 'ai-correction')
    expect(fix?.en).toBe('slip')
    expect(fix?.contexts[0]?.en).toContain('slip')

    // The fixed phrase opens the next battle.
    const next = await autopilot(page, { prefer: ['skirmish', 'scout', 'ambush'], stopWhen: (info) => info.runPhase === 'battle' && info.battlePhase === 'task' && (info.item?.startsWith('fix-') ?? false) })
    expect(next.info.item, `trail: ${next.trail.join(' | ')}`).toMatch(/^fix-/)
    await shot(page, 'materialized-enemy')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('Встреча without the AI: scripted lines and an honest self-assessment', async ({ page }) => {
    await realAI(page)
    await page.getByTestId('btn-run').click()
    await expect(page.getByTestId('screen-map')).toBeVisible()
    await page.evaluate(async () => {
      const hook = (window as unknown as { __nemesis: { setNodeType: (s: number, n: number, t: string) => Promise<void> } }).__nemesis
      await hook.setNodeType(0, 0, 'encounter')
    })
    await autopilot(page, { choose: async () => ({ step: 0, node: 0 }), stopWhen: (info) => info.runPhase === 'encounter' })
    await expect(page.getByTestId('scene-chips')).toHaveCount(0)
    for (let turn = 0; turn < 3; turn++) {
      await page.getByTestId('answer-input').fill('Something in English.')
      await page.getByTestId('answer-submit').click()
      await expect(page.getByTestId('scene-self')).toBeVisible()
      await expect(page.getByTestId('scene-sample')).not.toHaveText('')
      if (turn === 0) await shot(page, 'scene-self')
      await page.getByTestId(turn === 1 ? 'scene-self-fail' : 'scene-self-ok').click()
    }
    await expect(page.getByTestId('scene-result')).toHaveAttribute('data-outcome', 'partial')
    expect(await aiLog(page)).toEqual([])
  })

  test('Из жизни: a Russian thought, an English text, a manual phrase, a reader draft and the daily enrichment', async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto('/life')
    await expect(page.getByTestId('life-say')).toHaveAttribute('data-ai', 'on')
    await page.getByTestId('life-say').click()
    await page.getByTestId('life-text').fill('я в итоге остался дома')
    await page.getByTestId('life-ask').click()
    await expect(page.getByTestId('life-draft-en')).toHaveText('as a matter of fact')
    await shot(page, 'life-say')
    await page.getByTestId('life-draft-add').click()
    await expect(page.getByTestId('life-added')).toContainText('Добавлено: 1')

    await page.goto('/life/extract')
    await page.getByTestId('life-text').fill(TEXT)
    await page.getByTestId('life-ask').click()
    await expect(page.getByTestId('life-draft')).toHaveCount(5)
    await page.getByTestId('life-draft-check').nth(4).click()
    await shot(page, 'life-extract')
    await page.getByTestId('life-draft-add').click()
    await expect(page.getByTestId('life-added')).toContainText('Добавлено: 4')

    await page.goto('/life/manual')
    await page.getByTestId('life-manual-en').fill('give it a go')
    await page.getByTestId('life-manual-ru').fill('попробовать')
    await page.getByTestId('life-manual-add').click()
    await expect(page.getByTestId('life-added')).toContainText('Добавлено: 1')

    // The reader pre-fills the translation from the AI and keeps its contexts and situations.
    await page.goto('/read')
    await page.getByTestId('library-body').fill(TEXT)
    await page.getByTestId('library-save').click()
    await page.locator('[data-testid="reader-word"][data-p="0"][data-w="9"]').click()
    await page.getByTestId('tb-add').click()
    await expect(page.getByTestId('add-ru')).toHaveValue('перевод: risky')
    await shot(page, 'reader-ai-draft')
    await page.getByTestId('add-submit').click()
    await expect(page.getByTestId('reader-toast')).toBeVisible()

    let items = await dbItems(page)
    const life = items.filter((i) => i.source === 'life')
    expect(life).toHaveLength(7)
    expect(life.find((i) => i.en === 'risky')?.promptsRu).toHaveLength(2)
    expect(life.find((i) => i.en === 'give it a go')?.promptsRu).toHaveLength(0)

    // The daily batch completes the manual phrase on the next camp visit.
    await page.goto('/')
    await expect.poll(async () => (await aiLog(page)).includes('fromLife')).toBe(true)
    await expect
      .poll(async () => {
        items = await dbItems(page)
        return items.find((i) => i.en === 'give it a go')?.promptsRu.length ?? 0
      })
      .toBe(2)
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('a new nemesis gets a mnemonic and fresh contexts', async ({ page }) => {
    await page.getByTestId('btn-run').click()
    let victim: string | null = null
    await autopilot(page, {
      prefer: ['skirmish', 'scout'],
      decide: (info) => {
        if (victim === null && info.kind === 'shadow') victim = info.item
        return info.item !== victim
      },
    })
    await expect(page.getByTestId('summary')).toContainText('Стали немезидами')
    await page.getByTestId('summary-leave').click()
    await page.getByRole('link', { name: 'Зал трофеев' }).click()
    await expect(page.getByTestId('nemesis-card')).toHaveCount(1)
    await expect(page.getByTestId('nemesis-mnemonic')).toContainText('Мнемоника')
    await shot(page, 'nemesis-mnemonic')
    const items = await dbItems(page)
    const it = items.find((i) => i.id === victim)
    expect(it?.contexts.some((c) => c.en.startsWith('Fresh'))).toBe(true)
  })
})
