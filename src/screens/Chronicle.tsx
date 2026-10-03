import { Screen, Stub } from '@/ui/Screen'

export function ChronicleScreen() {
  return (
    <Screen title="Летопись" back="/" testId="screen-chronicle">
      <Stub stage={4} what="Все существа по землям: не встречал, встречал, ранен, приручён" />
    </Screen>
  )
}
