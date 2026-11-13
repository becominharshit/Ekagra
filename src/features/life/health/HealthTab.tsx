import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Footprints, HeartPulse, LoaderCircle, Moon, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { minutesLabel } from '@/features/academics/labels'
import { TrendChart } from '@/features/metrics/charts'
import { useProfile, useSaveSettings } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { addDays as addLocalDays } from '@/features/planner/time'
import { useNow, useTimezone } from '@/hooks/useNow'
import { formatNumber } from '@/lib/currency'
import { healthBridge, healthBridgeAvailable } from '@/lib/native/healthBridge'
import { clockInTimezone, dateKeyInTimezone } from '@/lib/timezone'
import { useLifeMutation } from '../lifeData'
import { average, dailyValues, nightFromTimes, onePerDate, regularityLabel, SLEEP_AIM, sleepRegularity, type SleepLog, type StepCount } from './health'
import { deleteSleep, deleteSteps, saveNights, saveSteps, SYNC_DAYS, useHealthSync, useSleepLogs, useStepCounts } from './healthData'

/** The charts show this many days, today last. */
const DAYS = 14

const number = (value: number) => formatNumber(value)
const dayLabel = (date: string) => format(parseISO(date), 'EEE d MMM')
const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.')

/** Life → Sleep & steps: from Health Connect on Android, or typed in; averages, regularity and charts. */
export function HealthTab() {
  const now = useNow(60_000)
  const timeZone = useTimezone()
  const today = dateKeyInTimezone(now, timeZone)
  const since = addLocalDays(today, 1 - SYNC_DAYS)
  const profile = useProfile()
  const sleep = useSleepLogs(since)
  const steps = useStepCounts(since)

  if (profile.isPending || sleep.isPending || steps.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  const problem = sleep.error ?? steps.error
  if (problem) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {problem.message}
      </p>
    )
  }
  const life = readSettings(profile.data?.settings).life

  return (
    <div className="grid gap-4">
      <HealthConnectCard />
      <SleepCard rows={sleep.data ?? []} today={today} />
      <StepsCard key={life.stepGoal} rows={steps.data ?? []} today={today} goal={life.stepGoal} />
    </div>
  )
}

