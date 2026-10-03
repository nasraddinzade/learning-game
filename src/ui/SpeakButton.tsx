import { useEffect, useRef, useState } from 'react'
import { speak, stopSpeaking, ttsAvailable } from '@/speech/tts'
import { useProfileStore } from '@/store/profile'

interface Props {
  text: string
  /** Speak once when mounted. */
  auto?: boolean
  /** Maximum number of plays; undefined for unlimited. */
  limit?: number
  label?: string
  size?: 'sm' | 'lg'
  onPlay?: () => void
  testId?: string
}

/** Speaker button for English text. Hidden when the device has no speech synthesis. */
export function SpeakButton({ text, auto = false, limit, label = 'Озвучить', size = 'sm', onPlay, testId = 'speak' }: Props) {
  const voice = useProfileStore((s) => s.profile?.settings.ttsVoice ?? 'en-US')
  const [plays, setPlays] = useState(0)
  const [busy, setBusy] = useState(false)
  const autoDone = useRef(false)

  async function play() {
    if (limit !== undefined && plays >= limit) return
    setPlays((p) => p + 1)
    onPlay?.()
    setBusy(true)
    await speak(text, voice)
    setBusy(false)
  }

  useEffect(() => {
    if (!auto || autoDone.current || !ttsAvailable()) return
    autoDone.current = true
    void play()
    return () => stopSpeaking()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ttsAvailable()) return null
  const exhausted = limit !== undefined && plays >= limit
  const big = size === 'lg'
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      disabled={exhausted}
      onClick={() => void play()}
      className={`tap inline-flex items-center justify-center gap-2 rounded-full border border-line bg-bg-card text-fg active:scale-95 disabled:opacity-40 ${
        big ? 'px-6 py-3 text-lg' : 'px-3 text-sm'
      } ${busy ? 'border-accent text-accent' : ''}`}
    >
      <svg width={big ? 26 : 18} height={big ? 26 : 18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 10v4h4l5 4V6L8 10H4z" fill="currentColor" />
        <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {big ? <span>{exhausted ? 'Прослушано' : label}</span> : null}
      {limit !== undefined && !big ? <span className="text-xs text-fg-muted">{Math.max(0, limit - plays)}</span> : null}
    </button>
  )
}
