import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signInWithGoogle } from '@/features/auth/auth'
import { useAuthStore } from '@/features/auth/authStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { GoogleLogo } from '@/pages/SignInPage'
import { ekagraUrl, rememberNext, safeNext } from '@studio/lib/links'

/** Studio's sign-in: Google only, with the same account as Ekagra (that's what connects the two apps). */
export function SignInPage() {
  const status = useAuthStore((state) => state.status)
  const storeError = useAuthStore((state) => state.error)
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'signed_in') return <Navigate to={next} replace />

  async function continueWithGoogle() {
    setBusy(true)
    setError(null)
    try {
      rememberNext(next) // the page reloads on the way back from Google
      await signInWithGoogle()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Please try again.')
      setBusy(false)
    }
  }

  const problem = error ?? storeError
  return (
    <main className="pt-safe pb-safe flex min-h-full items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <img src="/favicon.svg" alt="" className="size-7" />
            Ekagra Studio
          </CardTitle>
          <CardDescription>Your study room: notes, mind maps, revision sheets and quizzes from your PDFs, photos and YouTube lectures.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button size="lg" disabled={!isSupabaseConfigured || busy} onClick={() => void continueWithGoogle()}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <GoogleLogo />}
            Continue with Google
          </Button>
          <p className="text-sm text-muted-foreground">
            Use the same Google account as in Ekagra: your subjects and materials are shared, and what you make here shows up there.
          </p>
          {!isSupabaseConfigured && (
            <p className="text-sm text-muted-foreground">Sign-in turns on once Supabase is connected (docs/4-setup-guide.md).</p>
          )}
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <a
            href={ekagraUrl('privacy')}
            target="_blank"
            rel="noreferrer"
            className="justify-self-start text-xs text-muted-foreground underline underline-offset-3 hover:text-foreground"
          >
            Privacy policy
          </a>
        </CardContent>
      </Card>
    </main>
  )
}
