import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { autopilot, battleInfo, expectedAnswer, watchConsole, wipeAll } from './helpers.js'

const SHOTS = 'docs/verification/screenshots/_scratch/stage-6'

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` })
}

async function dbItems(page: Page): Promise<{ id: string; en: string; source: string }[]> {
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

test.describe('stage 6: polish', () => {
  test.beforeEach(async ({ page }) => {
    await wipeAll(page)
  })

  test('statistics show the week after a run', async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto('/stats')
    await expect(page.getByTestId('stats-answers')).toHaveText('0')
    await expect(page.getByTestId('stats-nemesis-none')).toBeVisible()
    await page.goto('/')
    await page.getByTestId('btn-run').click()
    await autopilot(page, { decide: () => true })
    await page.getByTestId('summary-leave').click()
    await page.getByRole('link', { name: 'Статистика' }).click()
    await expect(page.getByTestId('screen-stats')).toBeVisible()
    expect(Number(await page.getByTestId('stats-answers').textContent())).toBeGreaterThan(5)
    await expect(page.getByTestId('stats-accuracy')).toHaveText('100%')
    await expect(page.getByTestId('stats-day')).toHaveCount(7)
    await expect(page.getByTestId('stats-introduced')).toHaveText('6')
    await expect(page.getByTestId('stats-runs')).toHaveText('1 из 1')
    await expect(page.getByTestId('stats-pattern')).toHaveCount(5)
    await expect(page.getByTestId('stats-streak')).toHaveText('1')
    await shot(page, 'stats')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('export writes a JSON without keys; import restores it after a wipe', async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto('/life/manual')
    await page.getByTestId('life-manual-en').fill('give it a go')
    await page.getByTestId('life-manual-ru').fill('попробовать')
    await page.getByTestId('life-manual-add').click()
    await expect(page.getByTestId('life-added')).toBeVisible()
    await page.goto('/settings')
    await page.getByTestId('ai-gemini-key').fill('secret-key-must-not-leave')
    await page.waitForTimeout(300)

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('data-export').click()])
    expect(download.suggestedFilename()).toMatch(/^nemesis-backup-\d{4}-\d{2}-\d{2}\.json$/)
    const path = await download.path()
    const backup = JSON.parse(readFileSync(path, 'utf8')) as { app: string; tables: { items: { en: string }[]; profile: { settings: { ai: { geminiKey: string } } }[] } }
    expect(backup.app).toBe('nemesis')
    expect(backup.tables.items.some((i) => i.en === 'give it a go')).toBe(true)
    expect(backup.tables.profile[0]!.settings.ai.geminiKey).toBe('')
    await expect(page.getByTestId('data-message')).toContainText('Сохранено')
    await shot(page, 'export')

    expect(problems, problems.join('\n')).toEqual([])
    // Wiping the open database mid-test logs a Dexie "blocked" warning; watch the console afresh after it.
    await wipeAll(page)
    const problemsAfter = watchConsole(page)
    expect((await dbItems(page)).some((i) => i.source === 'life')).toBe(false)
    await page.goto('/settings')
    await page.getByTestId('data-import-input').setInputFiles(path)
    await expect(page.getByTestId('data-import-summary')).toContainText('походов: 0')
    await shot(page, 'import-summary')
    // The import ends with a full reload; wait for the new document before touching the page again.
    await Promise.all([page.waitForEvent('load'), page.getByTestId('data-import-confirm').click()])
    await expect(page.getByTestId('screen-settings')).toBeVisible()
    await expect.poll(async () => (await dbItems(page)).some((i) => i.en === 'give it a go')).toBe(true)
    expect(problemsAfter, problemsAfter.join('\n')).toEqual([])
  })

  test('keyboard: Enter repeats the intro, a digit picks the listening option, Enter moves on', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'keyboard control is for the desktop column')
    await page.getByTestId('btn-run').click()
    const stop = await autopilot(page, { prefer: ['scout', 'skirmish'], stopWhen: (info) => info.runPhase === 'battle' && info.battlePhase === 'task' && info.move === 'intro' })
    expect(stop.info.move).toBe('intro')
    await page.evaluate(() => (window as unknown as { __nemesis: { forceMove: (m: string) => void } }).__nemesis.forceMove('listen'))
    // Enter repeats each Знакомство; the forced move applies to the first real task after them.
    for (let i = 0; i < 8; i++) {
      const info = await battleInfo(page)
      if (info.move !== 'intro') break
      const before = info.answers ?? 0
      await page.keyboard.press('Enter')
      await expect.poll(async () => (await battleInfo(page)).answers ?? 0).toBeGreaterThan(before)
    }
    await expect.poll(async () => (await battleInfo(page)).move).toBe('listen')
    // The move component is a lazy chunk: the key listener exists only once it is on screen.
    await expect(page.getByTestId('move-listen')).toBeVisible()
    const right = Number(await expectedAnswer(page))
    await page.keyboard.press(String(right + 1))
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('feedback')).toHaveCount(0)
  })

  test('the installed app answers every route offline and the manifest points at the base', async ({ page, context }) => {
    await page.goto('/')
    await expect(page.getByTestId('screen-camp')).toBeVisible()
    await page.goto('/manifest.webmanifest')
    const manifest = JSON.parse(await page.locator('body').innerText()) as { start_url: string; scope: string }
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    await page.goto('/')
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 15_000 })
    await context.setOffline(true)
    await page.goto('/stats')
    await expect(page.getByTestId('screen-stats')).toBeVisible()
    await context.setOffline(false)
  })
})
