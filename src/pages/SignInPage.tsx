import { useState } from 'react'
import { FlaskConical, LoaderCircle } from 'lucide-react'
import { Navigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signInWithGoogle } from '@/features/auth/auth'
import { useAuthStore } from '@/features/auth/authStore'
import { isSupabaseConfigured } from '@/lib/supabase'

export function SignInPage() {
  const status = useAuthStore((state) => state.status)
  const storeError = useAuthStore((state) => state.error)
  const startDemo = useAuthStore((state) => state.startDemo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'signed_in' || status === 'demo') return <Navigate to="/today" replace />

  async function continueWithGoogle() {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const googleButton = (
    <Button
      key="google"
      size="lg"
      variant={isSupabaseConfigured ? 'default' : 'outline'}
      disabled={!isSupabaseConfigured || busy}
      onClick={() => void continueWithGoogle()}
    >
      {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <GoogleLogo />}
      Continue with Google
    </Button>
  )
  const demoButton = (
    <Button key="demo" size="lg" variant={isSupabaseConfigured ? 'outline' : 'default'} onClick={startDemo}>
      <FlaskConical aria-hidden />
      Try Demo Mode
    </Button>
  )
  const problem = error ?? storeError

  return (
    <main className="pt-safe pb-safe flex min-h-full items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Student Mentor</CardTitle>
          <CardDescription>Studies, side hustle and life in one plan, with one clear next step.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {/* Without Supabase, Demo Mode is the main button. */}
          {isSupabaseConfigured ? [googleButton, demoButton] : [demoButton, googleButton]}
          {!isSupabaseConfigured && (
            <p className="text-sm text-muted-foreground">
              Google sign-in turns on once Supabase is connected (see docs/4-setup-guide.md).
            </p>
          )}
          <p className="text-xs text-muted-foreground">Demo Mode keeps everything on this device. Nothing is sent to a server.</p>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

/** Google's "G" logo. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4-3.11z" />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4 3.11C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  )
}
