import { addDays, format, parseISO } from 'date-fns'
import type { Tables } from '@/types/database'

// Daily habits: when they're due, when they count as done, streaks and the week at a glance.
// A streak counts the scheduled days in a row that were done; days the habit isn't scheduled
// don't break it, and today only breaks it once the day is over. Pure functions, tested on their own.

export type Habit = Tables<'habits'>
export type HabitLog = Tables<'habit_logs'>

export const HABIT_KINDS = ['water', 'sleep', 'gym', 'meal', 'study', 'custom'] as const
export type HabitKind = (typeof HABIT_KINDS)[number]

export const HABIT_KIND_LABEL: Record<HabitKind, string> = { water: 'Water', sleep: 'Sleep', gym: 'Fitness', meal: 'Food', study: 'Study', custom: 'Other' }

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Habits many students start with, one tap each. */
export const SUGGESTED_HABITS: { title: string; kind: HabitKind; days: number[]; target: number | null; unit: string | null }[] = [
  { title: 'Drink water', kind: 'water', days: ALL_DAYS, target: 8, unit: 'glasses' },
  { title: 'Sleep by 23:30', kind: 'sleep', days: ALL_DAYS, target: null, unit: null },
  { title: 'Work out', kind: 'gym', days: [1, 3, 5], target: null, unit: null },
  { title: 'Read for 20 minutes', kind: 'study', days: ALL_DAYS, target: null, unit: null },
  { title: 'No phone for the first hour', kind: 'custom', days: ALL_DAYS, target: null, unit: null },
  { title: 'Eat a fruit', kind: 'meal', days: ALL_DAYS, target: null, unit: null },
]

/** Walking back further than this is never needed (and keeps a bad date from looping). */
const MAX_DAYS = 800

export function toHabitKind(value: string): HabitKind {
  return (HABIT_KINDS as readonly string[]).includes(value) ? (value as HabitKind) : 'custom'
}

export function isScheduled(habit: Pick<Habit, 'days_of_week'>, date: string): boolean {
  return habit.days_of_week.includes(parseISO(date).getDay())
}

/** Done when ticked, or when a counted habit reached its target (8 of 8 glasses). */
export function isDone(habit: Pick<Habit, 'target'>, log: Pick<HabitLog, 'done' | 'value'> | undefined): boolean {
  if (!log) return false
  return log.done || (habit.target !== null && Number(log.value) >= Number(habit.target))
}

/** The days a habit was done, from its logs. */
export function doneDates(habit: Pick<Habit, 'id' | 'target'>, logs: Pick<HabitLog, 'habit_id' | 'date' | 'done' | 'value'>[]): Set<string> {
  return new Set(logs.filter((log) => log.habit_id === habit.id && isDone(habit, log)).map((log) => log.date))
}

/** Scheduled days done in a row up to today (today counts once done, and doesn't break it before). */
export function currentStreak(habit: Pick<Habit, 'days_of_week'>, done: ReadonlySet<string>, today: string): number {
  let count = 0
  let day = parseISO(today)
  for (let steps = 0; steps < MAX_DAYS; steps++) {
    const date = format(day, 'yyyy-MM-dd')
    if (habit.days_of_week.includes(day.getDay())) {
      if (done.has(date)) count += 1
      else if (date !== today) break
    }
    day = addDays(day, -1)
  }
  return count
}

/** The longest run of scheduled days done, from the first time it was done until today. */
export function bestStreak(habit: Pick<Habit, 'days_of_week'>, done: ReadonlySet<string>, today: string): number {
  const first = [...done].filter((date) => date <= today).sort()[0]
  if (!first) return 0
  let best = 0
  let run = 0
  let day = parseISO(first)
  for (let steps = 0; steps < MAX_DAYS && format(day, 'yyyy-MM-dd') <= today; steps++) {
    const date = format(day, 'yyyy-MM-dd')
    if (habit.days_of_week.includes(day.getDay())) {
      if (done.has(date)) {
        run += 1
        best = Math.max(best, run)
      } else if (date !== today) {
        run = 0
      }
    }
    day = addDays(day, 1)
  }
  return best
}

export type DayMark = 'done' | 'missed' | 'open' | 'off'

/** The last 7 days, oldest first: done, missed, still open (today) or not scheduled (also before the habit existed). */
export function lastWeek(habit: Pick<Habit, 'days_of_week'> & { created_at?: string }, done: ReadonlySet<string>, today: string): { date: string; mark: DayMark }[] {
  const startedOn = habit.created_at ? format(new Date(habit.created_at), 'yyyy-MM-dd') : null
  return Array.from({ length: 7 }, (_, index) => {
    const date = format(addDays(parseISO(today), index - 6), 'yyyy-MM-dd')
    const before = startedOn !== null && date < startedOn && !done.has(date)
    const mark: DayMark = before || !isScheduled(habit, date) ? 'off' : done.has(date) ? 'done' : date === today ? 'open' : 'missed'
    return { date, mark }
  })
}

export interface HabitInput {
  title: string
  kind: HabitKind
  days: number[]
  /** A count to reach each day (e.g. 8), or null for done / not done. */
  target: number | null
  unit: string | null
}

/** Why a habit can't be saved, in plain words; null when it's fine. */
export function habitProblem(input: HabitInput): string | null {
  if (!input.title.trim()) return 'Give the habit a name.'
  if (input.title.trim().length > 80) return 'Keep the name under 80 characters.'
  if (input.days.length === 0) return 'Pick at least one day.'
  if (input.target !== null && (!Number.isFinite(input.target) || input.target <= 0 || input.target > 10000)) return 'The daily target is a number above 0.'
  if (input.unit && input.unit.trim().length > 20) return 'Keep the unit short, e.g. "glasses".'
  return null
}
