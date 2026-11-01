import { useState } from 'react'
import { addMinutes, format } from 'date-fns'
import { LoaderCircle, Play } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSubjects } from '@/features/academics/subjects'
import { primaryHustle, useHustles } from '@/features/hustle/hustles'
import { MODE_LABEL } from '@/features/mode/modes'
import { useBlocks } from '@/features/planner/planBlocks'
import { blockAt, blockMode, blocksAfter, localDateOf, type PlanBlock } from '@/features/planner/schedule'
import { useProfile, useSaveSettings } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useTodayMutation } from '@/features/today/todayMutation'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { allowChime } from './chime'
import { minutesLeftIn, startFocus, type FocusArea } from './sessions'
import { roundsWork, scheduleFor, scheduleMinutes, TIMER_LABEL, timerRhythm, workThatFits, type FocusMode, type Phase, type TimerLengths } from './timer'

const MODES: FocusMode[] = ['pomodoro', 'deep', 'custom']
const AREAS: { value: FocusArea; label: string }[] = [
  { value: 'academics', label: 'Study' },
  { value: 'hustle', label: 'Hustle' },
  { value: 'life', label: 'Life' },
]
const ANY = 'any'
const MIN_MINUTES = 5
const MAX_MINUTES = 240

const time = (iso: string) => format(new Date(iso), 'HH:mm')
const isOpen = (block: PlanBlock) => block.status === 'planned' || block.status === 'in_progress'

/** Focus minutes for a session on its own: 2 Pomodoros, 1 Deep work stretch, or 30 minutes. */
function ownMinutes(mode: FocusMode, lengths: TimerLengths): number {
  if (mode === 'custom') return 30
  return roundsWork(mode, mode === 'pomodoro' ? 2 : 1, lengths)
}

/** "25 min focus → 5 min break → 15 min focus" (long schedules are summed up). */
function scheduleSummary(phases: Phase[]): string {
  if (phases.length <= 5) return phases.map((phase) => `${phase.minutes} min ${phase.kind === 'work' ? 'focus' : 'break'}`).join(' → ')
  return `${phases.filter((phase) => phase.kind === 'work').length} rounds of focus, with breaks`
}

/** A choice shown as a tappable tile. */
function Choice({ pressed, onClick, title, detail }: { pressed: boolean; onClick: () => void; title: string; detail: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn('grid w-full gap-0.5 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40', pressed && 'border-primary bg-primary/5 ring-1 ring-primary')}
    >
      <span className="font-medium">{title}</span>
      <span className="text-sm text-muted-foreground">{detail}</span>
    </button>
  )
}

