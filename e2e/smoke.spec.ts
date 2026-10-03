import { expect, test, type Page } from '@playwright/test'
import { watchConsole } from './helpers.js'

// Raw screenshots land in a gitignored scratch folder; key ones are copied into
// docs/verification/screenshots/stage-N by hand when the stage report is written.
const SHOTS = 'docs/verification/screenshots/_scratch/stage-0'

function shot(page: Page, name: string) {
  return page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true })
}

// Console errors and warnings fail the test (SPEC §16.4); see helpers.ts for the one ignored notice.

test.describe('stage 0: scaffold', () => {
  test('camp opens, every screen is reachable, no console noise', async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto('/')
    await expect(page.getByTestId('screen-camp')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Лагерь' })).toBeVisible()
    await expect(page.getByTestId('count-debts')).toHaveText('0')
    await shot(page, 'camp')

    // No horizontal overflow on the phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow, 'horizontal scroll').toBe(false)

    const links: [string, string][] = [
      ['Из жизни', 'screen-life'],
      ['Летопись и земли', 'screen-chronicle'],
      ['Зал трофеев', 'screen-trophies'],
      ['Статистика', 'screen-stats'],
      ['Настройки', 'screen-settings'],
    ]
    for (const [label, testId] of links) {
      await page.getByRole('link', { name: label }).click()
      await expect(page.getByTestId(testId)).toBeVisible()
      await shot(page, testId)
      await page.getByRole('button', { name: 'Назад' }).click()
      await expect(page.getByTestId('screen-camp')).toBeVisible()
    }

    // Run screens by direct URL: without an active run they must land back on the camp
    // (the run store decides the route), never show a broken half-screen.
    for (const path of ['/battle', '/run', '/boon', '/summary', '/rest'] as const) {
      await page.goto(path)
      await expect(page.getByTestId('screen-camp')).toBeVisible()
    }
    // Lazy screen by direct URL (deep links must work for an installed PWA).
    await page.goto('/encounter')
    await expect(page.getByTestId('screen-encounter')).toBeVisible()
    await shot(page, 'screen-encounter')

    // Unknown route falls back to the camp.
    await page.goto('/nope')
    await expect(page.getByTestId('screen-camp')).toBeVisible()

    expect(problems, problems.join('\n')).toEqual([])
  })

  test('settings persist in IndexedDB across reload', async ({ page }) => {
    const problems = watchConsole(page)
    await page.goto('/settings')
    await expect(page.getByTestId('newPerDay')).toHaveText('6')
    await page.getByTestId('newPerDay-plus').click()
    await page.getByTestId('newPerDay-plus').click()
    await expect(page.getByTestId('newPerDay')).toHaveText('8')
    await page.getByTestId('toggle-sound').click()
    await expect(page.getByTestId('toggle-sound')).toHaveAttribute('aria-checked', 'false')
    await page.getByTestId('voice-en-GB').click()
    await expect(page.getByTestId('voice-en-GB')).toHaveAttribute('aria-checked', 'true')

    await page.reload()
    await expect(page.getByTestId('newPerDay')).toHaveText('8')
    await expect(page.getByTestId('toggle-sound')).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('voice-en-GB')).toHaveAttribute('aria-checked', 'true')
    await shot(page, 'settings-changed')

    expect(problems, problems.join('\n')).toEqual([])
  })

  test('works offline after first load (PWA)', async ({ page, context }) => {
    await page.goto('/')
    await expect(page.getByTestId('screen-camp')).toBeVisible()

    // Wait until the service worker controls the page and has finished precaching.
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.ready
      return reg.active?.state === 'activated' && navigator.serviceWorker.controller !== null
    })
    await page.reload()
    await expect(page.getByTestId('screen-camp')).toBeVisible()

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByTestId('screen-camp')).toBeVisible()
    await page.getByRole('link', { name: 'Настройки' }).click()
    await expect(page.getByTestId('screen-settings')).toBeVisible()

    // A deep link while offline must also be served from the cache.
    await page.goto('/trophies')
    await expect(page.getByTestId('screen-trophies')).toBeVisible()
    await shot(page, 'offline-trophies')
    await context.setOffline(false)
  })

  test('manifest is served and has installable fields', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest')
    expect(res.ok()).toBe(true)
    const manifest = (await res.json()) as {
      name: string
      display: string
      start_url: string
      icons: { sizes: string; purpose?: string }[]
    }
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true)
    for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      const r = await request.get(`/icons/${icon}`)
      expect(r.ok(), icon).toBe(true)
      expect(r.headers()['content-type']).toContain('image/png')
    }
  })
})
