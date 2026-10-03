import { expect, test, type Page } from '@playwright/test'
import { autopilot, shiftDays, watchConsole, wipeAll } from './helpers.js'

const SHOTS = 'docs/verification/screenshots/_scratch/stage-4'

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` })
}

/** Lets the overlay fade in (250 ms) and the title spring up before the screenshot. */
async function shotCelebration(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(700)
  await shot(page, name)
}

async function giveRunes(page: Page, clicks: number): Promise<void> {
  await page.goto('/')
  await page.getByTestId('dev-toggle').click()
  for (let i = 0; i < clicks; i++) await page.getByRole('button', { name: '+500 рун' }).click()
  await page.getByTestId('dev-toggle').click()
}

/** BFS path to a node type (copied from run.spec). */
async function pathToType(page: Page, type: string): Promise<{ step: number; node: number }[] | null> {
  return page.evaluate((wanted) => {
    const hook = (window as unknown as { __nemesis?: { state: () => { run: { map: { type: string; next: number[] }[][]; position: { step: number; node: number } | null } | null } } }).__nemesis
    const run = hook?.state().run
    if (!run) return null
    type P = { step: number; node: number }
    const queue: { at: P; path: P[] }[] = run.position
      ? [{ at: run.position, path: [] }]
      : run.map[0]!.map((_, i) => ({ at: { step: 0, node: i }, path: [{ step: 0, node: i }] }))
    while (queue.length > 0) {
      const { at, path } = queue.shift()!
      const node = run.map[at.step]?.[at.node]
      if (!node) continue
      if (node.type === wanted && path.length > 0) return path
      for (const j of node.next) queue.push({ at: { step: at.step + 1, node: j }, path: [...path, { step: at.step + 1, node: j }] })
    }
    return null
  }, type)
}

test.describe('stage 4: nemeses and progression', () => {
  test.beforeEach(async ({ page }) => {
    await wipeAll(page)
  })

  test('camp upgrades: runes buy hearts, a fourth boon, a start boon, looks and themes', async ({ page }) => {
    const problems = watchConsole(page)
    await giveRunes(page, 8)
    await page.getByTestId('link-upgrades').click()
    await expect(page.getByTestId('screen-upgrades')).toBeVisible()
    await expect(page.getByTestId('upgrades-runes')).toHaveText('◆ 4000')
    await shot(page, 'upgrades')

    await page.getByTestId('buy-maxHp').click()
    await expect(page.getByTestId('upgrade-maxHp-level')).toContainText('уровень 1 из 3')
    await page.getByTestId('buy-fourthBoon').click()
    await expect(page.getByTestId('upgrade-fourthBoon-level')).toContainText('куплено')
    await page.getByTestId('buy-startBoon').click()
    await page.getByTestId('buy-freezes').click()
    await expect(page.getByTestId('upgrade-freezes-level')).toContainText('в запасе: 1')
    await page.getByTestId('buy-theme').click()
    await expect(page.getByTestId('theme-tide')).toHaveAttribute('aria-pressed', 'true')
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim())
    expect(accent.toLowerCase()).toBe('#4fd1c5')
    await page.getByTestId('buy-heroLook').click()
    await expect(page.getByTestId('look-staff')).toHaveAttribute('aria-pressed', 'true')
    await shot(page, 'upgrades-bought')

    // The purchases reach the run: six hearts, a boon offered before the first node, four choices.
    await page.goto('/')
    await expect(page.locator('[data-look="staff"]')).toBeVisible()
    await expect(page.getByTestId('camp-freezes')).toContainText('🧊1')
    await page.getByTestId('btn-run').click()
    await expect(page.getByTestId('screen-boon')).toBeVisible()
    expect(await page.locator('[data-testid^="boon-"]').count()).toBe(4)
    await expect(page.locator('[data-testid^="boon-"]').last()).toBeVisible()
    await page.waitForTimeout(600)
    await shot(page, 'start-boon')
    await page.locator('[data-testid^="boon-"]').first().click()
    await expect(page.getByTestId('screen-map')).toBeVisible()
    await expect(page.getByTestId('run-boons')).toBeVisible()
    const hearts = page.getByTestId('screen-map').locator('[data-testid=hearts]')
    await expect(hearts).toHaveAttribute('data-hp', '6')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('a freeze keeps the streak over a missed day; without one it restarts', async ({ page }) => {
    await page.getByTestId('btn-run').click()
    await autopilot(page, { decide: () => true })
    await expect(page.getByTestId('summary-streak')).toContainText('Серия дней: 1')
    await page.getByTestId('summary-leave').click()

    await giveRunes(page, 1)
    await page.getByTestId('link-upgrades').click()
    await page.getByTestId('buy-freezes').click()
    await expect(page.getByTestId('upgrade-freezes-level')).toContainText('в запасе: 1')

    // Skip a day: the freeze bridges it.
    await shiftDays(page, 2)
    await page.getByTestId('btn-run').click()
    await autopilot(page, { decide: () => true })
    await expect(page.getByTestId('summary-streak')).toContainText('Серия дней: 2')
    await expect(page.getByTestId('summary-streak')).toContainText('заморозка спасла серию')
    await page.getByTestId('summary-leave').click()
    await expect(page.getByTestId('camp-streak')).toContainText('🔥 2')
    await expect(page.getByTestId('camp-freezes')).toHaveCount(0)

    // Skip again with no freeze left: the streak restarts, no reproach.
    await shiftDays(page, 2)
    await page.getByTestId('btn-run').click()
    await autopilot(page, { decide: () => true })
    await expect(page.getByTestId('summary-streak')).toContainText('Серия дней: 1')
  })

  test('level up and a new land are celebrated; the Chronicle shows creatures and lands', async ({ page }) => {
    await expect(page.getByTestId('camp-level')).toHaveText('⭐ 1')
    const seen: string[] = []
    // Day 1 and 2: twelve phrases met → the second land opens.
    for (let day = 1; day <= 2; day++) {
      if (day > 1) await shiftDays(page, 1)
      await page.getByTestId('btn-run').click()
      const r = await autopilot(page, { decide: () => true, onCelebration: (id) => shotCelebration(page, id) })
      for (const t of r.trail) if (t.startsWith('celebration:')) seen.push(t.slice('celebration:'.length))
      if (day === 2) {
        await expect(page.getByTestId('summary-newland')).toContainText('Мнение')
      }
      await page.getByTestId('summary-leave').click()
    }
    expect(seen).toContain('celebration-echo')
    expect(seen).toContain('celebration-level')
    expect(seen).toContain('celebration-land')
    await expect(page.getByTestId('camp-level')).not.toHaveText('⭐ 1')

    await page.getByRole('link', { name: 'Летопись и земли' }).click()
    await expect(page.getByTestId('screen-chronicle')).toBeVisible()
    await expect(page.getByTestId('chronicle-lands')).toHaveText('2')
    await expect(page.getByTestId('land-smalltalk')).toHaveAttribute('data-open', 'true')
    await expect(page.getByTestId('land-opinion')).toHaveAttribute('data-open', 'true')
    await expect(page.getByTestId('land-daily')).toHaveAttribute('data-open', 'false')
    expect(Number(await page.getByTestId('chronicle-met').textContent())).toBeGreaterThanOrEqual(12)
    await page.getByTestId('land-smalltalk').getByRole('button').first().click()
    await expect(page.getByTestId('land-smalltalk').locator('li[data-status="wounded"]').first()).toBeVisible()
    await expect(page.getByTestId('land-smalltalk').locator('li[data-status="unseen"]').first()).toContainText('???')
    await shot(page, 'chronicle')
  })

  test('a destroyed nemesis is celebrated and lands in the Hall of Trophies', async ({ page }) => {
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
    await expect(page.getByTestId('trophy')).toHaveCount(0)
    await shot(page, 'trophies-hunting')

    for (let day = 1; day <= 3; day++) {
      await page.goto('/')
      if (day > 1) await shiftDays(page, 1)
      await page.getByTestId('btn-run').click()
      await expect(page.getByTestId('screen-map')).toBeVisible()
      const path = await pathToType(page, 'lair')
      expect(path, `day ${day}: a path to the Lair`).not.toBeNull()
      const steps = [...(path ?? [])]
      const r = await autopilot(page, {
        choose: async () => steps.shift() ?? null,
        prefer: ['skirmish', 'scout', 'rest'],
        decide: () => true,
        onCelebration: (id) => shotCelebration(page, `${id}-day${day}`),
      })
      const celebrated = r.trail.filter((t) => t.startsWith('celebration:')).map((t) => t.slice('celebration:'.length))
      expect(celebrated, `day ${day}: nemesis celebration; trail ${r.trail.join(' | ')}`).toContain(day === 3 ? 'celebration-trophy' : 'celebration-nemesis')
      await page.getByTestId('summary-leave').click()
    }

    await page.getByRole('link', { name: 'Зал трофеев' }).click()
    await expect(page.getByTestId('trophy')).toHaveCount(1)
    await expect(page.getByTestId('nemesis-card')).toHaveCount(0)
    await expect(page.getByTestId('trophy')).toContainText('дней борьбы: 3')
    await shot(page, 'trophies')
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Зал трофеев/ })).toContainText('1')
  })
})
