import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  full?: boolean
}

const base =
  'tap inline-flex items-center justify-center gap-2 rounded-2xl px-5 font-semibold transition-transform ' +
  'active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-accent'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-bg shadow-[0_6px_0_var(--color-accent-deep)] active:translate-y-[2px] active:shadow-[0_2px_0_var(--color-accent-deep)]',
  secondary: 'bg-bg-card text-fg border border-line',
  ghost: 'bg-transparent text-fg-muted',
  danger: 'bg-danger/15 text-danger border border-danger/40',
}

export function Button({ variant = 'primary', full = false, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  )
}
