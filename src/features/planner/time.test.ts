import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayOfWeek,
  daysBetween,
  formatTime,
  freeIntervals,
  mergeIntervals,
  parseTime,
  routineIntervals,
  subtractIntervals,
} from './time'
import type { RoutineBlock } from './types'

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
const SLEEP: RoutineBlock = { kind: 'sleep', title: 'Sleep', daysOfWeek: EVERY_DAY, start: '23:00', end: '07:00' }
const CLASSES: RoutineBlock = { kind: 'class', title: 'Classes', daysOfWeek: [1, 2, 3, 4, 5], start: '09:00', end: '13:00' }
const SUNDAY = '2026-11-01'
const MONDAY = '2026-11-02'

describe('times of day', () => {
  it('turns HH:MM into minutes after midnight and back', () => {
    expect(parseTime('00:00')).toBe(0)
    expect(parseTime('07:30')).toBe(450)
    expect(parseTime('23:59')).toBe(1439)
    expect(parseTime('24:00')).toBe(1440)
    expect(parseTime('07:30:00')).toBe(450) // the database's "time" format
    expect(formatTime(450)).toBe('07:30')
  })

  it('rejects anything that is not a real HH:MM time', () => {
    for (const bad of ['7:30', '25:00', '24:30', '12:60', 'noon', '']) {
      expect(() => parseTime(bad), bad).toThrow(/Invalid time/)
    }
  })
})

describe('local dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays(SUNDAY, 14)).toBe('2026-11-15')
  })

  it('counts the days between two dates', () => {
    expect(daysBetween(SUNDAY, '2026-11-22')).toBe(21)
    expect(daysBetween('2026-11-22', SUNDAY)).toBe(-21)
  })

  it('knows the weekday (0 = Sunday)', () => {
    expect(dayOfWeek(SUNDAY)).toBe(0)
    expect(dayOfWeek(MONDAY)).toBe(1)
  })

  it('rejects dates that do not exist', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(/Invalid date/)
    expect(() => addDays('01/11/2026', 1)).toThrow(/Invalid date/)
  })
})

describe('intervals', () => {
  it('merges intervals that overlap or touch', () => {
    const merged = mergeIntervals([
      { start: 60, end: 120 },
      { start: 0, end: 30 },
      { start: 100, end: 150 },
      { start: 150, end: 160 },
    ])
    expect(merged).toEqual([
      { start: 0, end: 30 },
      { start: 60, end: 160 },
    ])
  })

  it('removes busy time from free time', () => {
    const left = subtractIntervals([{ start: 0, end: 600 }], [
      { start: 100, end: 200 },
      { start: 550, end: 700 },
    ])
    expect(left).toEqual([
      { start: 0, end: 100 },
      { start: 200, end: 550 },
    ])
  })
})

describe('routine and free time', () => {
  it("covers last night's sleep after midnight and tonight's sleep before midnight", () => {
    expect(routineIntervals([SLEEP], SUNDAY)).toEqual([
      { start: 0, end: 420 },
      { start: 1380, end: 1440 },
    ])
  })

  it('uses blocks only on their weekdays', () => {
    expect(routineIntervals([CLASSES], SUNDAY)).toEqual([])
    expect(routineIntervals([CLASSES], MONDAY)).toEqual([{ start: 540, end: 780 }])
  })

  it('carries a late-night block into the next morning', () => {
    const fridayShift: RoutineBlock = { kind: 'custom', title: 'Night shift', daysOfWeek: [5], start: '22:00', end: '02:00' }
    expect(routineIntervals([fridayShift], '2026-11-06')).toEqual([{ start: 1320, end: 1440 }]) // Friday
    expect(routineIntervals([fridayShift], '2026-11-07')).toEqual([{ start: 0, end: 120 }]) // Saturday
  })

  it('respects valid-from and valid-to dates', () => {
    const newTimetable: RoutineBlock = { ...CLASSES, validFrom: '2026-11-03', validTo: '2026-11-04' }
    expect(routineIntervals([newTimetable], MONDAY)).toEqual([])
    expect(routineIntervals([newTimetable], '2026-11-03')).toEqual([{ start: 540, end: 780 }])
    expect(routineIntervals([newTimetable], '2026-11-05')).toEqual([])
  })

  it('finds free time after "now" and skips gaps too short to use', () => {
    expect(freeIntervals([SLEEP, CLASSES], MONDAY)).toEqual([
      { start: 420, end: 540 },
      { start: 780, end: 1380 },
    ])
    expect(freeIntervals([SLEEP, CLASSES], MONDAY, 600)).toEqual([{ start: 780, end: 1380 }])

    const lunch: RoutineBlock = { kind: 'meal', title: 'Lunch', daysOfWeek: EVERY_DAY, start: '13:10', end: '14:00' }
    // 13:00–13:10 between classes and lunch is only 10 minutes: left out.
    expect(freeIntervals([SLEEP, CLASSES, lunch], MONDAY, 0, 15)).toEqual([
      { start: 420, end: 540 },
      { start: 840, end: 1380 },
    ])
  })
})
