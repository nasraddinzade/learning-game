import { create } from 'zustand'
import { loadProfile, saveProfile } from '@/db/profileRepo'
import type { Profile, Settings } from '@/types'

interface ProfileState {
  profile: Profile | null
  loaded: boolean
  error: string | null
  load: () => Promise<void>
  update: (patch: Partial<Omit<Profile, 'id' | 'settings'>>) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
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
}))
