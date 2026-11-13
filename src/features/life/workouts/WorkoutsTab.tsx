import { useState, type FormEvent } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Dumbbell, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { countLabel } from '@/features/academics/labels'
import { WeekBars } from '@/features/metrics/charts'
import { addDays as addLocalDays } from '@/features/planner/time'
import { useProfile, useSaveSettings } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useNow, useTimezone } from '@/hooks/useNow'
import { dateKeyInTimezone } from '@/lib/timezone'
import { useLifeMutation } from '../lifeData'
import {
  blankLog,
  nextProgramDay,
  personalBests,
  PROGRAM_KEYS,
  PROGRAMS,
  readExercises,
  specLabel,
  toProgramKey,
  workoutsPerWeek,
  type ExerciseSpec,
  type LoggedExercise,
  type Program,
  type ProgramDay,
  type Workout,
} from './programs'
import { deleteWorkout, saveWorkout, useWorkouts } from './workoutsData'

const DAYS = [
  { value: 1, short: 'M', name: 'Monday' },
  { value: 2, short: 'T', name: 'Tuesday' },
  { value: 3, short: 'W', name: 'Wednesday' },
  { value: 4, short: 'T', name: 'Thursday' },
  { value: 5, short: 'F', name: 'Friday' },
  { value: 6, short: 'S', name: 'Saturday' },
  { value: 0, short: 'S', name: 'Sunday' },
]
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const LOOKBACK_DAYS = 180

/** The short name of a program, e.g. "Hostel room". */
const shortName = (program: Program) => program.title.split(' (')[0] ?? program.title

