import { LoaderCircle } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { useProfile } from '@/features/profile/queries'
import { SyncController } from '@/features/sync/SyncController'
import { signOut } from './auth'
import { useAuthStore } from './authStore'

/**
 * The pages inside need a signed-in user (or Demo Mode) who has finished onboarding.
 * Signed out → /sign-in. Not onboarded yet → /onboarding.
 */
export function RequireAuth() {
  const status = useAuthStore((state) => state.status)
  const { pathname } = useLocation()
  const profile = useProfile()

  if (status === 'loading') return <Loading />
  if (status === 'signed_out') return <Navigate to="/sign-in" replace />
  if (profile.isPending) return <Loading />
  if (profile.isError) return <SetupProblem message={profile.error.message} onRetry={() => void profile.refetch()} />
  if (!profile.data) {
    return (
      <SetupProblem
        message="Your profile is missing. Run `npm run db:push` once more: the migration creates missing profiles."
        onRetry={() => void profile.refetch()}
      />
    )
  }
  return (
    <>
      <SyncController />
      {!profile.data.onboarded_at && pathname !== '/onboarding' ? <Navigate to="/onboarding" replace /> : <Outlet />}
    </>
  )
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      Loading…
    </div>
  )
}

/** Shown when the database isn't ready (e.g. the tables haven't been created yet). */
function SetupProblem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="pt-safe pb-safe flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p role="alert" className="max-w-sm text-sm text-destructive">
        {message}
      </p>
      <div className="flex gap-2">
        <Button onClick={onRetry}>Try again</Button>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  )
}
