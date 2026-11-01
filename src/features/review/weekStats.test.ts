import { describe, expect, it } from 'vitest'
import { dayWindowOf, nextReviewAt, noSleep, readWeekStats, RESTED_MINUTES, reviewOffset, reviewWeekStart, weekStats, type WeekStatsInputs } from './weekStats'

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
  sleep: [],
  workouts: [],
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

describe('sleep and study', () => {
  // Local times in 2026: month 9 is October, 10 is November.
  const local = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month, day, hour, minute).toISOString()
  const night = (date: string, bedAt: string, wakeAt: string, minutes: number, source = 'manual') => ({ date, bed_at: bedAt, wake_at: wakeAt, minutes, source })
  const session = (startedAt: string, minutes: number) => ({ started_at: startedAt, actual_minutes: minutes, completed: true })
  const answers = (createdAt: string, right: number, total: number) => Array.from({ length: total }, (_, index) => ({ question_id: 'q1', is_correct: index < right, created_at: createdAt }))

  // This week: 8 h, 6 h, 7.5 h and 6 h. Rested days (7+ hours): Oct 20, Nov 2 and Nov 4; short: Nov 3 and Nov 5.
  const inputs: WeekStatsInputs = {
    ...empty,
    sleep: [
      night('2026-10-11', local(9, 11, 2), local(9, 11, 7), 300, 'health_connect'), // before the last 4 weeks: left out
      night('2026-10-20', local(9, 19, 23), local(9, 20, 7), 480), // in the last 4 weeks, not this week
      night('2026-11-02', local(10, 1, 23), local(10, 2, 7), 480),
      night('2026-11-03', local(10, 3, 1), local(10, 3, 7), 360),
      night('2026-11-04', local(10, 3, 23, 30), local(10, 4, 7), 450),
      night('2026-11-05', local(10, 5, 1, 30), local(10, 5, 7), 330, 'health_connect'),
      night('2026-11-05', local(10, 5, 1), local(10, 5, 7), 360), // typed in: wins over Health Connect's
    ],
    focus: [session(local(9, 20, 10), 120), session(local(10, 2, 9), 60), session(local(10, 2, 15), 30), session(local(10, 3, 10), 30), session(local(10, 4, 10), 60)],
    attempts: [
      ...answers(local(9, 11, 9), 0, 4),
      ...answers(local(9, 20, 9), 2, 2),
      ...answers(local(10, 2, 9), 4, 4),
      ...answers(local(10, 3, 9), 2, 4),
      ...answers(local(10, 4, 9), 3, 4),
      ...answers(local(10, 5, 9), 1, 4),
      { question_id: 'q1', is_correct: null, created_at: local(10, 2, 11) }, // not marked: left out
    ],
    workouts: [{ date: '2026-11-03' }, { date: '2026-11-07' }, { date: '2026-11-09' }],
  }

  it("works out the week's sleep, one night per morning (typed in before Health Connect's)", () => {
    // Average (480 + 360 + 450 + 360) / 4 = 412.5; bedtimes 23:00, 01:00, 23:30 and 01:00, always up at 07:00.
    expect(weekStats(inputs).sleep).toMatchObject({ nights: 4, avgMinutes: 413, regularity: 78, shortNights: 2 })
  })

  it('compares focus and answers on the days after rested and short nights, over the last 4 weeks', () => {
    const stats = weekStats(inputs)
    expect(RESTED_MINUTES).toBe(7 * 60)
    expect(stats.sleep.vsStudy).toEqual({
      rested: { days: 3, focusMinutes: 90, attempts: 10, accuracy: 0.9 },
      short: { days: 2, focusMinutes: 15, attempts: 8, accuracy: 0.375 },
    })
    // Older focus sessions only count for sleep and study, not for the week's focus.
    expect(stats.focus).toEqual({ minutes: 180, sessions: 4, completed: 4 })
    expect(stats.workouts).toBe(2)
  })

  it('counts a night of exactly 7 hours as rested', () => {
    const { sleep } = weekStats({ ...inputs, sleep: [night('2026-11-06', local(10, 6, 0), local(10, 6, 7), 420)], focus: [], attempts: [] })
    expect(sleep).toMatchObject({ nights: 1, avgMinutes: 420, regularity: null, shortNights: 0 })
    expect(sleep.vsStudy.rested).toEqual({ days: 1, focusMinutes: 0, attempts: 0, accuracy: null })
    expect(sleep.vsStudy.short.days).toBe(0)
  })

  it('has nothing to compare without nights', () => {
    const stats = weekStats(empty)
    expect(stats.sleep).toEqual(noSleep())
    expect(stats.workouts).toBe(0)
  })
})

describe('reminders and saved numbers', () => {
  it('reminds on the review day at 18:00, next week once it has passed or the review is done', () => {
    const sunday = (hour: number) => new Date(2026, 10, 8, hour)
    expect(nextReviewAt(sunday(10), 0)).toEqual(new Date(2026, 10, 8, 18))
    expect(nextReviewAt(sunday(19), 0)).toEqual(new Date(2026, 10, 15, 18))
    expect(nextReviewAt(sunday(10), 0, { doneThisWeek: true })).toEqual(new Date(2026, 10, 15, 18))
    expect(nextReviewAt(new Date(2026, 10, 4, 9), 6)).toEqual(new Date(2026, 10, 7, 18)) // Wednesday → Saturday
  })

  it('reads saved numbers back, and nothing from broken ones', () => {
    const stats = weekStats(empty)
    expect(readWeekStats(JSON.parse(JSON.stringify(stats)))).toEqual(stats)
    expect(readWeekStats({ weekStart: '2026-11-02' })).toBeNull()
    expect(readWeekStats([])).toBeNull()
  })

  it('reads reviews saved before sleep was added as having none', () => {
    const saved: Record<string, unknown> = JSON.parse(JSON.stringify(weekStats(empty)))
    delete saved.sleep
    delete saved.workouts
    expect(readWeekStats(saved)).toMatchObject({ weekStart: '2026-11-02', sleep: noSleep(), workouts: 0 })
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