/** Life → Workouts: a program (hostel, dumbbells or gym), today's workout, the logger and progress. */
export function WorkoutsTab() {
  const now = useNow(60_000)
  const timeZone = useTimezone()
  const today = dateKeyInTimezone(now, timeZone)
  const profile = useProfile()
  const life = readSettings(profile.data?.settings).life
  const programKey = toProgramKey(life.program)
  const workouts = useWorkouts(addLocalDays(today, -LOOKBACK_DAYS))
  const [logging, setLogging] = useState<{ day: ProgramDay | null; startedAt: number } | null>(null)
  const [picking, setPicking] = useState(false)

  if (profile.isPending || workouts.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (workouts.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {workouts.error.message}
      </p>
    )
  }
  const program = programKey ? PROGRAMS[programKey] : null
  if (!program || picking) return <ProgramPicker current={programKey} onDone={() => setPicking(false)} />
  if (logging) return <WorkoutLogger program={program} day={logging.day} startedAt={logging.startedAt} today={today} onDone={() => setLogging(null)} />

  const list = workouts.data ?? []
  const next = nextProgramDay(program, list)
  const workoutDay = life.workoutDays.includes(now.getDay())
  const doneToday = list.some((workout) => workout.date === today)
  const nextDayName = [1, 2, 3, 4, 5, 6, 7].map((ahead) => addDays(now, ahead)).find((date) => life.workoutDays.includes(date.getDay()))

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {doneToday ? 'Done for today' : workoutDay ? `Today: ${next.key}, ${next.title}` : 'Rest day'}
          </CardTitle>
          <CardDescription>
            {shortName(program)}.{' '}
            {doneToday
              ? `Nice work. Rest helps your muscles grow. Next time: ${next.key}, ${next.title}.`
              : workoutDay
                ? 'Warm up for 5 minutes first. Stop if anything hurts.'
                : `Next workout: ${nextDayName ? DAY_NAME[nextDayName.getDay()] : 'pick your days below'} (${next.key}, ${next.title}).`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ul className="grid gap-1 text-sm">
            {next.exercises.map((exercise) => (
              <li key={exercise.name} className="flex justify-between gap-2">
                <span>{exercise.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{specLabel(exercise)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setLogging({ day: next, startedAt: Date.now() })}>
              <Dumbbell aria-hidden />
              {workoutDay && !doneToday ? 'Start the workout' : 'Work out anyway'}
            </Button>
            <Button variant="outline" onClick={() => setLogging({ day: null, startedAt: Date.now() })}>
              Log my own workout
            </Button>
          </div>
        </CardContent>
      </Card>

      <ProgressCard workouts={list} today={today} />
      <HistoryCard workouts={list} />
      <ProgramSettings program={program} days={life.workoutDays} onChangeProgram={() => setPicking(true)} />
    </div>
  )
}

function ProgramPicker({ current, onDone }: { current: string | null; onDone: () => void }) {
  const save = useSaveSettings()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a workout program</CardTitle>
        <CardDescription>No AI and no guessing: simple programs that work. You can change it any time.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {PROGRAM_KEYS.map((key) => {
          const program = PROGRAMS[key]
          return (
            <div key={key} className="grid gap-2 rounded-lg border p-3 text-sm">
              <p className="font-medium">{program.title}</p>
              <p className="text-muted-foreground">{program.description}</p>
              <p className="text-xs text-muted-foreground">{program.days.map((day) => `${day.key}: ${day.title}`).join(' · ')}</p>
              <Button
                size="sm"
                variant={key === current ? 'secondary' : 'default'}
                className="justify-self-start"
                disabled={save.isPending}
                onClick={() => save.mutate({ life: { program: key, workoutDays: program.weekdays } }, { onSuccess: onDone })}
              >
                {key === current ? 'Keep this one' : 'Choose'}
              </Button>
            </div>
          )
        })}
        {save.error && (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        )}
        {current && (
          <Button variant="ghost" className="justify-self-start" onClick={onDone}>
            Cancel
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

const blankSet = () => ({ reps: null, seconds: null, kg: null })
const toNumber = (text: string) => (text.trim() === '' ? null : Math.max(0, Number(text)))

function WorkoutLogger({ program, day, startedAt, today, onDone }: { program: Program; day: ProgramDay | null; startedAt: number; today: string; onDone: () => void }) {
  const [log, setLog] = useState<LoggedExercise[]>(() => (day ? blankLog(day) : [{ name: '', kind: 'reps', sets: [blankSet(), blankSet(), blankSet()] }]))
  const [title, setTitle] = useState(day ? `${shortName(program)} ${day.key}: ${day.title}` : 'My workout')
  const [minutes, setMinutes] = useState('')
  const [notes, setNotes] = useState('')
  const save = useLifeMutation(saveWorkout)
  const specs: (ExerciseSpec | undefined)[] = day?.exercises ?? []

  const change = (exerciseIndex: number, update: (exercise: LoggedExercise) => LoggedExercise) => setLog(log.map((exercise, index) => (index === exerciseIndex ? update(exercise) : exercise)))
  const setValue = (exerciseIndex: number, setIndex: number, field: 'reps' | 'seconds' | 'kg', text: string) =>
    change(exerciseIndex, (exercise) => ({ ...exercise, sets: exercise.sets.map((set, index) => (index === setIndex ? { ...set, [field]: toNumber(text) } : set)) }))

  function submit(event: FormEvent) {
    event.preventDefault()
    const typed = Number(minutes)
    const durationMin = minutes.trim() !== '' && Number.isFinite(typed) ? Math.round(typed) : Math.min(600, Math.max(1, Math.round((Date.now() - startedAt) / 60_000)))
    save.mutate({ date: today, title, program: day ? program.key : null, dayKey: day?.key ?? null, exercises: log, durationMin, notes }, { onSuccess: onDone })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{day ? `${day.key}: ${day.title}` : 'Your own workout'}</CardTitle>
        <CardDescription>Fill in each set as you go. Empty sets aren't saved.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          {!day && (
            <Label className="grid gap-1.5 font-normal">
              <span className="text-sm text-muted-foreground">Name</span>
              <Input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
            </Label>
          )}
          {log.map((exercise, exerciseIndex) => {
            const spec = specs[exerciseIndex]
            const weighted = spec ? spec.weighted : true
            return (
              <fieldset key={exerciseIndex} className="grid gap-2 rounded-lg border p-3">
                <legend className="sr-only">{exercise.name || `Exercise ${exerciseIndex + 1}`}</legend>
                {spec ? (
                  <p className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{exercise.name}</span>
                    <span className="text-muted-foreground tabular-nums">aim {specLabel(spec)}</span>
                  </p>
                ) : (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Input aria-label="Exercise" placeholder="e.g. Push-ups" value={exercise.name} onChange={(event) => change(exerciseIndex, (current) => ({ ...current, name: event.target.value }))} />
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      size="sm"
                      value={exercise.kind}
                      onValueChange={(kind) => kind && change(exerciseIndex, (current) => ({ ...current, kind: kind === 'seconds' ? 'seconds' : 'reps' }))}
                      aria-label="Count"
                    >
                      <ToggleGroupItem value="reps">Reps</ToggleGroupItem>
                      <ToggleGroupItem value="seconds">Seconds</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                )}
                {exercise.sets.map((set, setIndex) => (
                  <div key={setIndex} className="grid grid-cols-[3.5rem_1fr_1fr] items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Set {setIndex + 1}</span>
                    {exercise.kind === 'seconds' ? (
                      <Input type="number" inputMode="numeric" min={0} aria-label={`Set ${setIndex + 1} seconds`} placeholder="seconds" value={set.seconds ?? ''} onChange={(event) => setValue(exerciseIndex, setIndex, 'seconds', event.target.value)} />
                    ) : (
                      <Input type="number" inputMode="numeric" min={0} aria-label={`Set ${setIndex + 1} reps`} placeholder="reps" value={set.reps ?? ''} onChange={(event) => setValue(exerciseIndex, setIndex, 'reps', event.target.value)} />
                    )}
                    {weighted && exercise.kind === 'reps' ? (
                      <Input type="number" inputMode="decimal" min={0} step="0.5" aria-label={`Set ${setIndex + 1} kg`} placeholder="kg" value={set.kg ?? ''} onChange={(event) => setValue(exerciseIndex, setIndex, 'kg', event.target.value)} />
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
                <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={() => change(exerciseIndex, (current) => ({ ...current, sets: [...current.sets, blankSet()] }))}>
                  <Plus aria-hidden />
                  Set
                </Button>
              </fieldset>
            )
          })}
          {!day && (
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => setLog([...log, { name: '', kind: 'reps', sets: [blankSet(), blankSet(), blankSet()] }])}>
              <Plus aria-hidden />
              Exercise
            </Button>
          )}
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <Label className="grid gap-1.5 font-normal">
              <span className="text-sm text-muted-foreground">Minutes</span>
              <Input type="number" inputMode="numeric" min={1} max={600} placeholder="auto" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
            </Label>
            <Label className="grid gap-1.5 font-normal">
              <span className="text-sm text-muted-foreground">Notes</span>
              <Textarea rows={1} maxLength={1000} placeholder="How did it feel?" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Label>
          </div>
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              Save the workout
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function ProgressCard({ workouts, today }: { workouts: Workout[]; today: string }) {
  const weeks = workoutsPerWeek(workouts, today)
  const bests = personalBests(workouts).slice(0, 8)
  const total = weeks.reduce((sum, week) => sum + week.count, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Progress</CardTitle>
        <CardDescription>{total === 0 ? 'Your workouts per week and personal bests show here.' : `${countLabel(total, 'workout')} in the last 8 weeks.`}</CardDescription>
      </CardHeader>
      {total > 0 && (
        <CardContent className="grid gap-4">
          <WeekBars
            label={`Workouts per week over the last 8 weeks: ${total} in all`}
            values={weeks.map((week) => week.count)}
            format={(value) => String(Math.round(value))}
            liveLast
            firstLabel={format(parseISO(weeks[0]?.weekStart ?? today), 'd MMM')}
            lastLabel="This week"
          />
          {bests.length > 0 && (
            <div className="grid gap-1 text-sm">
              <p className="text-xs text-muted-foreground">Personal bests</p>
              {bests.map((best) => (
                <p key={best.name} className="flex justify-between gap-2">
                  <span>{best.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {[best.kg !== null ? `${best.kg} kg` : null, best.reps !== null ? `${best.reps} reps` : null, best.seconds !== null ? `${best.seconds} s` : null].filter(Boolean).join(' · ')}
                  </span>
                </p>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function HistoryCard({ workouts }: { workouts: Workout[] }) {
  const remove = useLifeMutation(deleteWorkout)
  if (workouts.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent workouts</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-1.5 text-sm">
          {workouts.slice(0, 10).map((workout) => {
            const sets = readExercises(workout.exercises).reduce((sum, exercise) => sum + exercise.sets.length, 0)
            return (
              <li key={workout.id} className="flex items-center justify-between gap-2 border-t pt-1.5 first:border-t-0 first:pt-0">
                <span className="min-w-0">
                  <span className="block truncate">{workout.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(workout.date), 'EEE d MMM')} · {sets} sets{workout.duration_min ? ` · ${workout.duration_min} min` : ''}
                  </span>
                </span>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${workout.title}`} disabled={remove.isPending} onClick={() => remove.mutate(workout.id)}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function ProgramSettings({ program, days, onChangeProgram }: { program: Program; days: number[]; onChangeProgram: () => void }) {
  const save = useSaveSettings()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Program</CardTitle>
        <CardDescription>
          {program.title}: {program.days.map((day) => `${day.key} ${day.title}`).join(', ')}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <span className="text-sm text-muted-foreground">Workout days</span>
          <ToggleGroup
            type="multiple"
            variant="outline"
            value={days.map(String)}
            onValueChange={(next) => next.length > 0 && save.mutate({ life: { program: program.key, workoutDays: next.map(Number).sort((a, b) => a - b) } })}
            aria-label="Workout days"
          >
            {DAYS.map((day) => (
              <ToggleGroupItem key={day.value} value={String(day.value)} aria-label={day.name}>
                {day.short}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Button variant="outline" className="justify-self-start" onClick={onChangeProgram}>
          Change the program
        </Button>
        {save.error && (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
