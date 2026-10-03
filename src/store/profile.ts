import { create } from 'zustand'
import { loadProfile, saveProfile } from '@/db/profileRepo'
import { buyUpgrade, type UpgradeDef } from '@/game/upgrades'
import type { HeroLook, Profile, Settings, ThemeId } from '@/types'

interface ProfileState {
  profile: Profile | null
  loaded: boolean
  error: string | null
  load: () => Promise<void>
  update: (patch: Partial<Omit<Profile, 'id' | 'settings'>>) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  buy: (def: UpgradeDef) => Promise<boolean>
  setLook: (look: HeroLook) => Promise<void>
  setTheme: (theme: ThemeId) => Promise<void>
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  loaded: false,
  error: null,

  load: async () => {
    try {
      const profile = await loadProfile()
      set({ profile, loaded: true, error: null })
    } catch (e) {
      set({ loaded: true, error: e instanceof Error ? e.message : String(e) })
    }
  },

  update: async (patch) => {
    const current = get().profile
    if (!current) return
    const next: Profile = { ...current, ...patch }
    set({ profile: next })
    await saveProfile(next)
  },

  updateSettings: async (patch) => {
    const current = get().profile
    if (!current) return
    const next: Profile = { ...current, settings: { ...current.settings, ...patch } }
    set({ profile: next })
    await saveProfile(next)
  },

  buy: async (def) => {
    const current = get().profile
    if (!current) return false
    const next = buyUpgrade(current, def)
    if (next === current) return false
    set({ profile: next })
    await saveProfile(next)
    return true
  },

  setLook: async (look) => get().update({ heroLook: look }),
  setTheme: async (theme) => get().update({ theme }),
}))
