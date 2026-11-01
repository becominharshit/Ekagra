import { useMemo, useState } from 'react'
import { addDays as addCalendarDays, format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MODE_TONE, type Mode } from '@/features/mode/modes'
import { toPlannerRoutine } from '@/features/onboarding/routineDraft'
import { useProfile, useRoutine } from '@/features/profile/queries'
import { plannerSettingsFor, readSettings, toChronotype } from '@/features/profile/settings'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { buildPlan, minutesByArea, plannedMinutes } from './planner'
import { useStudyData } from './studyData'
import { formatTime } from './time'
import type { Area } from './types'

const AREA_MODE: Record<Area, Mode> = { academics: 'study', hustle: 'hustle', life: 'life' }
const AREA_LABEL: Record<Area, string> = { academics: 'Study', hustle: 'Hustle', life: 'Life' }

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/**
 * A read-only look at the plan the planner engine makes from your routine and budget.
 * The full Today screen (Now card, "I Crashed", check-in) is Milestone 4.
 */
export function PlanPreview() {
  const now = useNow(60_000)
  const profile = useProfile()
  const routine = useRoutine()
  const study = useStudyData()
  const [showTomorrow, setShowTomorrow] = useState(false)

  const today = format(now, 'yyyy-MM-dd')
  const nowMinute = now.getHours() * 60 + now.getMinutes()

  const plan = useMemo(() => {
    if (!profile.data || !routine.data || !study.data) return null
    const chronotype = toChronotype(profile.data.chronotype)
    return buildPlan({
      today,
      nowMinute,
      horizonDays: 14,
      routine: toPlannerRoutine(routine.data),
      subjects: study.data.subjects,
      topics: study.data.topics,
      tasks: [],
      checkIns: [],
      settings: plannerSettingsFor(readSettings(profile.data.settings), chronotype),
    })
  }, [profile.data, routine.data, study.data, today, nowMinute])

  if (!plan) return null
  const hasTopics = (study.data?.topics.length ?? 0) > 0
  const day = plan.days[showTomorrow ? 1 : 0]
  if (!day) return null
  const areas = minutesByArea(day)
  const dayName = showTomorrow ? format(addCalendarDays(now, 1), 'EEEE') : 'today'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your plan (preview)</CardTitle>
        <CardDescription>
          Made by the planner from your routine, time budget and roadmaps.
          {hasTopics ? '' : ' Study blocks appear once a subject has a roadmap (Academics → import its syllabus).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex gap-2">
          <Button size="sm" variant={showTomorrow ? 'outline' : 'default'} aria-pressed={!showTomorrow} onClick={() => setShowTomorrow(false)}>
            Today
          </Button>
          <Button size="sm" variant={showTomorrow ? 'default' : 'outline'} aria-pressed={showTomorrow} onClick={() => setShowTomorrow(true)}>
            Tomorrow
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Free {duration(day.freeMinutes)} · planned {duration(plannedMinutes(day))} · study {duration(areas.academics)} · hustle{' '}
          {duration(areas.hustle)} · life {duration(areas.life)}
          {day.examSeason && ' · exam season (80/5/15)'}
        </p>

        {day.blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing planned for the rest of {dayName}.</p>
        ) : (
          <ol className="grid gap-2">
            {day.blocks.map((block) => (
              <li key={`${block.start}-${block.key}`} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  {formatTime(block.start)}–{formatTime(block.end)}
                </span>
                <span className="min-w-0 flex-1 truncate">{block.title}</span>
                <Badge variant="outline" className={cn('ring-1 ring-inset', MODE_TONE[AREA_MODE[block.area]])}>
                  {AREA_LABEL[block.area]}
                </Badge>
              </li>
            ))}
          </ol>
        )}

        {plan.atRisk.length > 0 && (
          <p className="text-sm text-destructive">
            At risk in the next 14 days: {plan.atRisk.map((item) => item.title).join(', ')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
