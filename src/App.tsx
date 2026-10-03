import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ensureSeed } from '@/db/seedRepo'
import { DEBUG } from '@/debug'
import { useProfileStore } from '@/store/profile'
import { installDebugHooks } from '@/debugHooks'
import { DevPanel } from '@/ui/DevPanel'
import { CampScreen } from '@/screens/Camp'
import { MapScreen } from '@/screens/Map'
import { RestScreen } from '@/screens/Rest'
import { BoonScreen } from '@/screens/Boon'
import { SummaryScreen } from '@/screens/Summary'
import { ChronicleScreen } from '@/screens/Chronicle'
import { TrophiesScreen } from '@/screens/Trophies'
import { FromLifeScreen } from '@/screens/FromLife'
import { StatsScreen } from '@/screens/Stats'
import { SettingsScreen } from '@/screens/Settings'
import { UpgradesScreen } from '@/screens/Upgrades'
import { LibraryScreen } from '@/screens/Library'

// Heavy screens load lazily so the camp stays small (SPEC §3).
const BattleScreen = lazy(() => import('@/screens/Battle').then((m) => ({ default: m.BattleScreen })))
const EncounterScreen = lazy(() =>
  import('@/screens/Encounter').then((m) => ({ default: m.EncounterScreen })),
)
const ReaderScreen = lazy(() => import('@/screens/Reader').then((m) => ({ default: m.ReaderScreen })))

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

  // Bought themes recolor the accent through a data attribute on <html>.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (DEBUG) installDebugHooks()
    void ensureSeed().then(load)
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
