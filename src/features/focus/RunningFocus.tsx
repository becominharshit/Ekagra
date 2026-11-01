import { useState } from 'react'
import { format } from 'date-fns'
import { Check, Pause, Play, Square } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { countLabel } from '@/features/academics/labels'
import { useSubjects } from '@/features/academics/subjects'
import { useHustles } from '@/features/hustle/hustles'
import { MODE_LABEL } from '@/features/mode/modes'
import { useBlocks } from '@/features/planner/planBlocks'
import { blockMode, localDateOf } from '@/features/planner/schedule'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useTodayMutation } from '@/features/today/todayMutation'
import { WorkLink } from '@/features/today/WorkLink'
import { focusGuardAvailable } from '@/lib/native/focusGuard'
import { cn } from '@/lib/utils'
import { blockedPackages, useBlockedApps } from './blockedApps'
import { DistractionButton } from './DistractionButton'
import { useDistractions } from './distractions'
import { useFocusStore, useFocusTimer } from './focusStore'
import { readyToBlock, usePermissionStatus } from './guard'
import { guardsSession } from './idleGuard'
import { finishBlock, finishSession, sessionTitle, stopFocus, toFocusMode, type FocusSession } from './sessions'
import { clockLabel, phaseLabel, TIMER_LABEL } from './timer'

const time = (iso: string) => format(new Date(iso), 'HH:mm')

