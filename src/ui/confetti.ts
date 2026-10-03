/** Fires confetti without pulling canvas-confetti into the main bundle. */
export async function burstConfetti(big: boolean): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  try {
    const { default: confetti } = await import('canvas-confetti')
    const colors = ['#ffb547', '#ff4d6d', '#4ade80', '#e8ecf5']
    void confetti({ particleCount: big ? 140 : 60, spread: big ? 90 : 60, origin: { y: 0.6 }, colors, disableForReducedMotion: true })
    if (big) {
      setTimeout(() => void confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors }), 250)
      setTimeout(() => void confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors }), 400)
    }
  } catch {
    /* confetti is decoration; never break the game over it */
  }
}

