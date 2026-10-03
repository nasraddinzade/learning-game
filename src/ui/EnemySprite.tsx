import { motion } from 'motion/react'
import { enemyLook, type EnemyLook } from '@/game/enemyLook'
import type { EnemyKind } from '@/types'

interface Props {
  itemId: string
  kind: EnemyKind
  /** Nemesis scars. */
  scars?: number
  /** Animation trigger: increments on each hit/miss. */
  shake?: number
  /** Enemy dissolves (defeated). */
  down?: boolean
  size?: number
}

function bodyPath(look: EnemyLook): string {
  switch (look.shape) {
    case 'tall':
      return 'M60 10 C85 10 92 40 92 70 C92 100 85 118 60 118 C35 118 28 100 28 70 C28 40 35 10 60 10Z'
    case 'wide':
      return 'M60 30 C100 30 115 55 115 80 C115 105 95 118 60 118 C25 118 5 105 5 80 C5 55 20 30 60 30Z'
    case 'spiky':
      return 'M60 8 L72 30 L96 26 L88 50 L112 64 L88 78 L96 104 L72 98 L60 120 L48 98 L24 104 L32 78 L8 64 L32 50 L24 26 L48 30Z'
    default:
      return 'M60 18 C90 18 108 42 108 72 C108 100 88 118 60 118 C32 118 12 100 12 72 C12 42 30 18 60 18Z'
  }
}

function Eye({ cx, cy, style, danger }: { cx: number; cy: number; style: EnemyLook['eyeStyle']; danger: boolean }) {
  const fill = danger ? '#ff4d6d' : '#fff7e6'
  if (style === 'slit') return <ellipse cx={cx} cy={cy} rx="3" ry="8" fill={fill} />
  if (style === 'dot') return <circle cx={cx} cy={cy} r="3" fill={fill} />
  return (
    <>
      <circle cx={cx} cy={cy} r="7" fill={fill} />
      <circle cx={cx + 1.5} cy={cy + 1} r="3" fill="#0b0d12" />
    </>
  )
}

/** Procedural SVG creature. Same item id always draws the same creature (SPEC §5.4). */
export function EnemySprite({ itemId, kind, scars = 0, shake = 0, down = false, size = 150 }: Props) {
  const look = enemyLook(itemId)
  const nemesis = kind === 'nemesis'
  const echo = kind === 'echo'
  const debtor = kind === 'debtor'
  const hue = nemesis ? 350 : echo ? 268 : look.hue
  const sat = nemesis ? 80 : echo ? 55 : 45
  const body = `hsl(${hue} ${sat}% ${nemesis ? 42 : 36}%)`
  const bodyDark = `hsl(${hue} ${sat}% ${nemesis ? 28 : 24}%)`
  const eyesY = look.shape === 'wide' ? 66 : 58
  const eyeXs = look.eyes === 1 ? [60] : look.eyes === 2 ? [46, 74] : [40, 60, 80]
  const scale = look.scale * (nemesis ? 1.15 + Math.min(scars, 5) * 0.04 : echo ? 1.2 : 1)

  return (
    <motion.svg
      key={shake}
      viewBox="0 0 120 130"
      width={size}
      height={size * (130 / 120)}
      initial={shake > 0 ? { x: 0 } : false}
      animate={
        down
          ? { scale: 0, opacity: 0, rotate: 20 }
          : shake > 0
            ? { x: [0, -10, 10, -6, 6, 0] }
            : { x: 0, y: [0, -4, 0] }
      }
      transition={
        down ? { duration: 0.45 } : shake > 0 ? { duration: 0.35 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
      }
      style={{ opacity: debtor ? 0.75 : 1 }}
      data-testid="enemy-sprite"
      data-kind={kind}
      aria-hidden="true"
    >
      <g transform={`translate(60 65) scale(${scale}) translate(-60 -65)`}>
        {look.horns > 0 ? (
          <g fill={bodyDark}>
            <path d="M38 22 L30 2 L50 18Z" />
            {look.horns > 1 ? <path d="M82 22 L90 2 L70 18Z" /> : null}
          </g>
        ) : null}
        <path d={bodyPath(look)} fill={body} />
        <path d={bodyPath(look)} fill="url(#enemy-shade)" opacity="0.5" />
        {Array.from({ length: look.spikes }).map((_, i) => (
          <circle key={i} cx={20 + i * 20} cy={112} r="3" fill={bodyDark} />
        ))}
        {Array.from({ length: look.marks }).map((_, i) => (
          <circle key={i} cx={40 + i * 18} cy={90} r="2.5" fill={bodyDark} />
        ))}
        {eyeXs.map((cx) => (
          <Eye key={cx} cx={cx} cy={eyesY} style={look.eyeStyle} danger={nemesis || echo} />
        ))}
        {nemesis
          ? Array.from({ length: Math.min(scars, 6) }).map((_, i) => (
              <path
                key={i}
                d={`M${30 + i * 10} ${78 + (i % 2) * 6} l8 12`}
                stroke="#ffd6de"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            ))
          : null}
      </g>
      <defs>
        <linearGradient id="enemy-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>
      </defs>
    </motion.svg>
  )
}
