import { useEffect } from 'react'

/**
 * Desktop keyboard control (SPEC §12): maps keys to actions while no text field is focused.
 * Enter on a focused button already works natively; this covers digits, arrows and bare Enter.
 */
export function useKeys(map: Record<string, () => void>, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const fn = map[e.key]
      if (!fn) return
      e.preventDefault()
      fn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [map, enabled])
}
