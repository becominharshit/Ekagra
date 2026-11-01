import { useEffect, useRef } from 'react'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { chime } from './chime'
import { useFocusStore } from './focusStore'
import type { FocusSession } from './sessions'
import { timerAt, type Pause, type Phase, type TimerView } from './timer'

// The idle guard: a study session pauses itself after 4 minutes of focus time without a tap,
// scroll or key press, so a timer left running doesn't count as studying. Breaks and pauses
// don't count toward the 4 minutes. When the app was in the background (or closed), the pause
// starts where the 4 minutes ran out, not when the app came back.

export const IDLE_SECONDS = 4 * 60

// "click" too: screen readers press buttons with a click and no pointer.
const ACTIVITY_EVENTS = ['pointerdown', 'click', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
/** The last activity is saved on the device at most this often. */
const SAVE_EVERY_MS = 15_000

/** Whether the guard watches a session: study sessions, unless it's off in the settings or for this session. */
export function guardsSession(session: Pick<FocusSession, 'area'>, idleCheck: boolean, offForSession: boolean): boolean {
  return idleCheck && !offForSession && session.area === 'academics'
}

/**
 * When an idle session should have paused: the moment it had 4 minutes of focus time after the
 * last activity (to the second). Null while it isn't idle.
 */
export function idlePauseAt(phases: Phase[], startedAt: string, pauses: Pause[], lastActivity: Date, now: Date, idleSeconds = IDLE_SECONDS): Date | null {
  const focusedAt = (time: number) => timerAt(phases, startedAt, pauses, new Date(time)).focused
  const from = Math.max(lastActivity.getTime(), Date.parse(startedAt))
  const base = focusedAt(from)
  if (focusedAt(now.getTime()) - base < idleSeconds) return null
  // Narrow down to the first second with that much focus since the last activity.
  let low = from
  let high = now.getTime()
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2)
    if (focusedAt(middle) - base >= idleSeconds) high = middle
    else low = middle
  }
  return new Date(high)
}

interface IdleGuardInput {
  session: FocusSession
  phases: Phase[]
  pauses: Pause[]
  view: TimerView
  now: Date
}

/** Watches taps, scrolls and key presses while a study session runs, and pauses it (with a chime) when they stop. */
export function useIdleGuard({ session, phases, pauses, view, now }: IdleGuardInput): void {
  const profile = useProfile()
  const idleCheck = readSettings(profile.data?.settings).focus.idleCheck
  const off = useFocusStore((state) => state.idleOff[session.id] === true)
  const touch = useFocusStore((state) => state.touch)
  const autoPause = useFocusStore((state) => state.autoPause)
  const watching = guardsSession(session, idleCheck, off)
  const lastActivity = useRef<number | null>(null)
  const lastSaved = useRef(0)

  useEffect(() => {
    if (!watching) return
    const onActivity = () => {
      const time = Date.now()
      lastActivity.current = time
      if (time - lastSaved.current < SAVE_EVERY_MS) return
      lastSaved.current = time
      touch(session.id, new Date(time))
    }
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { capture: true, passive: true })
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true })
    }
  }, [watching, session.id, touch])

  // Checked every tick of the timer (and right after the app comes back to the screen).
  useEffect(() => {
    if (!watching || view.paused || view.done) return
    if (lastActivity.current === null) {
      // First look: the activity saved on this device (e.g. before the app was closed), else now.
      const saved = useFocusStore.getState().activity[session.id]
      lastActivity.current = saved ? Date.parse(saved) : now.getTime()
    }
    const at = idlePauseAt(phases, session.started_at, pauses, new Date(lastActivity.current), now)
    if (!at) return
    autoPause(session.id, at)
    chime()
  }, [watching, view.paused, view.done, now, phases, pauses, session.id, session.started_at, autoPause])
}
