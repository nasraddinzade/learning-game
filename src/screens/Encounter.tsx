import { Screen, Stub } from '@/ui/Screen'

export function EncounterScreen() {
  return (
    <Screen title="Встреча" back="/" testId="screen-encounter">
      <Stub stage={5} what="Сцена-диалог, где английский решает исход" />
    </Screen>
  )
}
