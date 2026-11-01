import { useState } from 'react'
import { format } from 'date-fns'
import { Check, LoaderCircle, Pause, Play, SkipForward, Square, Timer } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSubjects } from '@/features/academics/subjects'
import { allowChime } from '@/features/focus/chime'
import { useFocusStore, useFocusTimer, useTimerLengths } from '@/features/focus/focusStore'
import { finishBlock, finishSession, minutesLeftIn, partOf, sessionTitle, startFocus, stopFocus, toFocusMode, useActiveFocus, type FocusSession } from '@/features/focus/sessions'
import { clockLabel, phaseLabel, TIMER_LABEL, workThatFits } from '@/features/focus/timer'
import { useHustles } from '@/features/hustle/hustles'
import { MODE_LABEL, MODE_TONE } from '@/features/mode/modes'
import { useBlocks } from '@/features/planner/planBlocks'
import { blockMode, localDateOf, type PlanBlock } from '@/features/planner/schedule'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { nowView, upNext } from './nowView'
import { useTodayMutation } from './todayMutation'
import { WorkLink } from './WorkLink'

const time = (iso: string) => format(new Date(iso), 'HH:mm')
const PARTS = [
  { fraction: 0.25, label: 'About a quarter' },
  { fraction: 0.5, label: 'About half' },
  { fraction: 0.75, label: 'About three quarters' },
]

