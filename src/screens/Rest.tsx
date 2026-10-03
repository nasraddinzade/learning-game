import { Screen, Stub } from '@/ui/Screen'

export function RestScreen() {
  return (
    <Screen title="Привал" back="/" testId="screen-rest">
      <Stub stage={2} what="Костёр, восстановление здоровья и тренировка Ловушкой" />
    </Screen>
  )
}
