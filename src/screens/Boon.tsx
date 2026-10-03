import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { BOONS } from '@/game/boons'
import { routeForRun, useRunStore } from '@/store/run'

/** Choose one of three boons after a node (SPEC §7.1). */
export function BoonScreen() {
  const navigate = useNavigate()
  const s = useRunStore()

  useEffect(() => {
    void s.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!s.loaded) return
    const route = routeForRun(s.run)
    if (route !== '/boon') navigate(route, { replace: true })
  }, [s.run, s.loaded, navigate])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const offer = useRunStore.getState().run?.boonOffer
      const i = Number(e.key) - 1
      if (offer && i >= 0 && i < offer.length) void useRunStore.getState().pickBoon(offer[i] as (typeof offer)[number])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const offer = s.run?.boonOffer ?? null
  if (!s.run || !offer) {
    return (
      <main data-testid="screen-boon" className="flex min-h-full items-center justify-center text-fg-muted">
        …
      </main>
    )
  }

  return (
    <main data-testid="screen-boon" className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[440px] flex-col gap-4 px-4 pb-6">
      <header className="flex h-14 items-center">
        <h1 className="text-xl font-bold tracking-tight">Выбери усиление</h1>
      </header>
      <p className="text-sm text-fg-muted">Действует до конца похода. Усиления меняют награды и ход боя, но не оценку памяти.</p>
      <div className="flex flex-col gap-3">
        {offer.map((id, i) => {
          const b = BOONS[id]
          return (
            <motion.button
              key={id}
              type="button"
              data-testid={`boon-${id}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.2 }}
              onClick={() => void s.pickBoon(id)}
              className="tap flex items-center gap-4 rounded-card border border-line bg-bg-card p-4 text-left active:scale-[0.98] active:border-accent"
            >
              <span className="text-3xl" aria-hidden="true">
                {b.icon}
              </span>
              <span className="flex-1">
                <span className="block text-lg font-bold">{b.name}</span>
                <span className="block text-sm text-fg-muted">{b.text}</span>
              </span>
              <span className="text-xs text-fg-faint">{i + 1}</span>
            </motion.button>
          )
        })}
      </div>
    </main>
  )
}
