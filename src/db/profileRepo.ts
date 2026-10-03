import { db } from './db'
import type { Profile, Settings } from '@/types'

export const DEFAULT_SETTINGS: Settings = {
  ttsVoice: 'en-US',
  newPerDay: 6,
  sound: true,
  vibration: true,
  ai: {
    geminiKey: '',
    geminiModel: 'gemini-2.5-flash',
    groqKey: '',
    groqModel: 'llama-3.3-70b-versatile',
  },
}

export function defaultProfile(): Profile {
  return {
    id: 'me',
    xp: 0,
    level: 1,
    runes: 0,
    streak: 0,
    freezes: 0,
    lastActiveDay: '',
    camp: {},
    trophies: [],
    unlockedLands: ['smalltalk'],
    settings: structuredClone(DEFAULT_SETTINGS),
  }
}

/** Loads the single profile row, creating it on first launch. */
export async function loadProfile(): Promise<Profile> {
  const existing = await db.profile.get('me')
  if (existing) {
    // Fill in settings added by later versions without touching user values.
    return {
      ...existing,
      settings: {
        ...DEFAULT_SETTINGS,
        ...existing.settings,
        ai: { ...DEFAULT_SETTINGS.ai, ...existing.settings.ai },
      },
    }
  }
  const fresh = defaultProfile()
  await db.profile.put(fresh)
  return fresh
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put(profile)
}
