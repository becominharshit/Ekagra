import { addDays, format, parseISO } from 'date-fns'
import type { SleepSession } from '@/lib/native/healthBridge'
import type { Tables } from '@/types/database'

// Sleep and steps: each morning's night from Health Connect's sessions, one row per day, how
// regular sleep is, typed-in nights, and day-by-day values for the charts. Pure functions,
// tested on their own. Numbers to guide the student, not medical advice.

export type SleepLog = Tables<'sleep_logs'>
export type StepCount = Tables<'step_counts'>

/** The hours of sleep most young adults need (general guidance). */
export const SLEEP_AIM = { min: 7, max: 9 } as const

export interface Night {
  /** The morning the night ended, 'YYYY-MM-DD'. */
  date: string
  bedAt: string
  wakeAt: string
  /** Minutes asleep. */
  minutes: number
}

/** One night per morning from Health Connect's sessions: the longest one that ended that day (naps are left out). */
export function nightsFromSessions(sessions: SleepSession[]): Night[] {
  const byDate = new Map<string, SleepSession>()
  for (const session of sessions) {
    if (session.end <= session.start) continue
    const date = format(new Date(session.end), 'yyyy-MM-dd')
    const kept = byDate.get(date)
    if (!kept || session.end - session.start > kept.end - kept.start) byDate.set(date, session)
  }
  return [...byDate]
    .map(([date, session]) => ({
      date,
      bedAt: new Date(session.start).toISOString(),
      wakeAt: new Date(session.end).toISOString(),
      minutes: Math.min(1440, Math.max(0, Math.round(session.minutes))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** One row per date, oldest first: what the student typed if they did (they're correcting it), else Health Connect's. */
export function onePerDate<T extends { date: string; source: string }>(rows: T[]): T[] {
  const byDate = new Map<string, T>()
  for (const row of rows) {
    const kept = byDate.get(row.date)
    if (!kept || (kept.source !== 'manual' && row.source === 'manual')) byDate.set(row.date, row)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const minuteOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes()
/** Bedtimes are counted from noon, so 23:30 and 00:30 are an hour apart (not 23 hours). */
const fromNoon = (date: Date) => (minuteOfDay(date) - 720 + 1440) % 1440

function deviation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

/**
 * How regular sleep is, 0–100: 100 = to bed and up at the same times every day. It drops about 8
 * points for every 10 minutes the times wander (0 at 2 hours). Null with fewer than 3 nights.
 */
export function sleepRegularity(nights: { bed_at: string; wake_at: string }[]): number | null {
  if (nights.length < 3) return null
  const bed = deviation(nights.map((night) => fromNoon(parseISO(night.bed_at))))
  const wake = deviation(nights.map((night) => minuteOfDay(parseISO(night.wake_at))))
  return Math.max(0, Math.min(100, Math.round(100 - ((bed + wake) / 2) * (100 / 120))))
}

/** A regularity score in words. */
export function regularityLabel(score: number): string {
  if (score >= 80) return 'Very regular'
  if (score >= 60) return 'Fairly regular'
  return 'Irregular times'
}

export function average(values: number[]): number | null {
  return values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** A typed night: bedtime and wake time ('HH:MM') for the morning `date`; a bedtime later than the wake time was the evening before. */
export function nightFromTimes(date: string, bed: string, wake: string): { night: Night } | { problem: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { problem: 'Pick the morning you woke up.' }
  if (!TIME.test(bed) || !TIME.test(wake)) return { problem: 'Enter both times, e.g. 23:30 and 07:00.' }
  const wakeAt = parseISO(`${date}T${wake}`)
  const sameDay = parseISO(`${date}T${bed}`)
  const bedAt = sameDay.getTime() < wakeAt.getTime() ? sameDay : addDays(sameDay, -1)
  const minutes = Math.round((wakeAt.getTime() - bedAt.getTime()) / 60_000)
  if (minutes > 16 * 60) return { problem: "That's more than 16 hours: check the times." }
  return { night: { date, bedAt: bedAt.toISOString(), wakeAt: wakeAt.toISOString(), minutes } }
}

/** A value for each of the last `days` days, oldest first, today last; null where there's nothing. */
export function dailyValues<T extends { date: string }>(rows: T[], today: string, days: number, value: (row: T) => number): { date: string; value: number | null }[] {
  const byDate = new Map(rows.map((row) => [row.date, value(row)]))
  return Array.from({ length: days }, (_, index) => {
    const date = format(addDays(parseISO(today), index - days + 1), 'yyyy-MM-dd')
    return { date, value: byDate.get(date) ?? null }
  })
}
