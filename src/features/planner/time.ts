import type { Interval, LocalDate, Minute, RoutineBlock } from './types'

// Small helpers for local dates ('YYYY-MM-DD') and times of day (minutes after midnight).
// Dates are treated as plain calendar days (the math runs in UTC), so the device's own
// timezone can never change the result.

export const MINUTES_PER_DAY = 1440
const MS_PER_DAY = 86_400_000
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
// Accepts '07:30' and the database's '07:30:00' (seconds are ignored).
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::\d{2})?$/

/** '07:30' → 450. '24:00' is allowed and means the end of the day. */
export function parseTime(value: string): Minute {
  const match = TIME_PATTERN.exec(value)
  const hours = Number(match?.[1])
  const minutes = Number(match?.[2])
  if (!match || hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) {
    throw new Error(`Invalid time "${value}": use HH:MM, for example 07:30`)
  }
  return hours * 60 + minutes
}

/** 450 → '07:30' */
export function formatTime(minute: Minute): string {
  const hours = Math.floor(minute / 60)
  return `${String(hours).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function fromUtcMs(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10)
}

function toUtcMs(date: LocalDate): number {
  const match = DATE_PATTERN.exec(date)
  const ms = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN
  // Also rejects days that don't exist, like 2026-02-30.
  if (Number.isNaN(ms) || fromUtcMs(ms) !== date) throw new Error(`Invalid date "${date}": use YYYY-MM-DD`)
  return ms
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY)
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY)
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: LocalDate): number {
  return new Date(toUtcMs(date)).getUTCDay()
}

/** Sorts intervals and joins the ones that overlap or touch. Empty intervals are dropped. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((interval) => interval.end > interval.start).sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
    else merged.push({ ...interval })
  }
  return merged
}

/** The parts of `from` that are not covered by `remove`. */
export function subtractIntervals(from: Interval[], remove: Interval[]): Interval[] {
  let result = mergeIntervals(from)
  for (const cut of mergeIntervals(remove)) {
    result = result.flatMap((interval) => {
      if (cut.end <= interval.start || cut.start >= interval.end) return [interval]
      const parts: Interval[] = []
      if (cut.start > interval.start) parts.push({ start: interval.start, end: cut.start })
      if (cut.end < interval.end) parts.push({ start: cut.end, end: interval.end })
      return parts
    })
  }
  return result
}

export function totalMinutes(intervals: Interval[]): number {
  return intervals.reduce((total, interval) => total + (interval.end - interval.start), 0)
}

function isActiveOn(block: RoutineBlock, date: LocalDate): boolean {
  return (
    block.daysOfWeek.includes(dayOfWeek(date)) &&
    (!block.validFrom || date >= block.validFrom) &&
    (!block.validTo || date <= block.validTo)
  )
}

/** Busy times on `date` from the routine, including the part of last night's sleep after midnight. */
export function routineIntervals(routine: RoutineBlock[], date: LocalDate): Interval[] {
  const previousDay = addDays(date, -1)
  const busy: Interval[] = []
  for (const block of routine) {
    const start = parseTime(block.start)
    const end = parseTime(block.end)
    const overnight = end <= start
    if (isActiveOn(block, date)) busy.push({ start, end: overnight ? MINUTES_PER_DAY : end })
    if (overnight && isActiveOn(block, previousDay)) busy.push({ start: 0, end })
  }
  return mergeIntervals(busy)
}

/** Free time on `date` that's not in the routine, starting at `fromMinute`.
 *  Gaps shorter than `minMinutes` are left out because nothing useful fits in them. */
export function freeIntervals(
  routine: RoutineBlock[],
  date: LocalDate,
  fromMinute: Minute = 0,
  minMinutes = 0,
): Interval[] {
  const day: Interval = { start: Math.min(Math.max(0, fromMinute), MINUTES_PER_DAY), end: MINUTES_PER_DAY }
  return subtractIntervals([day], routineIntervals(routine, date)).filter((gap) => gap.end - gap.start >= minMinutes)
}
