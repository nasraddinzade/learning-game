import { Screen, Stub } from '@/ui/Screen'

export function SummaryScreen() {
  return (
    <Screen title="Итог похода" back="/" testId="screen-summary">
      <Stub stage={2} what="Что выучено, какие долги закрыты, сколько рун" />
    </Screen>
  )
}
