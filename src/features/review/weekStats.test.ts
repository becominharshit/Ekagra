import { describe, expect, it } from 'vitest'
import { dayWindowOf, reviewOffset, reviewWeekStart, weekStats, type WeekStatsInputs } from './weekStats'

// The week of Monday 2 November 2026 (local time).
const WEEK = new Date(2026, 10, 2)
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString()

const empty: WeekStatsInputs = {
  weekStart: WEEK,
  budget: { academics: 55, hustle: 25, life: 20 },
  subjects: [
    { id: 'dbms', name: 'DBMS' },
    { id: 'maths', name: 'Maths' },
  ],
  blocks: [],
  topics: [],
  attempts: [],
  questionSubjects: new Map(),
  reviews: [],
  focus: [],
  distractions: [],
  appLabels: new Map(),
  checkIns: [],
  tasks: [],
  timeEntries: [],
  transactions: [],
}

const block = (date: string, area: string, status: string, planned: number, actual: number | null = null, subject: string | null = null) => ({
  date,
  area,
  subject_id: subject,
  planned_minutes: planned,
  actual_minutes: actual,
  status,
})

describe('weekStats', () => {
  it('adds up time per area against the budget, and the blocks (moved ones only once)', () => {
    const stats = weekStats({
      ...empty,
      blocks: [
        block('2026-11-02', 'academics', 'done', 50, 45, 'dbms'),
        block('2026-11-03', 'academics', 'partial', 50, 20, 'dbms'),
        block('2026-11-03', 'academics', 'missed', 50, null, 'maths'),
        block('2026-11-04', 'academics', 'moved', 50, null, 'maths'),
        block('2026-11-04', 'hustle', 'done', 60, null),
        block('2026-11-08', 'life', 'planned', 30),
        block('2026-11-09', 'academics', 'done', 50, 50, 'dbms'), // next week
      ],
    })
    expect(stats.areas).toEqual({
      academics: { planned: 150, done: 65, budgetPct: 55, sharePct: 52 },
      hustle: { planned: 60, done: 60, budgetPct: 25, sharePct: 48 },
      life: { planned: 30, done: 0, budgetPct: 20, sharePct: 0 },
    })
    expect(stats.blocks).toEqual({ planned: 5, done: 2, partial: 1, missed: 1, open: 1 })
    expect(stats.subjects.map((subject) => [subject.name, subject.planned, subject.done])).toEqual([
      ['DBMS', 100, 65],
      ['Maths', 50, 0],
    ])
    expect(stats.weekStart).toBe('2026-11-02')
    expect(stats.weekEnd).toBe('2026-11-08')
  })

  it("works out this week's accuracy per subject, and accuracy by part of the day over 4 weeks", () => {
    const answer = (question: string, right: boolean, when: string) => ({ question_id: question, is_correct: right, created_at: when })
    const stats = weekStats({
      ...empty,
      questionSubjects: new Map([
        ['q1', 'dbms'],
        ['q2', 'maths'],
      ]),
      attempts: [
        answer('q1', true, at(3, 9)),
        answer('q1', true, at(4, 10)),
        answer('q2', false, at(5, 22)),
        answer('q2', true, new Date(2026, 9, 20, 9).toISOString()), // 2 weeks before: only for parts of the day
        { question_id: 'q1', is_correct: null, created_at: at(5) }, // not marked: left out
      ],
    })
    expect(stats.quiz).toEqual({ attempts: 3, accuracy: 0.667 })
    expect(stats.subjects.map((subject) => [subject.name, subject.attempts, subject.accuracy])).toEqual([
      ['DBMS', 2, 1],
      ['Maths', 1, 0],
    ])
    expect(stats.accuracyByWindow).toEqual({
      morning: { attempts: 3, accuracy: 1 },
      afternoon: { attempts: 0, accuracy: null },
      evening: { attempts: 0, accuracy: null },
      night: { attempts: 1, accuracy: 0 },
    })
  })

  it('counts topics learned, retention, focus, distractions, check-ins, tasks and hustle', () => {
    const stats = weekStats({
      ...empty,
      topics: [
        { subject_id: 'dbms', title: 'Joins', learned_at: at(4) },
        { subject_id: 'dbms', title: 'Keys', learned_at: at(1) }, // last week
      ],
      reviews: [3, 4, 1, 3].map((rating, index) => ({ rating, reviewed_at: at(3 + index) })),
      focus: [
        { started_at: at(3), actual_minutes: 25, completed: true },
        { started_at: at(4), actual_minutes: 10, completed: false },
      ],
      appLabels: new Map([['com.instagram.android', 'Instagram']]),
      distractions: [
        { kind: 'blocked_open', app_package: 'com.instagram.android', reason: null, at: at(3, 22) },
        { kind: 'blocked_open', app_package: 'com.instagram.android', reason: null, at: at(4, 22) },
        { kind: 'tollbooth_unlock', app_package: 'com.whatsapp', reason: null, at: at(5, 15) },
        { kind: 'self_report', app_package: null, reason: null, at: at(6, 22) },
        { kind: 'mode_switch', app_package: null, reason: 'urgent', at: at(6, 11) },
      ],
      checkIns: [
        { date: '2026-11-03', energy: 4, mood: 3, minimum_day: false },
        { date: '2026-11-05', energy: 2, mood: null, minimum_day: true },
      ],
      tasks: [
        { status: 'done', completed_at: at(4), due_at: null },
        { status: 'todo', completed_at: null, due_at: at(6) }, // overdue at the end of the week
        { status: 'todo', completed_at: null, due_at: at(12) },
      ],
      timeEntries: [{ minutes: 90, started_at: at(5) }],
      transactions: [
        { kind: 'income', amount: 1500, currency: 'INR', occurred_on: '2026-11-04' },
        { kind: 'income', amount: 500.5, currency: 'INR', occurred_on: '2026-11-06' },
        { kind: 'expense', amount: 200, currency: 'INR', occurred_on: '2026-11-06' },
      ],
    })
    expect(stats.topicsLearned).toEqual([{ title: 'Joins', subjectId: 'dbms' }])
    expect(stats.reviews).toEqual({ count: 4, retention: 0.75 })
    expect(stats.focus).toEqual({ minutes: 35, sessions: 2, completed: 1 })
    expect(stats.distractions).toEqual({
      total: 4,
      unlocks: 1,
      topApps: [
        { app: 'Instagram', count: 2 },
        { app: 'com.whatsapp', count: 1 },
      ],
      topHours: [
        { hour: 22, count: 3 },
        { hour: 15, count: 1 },
      ],
      reasons: [{ reason: 'urgent', count: 1 }],
    })
    expect(stats.checkIns).toEqual({ days: 2, energy: 3, mood: 3, crashedDays: 1 })
    expect(stats.tasks).toEqual({ completed: 1, overdue: 1 })
    expect(stats.hustle).toEqual({ minutes: 90, income: [{ currency: 'INR', amount: 2000.5 }] })
  })
})

describe('the week under review', () => {
  it('splits the day into mornings, afternoons, evenings and nights', () => {
    expect([6, 11, 12, 17, 21, 2].map((hour) => dayWindowOf(new Date(2026, 10, 2, hour)))).toEqual(['morning', 'morning', 'afternoon', 'evening', 'night', 'night'])
  })

  it('is this week from Sunday, and last week until then (Monday reviews look back)', () => {
    const day = (date: number) => new Date(2026, 10, date, 18)
    expect(reviewWeekStart(day(8))).toEqual(new Date(2026, 10, 2)) // Sunday
    expect(reviewWeekStart(day(7))).toEqual(new Date(2026, 9, 26)) // Saturday: last week
    expect(reviewWeekStart(day(9))).toEqual(new Date(2026, 10, 2)) // Monday: the week that just ended
    expect(reviewWeekStart(day(7), 6)).toEqual(new Date(2026, 10, 2)) // Saturday reviews
    expect(reviewWeekStart(day(9), 1)).toEqual(new Date(2026, 10, 2)) // Monday reviews look back
    expect([0, 1, 6].map(reviewOffset)).toEqual([6, 7, 5])
  })
})
