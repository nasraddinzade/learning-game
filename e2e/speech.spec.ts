import { expect, test, type Page } from '@playwright/test'
import { answerCurrent, autopilot, battleInfo, expectedAnswer, next, waitForSetting, waitForTask, watchConsole, wipeAll } from './helpers.js'

const SHOTS = 'docs/verification/screenshots/_scratch/stage-3'

function shot(page: Page, name: string) {
  return page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` })
}

interface SpeechHooks {
  fakeSpeech: (opts?: { recognition?: boolean }) => void
  setTranscript: (t: string | null) => void
  spoken: () => string[]
  forceMove: (m: string | null) => void
}

function spoken(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __nemesis: SpeechHooks }).__nemesis.spoken())
}

function setTranscript(page: Page, text: string | null): Promise<void> {
  return page.evaluate((t) => (window as unknown as { __nemesis: SpeechHooks }).__nemesis.setTranscript(t), text)
}

/** Fakes speech (synthesis records, recognition returns the set transcript) and starts a run. */
async function startWithFakeSpeech(page: Page, recognition = true): Promise<void> {
  await page.evaluate((rec) => (window as unknown as { __nemesis: SpeechHooks }).__nemesis.fakeSpeech({ recognition: rec }), recognition)
  await page.getByTestId('btn-run').click()
  await expect(page.getByTestId('screen-map')).toBeVisible()
}

/** Plays through intros until the first real fight, with `move` forced for it. */
async function reachForcedMove(page: Page, move: string): Promise<void> {
  await autopilot(page, { prefer: ['skirmish', 'scout'], stopWhen: (i) => i.runPhase === 'battle' && i.battlePhase === 'task' })
  for (let i = 0; i < 20; i++) {
    const info = await waitForTask(page)
    if (info.kind !== 'newcomer' && info.move === move) return
    await page.evaluate((m) => (window as unknown as { __nemesis: SpeechHooks }).__nemesis.forceMove(m), move)
    await answerCurrent(page, true)
    await next(page)
  }
  throw new Error(`could not reach move ${move}`)
}

test.describe('stage 3: sound and speech', () => {
  test.beforeEach(async ({ page }) => {
    await wipeAll(page)
  })

  test('На слух: the sentence is spoken, not shown; the meaning is chosen among three', async ({ page }) => {
    const problems = watchConsole(page)
    await startWithFakeSpeech(page)
    await reachForcedMove(page, 'listen')
    await expect(page.getByTestId('move-listen')).toBeVisible()
    await expect(page.getByTestId('listen-option-0')).toBeVisible()
    await expect(page.getByTestId('listen-option-2')).toBeVisible()
    const said = await spoken(page)
    expect(said.length, 'auto-played once').toBeGreaterThanOrEqual(1)
    const sentence = said[said.length - 1] as string
    // The English sentence must not be on screen.
    await expect(page.getByTestId('move-listen')).not.toContainText(sentence)
    await shot(page, 'listen')
    await page.getByTestId('listen-play').click()
    expect((await spoken(page)).length).toBeGreaterThanOrEqual(2)
    const right = Number(await expectedAnswer(page))
    await page.getByTestId(`listen-option-${(right + 1) % 3}`).click()
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false')
    // After a miss the right phrase is spoken and a speaker button is offered.
    await expect(page.getByTestId('feedback-speak')).toBeVisible()
    expect((await spoken(page)).length).toBeGreaterThanOrEqual(3)
    await shot(page, 'feedback-miss-speak')
    await next(page)
    expect(problems, problems.join('\n')).toEqual([])
  })

  test('Диктант: typed sentence, one replay only', async ({ page }) => {
    await startWithFakeSpeech(page)
    await reachForcedMove(page, 'dictation')
    await expect(page.getByTestId('move-dictation')).toBeVisible()
    const expected = (await expectedAnswer(page)) as string
    await expect(page.getByTestId('move-dictation')).not.toContainText(expected)
    const before = (await spoken(page)).length
    await page.getByTestId('dictation-play').click()
    expect((await spoken(page)).length).toBe(before + 1)
    await expect(page.getByTestId('dictation-play')).toBeDisabled()
    await shot(page, 'dictation')
    await page.getByTestId('answer-input').fill(expected)
    await page.getByTestId('answer-submit').click()
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
    await next(page)
  })

  test('Голос: the microphone hears the phrase (fake recognizer), a wrong sentence misses', async ({ page }) => {
    await startWithFakeSpeech(page)
    await reachForcedMove(page, 'voice')
    await expect(page.getByTestId('move-voice')).toHaveAttribute('data-supported', 'true')
    const target = (await expectedAnswer(page)) as string
    await setTranscript(page, `well ${target} i guess`)
    await shot(page, 'voice')
    await page.getByTestId('voice-record').click()
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
    await next(page)

    await reachForcedMove(page, 'voice')
    await setTranscript(page, 'something completely different')
    await page.getByTestId('voice-record').click()
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false')
    await next(page)
  })

  test('Голос without recognition: model answer and honest self-assessment', async ({ page }) => {
    await startWithFakeSpeech(page, false)
    await reachForcedMove(page, 'voice')
    await expect(page.getByTestId('move-voice')).toHaveAttribute('data-supported', 'false')
    await expect(page.getByTestId('voice-self')).toBeVisible()
    await page.getByTestId('voice-reveal').click()
    await expect(page.getByTestId('voice-sample')).toBeVisible()
    await shot(page, 'voice-self')
    await page.getByTestId('voice-self-typo').click()
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
    const info = await battleInfo(page)
    expect(info.feedback?.correct).toBe(true)
    await next(page)
  })

  test('Экспромт: six seconds to start, a late start is a miss, typing in time works', async ({ page }) => {
    await startWithFakeSpeech(page)
    await reachForcedMove(page, 'improv')
    await expect(page.getByTestId('move-improv')).toHaveAttribute('data-started', 'false')
    await expect(page.getByTestId('improv-clock')).toBeVisible()
    await shot(page, 'improv')
    // Do nothing: the window closes and the enemy strikes.
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false', { timeout: 10_000 })
    await expect(page.getByTestId('feedback')).toContainText('не начал')
    await next(page)

    await reachForcedMove(page, 'improv')
    const target = (await expectedAnswer(page)) as string
    await page.getByTestId('answer-input').fill(`Honestly, ${target} right now`)
    await expect(page.getByTestId('move-improv')).toHaveAttribute('data-started', 'true')
    await expect(page.getByTestId('improv-clock')).toHaveCount(0)
    await page.getByTestId('answer-submit').click()
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
    await next(page)
  })

  test('settings: voice check speaks a sample, toggles persist', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __nemesis: SpeechHooks }).__nemesis.fakeSpeech())
    await page.getByRole('link', { name: 'Настройки' }).click()
    await expect(page.getByTestId('speech-status')).toContainText('Озвучка: есть')
    await page.getByTestId('settings-speak').click()
    expect((await spoken(page)).length).toBe(1)
    await page.getByTestId('toggle-sound').click()
    await expect(page.getByTestId('toggle-sound')).toHaveAttribute('aria-checked', 'false')
    await page.getByTestId('toggle-vibration').click()
    await expect(page.getByTestId('toggle-vibration')).toHaveAttribute('aria-checked', 'false')
    await waitForSetting(page, 'sound', false)
    await waitForSetting(page, 'vibration', false)
    await page.reload()
    await expect(page.getByTestId('toggle-sound')).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('toggle-vibration')).toHaveAttribute('aria-checked', 'false')
  })
})
