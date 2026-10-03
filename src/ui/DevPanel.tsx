// Dev-only panel (SPEC §15): time shift, data reset, give runes, force a nemesis.
// Tree-shaken out of production builds because App only renders it when import.meta.env.DEV.
import { useState } from 'react'
import { db, resetDatabase } from '@/db/db'
import { dayKey } from '@/engine/clock'
import { now, useClockStore } from '@/store/clock'
import { useProfileStore } from '@/store/profile'

function Btn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap rounded-lg border border-line bg-bg-card px-3 text-sm active:bg-bg-raised"
    >
      {label}
    </button>
  )
}

export function DevPanel() {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const offsetDays = useClockStore((s) => s.offsetDays)
  const shiftDays = useClockStore((s) => s.shiftDays)
  const resetOffset = useClockStore((s) => s.resetOffset)
  const profile = useProfileStore((s) => s.profile)
  const update = useProfileStore((s) => s.update)

  async function giveRunes() {
    if (!profile) return
    setMsg('+100 рун')
    await update({ runes: profile.runes + 100 })
  }

  async function forceNemesis() {
    // Picks the first progress row that is not yet a nemesis and marks it as one.
    // Until items exist (stage 1) this reports that there is nothing to promote.
    const candidate = await db.progress.filter((p) => p.nemesis === null).first()
    if (!candidate) {
      setMsg('Нет элементов для немезиды')
      return
    }
    await db.progress.update(candidate.itemId, {
      nemesis: { since: now(), winsOverHero: 3, defeatedDays: [] },
    })
    setMsg(`Немезида: ${candidate.itemId}`)
  }

  async function reset() {
    await resetDatabase()
    resetOffset()
    location.reload()
  }

  return (
    <div className="fixed top-1/2 right-0 z-50 flex -translate-y-1/2 flex-col items-end gap-2" data-testid="dev-panel">
      {open ? (
        <div className="mr-1 w-64 rounded-xl border border-line bg-bg-raised/95 p-3 text-xs shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Dev</span>
            <span className="text-fg-muted" data-testid="dev-date">
              {dayKey(now())} ({offsetDays >= 0 ? '+' : ''}
              {offsetDays}д)
            </span>
          </div>
          <div className="mb-2 grid grid-cols-3 gap-1">
            <Btn label="+1 день" onClick={() => shiftDays(1)} />
            <Btn label="+7 дней" onClick={() => shiftDays(7)} />
            <Btn label="Сброс дня" onClick={resetOffset} />
            <Btn label="+100 рун" onClick={giveRunes} />
            <Btn label="Немезида" onClick={forceNemesis} />
            <Btn label="Стереть всё" onClick={reset} />
          </div>
          {msg ? <p className="text-fg-muted">{msg}</p> : null}
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Dev-панель"
        data-testid="dev-toggle"
        onClick={() => setOpen((v) => !v)}
        className="h-12 w-6 rounded-l-lg border border-r-0 border-line bg-bg-raised/80 text-[10px] text-fg-muted backdrop-blur"
      >
        dev
      </button>
    </div>
  )
}
