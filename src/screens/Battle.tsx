import { Screen, Stub } from '@/ui/Screen'

export function BattleScreen() {
  return (
    <Screen title="Бой" back="/" testId="screen-battle">
      <Stub stage={1} what="Враг, шкала замаха, задание и зона ответа" />
    </Screen>
  )
}
