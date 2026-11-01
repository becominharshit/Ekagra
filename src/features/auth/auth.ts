import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { queryClient } from '@/lib/queryClient'
import { requireSupabase, supabase } from '@/lib/supabase'
import { useAuthStore } from './authStore'

// Google sign-in, two ways:
//   Web:     the page goes to Google → Supabase → back to /auth/callback?code=…
//   Android: Google doesn't allow sign-in inside an app's WebView, so we open the system
//            browser. Afterwards Supabase sends it to ekagra://auth/callback?code=…, Android
//            reopens our app with that link, and we swap the code for a session.

/** The Android return link. It must also be in AndroidManifest.xml and in
 *  Supabase → Authentication → URL Configuration → Redirect URLs. */
export const NATIVE_REDIRECT_URL = 'ekagra://auth/callback'

/** The web return page. */
export function webRedirectUrl(): string {
  return `${window.location.origin}/auth/callback`
}

let started = false

/** Starts following sign-in changes. Called once when the app starts (main.tsx). */
export function initAuth(): void {
  if (started) return
  started = true

  // Fires at start-up with any saved session, and again on every sign-in and sign-out.
  supabase?.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setSession(session)
  })

  if (Capacitor.isNativePlatform()) {
    // The app was open in the background: the return link arrives as an event.
    void App.addListener('appUrlOpen', ({ url }) => void finishNativeSignIn(url))
    // The app had been closed: Android starts it with the return link.
    void App.getLaunchUrl().then((launch) => (launch?.url ? finishNativeSignIn(launch.url) : undefined))
  }
}

export async function signInWithGoogle(): Promise<void> {
  const client = requireSupabase()
  useAuthStore.getState().setError(null)

  if (Capacitor.isNativePlatform()) {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: NATIVE_REDIRECT_URL, skipBrowserRedirect: true },
    })
    if (error) throw error
    await Browser.open({ url: data.url })
    return
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: webRedirectUrl() },
  })
  if (error) throw error
}

/** Reads the Android return link: a one-time code to swap for a session, or an error.
 *  Returns null for links that aren't ours. */
export function readAuthCallback(url: string): { code: string } | { error: string } | null {
  if (!url.startsWith(NATIVE_REDIRECT_URL)) return null
  const [beforeHash = '', hash = ''] = url.split('#')
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : ''
  const params = new URLSearchParams(query)
  const fromHash = new URLSearchParams(hash)
  const error =
    params.get('error_description') ?? params.get('error') ?? fromHash.get('error_description') ?? fromHash.get('error')
  if (error) return { error }
  const code = params.get('code')
  return code ? { code } : { error: 'The sign-in link had no code. Please try again.' }
}

async function finishNativeSignIn(url: string): Promise<void> {
  const result = readAuthCallback(url)
  if (!result) return
  await Browser.close().catch(() => undefined) // on Android the browser tab may already be gone
  if ('error' in result) {
    useAuthStore.getState().setError(result.error)
    return
  }
  const { error } = await requireSupabase().auth.exchangeCodeForSession(result.code)
  // On success, onAuthStateChange reports the new session and the app moves on to Today.
  if (error) useAuthStore.getState().setError(error.message)
}

export async function signOut(): Promise<void> {
  const { status, endDemo } = useAuthStore.getState()
  if (status === 'demo') {
    endDemo()
  } else if (supabase) {
    // 'local' signs out this device only, and also works offline.
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw error
  }
  queryClient.clear() // forget the previous person's cached data
}
