import { DEMO_USER } from '@/features/auth/demo'
import { demoDb } from '@/lib/demoDb'
import type { ProfileRepo, ProfileRow, RoutineRow } from './queries'
import { deviceTimezone } from './settings'

// Demo Mode storage: the demo profile and routine live in this browser's localStorage, in
// the same shape as the database rows, so the rest of the app doesn't care where they come from.
// Nothing here is ever sent to a server.

const STORAGE_KEY = 'ekagra-demo-data'

interface DemoData {
  profile: ProfileRow
  routine: RoutineRow[]
}

function freshData(): DemoData {
  const now = new Date().toISOString()
  return {
    profile: {
      id: DEMO_USER.id,
      full_name: DEMO_USER.name,
      avatar_url: null,
      college: null,
      program: null,
      year: null,
      semester: null,
      timezone: deviceTimezone(),
      currency: 'INR',
      chronotype: 'neutral',
      mentor_tone: 'balanced',
      onboarded_at: null,
      settings: {},
      created_at: now,
      updated_at: now,
    },
    routine: [],
  }
}

function read(): DemoData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return freshData()
    const data = JSON.parse(saved) as Partial<DemoData>
    return data.profile && Array.isArray(data.routine) ? { profile: data.profile, routine: data.routine } : freshData()
  } catch {
    return freshData()
  }
}

function write(data: DemoData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export const demoProfileRepo: ProfileRepo = {
  async getProfile() {
    return read().profile
  },
  async saveProfile(patch) {
    const data = read()
    data.profile = { ...data.profile, ...patch, id: DEMO_USER.id, updated_at: new Date().toISOString() }
    write(data)
  },
  async getRoutine() {
    return read().routine
  },
  async replaceRoutine(rows) {
    const data = read()
    const now = new Date().toISOString()
    data.routine = rows.map((row, index) => ({
      valid_from: null,
      valid_to: null,
      ...row,
      id: `demo-routine-${index + 1}`,
      user_id: DEMO_USER.id,
      created_at: now,
      updated_at: now,
    }))
    write(data)
  },
}

/** Deletes all Demo Mode data from this device: the profile, the routine and every demo table. */
export function clearDemoData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage is blocked: there is nothing saved to clear.
  }
  demoDb.clear()
}
