import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useSubjects } from '@/features/academics/subjects'
import { useHustles } from '@/features/hustle/hustles'
import { useBlocks } from '@/features/planner/planBlocks'
import { localDateOf, localToIso } from '@/features/planner/schedule'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useNow } from '@/hooks/useNow'
import { useDataSource } from '@/lib/dataSource'
import { focusGuard, focusGuardAvailable, type PermissionStatus } from '@/lib/native/focusGuard'
import { blockedPackages, useBlockedApps } from './blockedApps'
import { distractionsKey, logBlockedOpen, useDistractions } from './distractions'
import { useFocusStore, useTimerLengths } from './focusStore'
import { focusRoute, guardPlan, sessionEndsAt } from './guardPlan'
import { sessionTitle, useActiveFocus } from './sessions'
import type { Pause } from './timer'
import { tollboothStatus } from './tollbooth'

// FocusGuard (the Android app blocker) in the app: its permissions, the apps to pick from, and
// keeping it in step with focus sessions. On the web all of this quietly does nothing.

const NO_PAUSES: Pause[] = []

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

/**
 * Keeps FocusGuard in step with the app: blocking starts with a focus session (or a Study block,
 * if chosen) and stops when it ends; the unlocks left and the end time stay up to date. What
 * FocusGuard saw (blocked apps opened) is saved as distraction events.
 */
export function useFocusGuardSync(): void {
  const available = focusGuardAvailable()
  const now = useNow(30_000)
  const today = localDateOf(now)
  const focus = useActiveFocus()
  const blocks = useBlocks(today, today)
  const apps = useBlockedApps()
  const events = useDistractions(localToIso(today, 0))
  const permissions = usePermissionStatus()
  const profile = useProfile()
  const subjects = useSubjects()
  const hustles = useHustles()
  const lengths = useTimerLengths()
  const session = focus.data ?? null
  const pauses = useFocusStore((state) => (session ? state.pauses[session.id] : undefined)) ?? NO_PAUSES
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  const settings = readSettings(profile.data?.settings)

  let key: string | null = null
  let plan: ReturnType<typeof guardPlan> = null
  if (available) {
    // Decided only once everything it depends on has loaded.
    if (permissions.data && apps.data && blocks.data && events.data && focus.data !== undefined) {
      const title = session
        ? sessionTitle(session, {
            block: blocks.data.find((block) => block.id === session.plan_block_id)?.title,
            subject: subjects.data?.find((subject) => subject.id === session.subject_id)?.name,
            hustle: hustles.data?.find((hustle) => hustle.id === session.hustle_id)?.name,
          })
        : ''
      plan = readyToBlock(permissions.data)
        ? guardPlan({
            now,
            session: session ? { title, endsAt: sessionEndsAt(session, pauses, now, lengths) } : null,
            blocks: blocks.data,
            blockDuring: settings.focus.blockDuring,
            blockedPackages: blockedPackages(apps.data),
            unlocksLeft: tollboothStatus(events.data, { dayStart: new Date(localToIso(today, 0)), now, dailyLimit: settings.tollbooth.dailyLimit }).left,
          })
        : null
      key = plan ? JSON.stringify(plan) : 'off'
    }
  }

  // Only a change is sent to FocusGuard (a failed call is tried again with the next change).
  const applied = useRef<string | null>(null)
  useEffect(() => {
    if (key === null || key === applied.current) return
    applied.current = key
    const call = plan ? focusGuard.start(plan) : focusGuard.stop()
    call.catch(() => {
      applied.current = null
    })
  }, [key, plan])

  // What FocusGuard saw: picked up when it tells us, and whenever the app comes back.
  const sessionId = session?.id ?? null
  useEffect(() => {
    if (!available || !source) return
    const pickUp = async () => {
      const opened = (await focusGuard.takeEvents()).filter((event) => event.type === 'blockedAppOpened')
      for (const event of opened) await logBlockedOpen(source, { packageName: event.packageName, at: new Date(event.at), sessionId })
      if (opened.length > 0) await queryClient.invalidateQueries({ queryKey: distractionsKey(owner) })
    }
    const run = () => void pickUp().catch(() => undefined)
    run()
    const stopListening = focusGuard.onEvent(run)
    const resumed = App.addListener('resume', run)
    return () => {
      stopListening()
      void resumed.then((listener) => listener.remove())
    }
  }, [available, source, owner, sessionId, queryClient])
}

/** The app was opened by a link once: it isn't followed again when the app's frame reloads. */
let launchLinkFollowed = false

/** FocusGuard's blocker screen opens the app on ekagra://focus links: show the screen they're for. */
export function useNativeLinks(): void {
  const navigate = useNavigate()
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const follow = (url: string | undefined) => {
      const route = url ? focusRoute(url) : null
      if (route) void navigate(route)
    }
    if (!launchLinkFollowed) {
      launchLinkFollowed = true
      void App.getLaunchUrl().then((launch) => follow(launch?.url))
    }
    const opened = App.addListener('appUrlOpen', ({ url }) => follow(url))
    return () => {
      void opened.then((listener) => listener.remove())
    }
  }, [navigate])
}
