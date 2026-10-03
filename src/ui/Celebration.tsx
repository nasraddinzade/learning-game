import { useEffect } from 'react'
import { motion, MotionConfig } from 'motion/react'
import { burstConfetti } from './confetti'
import { buzz, fx } from './fx'

export interface CelebrationData {
  emoji: string
  title: string
  subtitle?: string
  /** Visual intensity: 'big' fires a wide confetti burst. */
  tone?: 'big' | 'small'
  testId?: string
}

interface Props extends CelebrationData {
  onDone: () => void
}

/** Full-screen celebration (SPEC §7.3): confetti, vibration, tap anywhere to continue. */
export function Celebration({ emoji, title, subtitle, tone = 'big', testId = 'celebration', onDone }: Props) {
  useEffect(() => {
    void burstConfetti(tone === 'big')
    if (tone === 'big') {
      fx.big()
      buzz.big()
    } else {
      fx.win()
      buzz.debtClosed()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ') onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <MotionConfig reducedMotion="user">
    <motion.div
      role="dialog"
      aria-label={title}
      data-testid={testId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      onClick={onDone}
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-3 bg-bg/95 px-6 text-center backdrop-blur-sm"
    >
      <motion.span
        aria-hidden="true"
        className="text-7xl"
        initial={{ scale: 0.4, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14 }}
      >
        {emoji}
      </motion.span>
      <motion.h2 className="text-3xl font-bold" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
        {title}
      </motion.h2>
      {subtitle ? (
        <motion.p className="text-lg text-fg-muted" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
          {subtitle}
        </motion.p>
      ) : null}
      <p className="mt-6 text-sm text-fg-faint">Тапни, чтобы продолжить</p>
    </motion.div>
    </MotionConfig>
  )
}
