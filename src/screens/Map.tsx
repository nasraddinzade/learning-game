import { Screen, Stub } from '@/ui/Screen'

export function MapScreen() {
  return (
    <Screen title="Карта похода" back="/" testId="screen-map">
      <Stub stage={2} what="Карта из шести шагов с выбором пути и финальным Эхо" />
    </Screen>
  )
}
