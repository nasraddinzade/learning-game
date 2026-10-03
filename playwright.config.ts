import { defineConfig, devices } from '@playwright/test'

// Tests run against a production-like build (`--mode e2e`, which keeps the dev panel and the
// window.__nemesis test hook) served by `vite preview`, so the service worker and offline mode
// behave exactly as on the phone (SPEC §16).
const PORT = 4173
const BASE = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Asia/Baku',
  },
  projects: [
    {
      // Primary target: Xiaomi 11 Lite, 393×873 CSS px, Chrome, touch.
      name: 'phone',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 393, height: 873 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'phone-small',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 800 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'npm run build:e2e && npm run preview',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
