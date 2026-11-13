import { useState, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { Check, Flame, LoaderCircle, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { addDays as addLocalDays } from '@/features/planner/time'
import { useNow, useTimezone } from '@/hooks/useNow'
import { dateKeyInTimezone } from '@/lib/timezone'
import { cn } from '@/lib/utils'
import {
  ALL_DAYS,
  currentStreak,
  doneDates,
  HABIT_KIND_LABEL,
  HABIT_KINDS,
  isDone,
  isScheduled,
  lastWeek,
  SUGGESTED_HABITS,
  toHabitKind,
  type DayMark,
  type Habit,
  type HabitKind,
  type HabitLog,
} from './habits'
import { useLifeMutation } from '../lifeData'
import { archiveHabit, logHabit, saveHabit, useHabitLogs, useHabits } from './habitsData'

// Monday first, like the routine editor.
const DAYS = [
  { value: 1, short: 'M', name: 'Monday' },
  { value: 2, short: 'T', name: 'Tuesday' },
  { value: 3, short: 'W', name: 'Wednesday' },
  { value: 4, short: 'T', name: 'Thursday' },
  { value: 5, short: 'F', name: 'Friday' },
  { value: 6, short: 'S', name: 'Saturday' },
  { value: 0, short: 'S', name: 'Sunday' },
]

/** Streaks look back this far. */
const LOOKBACK_DAYS = 180

function daysLabel(days: number[]): string {
  if (days.length === 7) return 'Every day'
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return 'Weekdays'
  return DAYS.filter((day) => days.includes(day.value))
    .map((day) => day.name.slice(0, 3))
    .join(', ')
}

/** Life → Habits: today's habits (tick or count), streaks and the last 7 days. */
export function HabitsTab() {
  const now = useNow(60_000)
  const timeZone = useTimezone()
  const today = dateKeyInTimezone(now, timeZone)
  const habits = useHabits()
  const logs = useHabitLogs(addLocalDays(today, -LOOKBACK_DAYS))
  const log = useLifeMutation(logHabit)
  const add = useLifeMutation(saveHabit)
  const [editing, setEditing] = useState<Habit | 'new' | null>(null)

  if (habits.isPending || logs.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (habits.error || logs.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {(habits.error ?? logs.error)?.message}
      </p>
    )
  }
  const list = habits.data ?? []
  const allLogs = logs.data ?? []
  const dueToday = list.filter((habit) => isScheduled(habit, today))
  const notToday = list.filter((habit) => !isScheduled(habit, today))
  const doneToday = dueToday.filter((habit) => isDone(habit, allLogs.find((row) => row.habit_id === habit.id && row.date === today))).length
  const suggestions = SUGGESTED_HABITS.filter((suggestion) => !list.some((habit) => habit.title.toLowerCase() === suggestion.title.toLowerCase()))

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            Today
            {dueToday.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground tabular-nums">
                {doneToday} of {dueToday.length} done
              </span>
            )}
          </CardTitle>
          <CardDescription>{list.length === 0 ? 'Small daily habits add up. Start with one or two.' : 'Tap to tick a habit off. Tap its name to change it.'}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {dueToday.length > 0 && (
            <ul className="grid gap-2">
              {dueToday.map((habit) => (
                <HabitRow key={habit.id} habit={habit} logs={allLogs} today={today} busy={log.isPending} onLog={(values) => log.mutate(values)} onEdit={() => setEditing(habit)} />
              ))}
            </ul>
          )}
          {list.length > 0 && dueToday.length === 0 && <p className="text-sm text-muted-foreground">No habits are due today.</p>}
          {log.error && (
            <p role="alert" className="text-sm text-destructive">
              {log.error.message}
            </p>
          )}
          {notToday.length > 0 && (
            <div className="grid gap-1.5 text-sm">
              <p className="text-xs text-muted-foreground">Not today</p>
              {notToday.map((habit) => (
                <button key={habit.id} type="button" className="flex justify-between gap-2 text-left underline-offset-4 hover:underline" onClick={() => setEditing(habit)}>
                  <span>{habit.title}</span>
                  <span className="text-xs text-muted-foreground">{daysLabel(habit.days_of_week)}</span>
                </button>
              ))}
            </div>
          )}
          {editing === null && (
            <Button variant="outline" className="justify-self-start" onClick={() => setEditing('new')}>
              <Plus aria-hidden />
              Add a habit
            </Button>
          )}
        </CardContent>
      </Card>

      {editing !== null && <HabitForm key={editing === 'new' ? 'new' : editing.id} habit={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}

      {suggestions.length > 0 && editing === null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ideas</CardTitle>
            <CardDescription>One tap adds a habit; you can change it afterwards.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <Button key={suggestion.title} size="sm" variant="outline" disabled={add.isPending} onClick={() => add.mutate(suggestion)}>
                <Plus aria-hidden />
                {suggestion.title}
                {suggestion.target ? ` (${suggestion.target} ${suggestion.unit})` : ''}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function HabitRow({
  habit,
  logs,
  today,
  busy,
  onLog,
  onEdit,
}: {
  habit: Habit
  logs: HabitLog[]
  today: string
  busy: boolean
  onLog: (values: { habitId: string; date: string; done: boolean; value: number }) => void
  onEdit: () => void
}) {
  const done = doneDates(habit, logs)
  const todayLog = logs.find((row) => row.habit_id === habit.id && row.date === today)
  const streak = currentStreak(habit, done, today)
  const doneToday = isDone(habit, todayLog)
  const value = Number(todayLog?.value ?? 0)
  const target = habit.target === null ? null : Number(habit.target)

  return (
    <li className={cn('grid gap-2 rounded-lg border p-3', doneToday && 'bg-mode-life/5')}>
      <div className="flex items-center gap-3">
        {target === null ? (
          <Button
            size="icon"
            variant={doneToday ? 'default' : 'outline'}
            aria-pressed={doneToday}
            aria-label={doneToday ? `${habit.title}: done (tap to undo)` : `Tick off ${habit.title}`}
            disabled={busy}
            onClick={() => onLog({ habitId: habit.id, date: today, done: !doneToday, value: 0 })}
          >
            <Check aria-hidden />
          </Button>
        ) : (
          <div className="flex items-center gap-1" role="group" aria-label={`${habit.title}: ${value} of ${target}`}>
            <Button size="icon-sm" variant="outline" aria-label="One less" disabled={busy || value <= 0} onClick={() => onLog({ habitId: habit.id, date: today, done: false, value: value - 1 })}>
              <Minus aria-hidden />
            </Button>
            <span className={cn('min-w-12 text-center text-sm tabular-nums', doneToday && 'font-semibold text-mode-life')}>
              {value}/{target}
            </span>
            <Button size="icon-sm" variant="outline" aria-label="One more" disabled={busy} onClick={() => onLog({ habitId: habit.id, date: today, done: false, value: value + 1 })}>
              <Plus aria-hidden />
            </Button>
          </div>
        )}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onEdit}>
          <p className="truncate font-medium">{habit.title}</p>
          <p className="text-xs text-muted-foreground">
            {target === null ? '' : `${target} ${habit.unit ?? ''} · `}
            {daysLabel(habit.days_of_week)}
          </p>
        </button>
        {streak > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-sm tabular-nums" aria-label={`${streak}-day streak`}>
            <Flame className="size-4 text-mode-hustle" aria-hidden />
            {streak}
          </span>
        )}
      </div>
      <WeekDots week={lastWeek(habit, done, today)} />
    </li>
  )
}

const MARK_STYLE: Record<DayMark, string> = {
  done: 'bg-mode-life text-white',
  missed: 'border border-destructive/50 text-destructive',
  open: 'border border-primary/40',
  off: 'text-muted-foreground/50',
}
const MARK_LABEL: Record<DayMark, string> = { done: 'done', missed: 'missed', open: 'not yet', off: 'not scheduled' }

function WeekDots({ week }: { week: { date: string; mark: DayMark }[] }) {
  return (
    <ol className="flex gap-1.5" aria-label="The last 7 days">
      {week.map((day) => (
        <li key={day.date} className={cn('flex size-6 items-center justify-center rounded-full text-[10px]', MARK_STYLE[day.mark])} aria-label={`${format(parseISO(day.date), 'EEEE')}: ${MARK_LABEL[day.mark]}`}>
          {format(parseISO(day.date), 'EEEEE')}
        </li>
      ))}
    </ol>
  )
}

function HabitForm({ habit, onDone }: { habit: Habit | null; onDone: () => void }) {
  const [title, setTitle] = useState(habit?.title ?? '')
  const [kind, setKind] = useState<HabitKind>(habit ? toHabitKind(habit.kind) : 'custom')
  const [days, setDays] = useState<string[]>((habit?.days_of_week ?? ALL_DAYS).map(String))
  const [counted, setCounted] = useState(habit !== null && habit.target !== null)
  const [target, setTarget] = useState(habit?.target === null || habit === null ? '8' : String(Number(habit.target)))
  const [unit, setUnit] = useState(habit?.unit ?? 'glasses')
  const save = useLifeMutation(saveHabit)
  const archive = useLifeMutation(archiveHabit)

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate(
      { id: habit?.id, title, kind, days: days.map(Number), target: counted ? Number(target) : null, unit: counted ? unit : null },
      { onSuccess: onDone },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{habit ? 'Change the habit' : 'A new habit'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <Label className="grid gap-1.5 font-normal">
            <span className="text-sm text-muted-foreground">Name</span>
            <Input value={title} maxLength={80} placeholder="e.g. Drink water" onChange={(event) => setTitle(event.target.value)} />
          </Label>
          <div className="grid gap-1.5">
            <span className="text-sm text-muted-foreground">Kind</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind">
              {HABIT_KINDS.map((option) => (
                <Button key={option} type="button" size="sm" variant={option === kind ? 'secondary' : 'outline'} aria-pressed={option === kind} onClick={() => setKind(option)}>
                  {HABIT_KIND_LABEL[option]}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm text-muted-foreground">Days</span>
            <ToggleGroup type="multiple" variant="outline" value={days} onValueChange={setDays} aria-label="Days">
              {DAYS.map((day) => (
                <ToggleGroupItem key={day.value} value={String(day.value)} aria-label={day.name}>
                  {day.short}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={counted} onCheckedChange={(checked) => setCounted(checked === true)} />
            Count it (e.g. 8 glasses a day)
          </Label>
          {counted && (
            <div className="grid grid-cols-2 gap-3">
              <Label className="grid gap-1.5 font-normal">
                <span className="text-sm text-muted-foreground">Each day</span>
                <Input type="number" inputMode="decimal" min={1} value={target} onChange={(event) => setTarget(event.target.value)} />
              </Label>
              <Label className="grid gap-1.5 font-normal">
                <span className="text-sm text-muted-foreground">Unit</span>
                <Input value={unit} maxLength={20} onChange={(event) => setUnit(event.target.value)} />
              </Label>
            </div>
          )}
          {(save.error ?? archive.error) && (
            <p role="alert" className="text-sm text-destructive">
              {(save.error ?? archive.error)?.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              {habit ? 'Save' : 'Add habit'}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            {habit && (
              <Button type="button" variant="ghost" className="ml-auto text-destructive" disabled={archive.isPending} onClick={() => archive.mutate(habit.id, { onSuccess: onDone })}>
                Remove
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
