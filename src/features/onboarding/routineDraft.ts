import { parseTime } from '@/features/planner/time'
import type { RoutineBlock, RoutineKind } from '@/features/planner/types'

// The routine part of onboarding: what the form holds, how it becomes routine_blocks rows
// (and back, for editing), and the checks before saving. Pure functions, tested on their own.

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
export const WEEKDAYS = [1, 2, 3, 4, 5]
export const MEALS = ['Breakfast', 'Lunch', 'Dinner'] as const
export type MealName = (typeof MEALS)[number]

/** One repeating block in the form, e.g. "Classes, Mon–Fri, 09:00–16:00". */
export interface TimeBlockDraft {
  /** Only used to keep React lists stable. */
  id: string
  title: string
  /** 0 = Sunday … 6 = Saturday */
  days: number[]
  /** 'HH:MM' */
  start: string
  end: string
}

export interface MealDraft {
  on: boolean
  start: string
  end: string
}

export interface RoutineDraft {
  wake: string
  bed: string
  classes: TimeBlockDraft[]
  gym: TimeBlockDraft | null
  meals: Record<MealName, MealDraft>
  /** Commute and anything else fixed. */
  other: TimeBlockDraft[]
}

/** A routine_blocks row without the columns the database fills in itself. */
export interface RoutineRowDraft {
  kind: RoutineKind
  title: string
  days_of_week: number[]
  start_time: string
  end_time: string
}

/** The fields of a saved routine_blocks row that we read back. */
export interface RoutineRowLike {
  kind: string
  title: string
  days_of_week: number[]
  start_time: string
  end_time: string
  valid_from?: string | null
  valid_to?: string | null
}

let lastId = 0
export function newBlockId(): string {
  lastId += 1
  return `block-${lastId}`
}

/** A typical college week, used until the student changes it. */
export function defaultRoutine(): RoutineDraft {
  return {
    wake: '07:00',
    bed: '23:00',
    classes: [{ id: newBlockId(), title: 'Classes', days: [...WEEKDAYS], start: '09:00', end: '16:00' }],
    gym: null,
    meals: {
      Breakfast: { on: true, start: '08:00', end: '08:30' },
      Lunch: { on: true, start: '13:00', end: '13:45' },
      Dinner: { on: true, start: '20:30', end: '21:15' },
    },
    other: [],
  }
}

const DEFAULT_TITLES: Record<RoutineKind, string> = {
  class: 'Classes',
  sleep: 'Sleep',
  gym: 'Gym',
  meal: 'Meal',
  commute: 'Commute',
  custom: 'Fixed time',
}

function toRow(kind: RoutineKind, block: TimeBlockDraft): RoutineRowDraft {
  return {
    kind,
    title: block.title.trim() || DEFAULT_TITLES[kind],
    days_of_week: [...block.days].sort((a, b) => a - b),
    start_time: block.start,
    end_time: block.end,
  }
}

/** The form → routine_blocks rows. Sleep runs from bedtime to wake-up time, every night. */
export function routineToRows(draft: RoutineDraft): RoutineRowDraft[] {
  const rows: RoutineRowDraft[] = [
    { kind: 'sleep', title: 'Sleep', days_of_week: [...ALL_DAYS], start_time: draft.bed, end_time: draft.wake },
  ]
  for (const block of draft.classes) rows.push(toRow('class', block))
  if (draft.gym) rows.push(toRow('gym', draft.gym))
  for (const meal of MEALS) {
    const { on, start, end } = draft.meals[meal]
    if (on) rows.push({ kind: 'meal', title: meal, days_of_week: [...ALL_DAYS], start_time: start, end_time: end })
  }
  for (const block of draft.other) rows.push(toRow('custom', block))
  return rows
}

const hhmm = (time: string) => time.slice(0, 5) // the database stores '07:00:00'

function toDraft(row: RoutineRowLike): TimeBlockDraft {
  return { id: newBlockId(), title: row.title, days: [...row.days_of_week], start: hhmm(row.start_time), end: hhmm(row.end_time) }
}

/** Saved rows → the form, so the routine can be edited later. No rows → the default week. */
export function rowsToRoutine(rows: RoutineRowLike[]): RoutineDraft {
  const draft = defaultRoutine()
  if (rows.length === 0) return draft

  const sleep = rows.find((row) => row.kind === 'sleep')
  if (sleep) {
    draft.bed = hhmm(sleep.start_time)
    draft.wake = hhmm(sleep.end_time)
  }
  draft.classes = rows.filter((row) => row.kind === 'class').map(toDraft)
  const gym = rows.find((row) => row.kind === 'gym')
  draft.gym = gym ? toDraft(gym) : null
  for (const meal of MEALS) {
    const saved = rows.find((row) => row.kind === 'meal' && row.title === meal)
    draft.meals[meal] = saved
      ? { on: true, start: hhmm(saved.start_time), end: hhmm(saved.end_time) }
      : { ...draft.meals[meal], on: false }
  }
  draft.other = rows.filter((row) => row.kind === 'custom' || row.kind === 'commute').map(toDraft)
  return draft
}

function minutesOf(time: string): number | null {
  try {
    return parseTime(time)
  } catch {
    return null
  }
}

/** Problems to fix before saving, in plain words. An empty list means everything is fine. */
export function validateRoutine(draft: RoutineDraft): string[] {
  const problems: string[] = []
  const wake = minutesOf(draft.wake)
  const bed = minutesOf(draft.bed)
  if (wake === null || bed === null) {
    problems.push('Pick both a wake-up time and a bedtime.')
  } else {
    const sleepMinutes = (wake - bed + 1440) % 1440
    if (sleepMinutes < 3 * 60 || sleepMinutes > 14 * 60) {
      problems.push(`Check your sleep times: that's ${Math.round(sleepMinutes / 60)} hours of sleep.`)
    }
  }

  const checkBlock = (block: TimeBlockDraft, name: string, mayCrossMidnight: boolean) => {
    const start = minutesOf(block.start)
    const end = minutesOf(block.end)
    if (block.days.length === 0) problems.push(`Pick at least one day for "${name}".`)
    if (start === null || end === null) problems.push(`Pick a start and an end time for "${name}".`)
    else if (start === end) problems.push(`"${name}" starts and ends at the same time.`)
    else if (end < start && !mayCrossMidnight) problems.push(`"${name}" ends before it starts.`)
  }
  for (const block of draft.classes) checkBlock(block, block.title.trim() || 'Classes', false)
  if (draft.gym) checkBlock(draft.gym, draft.gym.title.trim() || 'Gym', false)
  for (const meal of MEALS) {
    const { on, start, end } = draft.meals[meal]
    if (on) checkBlock({ id: meal, title: meal, days: ALL_DAYS, start, end }, meal, false)
  }
  for (const block of draft.other) checkBlock(block, block.title.trim() || 'Fixed time', true)
  return problems
}

const KINDS: readonly RoutineKind[] = ['class', 'sleep', 'gym', 'meal', 'commute', 'custom']

/** Saved rows → what the planner needs. */
export function toPlannerRoutine(rows: RoutineRowLike[]): RoutineBlock[] {
  return rows.map((row) => ({
    kind: KINDS.find((kind) => kind === row.kind) ?? 'custom',
    title: row.title,
    daysOfWeek: row.days_of_week,
    start: hhmm(row.start_time),
    end: hhmm(row.end_time),
    validFrom: row.valid_from ?? null,
    validTo: row.valid_to ?? null,
  }))
}
