import { useEffect, useRef } from 'react'
import { useActiveFocus } from '@/features/focus/sessions'
import { useNow } from '@/hooks/useNow'
import { focusGuard, focusGuardAvailable } from '@/lib/native/focusGuard'
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

/**
 * Once sharing is set up: keeps the shared numbers up to date (every few minutes, and as focus
 * sessions start and end, for "studying now"), and on Android shows a notification for a nudge
 * that arrives while the app is in the background (in the app, Today shows it). Renders nothing.
 */
export function SocialSync() {
  const now = useNow(60_000)
  const stats = useMyStats()
  const ready = Boolean(stats.data)
  const numbers = useMyNumbers(ready)
  const active = useActiveFocus()
  const nudges = useNudges(ready)
  const { mutate: publish } = useSocialMutation(saveMyStats)
  const until = studyingUntil(active.data ?? null, now)
  const publishedRef = useRef<string | null>(null)
  const notifiedRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!stats.data || !numbers.data) return
    const next = toPublished(readSharing(stats.data), numbers.data, until)
    const key = JSON.stringify(next)
    // The same thing is never sent twice in a row, even if the saved row reads back a little differently.
    if (samePublished(next, stats.data) || key === publishedRef.current) return
    publishedRef.current = key
    publish(next)
  }, [stats.data, numbers.data, until, publish])

  useEffect(() => {
    const received = nudges.data?.received ?? []
    const notified = notifiedRef.current ?? readNotified()
    notifiedRef.current = notified
    const fresh = received.filter((nudge) => !nudge.seen_at && !notified.has(nudge.id))
    if (fresh.length === 0) return
    for (const nudge of fresh) notified.add(nudge.id)
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notified].slice(-50)))
    if (document.visibilityState !== 'hidden' || !focusGuardAvailable()) return
    for (const nudge of fresh) {
      const { title, body } = nudgeText(nudge, nudge.from)
      void focusGuard.scheduleReminder({ id: `nudge-${nudge.id}`, at: Date.now() + 1500, title, body }).catch(() => undefined)
    }
  }, [nudges.data])

  return null
}
