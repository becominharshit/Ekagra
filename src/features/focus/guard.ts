import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { useQuery } from '@tanstack/react-query'
import { focusGuard, focusGuardAvailable, type PermissionStatus } from '@/lib/native/focusGuard'

// FocusGuard (the Android app blocker) in the app: its permissions and the apps to pick from.

/** Blocking works once these two are on; notifications and no battery limits make it reliable. */
export function readyToBlock(status: PermissionStatus): boolean {
  return status.usageAccess && status.overlay
}

/** FocusGuard's permissions, checked again whenever the app comes back to the screen (e.g. from Settings). */
export function usePermissionStatus() {
  const query = useQuery({ queryKey: ['focusguard', 'permissions'], queryFn: () => focusGuard.checkPermissions(), staleTime: 0 })
  const { refetch } = query
  useEffect(() => {
    if (!focusGuardAvailable()) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    const resumed = App.addListener('resume', () => void refetch())
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void resumed.then((listener) => listener.remove())
    }
  }, [refetch])
  return query
}

/** The phone's apps (example apps on the web), to pick which to block. */
export function useLaunchableApps() {
  return useQuery({ queryKey: ['focusguard', 'apps'], queryFn: () => focusGuard.listLaunchableApps(), staleTime: 5 * 60_000 })
}
