import { describe, expect, it } from 'vitest'
import {
  attendanceAdvice,
  attendanceState,
  classesBetween,
  classesOn,
  classesToRecover,
  classesWithStatus,
  classSlots,
  dbTime,
  percent,
  safeBunks,
  semesterOutlook,
  subjectAttendance,
  tally,
  type Attendance,
  type ClassSlot,
} from './attendance'

const count = (attended: number, held: number) => ({ attended, held })

function row(date: string, status: string, start: string | null = null, subjectId = 'dbms'): Attendance {
  return { id: `${subjectId}-${date}-${start}`, user_id: 'u', subject_id: subjectId, date, start_time: start, status, created_at: '', updated_at: '' }
}

describe('tally and percent', () => {
  it('counts present and absent classes; cancelled ones never happened', () => {
    expect(tally([row('2026-11-02', 'present'), row('2026-11-03', 'absent'), row('2026-11-04', 'cancelled'), row('2026-11-05', 'present')])).toEqual({
      held: 3,
      attended: 2,
    })
    expect(percent(count(2, 3))).toBeCloseTo(66.667, 2)
    expect(percent(count(0, 0))).toBeNull()
  })
})

describe('safe bunks: classes you can still miss', () => {
  it.each([
    [30, 36, 4], // 30 / 40 = 75% after 4 more misses; a 5th → 73.2%
    [30, 40, 0], // exactly 75%
    [3, 3, 1], // 3 / 4 = 75%
    [9, 10, 2], // 9 / 12 = 75%
    [20, 30, 0], // already under
    [0, 0, 0], // missing the very first class gives 0%
  ])('%i of %i attended → %i', (attended, held, expected) => {
    expect(safeBunks(count(attended, held), 75)).toBe(expected)
  })

  it('follows the minimum', () => {
    expect(safeBunks(count(30, 36), 80)).toBe(1) // 30 / 37 = 81%, 30 / 38 = 78.9%
    expect(safeBunks(count(30, 36), 60)).toBe(14)
  })
})

describe('classes to recover', () => {
  it.each([
    [20, 30, 10], // (22.5 − 20) / 0.25 = 10 → 30 / 40 = 75%
    [0, 4, 12], // 12 / 16 = 75%
    [29, 39, 1], // 30 / 40
    [30, 40, 0],
    [36, 40, 0],
  ])('%i of %i attended → %i in a row', (attended, held, expected) => {
    expect(classesToRecover(count(attended, held), 75)).toBe(expected)
  })

  it('never gets back to a 100% minimum after a miss', () => {
    expect(classesToRecover(count(9, 10), 100)).toBe(Number.POSITIVE_INFINITY)
    expect(classesToRecover(count(10, 10), 100)).toBe(0)
  })
})

describe('attendanceState', () => {
  it('warns one miss before the minimum, and below it', () => {
    expect(attendanceState(count(0, 0), 75)).toBe('none')
    expect(attendanceState(count(30, 36), 75)).toBe('safe')
    expect(attendanceState(count(3, 3), 75)).toBe('low') // 1 more miss allowed
    expect(attendanceState(count(30, 40), 75)).toBe('low') // exactly at the limit
    expect(attendanceState(count(29, 40), 75)).toBe('short')
  })
})

describe('semesterOutlook', () => {
  it('says how many of the classes left can still be missed', () => {
    // 20 of 30 now, 30 left: finish with at least 45 of 60 → can miss 5.
    expect(semesterOutlook(count(20, 30), 30, 75)).toEqual({ best: 83.33333333333334, canMiss: 5, reachable: true })
  })

  it("says when even every class left isn't enough", () => {
    const outlook = semesterOutlook(count(10, 30), 10, 75)
    expect(outlook).toMatchObject({ best: 50, canMiss: 0, reachable: false })
  })

  it('has nothing to say without any classes', () => {
    expect(semesterOutlook(count(0, 0), 0, 75)).toBeNull()
  })
})

