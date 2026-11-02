import { describe, expect, it } from 'vitest'
import { classTimeLabel, linkClasses, mergeClasses, newCourses, routineWithTimetable, type TimetableClass } from './timetable'

const cls = (subject: string, days: number[], start: string, end: string, subjectId: string | null = null): TimetableClass => ({ subject, subjectId, days, start, end })

describe('mergeClasses', () => {
  it('makes one block per course and time with all its days, earliest first', () => {
    const merged = mergeClasses([cls('OS', [3], '11:00', '12:00'), cls(' DBMS ', [3, 1], '09:00', '10:00', 's1'), cls('DBMS', [5], '09:00', '10:00', 's1'), cls('OS', [1], '11:00', '12:00')])
    expect(merged).toEqual([cls('DBMS', [1, 3, 5], '09:00', '10:00', 's1'), cls('OS', [1, 3], '11:00', '12:00')])
  })
})

describe('new courses and links', () => {
  it('lists courses that are not subjects yet (once each), then links them by name', () => {
    const classes = [cls('DBMS', [1], '09:00', '10:00', 's1'), cls('Physics', [2], '10:00', '11:00'), cls('physics ', [4], '12:00', '13:00'), cls('Library', [5], '15:00', '16:00')]
    expect(newCourses(classes)).toEqual(['Physics', 'Library'])
    const linked = linkClasses(classes, [{ id: 'p1', name: 'Physics' }])
    expect(linked.map((item) => item.subjectId)).toEqual(['s1', 'p1', 'p1', null])
  })
})

describe('routineWithTimetable', () => {
  const current = [
    { kind: 'sleep', title: 'Sleep', days_of_week: [0, 1, 2, 3, 4, 5, 6], start_time: '23:00:00', end_time: '07:00:00' },
    { kind: 'class', title: 'Classes', days_of_week: [1, 2, 3, 4, 5], start_time: '09:00:00', end_time: '16:00:00', subject_id: null },
    { kind: 'meal', title: 'Lunch', days_of_week: [0, 1, 2, 3, 4, 5, 6], start_time: '13:00:00', end_time: '13:45:00' },
    { kind: 'gym', title: 'Gym', days_of_week: [1, 3, 5], start_time: '18:00:00', end_time: '19:00:00' },
  ]

  it('replaces only the class times; sleep, meals and the gym stay', () => {
    const { rows, problems } = routineWithTimetable(current, [cls('DBMS', [3, 1], '09:00', '10:00', 's1'), cls('Physics lab', [4], '14:00', '16:00')])
    expect(problems).toEqual([])
    expect(rows).toEqual([
      { kind: 'sleep', title: 'Sleep', days_of_week: [0, 1, 2, 3, 4, 5, 6], start_time: '23:00', end_time: '07:00' },
      { kind: 'class', title: 'DBMS', days_of_week: [1, 3], start_time: '09:00', end_time: '10:00', subject_id: 's1' },
      { kind: 'class', title: 'Physics lab', days_of_week: [4], start_time: '14:00', end_time: '16:00', subject_id: null },
      { kind: 'gym', title: 'Gym', days_of_week: [1, 3, 5], start_time: '18:00', end_time: '19:00' },
      { kind: 'meal', title: 'Lunch', days_of_week: [0, 1, 2, 3, 4, 5, 6], start_time: '13:00', end_time: '13:45' },
    ])
  })

  it('reports a class that ends before it starts', () => {
    expect(routineWithTimetable(current, [cls('DBMS', [1], '11:00', '10:00')]).problems).toEqual(['"DBMS" ends before it starts.'])
  })
})

describe('classTimeLabel', () => {
  it('shows the days Monday first, then the time', () => {
    expect(classTimeLabel({ days: [5, 1, 3], start: '09:00', end: '09:50' })).toBe('Mon, Wed, Fri 09:00–09:50')
  })
})
