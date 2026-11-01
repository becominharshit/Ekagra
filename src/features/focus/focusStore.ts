import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useNow } from '@/hooks/useNow'
import { focusedMinutes, sessionPhases, type FocusSession } from './sessions'
import { pauseAt, resumeAt, timerAt, type Pause, type TimerLengths } from './timer'

// The focus timer on this device: the pauses of each session, kept in localStorage so a reload
// or switching apps doesn't lose them (the session itself is in the database). Plus the hooks
// the focus screens use.

/** How many sessions' pauses are kept (old ones are dropped). */
const KEEP = 10
const NO_PAUSES: Pause[] = []

interface FocusState {
  /** Pauses of the last few focus sessions, by session id. */
  pauses: Record<string, Pause[]>
  pause: (sessionId: string, at: Date) => void
  resume: (sessionId: string, at: Date) => void
  /** Drops a session that ended. */
  forget: (sessionId: string) => void
}

const keepLast = (pauses: Record<string, Pause[]>) => Object.fromEntries(Object.entries(pauses).slice(-KEEP))

export const useFocusStore = create<FocusState>()(
  persist(
    (set) => ({
      pauses: {},
      pause: (sessionId, at) => set((state) => ({ pauses: keepLast({ ...state.pauses, [sessionId]: pauseAt(state.pauses[sessionId] ?? [], at) }) })),
      resume: (sessionId, at) => set((state) => ({ pauses: { ...state.pauses, [sessionId]: resumeAt(state.pauses[sessionId] ?? [], at) } })),
      forget: (sessionId) => set((state) => ({ pauses: Object.fromEntries(Object.entries(state.pauses).filter(([id]) => id !== sessionId)) })),
    }),
    { name: 'ekagra-focus', partialize: (state) => ({ pauses: state.pauses }) },
  ),
)

/** The Pomodoro and Deep work lengths from the settings (25/5 and 50/10 unless changed). */
export function useTimerLengths(): TimerLengths {
  const profile = useProfile()
  const { pomodoro, deep } = readSettings(profile.data?.settings).focus
  return { pomodoro, deep }
}

/** A running session's timer, ticking every second. */
export function useFocusTimer(session: FocusSession) {
  const now = useNow(1000)
  const lengths = useTimerLengths()
  const pauses = useFocusStore((state) => state.pauses[session.id] ?? NO_PAUSES)
  const phases = sessionPhases(session, lengths)
  const view = timerAt(phases, session.started_at, pauses, now)
  return { now, phases, view, focusedMinutes: Math.round(view.focused / 60) }
}

/** Minutes focused in a session right now, for code that has no timer on screen (e.g. the evening check-in). */
export function focusedMinutesNow(session: FocusSession, lengths: TimerLengths): number {
  return focusedMinutes(session, useFocusStore.getState().pauses[session.id] ?? NO_PAUSES, new Date(), lengths)
}
