import type { HeroLook } from '@/types'

/** The lone wanderer by the fire (SPEC §12), with a few bought looks. Inline SVG only. */
export function HeroScene({ look = 'wanderer' }: { look?: HeroLook }) {
  return (
    <svg viewBox="0 0 360 150" className="h-auto w-full" role="img" aria-label="Путник у костра" data-look={look}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2238" />
          <stop offset="1" stopColor="#0b0d12" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="360" height="150" rx="20" fill="url(#sky)" />
      <circle cx="300" cy="34" r="13" fill="#e8ecf5" opacity="0.9" />
      <circle cx="60" cy="28" r="1.5" fill="#e8ecf5" opacity="0.7" />
      <circle cx="120" cy="48" r="1" fill="#e8ecf5" opacity="0.5" />
      <circle cx="210" cy="22" r="1.2" fill="#e8ecf5" opacity="0.6" />
      <circle cx="250" cy="64" r="1" fill="#e8ecf5" opacity="0.4" />
      <path d="M0 104 Q60 80 120 102 T240 96 T360 104 V150 H0Z" fill="#161c2b" />
      <path d="M0 124 Q90 104 180 126 T360 122 V150 H0Z" fill="#11151f" />
      <ellipse cx="230" cy="128" rx="60" ry="24" fill="url(#glow)" />
      <path d="M224 128 q-6 -14 6 -24 q0 10 8 12 q2 -8 8 -10 q-2 16 -10 24z" fill="var(--color-accent)" />
      <path d="M228 130 q-2 -8 4 -14 q2 6 4 8 q0 -4 2 -6 q0 10 -6 14z" fill="#fff3d6" />
      <g fill="#0b0d12">
        {look === 'hood' ? <path d="M138 96 q12 -18 24 0 q-4 -6 -12 -6 q-8 0 -12 6z" /> : <circle cx="150" cy="90" r="9" />}
        <path d="M136 132 q0 -34 14 -36 q14 2 14 36z" />
        {look === 'staff' ? (
          <>
            <path d="M133 104 l-8 12" stroke="#0b0d12" strokeWidth="5" strokeLinecap="round" />
            <path d="M172 82 l-4 50" stroke="#3b2f1e" strokeWidth="3" strokeLinecap="round" />
            <circle cx="172" cy="80" r="3" fill="var(--color-accent)" />
          </>
        ) : (
          <path d="M133 104 l-8 12 M167 104 l10 10" stroke="#0b0d12" strokeWidth="5" strokeLinecap="round" />
        )}
      </g>
    </svg>
  )
}
