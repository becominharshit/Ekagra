import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useNow } from '@/hooks/useNow'
import { focusedMinutes, sessionPhases, type FocusSession } from './sessions'
import { pauseAt, resumeAt, timerAt, type Pause, type TimerLengths } from './timer'

// The focus timer on this device: the pauses of each session, kept in localStorage so a reload
// or switching apps doesn't lose them (the session itself is in the database), and what the
// idle guard needs. Plus the hooks the focus screens use.

/** How many sessions are remembered (old ones are dropped). */
const KEEP = 10
const NO_PAUSES: Pause[] = []

interface FocusState {
  /** Pauses of the last few focus sessions, by session id. */
  pauses: Record<string, Pause[]>
  /** When each session last had a tap, scroll or key press (saved now and then, for after a reload). */
  activity: Record<string, string>
  /** Sessions with the idle guard off ("I'm studying away from the screen"). */
  idleOff: Record<string, boolean>
  /** The emergency unlock pass from the Academic Tollbooth: blocked apps are open until then. */
  pass: UnlockPass | null
  pause: (sessionId: string, at: Date) => void
  /** The idle guard pauses a session, from the moment its 4 minutes ran out. */
  autoPause: (sessionId: string, at: Date) => void
  resume: (sessionId: string, at: Date) => void
  touch: (sessionId: string, at: Date) => void
  setIdleOff: (sessionId: string) => void
  setPass: (pass: UnlockPass | null) => void
  /** Drops a session that ended. */
  forget: (sessionId: string) => void
}

export interface UnlockPass {
  /** ISO timestamp. */
  until: string
  /** The app it was asked for (its name), if known. */
  app: string | null
}

const keepLast = <T>(map: Record<string, T>) => Object.fromEntries(Object.entries(map).slice(-KEEP))
const without = <T>(map: Record<string, T>, id: string) => Object.fromEntries(Object.entries(map).filter(([key]) => key !== id))

export const useFocusStore = create<FocusState>()(
  persist(
    (set) => ({
      pauses: {},
      activity: {},
      idleOff: {},
      pass: null,
      pause: (sessionId, at) => set((state) => ({ pauses: keepLast({ ...state.pauses, [sessionId]: pauseAt(state.pauses[sessionId] ?? [], at) }) })),
      autoPause: (sessionId, at) => set((state) => ({ pauses: keepLast({ ...state.pauses, [sessionId]: pauseAt(state.pauses[sessionId] ?? [], at, true) }) })),
      resume: (sessionId, at) => set((state) => ({ pauses: { ...state.pauses, [sessionId]: resumeAt(state.pauses[sessionId] ?? [], at) } })),
      touch: (sessionId, at) => set((state) => ({ activity: keepLast({ ...state.activity, [sessionId]: at.toISOString() }) })),
      setIdleOff: (sessionId) => set((state) => ({ idleOff: keepLast({ ...state.idleOff, [sessionId]: true }) })),
      setPass: (pass) => set({ pass }),
      forget: (sessionId) =>
        set((state) => ({ pauses: without(state.pauses, sessionId), activity: without(state.activity, sessionId), idleOff: without(state.idleOff, sessionId) })),
    }),
    { name: 'ekagra-focus', partialize: (state) => ({ pauses: state.pauses, activity: state.activity, idleOff: state.idleOff, pass: state.pass }) },
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
  return { now, phases, pauses, view, focusedMinutes: Math.round(view.focused / 60) }
}

/** Minutes focused in a session right now, for code that has no timer on screen (e.g. the evening check-in). */
export function focusedMinutesNow(session: FocusSession, lengths: TimerLengths): number {
  return focusedMinutes(session, useFocusStore.getState().pauses[session.id] ?? NO_PAUSES, new Date(), lengths)
}
