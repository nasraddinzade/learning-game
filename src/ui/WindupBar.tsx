import { useEffect, useRef, useState } from 'react'

interface Props {
  startedAt: number
  durationMs: number
  /** Freeze the bar (answer given). */
  paused?: boolean
}

/**
 * Enemy wind-up bar. Driven by requestAnimationFrame rather than CSS transitions so it keeps
 * working under prefers-reduced-motion (a frozen bar would break the crit rule).
 */
export function WindupBar({ startedAt, durationMs, paused = false }: Props) {
  const fillRef = useRef<HTMLDivElement>(null)
  // Which wind-up (by start time) has filled. Derived so a new start resets it without setState.
  const [filledFor, setFilledFor] = useState<number | null>(null)
  const filled = filledFor === startedAt

  useEffect(() => {
    if (paused || durationMs <= 0) return
    let raf = 0
    const tick = () => {
      const ratio = Math.min(1, (Date.now() - startedAt) / durationMs)
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${ratio})`
      if (ratio >= 1) {
        setFilledFor(startedAt)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [startedAt, durationMs, paused])

  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-bg-raised"
      role="progressbar"
      aria-label="Шкала замаха"
      data-testid="windup"
      data-filled={filled ? 'true' : 'false'}
    >
      <div
        ref={fillRef}
        className={`h-full w-full origin-left rounded-full ${filled ? 'bg-fg-faint' : 'bg-danger'}`}
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  )
}
