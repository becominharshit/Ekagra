import { LoaderCircle } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/features/auth/authStore'
import { readNext } from '@studio/lib/links'

/**
 * The page Google sign-in returns to. Supabase swaps the ?code= for a session by itself; then the
 * student goes where they were headed (sign-in saves that every time, so it's never an old one).
 */
export function AuthCallbackPage() {
  const status = useAuthStore((state) => state.status)
  const [params] = useSearchParams()
  const problem = params.get('error_description') ?? params.get('error')

  if (status === 'signed_in') return <Navigate to={readNext()} replace />

  const failed = problem ?? (status === 'loading' ? null : "Sign-in didn't finish. Please try again.")
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