/** Start a focus session: for the plan's block (or the one picked on Today) or something else, with a timer. */
export function StartFocus() {
  const now = useNow(30_000)
  const today = localDateOf(now)
  const [params] = useSearchParams()
  const blocks = useBlocks(today, today)
  const subjects = useSubjects()
  const hustles = useHustles()
  const profile = useProfile()
  const settings = readSettings(profile.data?.settings).focus
  const lengths: TimerLengths = { pomodoro: settings.pomodoro, deep: settings.deep }
  const start = useTodayMutation(startFocus)
  const saveSettings = useSaveSettings()

  const open = (blocks.data ?? []).filter(isOpen)
  // The block picked on Today, else the one of right now, else the next one.
  const suggested = open.find((block) => block.id === params.get('block')) ?? blockAt(open, now) ?? blocksAfter(open, now, 1)[0] ?? null
  const activeHustles = (hustles.data ?? []).filter((hustle) => hustle.status === 'active')

  // null = not changed by the student: the default applies.
  const [forBlock, setForBlock] = useState<boolean | null>(null)
  const [area, setArea] = useState<FocusArea>('academics')
  const [subjectId, setSubjectId] = useState(ANY)
  const [hustleId, setHustleId] = useState<string | null>(null)
  const [mode, setMode] = useState<FocusMode | null>(null)
  const [minutesText, setMinutesText] = useState<string | null>(null)
  const [makeDefault, setMakeDefault] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const block = (forBlock ?? true) ? suggested : null
  const chosenMode = mode ?? settings.defaultMode
  const chosenHustle = hustleId ?? primaryHustle(activeHustles)?.id ?? null
  const suggestedMinutes = block ? workThatFits(chosenMode, minutesLeftIn(block, now), lengths) : ownMinutes(chosenMode, lengths)
  const minutes = minutesText === null ? suggestedMinutes : Number(minutesText)
  const valid = Number.isInteger(minutes) && minutes >= MIN_MINUTES && minutes <= MAX_MINUTES
  const phases = valid ? scheduleFor(chosenMode, minutes, lengths) : []
  const isNow = (row: PlanBlock) => Date.parse(row.start_at) <= now.getTime()
  const subjectName = (row: PlanBlock) => subjects.data?.find((subject) => subject.id === row.subject_id)?.name

  function begin() {
    if (!valid) return setProblem(`Pick between ${MIN_MINUTES} and ${MAX_MINUTES} minutes of focus.`)
    setProblem(null)
    allowChime()
    if (makeDefault && chosenMode !== settings.defaultMode) saveSettings.mutate({ focus: { defaultMode: chosenMode } })
    start.mutate({ block, area, subjectId: subjectId === ANY ? null : subjectId, hustleId: chosenHustle, mode: chosenMode, workMinutes: minutes })
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        begin()
      }}
    >
      <Card size="sm">
        <CardContent className="grid gap-5">
          <section className="grid gap-2" aria-labelledby="focus-what">
            <h2 id="focus-what" className="text-sm font-medium">
              What
            </h2>
            {suggested ? (
              <div className="grid gap-2">
                <Choice
                  pressed={block !== null}
                  onClick={() => {
                    setForBlock(true)
                    setMinutesText(null)
                  }}
                  title={suggested.title}
                  detail={[
                    `${isNow(suggested) ? 'Now' : 'Next'} · ${time(suggested.start_at)}–${time(suggested.end_at)}`,
                    MODE_LABEL[blockMode(suggested.area)],
                    subjectName(suggested),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
                <Choice
                  pressed={block === null}
                  onClick={() => {
                    setForBlock(false)
                    setMinutesText(null)
                  }}
                  title="Something else"
                  detail="Study, hustle or life work that isn't in the plan"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing more is planned today, so this session is on its own.</p>
            )}
            {!block && (
              <div className="grid gap-3">
                <div className="flex gap-2" role="group" aria-label="Area">
                  {AREAS.map((option) => (
                    <Button key={option.value} type="button" size="sm" variant={area === option.value ? 'default' : 'outline'} aria-pressed={area === option.value} onClick={() => setArea(option.value)}>
                      {option.label}
                    </Button>
                  ))}
                </div>
                {area === 'academics' && (subjects.data?.length ?? 0) > 0 && (
                  <Select value={subjectId} onValueChange={setSubjectId}>
                    <SelectTrigger aria-label="Subject" className="w-full sm:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Any subject</SelectItem>
                      {(subjects.data ?? []).map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {area === 'hustle' &&
                  (activeHustles.length > 0 && chosenHustle ? (
                    <Select value={chosenHustle} onValueChange={setHustleId}>
                      <SelectTrigger aria-label="Hustle" className="w-full sm:w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activeHustles.map((hustle) => (
                          <SelectItem key={hustle.id} value={hustle.id}>
                            {hustle.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">No active hustle: the time isn't added to one.</p>
                  ))}
              </div>
            )}
          </section>

          <section className="grid gap-2" aria-labelledby="focus-timer">
            <h2 id="focus-timer" className="text-sm font-medium">
              Timer
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((option) => (
                <Choice
                  key={option}
                  pressed={chosenMode === option}
                  onClick={() => {
                    setMode(option)
                    setMinutesText(null)
                  }}
                  title={TIMER_LABEL[option]}
                  detail={timerRhythm(option, lengths)}
                />
              ))}
            </div>
            {chosenMode !== settings.defaultMode && (
              <div className="flex items-center gap-2">
                <Checkbox id="focus-make-default" checked={makeDefault} onCheckedChange={(value) => setMakeDefault(value === true)} />
                <Label htmlFor="focus-make-default" className="font-normal">
                  Use {TIMER_LABEL[chosenMode]} for one-tap Start focus on Today
                </Label>
              </div>
            )}
          </section>

          <section className="grid gap-2" aria-labelledby="focus-minutes-label">
            <Label id="focus-minutes-label" htmlFor="focus-minutes">
              Minutes of focus
            </Label>
            <Input
              id="focus-minutes"
              type="number"
              inputMode="numeric"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              step={5}
              className="w-28"
              value={minutesText ?? String(suggestedMinutes)}
              onChange={(event) => setMinutesText(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              {valid
                ? `${scheduleSummary(phases)} · ends about ${format(addMinutes(now, scheduleMinutes(phases)), 'HH:mm')}${block && minutesText === null ? ' (fits this block)' : ''}`
                : `Pick between ${MIN_MINUTES} and ${MAX_MINUTES} minutes.`}
            </p>
          </section>
        </CardContent>
      </Card>
      {(problem ?? start.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? start.error?.message}
        </p>
      )}
      <Button type="submit" size="lg" className="justify-self-start" disabled={start.isPending || blocks.isPending}>
        {start.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Play aria-hidden />}
        Start focusing
      </Button>
    </form>
  )
}
