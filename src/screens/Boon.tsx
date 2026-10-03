import { Screen, Stub } from '@/ui/Screen'

export function BoonScreen() {
  return (
    <Screen title="Выбор усиления" back="/" testId="screen-boon">
      <Stub stage={2} what="Одно из трёх усилений на этот поход" />
    </Screen>
  )
}