/** A running focus session on the Now card: the timer, pause, and Done, Partly or Stop. */
function FocusingCard({ session, block, describe }: { session: FocusSession; block: PlanBlock | null; describe: (block: PlanBlock) => string }) {
  const { view, focusedMinutes } = useFocusTimer(session)
  const subjects = useSubjects()
  const hustles = useHustles()
  const pause = useFocusStore((state) => state.pause)
  const resume = useFocusStore((state) => state.resume)
  const forget = useFocusStore((state) => state.forget)
  const finish = useTodayMutation(finishBlock)
  const finishOwn = useTodayMutation(finishSession)
  const stop = useTodayMutation(stopFocus)
  const busy = finish.isPending || finishOwn.isPending || stop.isPending
  const error = finish.error ?? finishOwn.error ?? stop.error
  const ended = { onSuccess: () => forget(session.id) }
  const subject = subjects.data?.find((row) => row.id === session.subject_id)
  const hustle = hustles.data?.find((row) => row.id === session.hustle_id)

  return (
    <Card className="ring-2 ring-primary/30">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Timer className="size-3.5" aria-hidden />
          Focusing · {block ? describe(block) : MODE_LABEL[blockMode(session.area)]} · {TIMER_LABEL[toFocusMode(session.mode)]}
        </CardDescription>
        <CardTitle className="text-lg">{sessionTitle(session, { block: block?.title, subject: subject?.name, hustle: hustle?.name })}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 tabular-nums">
            {view.done ? (
              <span className="font-heading text-2xl font-semibold">Time's up</span>
            ) : (
              <span className={cn('font-heading text-4xl font-semibold', view.paused && 'text-muted-foreground')}>{clockLabel(view.phaseLeft)}</span>
            )}{' '}
            <span className="text-sm text-muted-foreground">
              {view.done ? '' : `${phaseLabel(view)} · `}
              {focusedMinutes} of {Math.round(view.plannedFocus / 60)} min focused
            </span>
          </p>
          {!view.done && (
            <Button
              variant="outline"
              size="icon"
              aria-label={view.paused ? 'Resume' : 'Pause'}
              onClick={() => (view.paused ? resume(session.id, new Date()) : pause(session.id, new Date()))}
            >
              {view.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Button asChild variant="ghost">
            <Link to="/today/focus">
              <Timer aria-hidden />
              Open timer
            </Link>
          </Button>
        </div>
        {block && <WorkLink block={block} />}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** The current block of the plan, with one-tap actions. */
export function NowCard() {
  const now = useNow(15_000)
  const today = localDateOf(now)
  const blocks = useBlocks(today, today)
  const focus = useActiveFocus()
  const subjects = useSubjects()
  const profile = useProfile()
  const lengths = useTimerLengths()
  const navigate = useNavigate()
  const start = useTodayMutation(startFocus)
  const finish = useTodayMutation(finishBlock)
  const [partialFor, setPartialFor] = useState<PlanBlock | null>(null)
  const defaultMode = readSettings(profile.data?.settings).focus.defaultMode

  const busy = start.isPending || finish.isPending
  const error = start.error ?? finish.error
  const subjectOf = (block: PlanBlock) => subjects.data?.find((subject) => subject.id === block.subject_id)
  const describe = (block: PlanBlock) =>
    [`${time(block.start_at)}–${time(block.end_at)}`, MODE_LABEL[blockMode(block.area)], subjectOf(block)?.name].filter(Boolean).join(' · ')

  /** One tap: focus on the block with the usual timer, fitted to the time the block has left. */
  const focusOn = (block: PlanBlock) => {
    allowChime()
    start.mutate({ block, mode: defaultMode, lengths }, { onSuccess: () => void navigate('/today/focus') })
  }

  if (blocks.isPending || focus.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Now</CardTitle>
          <CardDescription className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading your plan…
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const view = nowView(blocks.data ?? [], focus.data ?? null, now)
  const errorLine = error && (
    <p role="alert" className="text-sm text-destructive">
      {error.message}
    </p>
  )

  if (view.kind === 'focus') return <FocusingCard session={view.session} block={view.block} describe={describe} />

  if (view.kind === 'block') {
    const { block } = view
    return (
      <Card>
        <CardHeader>
          <CardDescription>Now · {describe(block)}</CardDescription>
          <CardTitle className="text-lg">{block.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => focusOn(block)}>
              <Play aria-hidden />
              Start focus
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => finish.mutate({ block, outcome: 'done' })}>
              <Check aria-hidden />
              Done
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setPartialFor(block)}>
              Partly
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => finish.mutate({ block, outcome: 'missed' })}>
              <SkipForward aria-hidden />
              Skip
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Timer: {TIMER_LABEL[defaultMode]}, {workThatFits(defaultMode, minutesLeftIn(block, now), lengths)} min of focus ·{' '}
            <Link to={`/today/focus?block=${block.id}`} className="underline underline-offset-4 hover:text-foreground">
              change
            </Link>
          </p>
          <WorkLink block={block} />
          {errorLine}
        </CardContent>
        <Dialog open={partialFor !== null} onOpenChange={(open) => !open && setPartialFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>How much did you do?</DialogTitle>
              <DialogDescription>The rest goes back into the plan for the next days.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              {partialFor &&
                PARTS.map((part) => (
                  <Button
                    key={part.fraction}
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      finish.mutate(
                        { block: partialFor, outcome: 'partial', minutes: partOf(partialFor.planned_minutes, part.fraction) },
                        { onSuccess: () => setPartialFor(null) },
                      )
                    }
                  >
                    {part.label} ({partOf(partialFor.planned_minutes, part.fraction)} min)
                  </Button>
                ))}
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    )
  }

  const { next } = view
  return (
    <Card>
      <CardHeader>
        <CardDescription>Now</CardDescription>
        <CardTitle className="text-lg">Free time</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          {next ? `Next: ${next.title} at ${time(next.start_at)} (${MODE_LABEL[blockMode(next.area)]}).` : 'Nothing more is planned for today.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {next && (
            <Button variant="outline" disabled={busy} onClick={() => focusOn(next)}>
              <Play aria-hidden />
              Start it now
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link to="/today/focus">
              <Timer aria-hidden />
              Focus on something else
            </Link>
          </Button>
        </div>
        {errorLine}
      </CardContent>
    </Card>
  )
}

/** The next 2–3 blocks of today. */
export function UpNext() {
  const now = useNow(60_000)
  const today = localDateOf(now)
  const blocks = useBlocks(today, today)
  const focus = useActiveFocus()
  const subjects = useSubjects()
  const view = nowView(blocks.data ?? [], focus.data ?? null, now)
  // The block the Now card already shows isn't "next".
  const shown = view.kind === 'free' ? view.next?.id : view.block?.id
  const next = upNext(blocks.data ?? [], now, 4)
    .filter((block) => block.id !== shown)
    .slice(0, 3)
  if (next.length === 0) return null
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Up next</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2">
          {next.map((block) => {
            const mode = blockMode(block.area)
            const subject = subjects.data?.find((row) => row.id === block.subject_id)
            return (
              <li key={block.id} className="flex items-center gap-3 text-sm">
                <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{time(block.start_at)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {block.title}
                  {subject && <span className="text-muted-foreground"> · {subject.code ?? subject.name}</span>}
                </span>
                <Badge variant="outline" className={cn('ring-1 ring-inset', MODE_TONE[mode])}>
                  {MODE_LABEL[mode]}
                </Badge>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
