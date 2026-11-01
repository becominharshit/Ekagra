import { addDays, format, parseISO } from 'date-fns'
import type { Tables } from '@/types/database'

// Attendance maths. Colleges need a minimum share of classes (75% unless changed), so for every
// subject this works out where you stand and what you can still afford:
//   A = classes attended, T = classes held (cancelled ones don't count), r = the minimum (0.75)
//   safe bunks         = ⌊A / r − T⌋            classes you can still miss and stay at r
//   classes to recover = ⌈(rT − A) / (1 − r)⌉   classes in a row to attend to get back to r
//   rest of semester   = ⌊A + R − r(T + R)⌋     of the R classes left, how many you can miss
// Pure functions (no storage), tested on their own.

export type Attendance = Tables<'attendance'>

export const ATTENDANCE_STATUSES = ['present', 'absent', 'cancelled'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const STATUS_LABEL: Record<AttendanceStatus, string> = { present: 'Present', absent: 'Absent', cancelled: 'Cancelled' }

/** The minimum when the settings don't say. */
export const DEFAULT_MIN_PERCENT = 75

/** Room for rounding: 0.1 + 0.2 isn't exactly 0.3 in JavaScript. */
const EPSILON = 1e-9

export interface Tally {
  /** Classes that took place (present or absent). */
  held: number
  attended: number
}

export function toStatus(value: string): AttendanceStatus | null {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value) ? (value as AttendanceStatus) : null
}

export function tally(rows: { status: string }[]): Tally {
  let held = 0
  let attended = 0
  for (const row of rows) {
    if (row.status === 'present') attended += 1
    if (row.status === 'present' || row.status === 'absent') held += 1
  }
  return { held, attended }
}

/** Attendance in %, or null before the first class. */
export function percent({ held, attended }: Tally): number | null {
  return held === 0 ? null : (attended / held) * 100
}

/** How many more classes can be missed while staying at or above the minimum (0 when already below). */
export function safeBunks({ held, attended }: Tally, minPercent: number): number {
  const share = minPercent / 100
  if (share <= 0) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor(attended / share - held + EPSILON))
}

/** Classes in a row to attend to get back to the minimum (0 when already there; Infinity at a 100% minimum). */
export function classesToRecover({ held, attended }: Tally, minPercent: number): number {
  const share = minPercent / 100
  const gap = share * held - attended
  if (gap <= EPSILON) return 0
  if (share >= 1) return Number.POSITIVE_INFINITY
  return Math.ceil(gap / (1 - share) - EPSILON)
}

/** none = no classes yet; short = under the minimum; low = at most one more miss allowed; safe. */
export type AttendanceState = 'none' | 'safe' | 'low' | 'short'

export function attendanceState(count: Tally, minPercent: number): AttendanceState {
  const share = percent(count)
  if (share === null) return 'none'
  if (share < minPercent - EPSILON) return 'short'
  return safeBunks(count, minPercent) < 2 ? 'low' : 'safe'
}

export interface Outlook {
  /** The best you can still finish with (attending every class left), in %. */
  best: number
  /** How many of the classes left you can miss and still finish at the minimum. */
  canMiss: number
  /** False when even every class left isn't enough. */
  reachable: boolean
}

/** The rest of the semester, if all `remaining` classes take place. */
export function semesterOutlook({ held, attended }: Tally, remaining: number, minPercent: number): Outlook | null {
  const total = held + remaining
  if (total === 0) return null
  const spare = attended + remaining - (minPercent / 100) * total
  return { best: ((attended + remaining) / total) * 100, canMiss: Math.max(0, Math.floor(spare + EPSILON)), reachable: spare >= -EPSILON }
}

/** A class time from the routine: a class block that names its subject. */
export interface ClassSlot {
  subjectId: string
  /** 'HH:MM' */
  start: string
  end: string
  /** 0 = Sunday … 6 = Saturday */
  daysOfWeek: number[]
  validFrom: string | null
  validTo: string | null
}

/** '09:00:00' (database) or '09:00' → '09:00'. */
export const hhmm = (time: string) => time.slice(0, 5)

/** '09:00' → '09:00:00', how the database gives times back (so the same class always matches). */
export const dbTime = (time: string) => `${hhmm(time)}:00`

interface RoutineRowLike {
  kind: string
  subject_id?: string | null
  start_time: string
  end_time: string
  days_of_week: number[]
  valid_from?: string | null
  valid_to?: string | null
}

