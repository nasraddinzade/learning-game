import { expect, test, type Page } from '@playwright/test'
import { answerCurrent, battleInfo, next, shiftDays, waitForTask, watchConsole, wipeAll } from './helpers.js'

const SHOTS = 'docs/verification/screenshots/_scratch/stage-1'

function shot(page: Page, name: string) {
  return page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` })
}

/** Plays until the summary appears, answering with `decide(info)`. */
async function playUntilDone(
  page: Page,
  decide: (info: Awaited<ReturnType<typeof battleInfo>>) => boolean | Promise<boolean>,
  maxAnswers = 80,
): Promise<void> {
  for (let i = 0; i < maxAnswers; i++) {
    const info = await waitForTask(page)
    if (info.phase !== 'task') return
    await answerCurrent(page, await decide(info))
    await next(page)
  }
  throw new Error('battle did not finish in time')
}

test.describe('stage 1: one battle', () => {
  test.beforeEach(async ({ page }) => {
    await wipeAll(page)
  })

  test('full battle: intro, hit, miss, debtor returns with another move, risk, summary', async ({ page }) => {
    const problems = watchConsole(page)
    await expect(page.getByTestId('count-new')).toHaveText('6')
    await page.getByTestId('btn-battle').click()
    await expect(page.getByTestId('screen-battle')).toBeVisible()

    // Знакомство first.
    let info = await waitForTask(page)
    expect(info.kind).toBe('newcomer')
    expect(info.move).toBe('intro')
    await shot(page, 'intro')
    await answerCurrent(page, true)

    let missedItem: string | null = null
    let missedMove: string | null = null
    let missedAt = 0
    let debtorSeen = false
    let debtorHits = 0
    let debtClosed = false
    let risked = false
    let riskRunes = 0

    for (let i = 0; i < 80; i++) {
      info = await waitForTask(page)
      if (info.phase !== 'task') break

      if (info.kind === 'shadow' && missedItem === null) {
        // Deliberate miss on the first real fight.
        missedItem = info.item
        missedMove = info.move
        missedAt = info.answers ?? 0
        await shot(page, `task-${info.move}`)
        await answerCurrent(page, false)
        const fb = await battleInfo(page)
        expect(fb.feedback?.correct).toBe(false)
        expect(fb.feedback?.events).toContain('debtorLeaves')
        expect(fb.hp).toBe(4)
        await expect(page.getByTestId('feedback-expected')).toBeVisible()
        await shot(page, 'feedback-miss')
        await next(page)
        continue
      }

      if (info.item === missedItem && info.kind === 'debtor') {
        if (!debtorSeen) {
          debtorSeen = true
          const others = (info.answers ?? 0) - missedAt - 1
          expect(others, 'debtor returns after 3–5 other answers').toBeGreaterThanOrEqual(3)
          expect(others).toBeLessThanOrEqual(5)
          expect(info.move, 'debtor comes back with a different move').not.toBe(missedMove)
          await shot(page, 'debtor')
        }
        debtorHits++
        await answerCurrent(page, true)
        const fb = await battleInfo(page)
        expect(fb.feedback?.correct).toBe(true)
        if (fb.feedback?.progressEvents.includes('debtClosed')) {
          debtClosed = true
          await expect(page.getByTestId('feedback')).toContainText('Долг закрыт')
          await shot(page, 'feedback-debt-closed')
        }
        await next(page)
        continue
      }

      if (!risked && info.kind === 'shadow' && info.move === 'swipe') {
        await page.getByTestId('risk-translate').click()
        await expect(page.getByTestId('move-label')).toContainText('риск')
        risked = true
        await shot(page, 'risk-translate')
        await answerCurrent(page, true)
        const fb = await battleInfo(page)
        expect(fb.feedback?.correct).toBe(true)
        riskRunes = fb.feedback?.runes ?? 0
        await shot(page, 'feedback-hit')
        await next(page)
        continue
      }

      await answerCurrent(page, true)
      await next(page)
    }

    expect(missedItem).not.toBeNull()
    expect(debtorSeen).toBe(true)
    expect(debtorHits).toBe(2)
    expect(debtClosed).toBe(true)
    expect(risked).toBe(true)
    expect(riskRunes).toBeGreaterThan(10)

    await expect(page.getByTestId('summary')).toBeVisible()
    await expect(page.getByTestId('summary')).toHaveAttribute('data-status', 'won')
    await expect(page.getByTestId('summary')).toContainText('Долги закрыты')
    await shot(page, 'summary-won')
    const runes = Number(await page.getByTestId('summary-runes').textContent())
    expect(runes).toBeGreaterThan(0)

    await page.getByTestId('summary-leave').click()
    await expect(page.getByTestId('screen-camp')).toBeVisible()
    await expect(page.getByTestId('camp-runes')).toHaveText(`◆ ${runes}`)
    await expect(page.getByTestId('camp-streak')).toHaveText('🔥 1')
    await expect(page.getByTestId('count-debts')).toHaveText('0')
    await expect(page.getByTestId('count-new')).toHaveText('0')
    await shot(page, 'camp-after-battle')

    expect(problems, problems.join('\n')).toEqual([])
  })

  test('reload mid-battle resumes at the same place', async ({ page }) => {
    await page.goto('/battle')
    await answerCurrent(page, true)
    await next(page)
    await answerCurrent(page, true)
    await next(page)
    const before = await waitForTask(page)
    expect(before.answers).toBe(2)

    await page.reload()
    const after = await waitForTask(page)
    expect(after.runId).toBe(before.runId)
    expect(after.answers).toBe(2)
    expect(after.item).toBe(before.item)
    expect(after.move).toBe(before.move)

    await page.goto('/')
    await expect(page.getByTestId('btn-battle')).toHaveText('Продолжить бой')
  })

  test('retreat at 0 hp halves the runes and keeps the debts', async ({ page }) => {
    await page.goto('/battle')
    let hits = 0
    await playUntilDone(page, (info) => {
      // Hit the first two shadows for some runes, then miss everything.
      if (info.kind === 'shadow' && hits < 2) {
        hits++
        return true
      }
      return false
    })
    await expect(page.getByTestId('summary')).toHaveAttribute('data-status', 'retreated')
    const done = await battleInfo(page)
    expect(done.hp).toBe(0)
    expect(done.runes).toBeGreaterThan(0)
    await expect(page.getByTestId('summary')).toContainText('Должники ждут')
    await shot(page, 'summary-retreat')
    const kept = Number(await page.getByTestId('summary-runes').textContent())
    expect(kept).toBe(Math.floor((done.runes ?? 0) / 2))

    await page.getByTestId('summary-leave').click()
    // Camp counters load asynchronously; poll instead of reading the initial 0.
    await expect.poll(() => page.getByTestId('count-debts').textContent()).not.toBe('0')
    const debts = Number(await page.getByTestId('count-debts').textContent())
    expect(debts).toBeGreaterThanOrEqual(1)

    // Next day: debtors come first (Засада).
    await shiftDays(page, 1)
    await expect(page.getByTestId('count-debts')).toHaveText(String(debts))
    await page.getByTestId('btn-battle').click()
    const first = await waitForTask(page)
    expect(first.kind).toBe('debtor')

    // Reviews follow the FSRS schedule: the two items hit today are due within a month.
    await shiftDays(page, 30)
    await expect
      .poll(() => page.getByTestId('count-reviews').textContent().then((t) => Number(t)))
      .toBeGreaterThanOrEqual(2)
  })

  test('three misses make a nemesis; wins on three days destroy her', async ({ page }) => {
    await page.goto('/battle')
    let victim: string | null = null
    await playUntilDone(page, (info) => {
      if (victim === null && info.kind === 'shadow') victim = info.item
      return info.item !== victim
    })
    expect(victim).not.toBeNull()
    await expect(page.getByTestId('summary')).toContainText('Стали немезидами')
    await shot(page, 'summary-new-nemesis')
    await page.getByTestId('summary-leave').click()
    await expect(page.getByTestId('camp-nemeses')).toBeVisible()
    await shot(page, 'camp-nemesis')

    for (let day = 1; day <= 3; day++) {
      if (day > 1) await shiftDays(page, 1)
      await page.getByTestId('btn-battle').click()
      const first = await waitForTask(page)
      expect(first.kind, `day ${day}: nemesis comes first`).toBe('nemesis')
      expect(first.item).toBe(victim)
      await expect(page.getByTestId('enemy-name')).toBeVisible()
      if (day === 1) await shot(page, 'nemesis')
      const moves: string[] = []
      for (let h = 0; h < 3; h++) {
        const info = await waitForTask(page)
        expect(info.item).toBe(victim)
        expect(info.kind).toBe('nemesis')
        expect(moves, 'three different moves').not.toContain(info.move)
        moves.push(info.move ?? '')
        await answerCurrent(page, true)
        await next(page)
      }
      await playUntilDone(page, () => true)
      await expect(page.getByTestId('summary')).toContainText('Немезиды побеждены сегодня')
      await page.getByTestId('summary-leave').click()
      if (day < 3) {
        await expect(page.getByTestId('camp-nemeses')).toContainText(`твоих побед: ${day} из 3`)
      }
    }
    await expect(page.getByTestId('camp-nemeses')).toHaveCount(0)
    await shot(page, 'camp-nemesis-destroyed')
  })
})
