import { LoaderCircle } from 'lucide-react'
import { Navigate, Outlet } from 'react-router'
import { useAuthStore } from './authStore'

/** The pages inside need a signed-in user or Demo Mode. (Step 3 adds the onboarding check.) */
export function RequireAuth() {
  const status = useAuthStore((state) => state.status)

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </div>
    )
  }
  if (status === 'signed_out') return <Navigate to="/sign-in" replace />
  return <Outlet />
}
