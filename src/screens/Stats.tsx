import { Screen, Stub } from '@/ui/Screen'

export function StatsScreen() {
  return (
    <Screen title="Статистика" back="/" testId="screen-stats">
      <Stub stage={6} what="Недельный отчёт: приручено, точность по pattern, самая упорная немезида" />
    </Screen>
  )
}
