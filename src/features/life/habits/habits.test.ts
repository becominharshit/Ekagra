import { describe, expect, it } from 'vitest'
import { bestStreak, currentStreak, doneDates, habitProblem, isDone, isScheduled, lastWeek } from './habits'

// Monday 2 November … Sunday 8 November 2026.
const EVERY_DAY = { id: 'water', days_of_week: [0, 1, 2, 3, 4, 5, 6], target: null }
const MON_WED_FRI = { id: 'gym', days_of_week: [1, 3, 5], target: null }

describe('when a habit is due and done', () => {
  it('follows its days of the week', () => {
    expect(isScheduled(MON_WED_FRI, '2026-11-02')).toBe(true) // Monday
    expect(isScheduled(MON_WED_FRI, '2026-11-03')).toBe(false)
  })

  it('counts as done when ticked, or when a count reaches its target', () => {
    const water = { target: 8 }
    expect(isDone(water, { done: false, value: 8 })).toBe(true)
    expect(isDone(water, { done: false, value: 5 })).toBe(false)
    expect(isDone({ target: null }, { done: true, value: 0 })).toBe(true)
    expect(isDone(water, undefined)).toBe(false)
    const logs = [
      { habit_id: 'water', date: '2026-11-02', done: false, value: 8 },
      { habit_id: 'water', date: '2026-11-03', done: false, value: 3 },
      { habit_id: 'other', date: '2026-11-04', done: true, value: 0 },
    ]
    expect([...doneDates({ id: 'water', target: 8 }, logs)]).toEqual(['2026-11-02'])
  })
})

describe('streaks', () => {
  it('counts the days in a row, and today only breaks it once the day is over', () => {
    const done = new Set(['2026-11-05', '2026-11-06', '2026-11-07'])
    expect(currentStreak(EVERY_DAY, done, '2026-11-07')).toBe(3)
    expect(currentStreak(EVERY_DAY, done, '2026-11-08')).toBe(3) // Sunday not done yet: still 3
    expect(currentStreak(EVERY_DAY, done, '2026-11-09')).toBe(0) // Sunday was missed
  })

  it('skips the days the habit is not scheduled', () => {
    // Monday, Wednesday and Friday done: a 3-day streak, though Tuesday and Thursday were free.
    const done = new Set(['2026-11-02', '2026-11-04', '2026-11-06'])
    expect(currentStreak(MON_WED_FRI, done, '2026-11-08')).toBe(3)
    expect(currentStreak(MON_WED_FRI, new Set(['2026-11-02', '2026-11-06']), '2026-11-08')).toBe(1)
  })

  it('remembers the best streak', () => {
    const done = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-06', '2026-11-07'])
    expect(bestStreak(EVERY_DAY, done, '2026-11-08')).toBe(4)
    expect(bestStreak(EVERY_DAY, new Set(), '2026-11-08')).toBe(0)
  })
})

describe('lastWeek', () => {
  it('marks the last 7 days: done, missed, open today, or not scheduled', () => {
    const marks = lastWeek(MON_WED_FRI, new Set(['2026-11-02']), '2026-11-06').map((day) => day.mark)
    // Sat 31 Oct … Fri 6 Nov.
    expect(marks).toEqual(['off', 'off', 'done', 'off', 'missed', 'off', 'open'])
  })

  it("doesn't count days before the habit existed as missed", () => {
    const created = { days_of_week: [0, 1, 2, 3, 4, 5, 6], created_at: new Date(2026, 10, 5, 9).toISOString() }
    const marks = lastWeek(created, new Set(['2026-11-05']), '2026-11-06').map((day) => day.mark)
    expect(marks).toEqual(['off', 'off', 'off', 'off', 'off', 'done', 'open'])
  })
})

describe('habitProblem', () => {
  it('checks the name, the days and the target', () => {
    const habit = { title: 'Drink water', kind: 'water' as const, days: [1], target: 8, unit: 'glasses' }
    expect(habitProblem(habit)).toBeNull()
    expect(habitProblem({ ...habit, title: ' ' })).toMatch(/name/)
    expect(habitProblem({ ...habit, days: [] })).toMatch(/one day/)
    expect(habitProblem({ ...habit, target: 0 })).toMatch(/above 0/)
  })
})
