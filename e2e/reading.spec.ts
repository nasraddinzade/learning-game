import { expect, test, type Locator, type Page } from '@playwright/test'
import { autopilot, watchConsole, wipeAll } from './helpers.js'

const SHOTS = 'docs/verification/screenshots/_scratch/stage-2a'

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` })
}

const TEXT = `Hi there! How have you been? I didn't catch your name.

Honestly, I'm not sure about this plan. It sounds risky, but let's give it a shot and see what happens. We can always change course later if things go sideways, and nobody will blame us for trying something new.

Anyway, let's keep in touch.`

function word(page: Page, p: number, w: number): Locator {
  return page.locator(`[data-testid="reader-word"][data-p="${p}"][data-w="${w}"]`)
}

function selected(page: Page): Locator {
  return page.locator('[data-testid="reader-word"][data-selected="true"]')
}

async function pasteAndOpen(page: Page, title = 'Chat'): Promise<string> {
  await page.goto('/life')
  await page.getByTestId('life-read').click()
  await expect(page.getByTestId('screen-library')).toBeVisible()
  await page.getByTestId('library-body').fill(TEXT)
  await page.getByTestId('library-title').fill(title)
  await page.getByTestId('library-save').click()
  await expect(page.getByTestId('screen-reader')).toBeVisible()
  await expect(page.getByTestId('reader-title')).toHaveText(title)
  const url = page.url()
  return url.slice(url.lastIndexOf('/') + 1)
}

