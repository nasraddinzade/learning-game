import { defineConfig, devices } from '@playwright/test'

// Records the promo video (e2e/demo.record.ts): one phone-sized run through the real UI against the
// same e2e build the tests use. Not part of `npm run e2e`.
//   npx playwright test --config playwright.demo.config.ts
const PORT = 4173
const BASE = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'demo.record.ts',
  outputDir: 'test-results/demo',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 300_000,
  use: {
    baseURL: BASE,
    locale: 'ru-RU',
    timezoneId: 'Asia/Baku',
    ...devices['Pixel 7'],
    // Playwright records video in CSS pixels. A 786×1746 mobile window with the page's meta viewport
    // set to width=393 (scale 2, done in the recording script) keeps the phone layout and gives a
    // sharp 2× video, like a real high-density phone screen.
    viewport: { width: 786, height: 1746 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    video: { mode: 'on', size: { width: 786, height: 1746 } },
  },
  webServer: {
    command: 'npm run build:e2e && npm run preview',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
