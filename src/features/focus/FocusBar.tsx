import { Pause, Play, Timer } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePhaseChime } from './chime'
import { useFocusStore, useFocusTimer } from './focusStore'
import { useIdleGuard } from './idleGuard'
import { useActiveFocus, type FocusSession } from './sessions'
import { clockLabel, phaseLabel } from './timer'

/** Screens that show the timer themselves (Today's Now card and the focus screen). */
const SHOWS_TIMER = new Set(['/today', '/today/focus'])

/** A running focus session on every screen, e.g. while reading the topic's lesson: time left and pause. */
export function FocusBar() {
  const focus = useActiveFocus()
  // A new session starts with a fresh bar (its chime and idle guard start over).
  return focus.data ? <RunningBar key={focus.data.id} session={focus.data} /> : null
}

function RunningBar({ session }: { session: FocusSession }) {
  const { pathname } = useLocation()
  const { now, phases, pauses, view } = useFocusTimer(session)
  const pause = useFocusStore((state) => state.pause)
  const resume = useFocusStore((state) => state.resume)
  // This bar is always there while a session runs (even when hidden), so the chime and the idle
  // guard work on every screen: while reading the lesson, coding or reviewing flashcards.
  usePhaseChime(view.index)
  useIdleGuard({ session, phases, pauses, view, now })
  if (SHOWS_TIMER.has(pathname)) return null

  return (
    <section aria-label="Focus session" className={cn('border-b px-4 py-2 text-sm', view.done ? 'bg-amber-500/15' : 'bg-primary/5')}>
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
        <Timer className="size-4 shrink-0" aria-hidden />
        <Link to="/today/focus" className="min-w-0 flex-1 truncate">
          <span className="font-medium">{phaseLabel(view)}</span>
          {view.done ? ' · tap to finish' : <span className="tabular-nums"> · {clockLabel(view.phaseLeft)} left</span>}
        </Link>
        {!view.done && (
          <Button size="xs" variant="outline" onClick={() => (view.paused ? resume(session.id, new Date()) : pause(session.id, new Date()))}>
            {view.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
            {view.paused ? 'Resume' : 'Pause'}
          </Button>
        )}
      </div>
    </section>
  )
}
