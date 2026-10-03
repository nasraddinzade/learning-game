import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'

interface Props {
  placeholder: string
  multiline?: boolean
  onSubmit: (text: string) => void
  onInteract?: () => void
  extra?: ReactNode
  /** Label of the submit button; "Удар" in battle. */
  submitLabel?: string
}

/**
 * Text input for typed moves. Autocorrect and capitalization are off so the keyboard does
 * not hint the answer (SPEC §6). Enter submits; Shift+Enter adds a line in multiline mode.
 */
export function TextAnswer({ placeholder, multiline = false, onSubmit, onInteract, extra, submitLabel = 'Удар' }: Props) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const touched = useRef(false)

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])

  function change(v: string) {
    if (!touched.current && v.length > 0) {
      touched.current = true
      onInteract?.()
    }
    setText(v)
  }
  function submit() {
    const t = text.trim()
    if (t.length === 0) return
    onSubmit(t)
  }

  const common = {
    ref,
    value: text,
    placeholder,
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
    autoComplete: 'off',
    'data-testid': 'answer-input',
    className:
      'w-full rounded-2xl border border-line bg-bg-raised px-4 py-3 text-lg text-fg outline-none placeholder:text-fg-faint focus:border-accent',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
        e.preventDefault()
        submit()
      }
    },
  } as const

  return (
    <div className="flex flex-col gap-2">
      {multiline ? <textarea {...common} rows={2} /> : <input {...common} type="text" enterKeyHint="send" />}
      <div className="flex items-center gap-2">
        {extra ? <div className="shrink-0">{extra}</div> : null}
        <Button className="flex-1" data-testid="answer-submit" disabled={text.trim().length === 0} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
