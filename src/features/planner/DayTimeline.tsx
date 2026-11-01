import { useState } from 'react'
import { format } from 'date-fns'
import { Check, LoaderCircle, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSubjects } from '@/features/academics/subjects'
import { MODE_LABEL, MODE_TONE } from '@/features/mode/modes'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { useBlocks } from './planBlocks'
import { usePlanner } from './replan'
import { blockMode, localDateOf, type PlanBlock } from './schedule'
import { addDays } from './time'

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

const time = (iso: string) => format(new Date(iso), 'HH:mm')

/** Today's (or tomorrow's) saved plan, block by block, with what's done. */
export function DayTimeline() {
  const now = useNow(60_000)
  const today = localDateOf(now)
  const tomorrow = addDays(today, 1)
  const [showTomorrow, setShowTomorrow] = useState(false)
  const blocks = useBlocks(today, tomorrow)
  const subjects = useSubjects()
  const planner = usePlanner()

  const date = showTomorrow ? tomorrow : today
  const day = (blocks.data ?? []).filter((block) => block.date === date)
  const subjectName = new Map((subjects.data ?? []).map((subject) => [subject.id, subject.code ?? subject.name]))
  const counted = day.filter((block) => block.status !== 'missed')
  const byMode = { study: 0, hustle: 0, life: 0 }
  for (const block of counted) byMode[blockMode(block.area)] += block.planned_minutes
  const doneMinutes = day.filter((block) => block.status === 'done' || block.status === 'partial').reduce((total, block) => total + (block.actual_minutes ?? block.planned_minutes), 0)
  const atRisk = [...new Set(day.filter((block) => block.at_risk).map((block) => block.title))]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your plan</CardTitle>
        <CardDescription>
          {counted.length === 0
            ? 'Made by the planner from your routine, time budget and roadmaps.'
            : `Study ${duration(byMode.study)} · Hustle ${duration(byMode.hustle)} · Life ${duration(byMode.life)}${doneMinutes > 0 ? ` · ${duration(doneMinutes)} done` : ''}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={showTomorrow ? 'outline' : 'default'} aria-pressed={!showTomorrow} onClick={() => setShowTomorrow(false)}>
            Today
          </Button>
          <Button size="sm" variant={showTomorrow ? 'default' : 'outline'} aria-pressed={showTomorrow} onClick={() => setShowTomorrow(true)}>
            Tomorrow
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" disabled={planner.isPending || !planner.fingerprint} onClick={() => planner.replan('now')}>
            {planner.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            Re-plan
          </Button>
        </div>

        {planner.error && (
          <p role="alert" className="text-sm text-destructive">
            {planner.error.message}
          </p>
        )}
        {blocks.isPending || (planner.isPending && day.length === 0) ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Making your plan…
          </p>
        ) : day.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing planned for {showTomorrow ? 'tomorrow' : 'the rest of today'}.
            {(subjects.data?.length ?? 0) === 0 && ' Study blocks appear once a subject has a roadmap (Academics → import its syllabus).'}
          </p>
        ) : (
          <ol className="grid gap-2">
            {day.map((block) => (
              <TimelineRow key={block.id} block={block} subject={block.subject_id ? subjectName.get(block.subject_id) : undefined} now={now} />
            ))}
          </ol>
        )}

        {atRisk.length > 0 && <p className="text-sm text-destructive">At risk (can't be finished in time): {atRisk.join(', ')}</p>}
      </CardContent>
    </Card>
  )
}

function TimelineRow({ block, subject, now }: { block: PlanBlock; subject: string | undefined; now: Date }) {
  const mode = blockMode(block.area)
  const running = block.status !== 'missed' && Date.parse(block.start_at) <= now.getTime() && now.getTime() < Date.parse(block.end_at)
  const unmarked = block.status === 'planned' && Date.parse(block.end_at) <= now.getTime()
  return (
    <li className={cn('flex items-center gap-3 text-sm', (block.status === 'missed' || unmarked) && 'text-muted-foreground')}>
      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
        {time(block.start_at)}–{time(block.end_at)}
      </span>
      <span className={cn('min-w-0 flex-1 truncate', block.status === 'missed' && 'line-through')}>
        {block.title}
        {subject && <span className="text-muted-foreground"> · {subject}</span>}
      </span>
      {block.status === 'done' && <Check className="size-4 shrink-0 text-emerald-600" aria-label="Done" />}
      {block.status === 'partial' && <span className="shrink-0 text-xs text-amber-600">Partly</span>}
      {(running || block.status === 'in_progress') && <span className="shrink-0 text-xs font-medium text-primary">Now</span>}
      <Badge variant="outline" className={cn('ring-1 ring-inset', MODE_TONE[mode])}>
        {MODE_LABEL[mode]}
      </Badge>
    </li>
  )
}
