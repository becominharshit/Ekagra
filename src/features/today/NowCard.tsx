import { useState } from 'react'
import { format } from 'date-fns'
import { Check, LoaderCircle, Play, SkipForward, Square, Timer } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSubjects } from '@/features/academics/subjects'
import { MODE_LABEL, MODE_TONE } from '@/features/mode/modes'
import { useBlocks } from '@/features/planner/planBlocks'
import { blockMode, localDateOf, type PlanBlock } from '@/features/planner/schedule'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { finishBlock, nowView, partOf, startFocus, stopFocus, upNext, useActiveFocus, type FocusSession } from './focus'
import { useTodayMutation } from './todayMutation'

const time = (iso: string) => format(new Date(iso), 'HH:mm')
const PARTS = [
  { fraction: 0.25, label: 'About a quarter' },
  { fraction: 0.5, label: 'About half' },
  { fraction: 0.75, label: 'About three quarters' },
]

/** Where to do the block's work: the topic's lesson, or the review session. */
function WorkLink({ block }: { block: PlanBlock }) {
  if (block.kind === 'learn' && block.topic_id) {
    return (
      <Button asChild variant="link" className="h-auto justify-self-start p-0">
        <Link to={`/academics/topics/${block.topic_id}`}>Open the topic: lesson, quiz, flashcards</Link>
      </Button>
    )
  }
  if (block.kind === 'review') {
    return (
      <div className="flex flex-wrap gap-x-4">
        <Button asChild variant="link" className="h-auto p-0">
          <Link to="/academics/review">Review flashcards</Link>
        </Button>
        <Button asChild variant="link" className="h-auto p-0">
          <Link to="/academics/mistakes">Mistake notebook</Link>
        </Button>
      </div>
    )
  }
  return null
}

/** The time left in a focus session, ticking every second. */
function FocusTimer({ session }: { session: FocusSession }) {
  const now = useNow(1000)
  const left = Date.parse(session.started_at) + session.planned_minutes * 60_000 - now.getTime()
  const seconds = Math.floor(Math.abs(left) / 1000)
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <p className="tabular-nums">
      <span className="font-heading text-4xl font-semibold">{left < 0 ? `+${clock}` : clock}</span>{' '}
      <span className="text-sm text-muted-foreground">{left < 0 ? 'over the plan' : 'left'}</span>
    </p>
  )
}

/** The current block of the plan, with one-tap actions. */
export function NowCard() {
  const now = useNow(15_000)
  const today = localDateOf(now)
  const blocks = useBlocks(today, today)
  const focus = useActiveFocus()
  const subjects = useSubjects()
  const start = useTodayMutation(startFocus)
  const finish = useTodayMutation(finishBlock)
  const stop = useTodayMutation(stopFocus)
  const [partialFor, setPartialFor] = useState<PlanBlock | null>(null)

  const busy = start.isPending || finish.isPending || stop.isPending
  const error = start.error ?? finish.error ?? stop.error
  const subjectOf = (block: PlanBlock) => subjects.data?.find((subject) => subject.id === block.subject_id)
  const describe = (block: PlanBlock) =>
    [`${time(block.start_at)}–${time(block.end_at)}`, MODE_LABEL[blockMode(block.area)], subjectOf(block)?.name].filter(Boolean).join(' · ')

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

  if (view.kind === 'focus') {
    const { session, block } = view
    return (
      <Card className="ring-2 ring-primary/30">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <Timer className="size-3.5" aria-hidden />
            Focusing{block ? ` · ${describe(block)}` : ''}
          </CardDescription>
          <CardTitle className="text-lg">{block?.title ?? 'Focus session'}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <FocusTimer session={session} />
          <div className="flex flex-wrap gap-2">
            {block && (
              <>
                <Button disabled={busy} onClick={() => finish.mutate({ block, outcome: 'done', session })}>
                  <Check aria-hidden />
                  Done
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => finish.mutate({ block, outcome: 'partial', session })}>
                  Partly done
                </Button>
              </>
            )}
            <Button variant="ghost" disabled={busy} onClick={() => stop.mutate({ session })}>
              <Square aria-hidden />
              Stop
            </Button>
          </div>
          {block && <WorkLink block={block} />}
          {errorLine}
        </CardContent>
      </Card>
    )
  }

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
            <Button disabled={busy} onClick={() => start.mutate({ block })}>
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
        {next && (
          <Button variant="outline" className="justify-self-start" disabled={busy} onClick={() => start.mutate({ block: next })}>
            <Play aria-hidden />
            Start it now
          </Button>
        )}
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
