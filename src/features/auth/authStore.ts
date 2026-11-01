import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { isSupabaseConfigured } from '@/lib/supabase'
import { DEMO_USER, isDemoModeSaved, saveDemoMode } from './demo'

/** loading = still checking for a saved sign-in. demo = Demo Mode (no account, data stays on the device). */
export type AuthStatus = 'loading' | 'signed_out' | 'signed_in' | 'demo'

/** The person using the app, in the shape the screens need. */
export interface AppUser {
  id: string
  email: string | null
  name: string
  avatarUrl: string | null
  isDemo: boolean
}

interface AuthState {
  status: AuthStatus
  session: Session | null
  user: AppUser | null
  /** The last sign-in problem, shown on the sign-in page. */
  error: string | null
  setSession: (session: Session | null) => void
  setError: (error: string | null) => void
  startDemo: () => void
  endDemo: () => void
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** Google puts the person's name and photo in the user metadata. */
export function toAppUser(user: User): AppUser {
  const meta: Record<string, unknown> = user.user_metadata ?? {}
  return {
    id: user.id,
    email: user.email ?? null,
    name: text(meta.full_name) ?? text(meta.name) ?? user.email ?? 'Student',
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
    isDemo: false,
  }
}

const startsInDemo = isDemoModeSaved()

export const useAuthStore = create<AuthState>()((set, get) => ({
  // Without Supabase there's no saved sign-in to look for, so we know the answer right away.
  status: startsInDemo ? 'demo' : isSupabaseConfigured ? 'loading' : 'signed_out',
  session: null,
  user: startsInDemo ? DEMO_USER : null,
  error: null,
  setSession: (session) => {
    if (session) {
      saveDemoMode(false) // a real sign-in always ends Demo Mode
      set({ session, status: 'signed_in', user: toAppUser(session.user), error: null })
    } else if (get().status === 'demo') {
      set({ session: null })
    } else {
      set({ session: null, status: 'signed_out', user: null })
    }
  },
  setError: (error) => set({ error }),
  startDemo: () => {
    saveDemoMode(true)
    set({ status: 'demo', user: DEMO_USER, error: null })
  },
  endDemo: () => {
    saveDemoMode(false)
    const { session } = get()
    set(session ? { status: 'signed_in', user: toAppUser(session.user) } : { status: 'signed_out', user: null })
  },
}))
