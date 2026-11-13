import type { LocalDate, Minute } from '@/features/planner/types'

export const COMMON_TIMEZONES: readonly string[] = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
]

export function isValidTimezone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone || typeof timeZone !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

export function browserTimezone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (isValidTimezone(resolved)) return resolved
  } catch {
    // Non-Intl environment.
  }
  return 'UTC'
}

export function resolveTimezone(saved?: string | null): string {
  return isValidTimezone(saved) ? saved : browserTimezone()
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export interface ZonedTimeParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** 'YYYY-MM-DD' in the requested IANA timezone. */
  date: LocalDate
  /** 0 = Sunday ... 6 = Saturday in the requested IANA timezone. */
  weekday: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    })
    formatterCache.set(timeZone, fmt)
  }
  return fmt
}

function toDate(at: Date | string | number): Date {
  return at instanceof Date ? at : new Date(at)
}

/** Breaks an instant down into wall-clock calendar and clock parts inside `timeZone`. */
export function timePartsInTimezone(at: Date | string | number, timeZone: string): ZonedTimeParts {
  const zone = resolveTimezone(timeZone)
  const parts = getPartsFormatter(zone).formatToParts(toDate(at))
  let year = 1970
  let month = 1
  let day = 1
  let hour = 0
  let minute = 0
  let weekday = 0

  for (const part of parts) {
    if (part.type === 'year') year = Number(part.value)
    else if (part.type === 'month') month = Number(part.value)
    else if (part.type === 'day') day = Number(part.value)
    else if (part.type === 'hour') hour = Number(part.value) % 24
    else if (part.type === 'minute') minute = Number(part.value)
    else if (part.type === 'weekday') weekday = WEEKDAY_MAP[part.value] ?? 0
  }

  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { year, month, day, hour, minute, date, weekday }
}

/** Calendar date `'YYYY-MM-DD'` of an instant inside `timeZone`. */
export function dateKeyInTimezone(at: Date | string | number, timeZone: string): LocalDate {
  return timePartsInTimezone(at, timeZone).date
}

/** Minutes after midnight (`0..1439`) inside `timeZone`. */
export function minuteOfInTimezone(at: Date | string | number, timeZone: string): Minute {
  const parts = timePartsInTimezone(at, timeZone)
  return parts.hour * 60 + parts.minute
}

/** Clock string `'HH:MM'` inside `timeZone`. */
export function clockInTimezone(at: Date | string | number, timeZone: string): string {
  const parts = timePartsInTimezone(at, timeZone)
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

/**
 * Converts a local calendar date (`YYYY-MM-DD`) and minute offset in `timeZone`
 * into an exact UTC ISO-8601 timestamp string (`timestamptz`), independent of the
 * machine's local timezone and DST-aware via two-pass offset resolution.
 */
export function zonedLocalToIso(date: LocalDate, minute: Minute, timeZone: string): string {
  const zone = resolveTimezone(timeZone)
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number)
  const baseUtc = Date.UTC(year, month - 1, day, 0, minute, 0, 0)

  // First guess: treat target wall clock as UTC, measure zone offset there, then adjust.
  const firstParts = timePartsInTimezone(baseUtc, zone)
  const firstAsUtc = Date.UTC(firstParts.year, firstParts.month - 1, firstParts.day, firstParts.hour, firstParts.minute, 0, 0)
  const guess = baseUtc - (firstAsUtc - baseUtc)

  // Second pass handles DST boundaries cleanly.
  const secondParts = timePartsInTimezone(guess, zone)
  const secondAsUtc = Date.UTC(secondParts.year, secondParts.month - 1, secondParts.day, secondParts.hour, secondParts.minute, 0, 0)
  return new Date(guess - (secondAsUtc - baseUtc)).toISOString()
}

/** Formats a long date header (e.g. "Friday, 13 November") inside `timeZone`. */
export function formatLongDateInTimezone(at: Date | string | number, timeZone: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: resolveTimezone(timeZone),
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(toDate(at))
}

export function formatShortDateInTimezone(at: Date | string | number, timeZone: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: resolveTimezone(timeZone),
    day: 'numeric',
    month: 'short',
  }).format(toDate(at))
}
