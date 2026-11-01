import type { AttendanceState, ClassSlot } from './attendance'

// How attendance is shown: colours for the states, percentages and class times.

export const STATE_TONE: Record<AttendanceState, string> = {
  none: 'bg-muted text-muted-foreground',
  safe: 'bg-mode-life/15 text-mode-life',
  low: 'bg-mode-hustle/15 text-mode-hustle',
  short: 'bg-destructive/10 text-destructive',
}

export const STATE_LABEL: Record<AttendanceState, string> = { none: 'No classes yet', safe: 'Safe', low: 'Close to the minimum', short: 'Shortage' }

/** 74.96 → "74.9%": rounded down, so a share just under the minimum never looks like it. */
export function percentLabel(value: number | null): string {
  if (value === null) return '–'
  const down = Math.floor(value * 10 + 1e-9) / 10
  return `${Number.isInteger(down) ? down : down.toFixed(1)}%`
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Monday first, like most college timetables. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** "Mon, Wed 09:00–10:00 · Fri 14:00–16:00": the days of each class time, Monday first. */
export function slotsLabel(slots: ClassSlot[]): string {
  const byTime = new Map<string, Set<number>>()
  for (const slot of slots) {
    const time = `${slot.start}–${slot.end}`
    const days = byTime.get(time) ?? new Set<number>()
    for (const day of slot.daysOfWeek) days.add(day)
    byTime.set(time, days)
  }
  return [...byTime]
    .map(([time, days]) => ({ time, days: WEEK_ORDER.filter((day) => days.has(day)) }))
    .sort((a, b) => (a.days[0] === undefined ? 7 : WEEK_ORDER.indexOf(a.days[0])) - (b.days[0] === undefined ? 7 : WEEK_ORDER.indexOf(b.days[0])) || a.time.localeCompare(b.time))
    .map(({ time, days }) => `${days.map((day) => DAY_SHORT[day]).join(', ')} ${time}`)
    .join(' · ')
}
