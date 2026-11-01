import { describe, expect, it } from 'vitest'
import { freeIntervals } from '@/features/planner/time'
import {
  ALL_DAYS,
  defaultRoutine,
  routineToRows,
  rowsToRoutine,
  toPlannerRoutine,
  validateRoutine,
  type RoutineRowDraft,
  type RoutineRowLike,
} from './routineDraft'

const MONDAY = '2026-11-02'

/** Rows the way the database gives them back: times have seconds. */
function asSaved(rows: RoutineRowDraft[]): RoutineRowLike[] {
  return rows.map((row) => ({ ...row, start_time: `${row.start_time}:00`, end_time: `${row.end_time}:00` }))
}

describe('routineToRows', () => {
  it('turns the default week into sleep, classes and three meals', () => {
    expect(routineToRows(defaultRoutine()).map((row) => `${row.kind}: ${row.title}`)).toEqual([
      'sleep: Sleep',
      'class: Classes',
      'meal: Breakfast',
      'meal: Lunch',
      'meal: Dinner',
    ])
  })

  it('makes sleep run from bedtime to wake-up time, every night', () => {
    const [sleep] = routineToRows({ ...defaultRoutine(), bed: '22:45', wake: '06:30' })
    expect(sleep).toEqual({ kind: 'sleep', title: 'Sleep', days_of_week: ALL_DAYS, start_time: '22:45', end_time: '06:30' })
  })

  it('adds gym and other fixed times, skips meals that are off and fills in empty names', () => {
    const draft = defaultRoutine()
    draft.meals.Breakfast.on = false
    draft.gym = { id: 'gym', title: '  ', days: [5, 1, 3], start: '18:00', end: '19:00' }
    draft.other = [{ id: 'bus', title: 'Commute', days: [1, 2], start: '08:15', end: '08:45' }]

    const rows = routineToRows(draft)

    expect(rows.map((row) => row.title)).not.toContain('Breakfast')
    expect(rows).toContainEqual({ kind: 'gym', title: 'Gym', days_of_week: [1, 3, 5], start_time: '18:00', end_time: '19:00' })
    expect(rows).toContainEqual({ kind: 'custom', title: 'Commute', days_of_week: [1, 2], start_time: '08:15', end_time: '08:45' })
  })
})

describe('rowsToRoutine', () => {
  it('gives back the same routine that was saved, so it can be edited later', () => {
    const draft = defaultRoutine()
    draft.wake = '06:00'
    draft.meals.Dinner.on = false
    draft.classes.push({ id: 'lab', title: 'Lab', days: [6], start: '10:00', end: '12:00' })
    draft.gym = { id: 'gym', title: 'Gym', days: [1, 3, 5], start: '18:00', end: '19:00' }
    draft.other = [{ id: 'shift', title: 'Night shift', days: [6], start: '22:00', end: '02:00' }]
    const rows = routineToRows(draft)

    expect(routineToRows(rowsToRoutine(asSaved(rows)))).toEqual(rows)
  })

  it('uses the default week when nothing is saved yet', () => {
    expect(routineToRows(rowsToRoutine([]))).toEqual(routineToRows(defaultRoutine()))
  })

  it('keeps classes and meals that were removed, removed', () => {
    const draft = rowsToRoutine(
      asSaved([{ kind: 'sleep', title: 'Sleep', days_of_week: ALL_DAYS, start_time: '23:00', end_time: '07:00' }]),
    )
    expect(draft.classes).toEqual([])
    expect(Object.values(draft.meals).map((meal) => meal.on)).toEqual([false, false, false])
  })
})

describe('validateRoutine', () => {
  it('accepts the default week', () => {
    expect(validateRoutine(defaultRoutine())).toEqual([])
  })

  it('asks for missing sleep times', () => {
    expect(validateRoutine({ ...defaultRoutine(), wake: '' })).toEqual(['Pick both a wake-up time and a bedtime.'])
  })

  it('catches sleep that is too short or too long', () => {
    expect(validateRoutine({ ...defaultRoutine(), bed: '05:00', wake: '07:00' })).toEqual([
      "Check your sleep times: that's 2 hours of sleep.",
    ])
    expect(validateRoutine({ ...defaultRoutine(), bed: '18:00', wake: '10:00' })).toEqual([
      "Check your sleep times: that's 16 hours of sleep.",
    ])
  })

  it('catches blocks without days, with the same start and end, or ending before they start', () => {
    const draft = defaultRoutine()
    draft.classes = [
      { id: 'a', title: 'Labs', days: [], start: '14:00', end: '12:00' },
      { id: 'b', title: '', days: [1], start: '10:00', end: '10:00' },
    ]
    expect(validateRoutine(draft)).toEqual([
      'Pick at least one day for "Labs".',
      '"Labs" ends before it starts.',
      '"Classes" starts and ends at the same time.',
    ])
  })

  it('lets other fixed times cross midnight, like a night shift', () => {
    const draft = defaultRoutine()
    draft.other = [{ id: 'shift', title: 'Night shift', days: [6], start: '22:00', end: '02:00' }]
    expect(validateRoutine(draft)).toEqual([])
  })

  it('ignores the times of meals that are switched off', () => {
    const draft = defaultRoutine()
    draft.meals.Lunch = { on: false, start: '', end: '' }
    expect(validateRoutine(draft)).toEqual([])
  })
})

describe('toPlannerRoutine', () => {
  it('turns saved rows into planner blocks', () => {
    const [sleep] = toPlannerRoutine(asSaved(routineToRows(defaultRoutine())))
    expect(sleep).toEqual({
      kind: 'sleep',
      title: 'Sleep',
      daysOfWeek: ALL_DAYS,
      start: '23:00',
      end: '07:00',
      validFrom: null,
      validTo: null,
    })
  })

  it('leaves the planner the right free time on a weekday', () => {
    const routine = toPlannerRoutine(asSaved(routineToRows(defaultRoutine())))
    // Up at 07:00, breakfast 08:00–08:30, classes 09:00–16:00 (lunch is inside), dinner 20:30–21:15, bed at 23:00.
    expect(freeIntervals(routine, MONDAY)).toEqual([
      { start: 7 * 60, end: 8 * 60 },
      { start: 8 * 60 + 30, end: 9 * 60 },
      { start: 16 * 60, end: 20 * 60 + 30 },
      { start: 21 * 60 + 15, end: 23 * 60 },
    ])
  })

  it('treats kinds it does not know as custom', () => {
    const [block] = toPlannerRoutine([
      { kind: 'nap', title: 'Nap', days_of_week: [0], start_time: '14:00:00', end_time: '15:00:00' },
    ])
    expect(block?.kind).toBe('custom')
  })
})
