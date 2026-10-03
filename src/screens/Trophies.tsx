import { Screen, Stub } from '@/ui/Screen'

export function TrophiesScreen() {
  return (
    <Screen title="Зал трофеев" back="/" testId="screen-trophies">
      <Stub stage={4} what="Побеждённые немезиды с датой и счётом" />
    </Screen>
  )
}