test.describe('stage 2a: reading mode', () => {
  test.beforeEach(async ({ page }) => {
    await wipeAll(page)
  })

  test('paste a text, take a word and a phrase, they come first in the run with their sentence; deleting the text keeps them', async ({ page }) => {
    const problems = watchConsole(page)
    await expect(page.getByTestId('count-new')).toHaveText('6')
    const textId = await pasteAndOpen(page)
    await expect(page.getByTestId('reader-count')).toContainText('0')
    await shot(page, 'reader')

    // One word: "risky" is the 10th word of the second paragraph.
    await word(page, 1, 9).click()
    await expect(page.getByTestId('reader-toolbar')).toBeVisible()
    await expect(selected(page)).toHaveCount(1)
    await shot(page, 'word-selected')
    await page.getByTestId('tb-add').click()
    await expect(page.getByTestId('sheet-phrase')).toHaveText('risky')
    await expect(page.getByTestId('sheet-context')).toHaveText("It sounds risky, but let's give it a shot and see what happens.")
    await shot(page, 'add-sheet')
    await page.getByTestId('add-ru').fill('рискованно')
    await page.getByTestId('add-submit').click()
    await expect(page.getByTestId('reader-toast')).toContainText('risky')
    await expect(word(page, 1, 9)).toHaveAttribute('data-status', 'new')
    await expect(page.getByTestId('reader-count')).toContainText('1')

    // A phrase: tap "give", then "shot" → four words.
    await word(page, 1, 12).click()
    await word(page, 1, 15).click()
    await expect(selected(page)).toHaveCount(4)
    await page.getByTestId('tb-add').click()
    await expect(page.getByTestId('sheet-phrase')).toHaveText('give it a shot')
    await page.getByTestId('add-ru').fill('попробовать')
    await page.getByTestId('add-submit').click()
    await expect(page.getByTestId('reader-toast')).toBeVisible()
    for (const w of [12, 13, 14, 15]) await expect(word(page, 1, w)).toHaveAttribute('data-status', 'new')
    await shot(page, 'phrase-added')

    // Nine words restart the selection from the tapped word; eight are fine; a tap inside the range
    // restarts too; a tap on the lone selected word or outside the text clears it.
    await word(page, 1, 20).click()
    await word(page, 1, 28).click()
    await expect(selected(page)).toHaveCount(1)
    await expect(word(page, 1, 28)).toHaveAttribute('data-selected', 'true')
    await word(page, 1, 35).click()
    await expect(selected(page)).toHaveCount(8)
    await word(page, 1, 31).click()
    await expect(selected(page)).toHaveCount(1)
    await word(page, 1, 31).click()
    await expect(selected(page)).toHaveCount(0)
    await expect(page.getByTestId('reader-toolbar')).toHaveCount(0)
    await word(page, 1, 31).click()
    await page.getByTestId('reader-hint').click()
    await expect(selected(page)).toHaveCount(0)

    // A phrase that is already in the game shows its status and translation instead of the add button.
    await word(page, 1, 9).click()
    await expect(page.getByTestId('tb-added')).toBeVisible()
    await expect(page.getByTestId('tb-add')).toHaveCount(0)
    await page.getByTestId('tb-translate').click()
    await expect(page.getByTestId('sheet-ru')).toHaveText('рискованно')
    await shot(page, 'translate-known')
    await page.getByRole('button', { name: 'Закрыть' }).click()

    // Without AI the translation of an unknown phrase is yours to type.
    await word(page, 2, 2).click()
    await word(page, 2, 4).click()
    await page.getByTestId('tb-translate').click()
    await expect(page.getByTestId('translate-sheet')).toContainText('этап 5')
    await page.getByTestId('sheet-to-add').click()
    await expect(page.getByTestId('add-sheet')).toBeVisible()
    await page.getByTestId('add-cancel').click()

    // The library counts the phrases taken from the text.
    await page.getByRole('button', { name: 'К библиотеке' }).click()
    await expect(page.getByTestId('text-card')).toHaveCount(1)
    await expect(page.getByTestId('text-count')).toHaveText('2')
    await shot(page, 'library')

    // In the run the items from life come first among the new, with the sentence as context.
    await page.goto('/')
    await expect(page.getByTestId('count-new')).toHaveText('6')
    await page.getByTestId('btn-run').click()
    const first = await autopilot(page, {
      prefer: ['scout', 'skirmish'],
      stopWhen: (info) => info.move === 'intro' && (info.item?.startsWith('life-') ?? false),
    })
    expect(first.info.step, 'the life item is met at the first node').toBe(0)
    await expect(page.getByTestId('intro-en')).toHaveText('risky')
    await expect(page.getByTestId('move-intro')).toContainText("It sounds risky, but let's give it a shot")
    await shot(page, 'intro-from-life')
    await autopilot(page, { decide: () => true })
    await expect(page.getByTestId('summary')).toBeVisible()
    await page.getByTestId('summary-leave').click()

    // After the battle the highlight shows the new status.
    await page.goto(`/read/${textId}`)
    // One run can already tame a phrase (crits jump stages), so anything but "new" counts.
    await expect(word(page, 1, 9)).toHaveAttribute('data-status', /^(fight|tamed)$/)
    await expect(word(page, 1, 12)).toHaveAttribute('data-status', /^(fight|tamed)$/)
    await shot(page, 'status-after-battle')

    // Deleting the text keeps the items.
    await page.getByRole('button', { name: 'К библиотеке' }).click()
    await page.getByTestId('text-delete').click()
    await page.getByTestId('text-delete-confirm').click()
    await expect(page.getByTestId('library-empty')).toBeVisible()
    const lifeItems = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const req = indexedDB.open('nemesis')
          req.onsuccess = () => {
            const db = req.result
            const get = db.transaction('items').objectStore('items').getAll()
            get.onsuccess = () => {
              db.close()
              resolve((get.result as { source: string }[]).filter((i) => i.source === 'life').length)
            }
          }
        }),
    )
    expect(lifeItems).toBe(2)
    await page.goto(`/read/${textId}`)
    await expect(page.getByTestId('screen-reader')).toContainText('Текста больше нет')
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('selection at the screen edge, across a line wrap and by dragging keeps the toolbar inside the viewport', async ({ page }) => {
    const problems = watchConsole(page)
    await pasteAndOpen(page, 'Edges')
    const vw = await page.evaluate(() => window.innerWidth)

    // The last word of the first visual line of the long paragraph and the first word of the next line.
    const edge = await page.evaluate(() => {
      const spans = [...document.querySelectorAll<HTMLElement>('[data-testid="reader-word"][data-p="1"]')]
      const rects = spans.map((s) => ({ w: Number(s.dataset.w), top: Math.round(s.getBoundingClientRect().top) }))
      const firstTop = rects[0]!.top
      const lastOnFirstLine = rects.filter((r) => r.top === firstTop).at(-1)!
      return { last: lastOnFirstLine.w, next: lastOnFirstLine.w + 1 }
    })
    await word(page, 1, edge.last).click()
    await word(page, 1, edge.next).click()
    await expect(selected(page)).toHaveCount(2)
    const box = await page.getByTestId('reader-toolbar').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    await shot(page, 'edge-selection')

    // The first word sits at the left edge: the toolbar is clamped, not cut.
    await page.getByTestId('reader-hint').click()
    await expect(selected(page)).toHaveCount(0)
    await word(page, 1, 0).click()
    await expect(selected(page)).toHaveCount(1)
    const left = await page.getByTestId('reader-toolbar').boundingBox()
    expect(left!.x).toBeGreaterThanOrEqual(0)

    // Dragging from the selected word extends it; the page did not lose the selection on release.
    await page.getByTestId('reader-hint').click()
    await expect(selected(page)).toHaveCount(0)
    const a = await word(page, 1, 2).boundingBox()
    const b = await word(page, 1, 5).boundingBox()
    await word(page, 1, 2).click()
    await expect(selected(page)).toHaveCount(1)
    await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2)
    await page.mouse.down()
    await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect(selected(page)).toHaveCount(4)
    await expect(page.getByTestId('tb-add')).toBeVisible()
    await page.getByTestId('tb-add').click()
    await expect(page.getByTestId('sheet-phrase')).toHaveText('not sure about this')
    await shot(page, 'drag-selection')
    expect(problems, problems.join('\n')).toEqual([])
  })
})
