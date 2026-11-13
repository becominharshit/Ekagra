import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { completeWebAuthCallback, type AuthCallbackOutcome } from '@/features/auth/auth'
import { useAuthStore } from '@/features/auth/authStore'
import { isSupabaseConfigured } from '@/lib/supabase'

/**
 * The page Google / email sign-in returns to. Completes PKCE code exchange cleanly,
 * ensures the user's profile row exists, and routes straight to /today.
 */
export function AuthCallbackPage() {
  const status = useAuthStore((state) => state.status)
  const [params] = useSearchParams()
  const problem = params.get('error_description') ?? params.get('error')
  const [outcome, setOutcome] = useState<AuthCallbackOutcome | null>(null)

  useEffect(() => {
    if (problem || !isSupabaseConfigured) return

    let cancelled = false
    void completeWebAuthCallback(params)
      .then((result) => {
        if (!cancelled) setOutcome(result)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setOutcome({
            status: 'error',
            message: caught instanceof Error ? caught.message : "Sign-in didn't finish. Please try again.",
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [params, problem])

  const resolving = Boolean(isSupabaseConfigured && !problem && outcome === null)
  const readyForToday =
    outcome?.status === 'signed_in' ||
    (!isSupabaseConfigured && status === 'signed_in') ||
    (status === 'signed_in' && !resolving && !problem && outcome?.status !== 'error')

  if (readyForToday) {
    return <Navigate to="/today" replace />
  }

  const callbackError = outcome?.status === 'error' ? outcome.message : null
  const failed = problem ?? callbackError ?? (!resolving && status !== 'loading' ? "Sign-in didn't finish. Please try again." : null)

  return (
    <main className="pt-safe pb-safe flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
      {failed ? (
        <>
          <p role="alert" className="max-w-sm text-sm text-destructive">
            {failed}
          </p>
          <Button asChild variant="outline">
            <Link to="/sign-in" replace>
              Back to sign-in
            </Link>
          </Button>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Signing you in…
        </p>
      )}
    </main>
  )
}
