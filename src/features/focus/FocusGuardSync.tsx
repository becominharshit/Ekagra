import { useFocusGuardSync, useNativeLinks } from './guard'

/** FocusGuard kept in step with focus sessions, and its blocker screen's links into the app. Shows nothing. */
export function FocusGuardSync() {
  useFocusGuardSync()
  useNativeLinks()
  return null
}