/** The focus screen while a session runs: the clock, the schedule, pause, and Done, Partly or Stop. */
export function RunningFocus({ session }: { session: FocusSession }) {
  const { now, phases, view, focusedMinutes } = useFocusTimer(session)
  const pass = useFocusStore((state) => state.pass)
  const day = localDateOf(session.started_at)
  const blocks = useBlocks(day, day)
  const subjects = useSubjects()
  const hustles = useHustles()
  const pause = useFocusStore((state) => state.pause)
  const resume = useFocusStore((state) => state.resume)
  const forget = useFocusStore((state) => state.forget)
  const idleOff = useFocusStore((state) => state.idleOff[session.id] === true)
  const setIdleOff = useFocusStore((state) => state.setIdleOff)
  const profile = useProfile()
  const guarded = guardsSession(session, readSettings(profile.data?.settings).focus.idleCheck, idleOff)
  const distractions = useDistractions(session.started_at)
  const [lastNoted, setLastNoted] = useState<string | null>(null)
  const permissions = usePermissionStatus()
  const blockedApps = useBlockedApps()
  const navigate = useNavigate()
  const finish = useTodayMutation(finishBlock)
  const finishOwn = useTodayMutation(finishSession)
  const stop = useTodayMutation(stopFocus)
  const busy = finish.isPending || finishOwn.isPending || stop.isPending
  const error = finish.error ?? finishOwn.error ?? stop.error

  const block = blocks.data?.find((row) => row.id === session.plan_block_id) ?? null
  const subject = subjects.data?.find((row) => row.id === session.subject_id)
  const hustle = hustles.data?.find((row) => row.id === session.hustle_id)
  const title = sessionTitle(session, { block: block?.title, subject: subject?.name, hustle: hustle?.name })
  const details = [
    MODE_LABEL[blockMode(session.area)],
    block ? `${time(block.start_at)}–${time(block.end_at)}` : null,
    block ? subject?.name : null,
    TIMER_LABEL[toFocusMode(session.mode)],
  ].filter(Boolean)
  const planned = Math.round(view.plannedFocus / 60)
  const percent = view.plannedFocus > 0 ? Math.round((view.focused / view.plannedFocus) * 100) : 0
  const noted = (distractions.data ?? []).filter((event) => event.focus_session_id === session.id && event.kind === 'self_report').length
  // Android: whether FocusGuard blocks apps during this session.
  const picked = blockedPackages(blockedApps.data ?? []).length
  const guardReady = permissions.data !== undefined && readyToBlock(permissions.data)
  let blocking: string | null = null
  if (focusGuardAvailable() && permissions.data && blockedApps.data) {
    if (picked === 0) blocking = 'No apps are blocked yet.'
    else if (!guardReady) blocking = 'App blocking is off: FocusGuard needs two permissions.'
    else blocking = `${picked} ${picked === 1 ? 'app is' : 'apps are'} blocked until the session ends.`
  }
  /** Reading a book or writing on paper: the idle guard stays off for this session (an idle pause ends). */
  const awayFromScreen = () => {
    if (view.idle) resume(session.id, new Date())
    setIdleOff(session.id)
  }
  // When it ends, the timer's pauses are no longer needed, and Today shows what's next.
  const ended = {
    onSuccess: () => {
      forget(session.id)
      void navigate('/today')
    },
  }

  return (
    <Card className="ring-2 ring-primary/30">
      <CardHeader>
        <CardDescription>{details.join(' · ')}</CardDescription>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid justify-items-center gap-1 py-2 text-center">
          <p className={cn('text-sm font-medium', view.phase?.kind === 'break' && !view.paused ? 'text-mode-life' : 'text-muted-foreground')}>{phaseLabel(view)}</p>
          {view.done ? (
            <p className="font-heading text-4xl font-semibold">{focusedMinutes} min</p>
          ) : (
            <p className={cn('font-heading text-6xl font-semibold tabular-nums', view.paused && 'text-muted-foreground')}>{clockLabel(view.phaseLeft)}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {view.done ? 'focused. Well done: mark how it went.' : `${focusedMinutes} of ${planned} min focused`}
          </p>
        </div>

        <div
          role="progressbar"
          aria-label="Focus time done"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>

        {phases.length > 1 && (
          <ol aria-label="Schedule" className="flex flex-wrap justify-center gap-1.5 text-xs">
            {phases.map((phase, index) => (
              <li
                key={index}
                aria-current={index === view.index ? 'step' : undefined}
                className={cn(
                  'rounded-full px-2 py-0.5 ring-1 ring-inset ring-border',
                  index === view.index && 'bg-primary text-primary-foreground ring-primary',
                  index < view.index && 'text-muted-foreground line-through',
                )}
              >
                {phase.minutes} min {phase.kind === 'work' ? 'focus' : 'break'}
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          {!view.done &&
            (view.paused ? (
              <Button variant="outline" onClick={() => resume(session.id, new Date())}>
                <Play aria-hidden />
                Resume
              </Button>
            ) : (
              <Button variant="outline" onClick={() => pause(session.id, new Date())}>
                <Pause aria-hidden />
                Pause
              </Button>
            ))}
          {block && (
            <>
              <Button disabled={busy} onClick={() => finish.mutate({ block, outcome: 'done', session, focused: focusedMinutes }, ended)}>
                <Check aria-hidden />
                Done
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => finish.mutate({ block, outcome: 'partial', session, focused: focusedMinutes }, ended)}>
                Partly done
              </Button>
            </>
          )}
          {session.plan_block_id === null && (
            <Button disabled={busy} onClick={() => finishOwn.mutate({ session, focused: focusedMinutes }, ended)}>
              <Check aria-hidden />
              Done
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => stop.mutate({ session, focused: focusedMinutes }, ended)}>
            <Square aria-hidden />
            Stop
          </Button>
        </div>
        {view.idle && (
          <div className="grid justify-items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-center text-sm">
            <p>No tap, scroll or key press for 4 minutes, so the timer paused there. Resume when you're back.</p>
            <Button variant="outline" size="sm" onClick={awayFromScreen}>
              I'm studying away from the screen
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <DistractionButton sessionId={session.id} onNoted={setLastNoted} />
          {noted > 0 && (
            <span className="text-sm text-muted-foreground">
              {lastNoted && `Noted: ${lastNoted}. `}
              {countLabel(noted, 'distraction')} this session
            </span>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Breaks and pauses don't count. {block ? 'Done and Partly give your plan the minutes you focused; Stop keeps the block to do.' : 'The minutes you focus are saved.'}
          {guarded && !view.idle && (
            <>
              {' '}
              Study pauses itself after 4 minutes without a tap, scroll or key press.{' '}
              <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={awayFromScreen}>
                Studying away from the screen?
              </button>
            </>
          )}
        </p>
        {block && <WorkLink block={block} />}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        <div className="grid justify-items-center gap-1 border-t pt-3 text-center text-xs text-muted-foreground">
          {blocking && (
            <p>
              {blocking}{' '}
              <Link to="/me/focus" className="underline underline-offset-4 hover:text-foreground">
                {picked > 0 && guardReady ? 'Change' : 'Set it up'}
              </Link>
            </p>
          )}
          {pass && Date.parse(pass.until) > now.getTime() && (
            <p>
              Emergency unlock: {pass.app ?? 'blocked apps'} open until {format(new Date(pass.until), 'HH:mm')}
            </p>
          )}
          <Link to="/today/focus/tollbooth" className="underline underline-offset-4 hover:text-foreground">
            Emergency unlock (Academic Tollbooth)
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
