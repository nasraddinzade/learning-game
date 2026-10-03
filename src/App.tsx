import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ensureSeed } from '@/db/seedRepo'
import { DEBUG } from '@/debug'
import type { TextSize } from '@/types'
import { useProfileStore } from '@/store/profile'
import { installDebugHooks } from '@/debugHooks'
import { DevPanel } from '@/ui/DevPanel'
import { CampScreen } from '@/screens/Camp'

// Only the camp ships in the first chunk (SPEC §3): every other screen loads on demand.
const MapScreen = lazy(() => import('@/screens/Map').then((m) => ({ default: m.MapScreen })))
const RestScreen = lazy(() => import('@/screens/Rest').then((m) => ({ default: m.RestScreen })))
const BoonScreen = lazy(() => import('@/screens/Boon').then((m) => ({ default: m.BoonScreen })))
const SummaryScreen = lazy(() => import('@/screens/Summary').then((m) => ({ default: m.SummaryScreen })))
const ChronicleScreen = lazy(() => import('@/screens/Chronicle').then((m) => ({ default: m.ChronicleScreen })))
const TrophiesScreen = lazy(() => import('@/screens/Trophies').then((m) => ({ default: m.TrophiesScreen })))
const FromLifeScreen = lazy(() => import('@/screens/FromLife').then((m) => ({ default: m.FromLifeScreen })))
const StatsScreen = lazy(() => import('@/screens/Stats').then((m) => ({ default: m.StatsScreen })))
const SettingsScreen = lazy(() => import('@/screens/Settings').then((m) => ({ default: m.SettingsScreen })))
const UpgradesScreen = lazy(() => import('@/screens/Upgrades').then((m) => ({ default: m.UpgradesScreen })))
const LibraryScreen = lazy(() => import('@/screens/Library').then((m) => ({ default: m.LibraryScreen })))
const LifeAddScreen = lazy(() => import('@/screens/LifeAdd').then((m) => ({ default: m.LifeAddScreen })))
const BattleScreen = lazy(() => import('@/screens/Battle').then((m) => ({ default: m.BattleScreen })))
const EncounterScreen = lazy(() => import('@/screens/Encounter').then((m) => ({ default: m.EncounterScreen })))
const ReaderScreen = lazy(() => import('@/screens/Reader').then((m) => ({ default: m.ReaderScreen })))

const TEXT_SIZE_PX: Record<TextSize, string> = { normal: '16px', large: '18px', xlarge: '20px' }

function Loading() {
  return (
    <div className="flex min-h-full items-center justify-center text-fg-muted" data-testid="loading">
      …
    </div>
  )
}

export default function App() {
  const loaded = useProfileStore((s) => s.loaded)
  const error = useProfileStore((s) => s.error)
  const load = useProfileStore((s) => s.load)
  const theme = useProfileStore((s) => s.profile?.theme ?? 'ember')
  const textSize = useProfileStore((s) => s.profile?.settings.textSize ?? 'large')
  const [bootError, setBootError] = useState<string | null>(null)

  // Bought themes recolor the accent through a data attribute on <html>.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Text size scales the root font: every rem-based size and spacing follows (SPEC §12).
  useEffect(() => {
    document.documentElement.style.fontSize = TEXT_SIZE_PX[textSize]
  }, [textSize])

  useEffect(() => {
    if (DEBUG) installDebugHooks()
    // The profile loads even when the seed chunk fails: a stale page must never hang on "…".
    void ensureSeed()
      .catch((e: unknown) => setBootError(e instanceof Error ? e.message : String(e)))
      .finally(() => void load())
  }, [load])

  if (error) {
    return (
      <div className="mx-auto flex min-h-full max-w-[440px] flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-semibold">Не удалось открыть хранилище</p>
        <p className="text-sm text-fg-muted">{error}</p>
      </div>
    )
  }

  if (!loaded) return <Loading />

  return (
    <>
      {bootError ? (
        <div className="mx-auto flex max-w-[440px] items-center gap-3 px-4 pt-3 text-sm" data-testid="boot-error">
          <p className="min-w-0 flex-1 text-danger">Контент не загрузился: {bootError}</p>
          <button type="button" onClick={() => location.reload()} className="tap shrink-0 rounded-xl bg-bg-raised px-3 text-sm font-semibold">
            Обновить
          </button>
        </div>
      ) : null}
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<CampScreen />} />
          <Route path="/run" element={<MapScreen />} />
          <Route path="/battle" element={<BattleScreen />} />
          <Route path="/rest" element={<RestScreen />} />
          <Route path="/encounter" element={<EncounterScreen />} />
          <Route path="/boon" element={<BoonScreen />} />
          <Route path="/summary" element={<SummaryScreen />} />
          <Route path="/chronicle" element={<ChronicleScreen />} />
          <Route path="/trophies" element={<TrophiesScreen />} />
          <Route path="/life" element={<FromLifeScreen />} />
          <Route path="/life/:mode" element={<LifeAddScreen />} />
          <Route path="/stats" element={<StatsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/upgrades" element={<UpgradesScreen />} />
          <Route path="/read" element={<LibraryScreen />} />
          <Route path="/read/:id" element={<ReaderScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {DEBUG ? <DevPanel /> : null}
    </>
  )
}
