import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  title: string
  /** Where the back arrow leads. Omit for the root screen. */
  back?: string
  children: ReactNode
  /** Test id for e2e. */
  testId: string
}

/**
 * Common page shell: safe-area padding, a header with an optional back arrow,
 * and a single centered column that becomes a phone-width card on desktop.
 */
export function Screen({ title, back, children, testId }: Props) {
  const navigate = useNavigate()
  return (
    <main
      data-testid={testId}
      className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[440px] flex-col px-4 pb-6"
    >
      <header className="flex h-14 items-center gap-2">
        {back ? (
          <button
            type="button"
            aria-label="Назад"
            onClick={() => navigate(back)}
            className="tap -ml-3 flex items-center justify-center rounded-full text-fg-muted active:bg-bg-raised"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 5l-7 7 7 7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      </header>
      <div className="flex flex-1 flex-col gap-4">{children}</div>
    </main>
  )
}

/** Placeholder content for screens that arrive in later stages. */
export function Stub({ stage, what }: { stage: number; what: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line p-6 text-center">
      <span className="text-4xl" aria-hidden="true">
        🌫️
      </span>
      <p className="text-fg-muted">{what}</p>
      <p className="text-sm text-fg-faint">Появится на этапе {stage}</p>
    </div>
  )
}
