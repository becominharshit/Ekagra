import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useActiveFocus } from '@/features/focus/sessions'
import { useNow } from '@/hooks/useNow'
import { useDataSource } from '@/lib/dataSource'
import { focusGuard, focusGuardAvailable } from '@/lib/native/focusGuard'
import { runningSession } from './groups'
import { useGroups } from './groupsData'
import { keysFor, listenToSocial, type SocialPart } from './realtime'
import { nudgeText, readSharing, samePublished, studyingUntil, toPublished } from './social'
import { saveMyStats, useMyNumbers, useMyStats, useNudges, useSocialMutation } from './socialData'

const NOTIFIED_KEY = 'ekagra-nudges-notified'

function readNotified(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '[]')
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/** A notification on Android when the app is in the background (in the app, Today shows these). */
function notifyInBackground(id: string, title: string, body: string): void {
  if (document.visibilityState !== 'hidden' || !focusGuardAvailable()) return
  void focusGuard.scheduleReminder({ id, at: Date.now() + 1500, title, body }).catch(() => undefined)
}

/**
 * Once sharing is set up: keeps the shared numbers up to date (every few minutes, and as focus
 * sessions start and end, for "studying now"); listens to Supabase Realtime, so partners' and
 * group mates' changes show at once; and on Android notifies of nudges and group focus that
 * arrive while the app is in the background. Renders nothing.
 */
export function SocialSync() {
  const now = useNow(60_000)
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  const stats = useMyStats()
  const ready = Boolean(stats.data)
  const numbers = useMyNumbers(ready)
  const active = useActiveFocus()
  const nudges = useNudges(ready)
  const groups = useGroups(ready)
  const { mutate: publish } = useSocialMutation(saveMyStats)
  const until = studyingUntil(active.data ?? null, now)
  const client = source?.kind === 'supabase' ? source.client : null
  const userId = source?.kind === 'supabase' ? source.userId : null
  const publishedRef = useRef<string | null>(null)
  const notifiedRef = useRef<Set<string> | null>(null)
  const sessionsRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!stats.data || !numbers.data) return
    const next = toPublished(readSharing(stats.data), numbers.data, until)
    const key = JSON.stringify(next)
    // The same thing is never sent twice in a row, even if the saved row reads back a little differently.
    if (samePublished(next, stats.data) || key === publishedRef.current) return
    publishedRef.current = key
    publish(next)
  }, [stats.data, numbers.data, until, publish])

  // Realtime (signed in): changes arrive as they happen; a burst of them reloads once.
  useEffect(() => {
    if (!client || !userId || !ready) return
    const waiting = new Set<SocialPart>()
    let timer: number | undefined
    const stop = listenToSocial(client, userId, (part) => {
      waiting.add(part)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const keys = keysFor(waiting, owner)
        waiting.clear()
        for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey })
      }, 1000)
    })
    return () => {
      window.clearTimeout(timer)
      stop()
    }
  }, [client, userId, ready, owner, queryClient])

  useEffect(() => {
    const notified = notifiedRef.current ?? readNotified()
    notifiedRef.current = notified
    const fresh = (nudges.data?.received ?? []).filter((nudge) => !nudge.seen_at && !notified.has(nudge.id))
    if (fresh.length === 0) return
    for (const nudge of fresh) notified.add(nudge.id)
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notified].slice(-50)))
    for (const nudge of fresh) {
      const { title, body } = nudgeText(nudge, nudge.from)
      notifyInBackground(`nudge-${nudge.id}`, title, body)
    }
  }, [nudges.data])

  // A group focus someone else started (the sample group's are made up: no notification).
  useEffect(() => {
    const seen = sessionsRef.current ?? new Set<string>()
    sessionsRef.current = seen
    for (const group of groups.data ?? []) {
      const session = runningSession(group.sessions, new Date())
      if (!session || group.sample || seen.has(session.id) || session.user_id === userId) continue
      seen.add(session.id)
      const starter = group.members.find((member) => member.userId === session.user_id)?.name ?? 'Someone'
      notifyInBackground(`group-focus-${session.id}`, `Group focus in ${group.name}`, `${starter} started ${session.minutes} minutes of focus. Open Ekagra to join.`)
    }
  }, [groups.data, userId])

  return null
}
