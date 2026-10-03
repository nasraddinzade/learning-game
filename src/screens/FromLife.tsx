import { Screen, Stub } from '@/ui/Screen'

export function FromLifeScreen() {
  return (
    <Screen title="Из жизни" back="/" testId="screen-life">
      <Stub stage={5} what="Не смог сказать, вставить текст, добавить вручную" />
    </Screen>
  )
}