function HealthConnectCard() {
  const native = healthBridgeAvailable()
  const status = useQuery({ queryKey: ['health-connect', 'status'], queryFn: () => healthBridge.status(), enabled: native })
  const connect = useMutation({ mutationFn: () => healthBridge.requestAccess() })
  const open = useMutation({ mutationFn: (screen: 'settings' | 'store') => (screen === 'settings' ? healthBridge.openSettings() : healthBridge.openStore()) })
  const sync = useHealthSync()
  const { mutate: syncNow } = sync
  const granted = status.data?.granted === true
  const syncedRef = useRef(false)

  // With access, opening the tab brings in the latest sleep and steps (once per visit).
  useEffect(() => {
    if (!granted || syncedRef.current) return
    syncedRef.current = true
    syncNow()
  }, [granted, syncNow])

  const title = (
    <CardTitle className="flex items-center gap-2">
      <HeartPulse className="size-4" aria-hidden />
      Health Connect
    </CardTitle>
  )
  if (!native) {
    return (
      <Card>
        <CardHeader>
          {title}
          <CardDescription>
            In the Android app, Ekagra can bring in your sleep and steps from Health Connect, which collects them from your phone, watch and fitness apps. Here, type them in below.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const state = status.data?.status
  const problem = status.error ?? connect.error ?? open.error ?? sync.error
  return (
    <Card>
      <CardHeader>
        {title}
        <CardDescription>
          {status.isPending
            ? 'Checking Health Connect…'
            : state === 'not_supported'
              ? 'Health Connect needs Android 9 or newer. You can type your sleep and steps in below.'
              : state === 'not_installed'
                ? 'Install Health Connect (free, from Google) to bring in sleep and steps from your phone, watch or fitness apps.'
                : state === 'needs_update'
                  ? 'Update Health Connect to connect it.'
                  : granted
                    ? 'Connected. Ekagra reads your sleep and steps (only those) when you open this tab, and never writes or shares them.'
                    : 'Connect to bring in your sleep and steps by themselves. Ekagra only reads them, and only these two.'}
        </CardDescription>
      </CardHeader>
      {!status.isPending && state !== 'not_supported' && (
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {(state === 'not_installed' || state === 'needs_update') && (
              <Button disabled={open.isPending} onClick={() => open.mutate('store', { onSuccess: () => void status.refetch() })}>
                {state === 'not_installed' ? 'Install Health Connect' : 'Update Health Connect'}
              </Button>
            )}
            {state === 'available' && !granted && (
              <Button disabled={connect.isPending} onClick={() => connect.mutate(undefined, { onSuccess: () => void status.refetch() })}>
                {connect.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
                Connect
              </Button>
            )}
            {granted && (
              <Button disabled={sync.isPending} onClick={() => syncNow()}>
                <RefreshCw className={sync.isPending ? 'animate-spin' : undefined} aria-hidden />
                Sync now
              </Button>
            )}
            {state === 'available' && (
              <Button variant="outline" disabled={open.isPending} onClick={() => open.mutate('settings', { onSuccess: () => void status.refetch() })}>
                Health Connect settings
              </Button>
            )}
          </div>
          {connect.data === false && !granted && <p className="text-sm text-muted-foreground">Access wasn't allowed. Try again, or allow sleep and steps for Ekagra in Health Connect's settings.</p>}
          {sync.isPending && <p className="text-sm text-muted-foreground">Bringing in the last {SYNC_DAYS} days…</p>}
          {sync.data && (
            <p role="status" className="text-sm text-muted-foreground">
              Brought in {sync.data.nights} {sync.data.nights === 1 ? 'night' : 'nights'} of sleep and {sync.data.days} {sync.data.days === 1 ? 'day' : 'days'} of steps.
            </p>
          )}
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {messageOf(problem)}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg bg-muted/40 p-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-lg font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  )
}

function SleepCard({ rows, today }: { rows: SleepLog[]; today: string }) {
  const timeZone = useTimezone()
  const [adding, setAdding] = useState(false)
  const remove = useLifeMutation(deleteSleep)
  const nights = onePerDate(rows)
  const weekAgo = addLocalDays(today, -7)
  const week = nights.filter((night) => night.date > weekAgo)
  const last = nights[nights.length - 1]
  const averageMinutes = average(week.map((night) => night.minutes))
  const regularity = sleepRegularity(week)
  const values = dailyValues(nights, today, DAYS, (night) => night.minutes / 60)
  const known = values.flatMap((day) => (day.value === null ? [] : [day.value]))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Moon className="size-4" aria-hidden />
          Sleep
        </CardTitle>
        <CardDescription>
          {last
            ? `${last.date === today ? 'Last night' : `The night to ${dayLabel(last.date)}`}: ${minutesLabel(last.minutes)} asleep, ${clockInTimezone(last.bed_at, timeZone)} to ${clockInTimezone(last.wake_at, timeZone)}.`
            : 'No nights yet: connect Health Connect, or add last night below.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid grid-cols-3 gap-2">
          <Tile label="7-night average" value={averageMinutes === null ? '–' : minutesLabel(averageMinutes)} note={`Most people need ${SLEEP_AIM.min}–${SLEEP_AIM.max} h`} />
          <Tile label="Regularity" value={regularity === null ? '–' : `${regularity}/100`} note={regularity === null ? 'Needs 3 nights' : regularityLabel(regularity)} />
          <Tile label="Nights" value={String(week.length)} note="in the last 7 days" />
        </dl>
        {known.length > 0 && (
          <TrendChart
            label={`Hours of sleep over the last ${DAYS} nights${averageMinutes === null ? '' : `: about ${minutesLabel(averageMinutes)} a night this week`}`}
            values={values.map((day) => day.value)}
            range={[Math.min(4, ...known), Math.max(10, ...known)]}
            band={[SLEEP_AIM.min, SLEEP_AIM.max]}
            format={(value) => `${Math.round(value)} h`}
            firstLabel={dayLabel(values[0]?.date ?? today)}
            lastLabel="Today"
          />
        )}
        <p className="text-xs text-muted-foreground">
          Regularity counts as much as hours: going to bed and getting up at the same times keeps your energy and memory steady. The shaded band is {SLEEP_AIM.min}–{SLEEP_AIM.max} hours.
        </p>
        {adding ? (
          <NightForm today={today} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="outline" className="justify-self-start" onClick={() => setAdding(true)}>
            Add a night
          </Button>
        )}
        {week.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {[...week].reverse().map((night) => (
              <li key={night.id} className="flex items-center justify-between gap-2 border-t pt-1 first:border-t-0 first:pt-0">
                <span>
                  {dayLabel(night.date)} · {minutesLabel(night.minutes)}{' '}
                  <span className="text-xs text-muted-foreground">
                    ({clockInTimezone(night.bed_at, timeZone)}–{clockInTimezone(night.wake_at, timeZone)}, {night.source === 'health_connect' ? 'Health Connect' : 'typed'})
                  </span>
                </span>
                {night.source === 'manual' && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete the night to ${dayLabel(night.date)}`} disabled={remove.isPending} onClick={() => remove.mutate(night.id)}>
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function NightForm({ today, onDone }: { today: string; onDone: () => void }) {
  const [date, setDate] = useState(today)
  const [bed, setBed] = useState('23:00')
  const [wake, setWake] = useState('07:00')
  const [problem, setProblem] = useState<string | null>(null)
  const save = useLifeMutation((source, night: Parameters<typeof saveNights>[1][number]) => saveNights(source, [night], 'manual'))

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = nightFromTimes(date, bed, wake)
    if ('problem' in result) {
      setProblem(result.problem)
      return
    }
    setProblem(null)
    save.mutate(result.night, { onSuccess: onDone })
  }

  return (
    <form className="grid gap-3 rounded-lg border p-3" onSubmit={submit}>
      <div className="grid grid-cols-3 gap-2">
        <Label className="grid gap-1.5 font-normal">
          <span className="text-sm text-muted-foreground">Morning of</span>
          <Input type="date" max={today} value={date} onChange={(event) => setDate(event.target.value)} />
        </Label>
        <Label className="grid gap-1.5 font-normal">
          <span className="text-sm text-muted-foreground">Asleep at</span>
          <Input type="time" value={bed} onChange={(event) => setBed(event.target.value)} />
        </Label>
        <Label className="grid gap-1.5 font-normal">
          <span className="text-sm text-muted-foreground">Woke up at</span>
          <Input type="time" value={wake} onChange={(event) => setWake(event.target.value)} />
        </Label>
      </div>
      {(problem ?? save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? save.error?.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          Save the night
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function StepsCard({ rows, today, goal }: { rows: StepCount[]; today: string; goal: number }) {
  const [date, setDate] = useState(today)
  const [stepsText, setStepsText] = useState('')
  const [goalText, setGoalText] = useState(String(goal))
  const save = useLifeMutation((source, day: { date: string; steps: number }) => saveSteps(source, [day], 'manual'))
  const remove = useLifeMutation(deleteSteps)
  const saveGoal = useSaveSettings()
  const days = onePerDate(rows)
  const todaySteps = days.find((day) => day.date === today)?.steps ?? 0
  const weekAgo = addLocalDays(today, -7)
  const averageSteps = average(days.filter((day) => day.date > weekAgo && day.date < today).map((day) => day.steps))
  const values = dailyValues(days, today, DAYS, (day) => day.steps)
  const known = values.flatMap((day) => (day.value === null ? [] : [day.value]))
  const typed = days.filter((day) => day.source === 'manual' && day.date > weekAgo).reverse()
  const steps = Number(stepsText)
  const newGoal = Number(goalText)
  const goalProblem = !Number.isInteger(newGoal) || newGoal < 1000 || newGoal > 50_000 ? 'A goal between 1,000 and 50,000 steps.' : null

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate({ date, steps }, { onSuccess: () => setStepsText('') })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Footprints className="size-4" aria-hidden />
          Steps
        </CardTitle>
        <CardDescription>
          Today: {number(todaySteps)} of {number(goal)} steps.{averageSteps === null ? '' : ` Last 7 days: about ${number(averageSteps)} a day.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-mode-life" style={{ width: `${Math.min(100, Math.round((todaySteps / goal) * 100))}%` }} />
        </div>
        {known.length > 0 && (
          <TrendChart
            label={`Steps a day over the last ${DAYS} days; the dashed line is your goal of ${number(goal)}`}
            values={values.map((day) => day.value)}
            range={[0, Math.max(goal * 1.2, ...known)]}
            target={goal}
            liveLast
            format={(value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value)))}
            firstLabel={dayLabel(values[0]?.date ?? today)}
            lastLabel="Today"
          />
        )}
        <form className="grid grid-cols-[1fr_1fr_auto] items-end gap-2" onSubmit={submit}>
          <Label className="grid gap-1.5 font-normal">
            <span className="text-sm text-muted-foreground">Day</span>
            <Input type="date" max={today} value={date} onChange={(event) => setDate(event.target.value)} />
          </Label>
          <Label className="grid gap-1.5 font-normal">
            <span className="text-sm text-muted-foreground">Steps</span>
            <Input type="number" inputMode="numeric" min={0} max={200_000} placeholder="e.g. 6500" value={stepsText} onChange={(event) => setStepsText(event.target.value)} />
          </Label>
          <Button type="submit" variant="outline" disabled={!stepsText || !Number.isInteger(steps) || steps < 0 || steps > 200_000 || save.isPending}>
            Save
          </Button>
        </form>
        {typed.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {typed.map((day) => (
              <li key={day.id} className="flex items-center justify-between gap-2">
                <span>
                  {dayLabel(day.date)} · {number(day.steps)} steps <span className="text-xs text-muted-foreground">(typed)</span>
                </span>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete the steps of ${dayLabel(day.date)}`} disabled={remove.isPending} onClick={() => remove.mutate(day.id)}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!goalProblem) saveGoal.mutate({ life: { stepGoal: newGoal } })
          }}
        >
          <Label className="grid gap-1.5 font-normal">
            <span className="text-sm text-muted-foreground">Daily goal</span>
            <Input type="number" inputMode="numeric" min={1000} max={50_000} step={500} className="w-32" value={goalText} onChange={(event) => setGoalText(event.target.value)} />
          </Label>
          <Button type="submit" variant="ghost" disabled={newGoal === goal || goalProblem !== null || saveGoal.isPending}>
            Save goal
          </Button>
        </form>
        {((newGoal !== goal && goalProblem) || save.error || remove.error || saveGoal.error) && (
          <p role="alert" className="text-sm text-destructive">
            {(newGoal !== goal && goalProblem) || (save.error ?? remove.error ?? saveGoal.error)?.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
