import { Navigate, Outlet, useLocation } from 'react-router'
import { PageLoading } from '@/components/layout/PageLoading'
import { useAuthStore } from '@/features/auth/authStore'

/** Studio's pages need a signed-in student. Others go to sign-in, which brings them back here afterwards. */
export function RequireSignIn() {
  const status = useAuthStore((state) => state.status)
  const { pathname, search } = useLocation()
  if (status === 'loading') return <PageLoading />
  if (status !== 'signed_in') {
    const here = `${pathname}${search}`
    return <Navigate to={here === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(here)}`} replace />
  }
  return <Outlet />
}
