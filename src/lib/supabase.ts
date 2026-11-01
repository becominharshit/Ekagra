import { Capacitor } from '@capacitor/core'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Public values from .env (see .env.example). Without them the app still runs in Demo Mode.
const url: string | undefined = import.meta.env.VITE_SUPABASE_URL
const publishableKey: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

function connect(): SupabaseClient<Database> | null {
  if (!url || !publishableKey) return null
  try {
    return createClient<Database>(url, publishableKey, {
      auth: {
        // PKCE: after Google, the app gets a one-time code and swaps it for a session.
        flowType: 'pkce',
        // On the web, Supabase reads /auth/callback?code=… by itself. In the Android app the
        // code arrives through the ekagra:// deep link instead (see features/auth/auth.ts).
        detectSessionInUrl: !Capacitor.isNativePlatform(),
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  } catch (error) {
    console.error('The Supabase values in .env look wrong:', error)
    return null
  }
}

/** The Supabase client, or null while .env isn't filled in. */
export const supabase = connect()

/** True when the app is connected to Supabase, so Google sign-in is available. */
export const isSupabaseConfigured = supabase !== null

/** The client, or a clear error that explains how to connect Supabase. */
export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      'Supabase is not connected yet: copy .env.example to .env, fill in your project URL and publishable key, then restart `npm run dev`.',
    )
  }
  return supabase
}
