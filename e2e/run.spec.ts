import { expect, test, type Page } from '@playwright/test'
import { answerCurrent, autopilot, battleInfo, mapTypes, next, shiftDays, waitForTask, watchConsole, wipeAll } from './helpers.js'

const SHOTS = 'docs/verification/screenshots/_scratch/stage-2'

function shot(page: Page, name: string) {
  return page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` })
}

/** BFS over the hook's map for a path from the current position to the first node of `type`. */
async function pathToType(page: Page, type: string): Promise<{ step: number; node: number }[] | null> {
  return page.evaluate((wanted) => {
    const hook = (window as unknown as { __nemesis?: { state: () => { run: { map: { type: string; next: number[] }[][]; position: { step: number; node: number } | null } | null } } }).__nemesis
    const run = hook?.state().run
    if (!run) return null
    const map = run.map
    const start = run.position
    type P = { step: number; node: number }
    const queue: { at: P; path: P[] }[] = start
      ? [{ at: start, path: [] }]
      : map[0]!.map((_, i) => ({ at: { step: 0, node: i }, path: [{ step: 0, node: i }] }))
    while (queue.length > 0) {
      const { at, path } = queue.shift()!
      const node = map[at.step]?.[at.node]
      if (!node) continue
      if (node.type === wanted && path.length > 0) return path
      for (const j of node.next) queue.push({ at: { step: at.step + 1, node: j }, path: [...path, { step: at.step + 1, node: j }] })
    }
    return null
  }, type)
}

test.describe('stage 2: the run', () => {
  test.beforeEach(async ({ page }) => {
    await wipeAll(page)
  })

  test('full run: map, miss, debtor, risk, boon, rest with traps, Echo, summary, reload', async ({ page }) => {
    const problems = watchConsole(page)
    await expect(page.getByTestId('count-new')).toHaveText('6')
    await page.getByTestId('btn-run').click()
    await expect(page.getByTestId('screen-map')).toBeVisible()
    const types = await mapTypes(page)
    expect(types).toHaveLength(7)
    expect(types[6]).toEqual(['echo'])
    expect(types[0]!.length).toBeGreaterThanOrEqual(2)
    // Two steps visible, the rest in fog.
    expect(await page.locator('[data-testid=map-node-go]').count()).toBe(types[0]!.length)
    expect(await page.locator('[data-testid=map-node][data-type="fog"]').count()).toBeGreaterThan(0)
    await shot(page, 'map-start')

    let missedItem: string | null = null
    let missedMove: string | null = null
    let debtorMove: string | null = null
    let risked = false
    let restSeen = false
    let boonSeen = false
    let echoSeen = false
    let reloaded = false

    const result = await autopilot(page, {
      prefer: ['rest', 'echo', 'skirmish', 'scout'],
      decide: async (info) => {
        if (info.kind === 'shadow' && missedItem === null && info.nodeType !== 'scout') {
          missedItem = info.item
          missedMove = info.move
          return false
        }
        if (info.item === missedItem && info.kind === 'debtor' && debtorMove === null) {
          debtorMove = info.move
          await shot(page, 'debtor')
        }
        if (!risked && info.kind === 'shadow' && info.move === 'swipe' && info.nodeType !== 'echo') {
          await page.getByTestId('risk-translate').click()
          await expect(page.getByTestId('move-label')).toContainText('риск')
          risked = true
        }
        if (info.kind === 'echo' && !echoSeen) {
          echoSeen = true
          await expect(page.getByTestId('node-label')).toContainText('Эхо')
          await expect(page.getByTestId('enemy')).toHaveAttribute('data-kind', 'echo')
          // With speech available the hardest move is Экспромт (stage 5).
          expect(info.move, 'the Echo strikes with the hardest move').toBe('improv')
          await shot(page, 'echo')
        }
        return true
      },
      choose: async () => {
        const hasBoon = await page.evaluate(() => {
          const hook = (window as unknown as { __nemesis?: { state: () => { run: { boons: string[] } | null } } }).__nemesis
          return (hook?.state().run?.boons.length ?? 0) > 0
        })
        if (hasBoon && !reloaded) {
          // Reload on the map after a boon: the run resumes where it was with the boon kept.
          const before = await battleInfo(page)
          await page.reload()
          await expect(page.getByTestId('screen-map')).toBeVisible()
          await expect(page.getByTestId('run-boons')).toBeVisible()
          expect((await battleInfo(page)).runId).toBe(before.runId)
          reloaded = true
        }
        return null
      },
    })

    // Checks collected along the way.
    expect(missedItem, 'a miss happened').not.toBeNull()
    expect(debtorMove, 'the debtor came back').not.toBeNull()
    expect(debtorMove).not.toBe(missedMove)
    expect(risked).toBe(true)
    expect(echoSeen).toBe(true)
    restSeen = result.trail.some((t) => t.startsWith('rest:'))
    boonSeen = result.trail.some((t) => t.startsWith('boon:'))
    expect(restSeen, `trail: ${result.trail.join(' | ')}`).toBe(true)
    expect(boonSeen).toBe(true)
    expect(result.trail.filter((t) => t.startsWith('rest:')).every((t) => /rest:(\d+)\/\1/.test(t)), 'clean traps').toBe(true)

    await expect(page.getByTestId('summary')).toHaveAttribute('data-status', 'won')
    await expect(page.getByTestId('summary')).toContainText('Поход пройден')
    await shot(page, 'summary-won')
    await page.getByTestId('summary-leave').click()
    await expect(page.getByTestId('screen-camp')).toBeVisible()
    await expect.poll(() => page.getByTestId('camp-runes').textContent()).not.toBe('◆ 0')
    await expect(page.getByTestId('camp-streak')).toHaveText('🔥 1')
    await expect(page.getByTestId('btn-run')).toHaveText('В поход')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('rest screen: heal, five traps, a wrong trap means no free boon', async ({ page }) => {
    await page.getByTestId('btn-run').click()
    let trapsAnswered = 0
    const result = await autopilot(page, {
      prefer: ['rest'],
      traps: false,
      stopWhen: async (info) => info.runPhase === 'map' && trapsAnswered > 0,
      decide: () => true,
    })
    // autopilot answered traps wrongly; verify the rest screen reported it and no boon followed.
    trapsAnswered = result.trail.filter((t) => t.startsWith('rest:')).length
    expect(result.trail.some((t) => t.startsWith('rest:0/5')), result.trail.join(' | ')).toBe(true)
    const idx = result.trail.findIndex((t) => t.startsWith('rest:0/5'))
    expect(result.trail[idx + 1] ?? '').not.toMatch(/^boon:/)
  })

  test('reload mid-battle resumes the same node and enemy', async ({ page }) => {
    await page.getByTestId('btn-run').click()
    await autopilot(page, { prefer: ['skirmish', 'scout'], stopWhen: (i) => i.runPhase === 'battle' && i.battlePhase === 'task' })
    await answerCurrent(page, true)
    await next(page)
    const before = await waitForTask(page)
    await page.reload()
    const after = await waitForTask(page)
    expect(after.runId).toBe(before.runId)
    expect(after.answers).toBe(before.answers)
    expect(after.item).toBe(before.item)
    expect(after.move).toBe(before.move)
    await page.goto('/')
    await expect(page.getByTestId('btn-run')).toHaveText('Продолжить поход')
  })

  test('retreat at 0 hp, then an Ambush of debtors the next day and a two-minute sortie', async ({ page }) => {
    await page.getByTestId('btn-run').click()
    // Miss each item at most twice (three lapses would make a nemesis, and nemeses are not
    // debtors). The miss that empties the hearts ends the run at once, so the item missed last
    // is guaranteed to stay a debtor for tomorrow's Ambush.
    const missed = new Map<string, number>()
    await autopilot(page, {
      prefer: ['skirmish', 'scout'],
      decide: (info) => {
        if (info.kind === 'newcomer' || !info.item) return true
        const n = missed.get(info.item) ?? 0
        if (n < 2) {
          missed.set(info.item, n + 1)
          return false
        }
        return true
      },
    })
    await expect(page.getByTestId('summary')).toHaveAttribute('data-status', 'retreated')
    await expect(page.getByTestId('summary')).toContainText('Отступление')
    await shot(page, 'summary-retreat')
    await page.getByTestId('summary-leave').click()
    await expect.poll(() => page.getByTestId('count-debts').textContent()).not.toBe('0')
    const debts = Number(await page.getByTestId('count-debts').textContent())

    await shiftDays(page, 1)
    await expect(page.getByTestId('count-debts')).toHaveText(String(debts))
    await page.getByTestId('btn-run').click()
    await expect(page.getByTestId('screen-map')).toBeVisible()
    const types = await mapTypes(page)
    expect(types[0]).toEqual(['ambush'])
    await shot(page, 'map-ambush')
    await autopilot(page, { stopWhen: (i) => i.runPhase === 'battle' && i.battlePhase === 'task' })
    const first = await waitForTask(page)
    expect(first.nodeType).toBe('ambush')
    expect(first.kind).toBe('debtor')
    // Leave this run unfinished; a sortie is only offered without an active run, so finish by retreating.
    await autopilot(page, { decide: () => false })
    await page.getByTestId('summary-leave').click()

    await expect(page.getByTestId('btn-sortie')).toBeEnabled()
    await page.getByTestId('btn-sortie').click()
    await expect(page.getByTestId('screen-battle')).toBeVisible()
    await expect(page.getByTestId('sortie-clock')).toBeVisible()
    const s = await waitForTask(page)
    expect(s.nodeType).toBe('ambush')
    // Two retreats in a row promote the twice-failed debtors to nemeses, and a sortie pulls
    // one nemesis in besides the debtors, so either may come first.
    expect(['debtor', 'nemesis']).toContain(s.kind)
    await shot(page, 'sortie')
    await autopilot(page, { decide: () => true })
    await expect(page.getByTestId('summary')).toContainText('Вылазка окончена')
    await page.getByTestId('summary-leave').click()
    await expect(page.getByTestId('camp-streak')).toHaveText('🔥 2')
  })

  test('three misses make a nemesis; the Lair appears and three wins on three days destroy her', async ({ page }) => {
    await page.getByTestId('btn-run').click()
    let victim: string | null = null
    await autopilot(page, {
      prefer: ['skirmish', 'scout'],
      decide: (info) => {
        if (victim === null && info.kind === 'shadow') victim = info.item
        return info.item !== victim
      },
    })
    expect(victim).not.toBeNull()
    await expect(page.getByTestId('summary')).toContainText('Стали немезидами')
    await page.getByTestId('summary-leave').click()
    await expect(page.getByTestId('camp-nemeses')).toBeVisible()

    for (let day = 1; day <= 3; day++) {
      if (day > 1) await shiftDays(page, 1)
      await page.getByTestId('btn-run').click()
      await expect(page.getByTestId('screen-map')).toBeVisible()
      const types = await mapTypes(page)
      const lairStep = types.findIndex((s) => s.includes('lair'))
      expect(lairStep, `day ${day}: a Lair is on the map`).toBeGreaterThanOrEqual(2)
      const path = await pathToType(page, 'lair')
      expect(path, 'the Lair is reachable').not.toBeNull()
      const steps = [...(path ?? [])]
      const moves: string[] = []
      let fought = false
      const r = await autopilot(page, {
        choose: async () => steps.shift() ?? null,
        prefer: ['skirmish', 'scout', 'rest'],
        decide: async (info) => {
          if (info.kind === 'nemesis') {
            fought = true
            expect(info.item).toBe(victim)
            expect(moves, 'three different moves').not.toContain(info.move)
            moves.push(info.move ?? '')
            await expect(page.getByTestId('node-label')).toContainText('Логово')
            if (day === 1 && moves.length === 1) await shot(page, 'lair')
          }
          return true
        },
      })
      expect(fought, `day ${day}: fought the nemesis; map ${JSON.stringify(types)}; path ${JSON.stringify(path)}; trail ${r.trail.join(' | ')}`).toBe(true)
      expect(moves).toHaveLength(3)
      await expect(page.getByTestId('summary')).toContainText('Немезиды побеждены сегодня')
      await page.getByTestId('summary-leave').click()
      if (day < 3) await expect(page.getByTestId('camp-nemeses')).toContainText(`твоих побед: ${day} из 3`)
    }
    await expect(page.getByTestId('camp-nemeses')).toHaveCount(0)
  })
})