describe('the timetable', () => {
  const routine = [
    { kind: 'class', subject_id: 'dbms', start_time: '09:00:00', end_time: '10:00:00', days_of_week: [1, 3] },
    { kind: 'class', subject_id: 'dbms', start_time: '14:00', end_time: '16:00', days_of_week: [5] }, // a lab
    { kind: 'class', subject_id: 'maths', start_time: '11:00', end_time: '12:00', days_of_week: [1, 2, 3, 4, 5] },
    { kind: 'class', subject_id: null, start_time: '09:00', end_time: '16:00', days_of_week: [1, 2, 3, 4, 5] }, // no subject
    { kind: 'class', subject_id: 'deleted', start_time: '08:00', end_time: '09:00', days_of_week: [2] },
    { kind: 'gym', subject_id: null, start_time: '18:00', end_time: '19:00', days_of_week: [1] },
  ]
  const slots = classSlots(routine, new Set(['dbms', 'maths']))

  it('takes the class blocks that name a subject that still exists', () => {
    expect(slots.map((slot) => `${slot.subjectId} ${slot.start}`)).toEqual(['dbms 09:00', 'dbms 14:00', 'maths 11:00'])
  })

  it('lists the classes of a day in time order', () => {
    // 2 November 2026 is a Monday.
    expect(classesOn(slots, '2026-11-02').map((slot) => `${slot.subjectId} ${slot.start}`)).toEqual(['dbms 09:00', 'maths 11:00'])
    expect(classesOn(slots, '2026-11-06').map((slot) => `${slot.subjectId} ${slot.start}`)).toEqual(['maths 11:00', 'dbms 14:00'])
    expect(classesOn(slots, '2026-11-08')).toEqual([]) // Sunday
  })

  it('respects blocks that only run for part of the term', () => {
    const limited: ClassSlot[] = [{ subjectId: 'dbms', start: '09:00', end: '10:00', daysOfWeek: [1], validFrom: '2026-11-09', validTo: '2026-11-16' }]
    expect(classesBetween(limited, '2026-11-01', '2026-11-30')).toBe(2)
  })

  it('counts the classes between two dates, both included', () => {
    const dbms = slots.filter((slot) => slot.subjectId === 'dbms')
    expect(classesBetween(dbms, '2026-11-02', '2026-11-08')).toBe(3) // Mon, Wed, Fri
    expect(classesBetween(dbms, '2026-11-02', '2026-11-29')).toBe(12)
    expect(classesBetween(dbms, '2026-11-10', '2026-11-09')).toBe(0)
  })

  it("shows how each of today's classes was marked (the database gives times with seconds)", () => {
    const rows = [row('2026-11-02', 'present', '09:00:00'), row('2026-11-02', 'absent', '11:00:00', 'maths')]
    expect(classesWithStatus(slots, rows, '2026-11-02').map((day) => [day.slot.subjectId, day.status])).toEqual([
      ['dbms', 'present'],
      ['maths', 'absent'],
    ])
    expect(classesWithStatus(slots, [row('2026-11-02', 'present')], '2026-11-02').map((day) => day.status)).toEqual([null, null])
    expect(dbTime('09:00')).toBe('09:00:00')
  })
})

describe('subjectAttendance', () => {
  const slots: ClassSlot[] = [{ subjectId: 'dbms', start: '09:00', end: '10:00', daysOfWeek: [1, 3, 5], validFrom: null, validTo: null }]
  // 6 classes, 4 attended (66.7%).
  const rows = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09'].map((date) => row(date, 'present', '09:00:00'))
  rows.push(row('2026-11-11', 'absent', '09:00:00'), row('2026-11-13', 'absent', '09:00:00'), row('2026-11-13', 'present', null, 'maths'))

  it('puts it all together, counting unmarked classes today as still to come', () => {
    // Monday 16 November, today's class not marked yet; classes end on Friday 27 November.
    const summary = subjectAttendance({ subjectId: 'dbms', rows, slots, minPercent: 75, today: '2026-11-16', classesEndOn: '2026-11-27' })
    expect(summary).toMatchObject({ tally: { held: 6, attended: 4 }, state: 'short', safeBunks: 0, toRecover: 2, remaining: 6 })
    // 4 + 6 of 12 at best (83%); at least 9 of 12 are needed, so 1 of the 6 left can be missed.
    expect(summary.outlook).toEqual({ best: 83.33333333333334, canMiss: 1, reachable: true })
    expect(attendanceAdvice(summary, 75)).toBe('Attend the next 2 classes to get back to 75%.')
  })

  it('makes no forecast without a last day of classes', () => {
    const summary = subjectAttendance({ subjectId: 'dbms', rows, slots, minPercent: 75, today: '2026-11-16', classesEndOn: null })
    expect(summary.remaining).toBeNull()
    expect(summary.outlook).toBeNull()
  })

  it('advises in plain words', () => {
    const base = subjectAttendance({ subjectId: 'none', rows: [], slots: [], minPercent: 75, today: '2026-11-16', classesEndOn: null })
    expect(attendanceAdvice(base, 75)).toBe('No classes marked yet.')
    expect(attendanceAdvice({ ...base, state: 'safe', safeBunks: 3 }, 75)).toBe('You can miss 3 more classes and stay at 75% or above.')
    expect(attendanceAdvice({ ...base, state: 'low', safeBunks: 0 }, 75)).toMatch(/Exactly at the limit/)
  })
})