/** The routine's class blocks that name one of these subjects (a deleted subject's blocks are left out). */
export function classSlots(rows: RoutineRowLike[], subjectIds: ReadonlySet<string>): ClassSlot[] {
  const slots: ClassSlot[] = []
  for (const row of rows) {
    if (row.kind !== 'class' || !row.subject_id || !subjectIds.has(row.subject_id)) continue
    slots.push({
      subjectId: row.subject_id,
      start: hhmm(row.start_time),
      end: hhmm(row.end_time),
      daysOfWeek: row.days_of_week,
      validFrom: row.valid_from ?? null,
      validTo: row.valid_to ?? null,
    })
  }
  return slots
}

/** The classes on a date ('YYYY-MM-DD'), earliest first. */
export function classesOn(slots: ClassSlot[], date: string): ClassSlot[] {
  const weekday = parseISO(date).getDay()
  return slots
    .filter((slot) => slot.daysOfWeek.includes(weekday) && (!slot.validFrom || slot.validFrom <= date) && (!slot.validTo || date <= slot.validTo))
    .sort((a, b) => a.start.localeCompare(b.start))
}

/** How many classes take place from `from` to `to` (dates, both included). */
export function classesBetween(slots: ClassSlot[], from: string, to: string): number {
  let count = 0
  // A semester is at most about half a year; the cap only stops a wrong date from looping for long.
  for (let day = parseISO(from), steps = 0; format(day, 'yyyy-MM-dd') <= to && steps < 400; day = addDays(day, 1), steps++) {
    count += classesOn(slots, format(day, 'yyyy-MM-dd')).length
  }
  return count
}

export interface DayClass {
  slot: ClassSlot
  /** How it was marked, or null while not marked yet. */
  status: AttendanceStatus | null
}

/** The classes on a date, with how each one was marked. */
export function classesWithStatus(slots: ClassSlot[], rows: Attendance[], date: string): DayClass[] {
  return classesOn(slots, date).map((slot) => {
    const row = rows.find((one) => one.subject_id === slot.subjectId && one.date === date && one.start_time !== null && hhmm(one.start_time) === slot.start)
    return { slot, status: row ? toStatus(row.status) : null }
  })
}

export interface SubjectAttendance {
  subjectId: string
  tally: Tally
  percent: number | null
  state: AttendanceState
  safeBunks: number
  toRecover: number
  /** Classes left this semester from the routine, or null without class times or a last day of classes. */
  remaining: number | null
  outlook: Outlook | null
}

/** Where a subject stands. `today` and `classesEndOn` are dates ('YYYY-MM-DD'). */
export function subjectAttendance({
  subjectId,
  rows,
  slots,
  minPercent,
  today,
  classesEndOn,
}: {
  subjectId: string
  rows: Attendance[]
  slots: ClassSlot[]
  minPercent: number
  today: string
  classesEndOn: string | null
}): SubjectAttendance {
  const own = rows.filter((row) => row.subject_id === subjectId)
  const count = tally(own)
  const ownSlots = slots.filter((slot) => slot.subjectId === subjectId)
  let remaining: number | null = null
  if (classesEndOn && ownSlots.length > 0) {
    const tomorrow = format(addDays(parseISO(today), 1), 'yyyy-MM-dd')
    // Today's classes count as left until they're marked.
    const leftToday = today <= classesEndOn ? classesWithStatus(ownSlots, own, today).filter((day) => day.status === null).length : 0
    remaining = leftToday + (tomorrow <= classesEndOn ? classesBetween(ownSlots, tomorrow, classesEndOn) : 0)
  }
  return {
    subjectId,
    tally: count,
    percent: percent(count),
    state: attendanceState(count, minPercent),
    safeBunks: safeBunks(count, minPercent),
    toRecover: classesToRecover(count, minPercent),
    remaining,
    outlook: remaining === null ? null : semesterOutlook(count, remaining, minPercent),
  }
}

/** One short line for a subject, e.g. "You can miss 3 more" or "Attend the next 4 classes to get back to 75%". */
export function attendanceAdvice(summary: SubjectAttendance, minPercent: number): string {
  const { state, safeBunks: canMiss, toRecover } = summary
  if (state === 'none') return 'No classes marked yet.'
  if (state === 'short') {
    return Number.isFinite(toRecover)
      ? `Attend the next ${toRecover} ${toRecover === 1 ? 'class' : 'classes'} to get back to ${minPercent}%.`
      : `Under ${minPercent}%, and a ${minPercent}% minimum can't be reached again after a missed class.`
  }
  if (canMiss === 0) return `Don't miss the next class: it would take you under ${minPercent}%.`
  return `You can miss ${canMiss} more ${canMiss === 1 ? 'class' : 'classes'} and stay at ${minPercent}% or above.`
}
