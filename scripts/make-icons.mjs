// Renders PWA icons (PNG) from an inline SVG using the Playwright Chromium that is already
// installed for e2e. No image libraries needed. Run: npm run icons
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const out = new URL('../public/icons/', import.meta.url)
await mkdir(out, { recursive: true })

function svg(size, { padded }) {
  // Maskable icons need the artwork inside the inner 80% safe zone.
  const pad = padded ? 0.2 : 0.08
  const inner = size * (1 - 2 * pad)
  const offset = size * pad
  return `<!doctype html><html><body style="margin:0;background:#0b0d12">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0b0d12"/>
  <g transform="translate(${offset} ${offset}) scale(${inner / 64})">
    <path d="M26 50 q-8 -20 6 -32 q0 12 9 16 q2 -10 9 -13 q-2 22 -12 32z" fill="#ffb547"/>
    <path d="M30 50 q-3 -10 4 -18 q2 7 5 11 q0 -5 2 -8 q0 13 -7 18z" fill="#fff3d6"/>
    <path d="M14 58 h36" stroke="#2a3144" stroke-width="4" stroke-linecap="round"/>
  </g>
</svg></body></html>`
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })

const jobs = [
  ['icon-192.png', 192, { padded: false }],
  ['icon-512.png', 512, { padded: false }],
  ['icon-maskable-512.png', 512, { padded: true }],
]
for (const [name, size, opts] of jobs) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(svg(size, opts))
  await page.screenshot({ path: fileURLToPath(new URL(name, out)), clip: { x: 0, y: 0, width: size, height: size } })
  console.log('wrote', name)
}
await browser.close()
