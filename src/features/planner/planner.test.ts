import { describe, expect, it } from 'vitest'
import {
  buildPlan,
  burnoutGuard,
  dayBudget,
  EXAM_SEASON_BUDGET,
  growthAllowance,
  minimumDayWork,
  minutesByArea,
  PEAK_WINDOWS,
  plannedMinutes,
  resolveSettings,
  splitByBudget,
  splitIntoChunks,
  STANDARD_BUDGET,
} from './planner'
import { addDays } from './time'
import type {
  DayPlan,
  Plan,
  PlannedBlock,
  PlannerCheckIn,
  PlannerInput,
  PlannerSubject,
  PlannerTask,
  PlannerTopic,
  RoutineBlock,
  WorkItem,
} from './types'

const TODAY = '2026-11-01' // a Sunday
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
// Asleep 23:00–07:00, so every day has 16 hours (960 minutes) of free time.
const SLEEP: RoutineBlock = { kind: 'sleep', title: 'Sleep', daysOfWeek: EVERY_DAY, start: '23:00', end: '07:00' }
const SETTINGS = resolveSettings()
const ENDLESS = 50_000 // more study minutes than 14 days can hold

function subject(id: string, examInDays: number | null = null): PlannerSubject {
  return { id, name: id.toUpperCase(), examDate: examInDays === null ? null : addDays(TODAY, examInDays) }
}

function topic(id: string, subjectId: string, remainingMinutes: number, extra: Partial<PlannerTopic> = {}): PlannerTopic {
  return {
    id,
    subjectId,
    title: `Topic ${id}`,
    track: 'exam',
    remainingMinutes,
    difficulty: 2,
    priority: 0.5,
    prerequisiteIds: [],
    orderIndex: 0,
    ...extra,
  }
}

function checkIn(daysAgo: number, energy: number | null, minimumDay = false): PlannerCheckIn {
  return { date: addDays(TODAY, -daysAgo), energy, minimumDay }
}

function plan(overrides: Partial<PlannerInput> = {}): Plan {
  return buildPlan({
    today: TODAY,
    nowMinute: 0,
    routine: [SLEEP],
    subjects: [],
    topics: [],
    tasks: [],
    checkIns: [],
    ...overrides,
  })
}

function day(result: Plan, index: number): DayPlan {
  const found = result.days[index]
  if (!found) throw new Error(`The plan has no day ${index}`)
  return found
}

function minutesWhere(d: DayPlan, matches: (block: PlannedBlock) => boolean): number {
  return d.blocks.filter(matches).reduce((total, block) => total + block.end - block.start, 0)
}

const recoveredMinutes = (d: DayPlan) => minutesWhere(d, (block) => block.recovered === true)

/** One subject with endless study material and no exam: every day can be filled completely. */
const STUDY = { subjects: [subject('dbms')], topics: [topic('sql', 'dbms', ENDLESS)] }

describe('standard day (55/25/20)', () => {
  it('splits time 55/25/20 in 5-minute steps without losing a minute', () => {
    expect(splitByBudget(840, STANDARD_BUDGET)).toEqual({ academics: 460, hustle: 210, life: 170 })
    expect(splitByBudget(0, STANDARD_BUDGET)).toEqual({ academics: 0, hustle: 0, life: 0 })
  })

  it('keeps a 12% buffer and fills the rest 55/25/20', () => {
    const today = day(plan(STUDY), 0)
    expect(today.freeMinutes).toBe(960)
    expect(today.capacityMinutes).toBe(840) // 960 − 12% = 844.8, rounded down to 5 minutes
    expect(minutesByArea(today)).toEqual({ academics: 460, hustle: 210, life: 170 })
    expect(plannedMinutes(today)).toBe(840)
  })

  it('keeps blocks inside free time, at most 50 minutes long, with 5-minute gaps', () => {
    const classes: RoutineBlock = { kind: 'class', title: 'Classes', daysOfWeek: [1, 2, 3, 4, 5], start: '09:00', end: '13:00' }
    const result = plan({ ...STUDY, routine: [SLEEP, classes], horizonDays: 7 })
    for (const d of result.days) {
      let previousEnd = Number.NEGATIVE_INFINITY
      for (const block of d.blocks) {
        expect(block.end - block.start).toBeLessThanOrEqual(50)
        expect(d.free.some((gap) => block.start >= gap.start && block.end <= gap.end)).toBe(true)
        expect(block.start - previousEnd).toBeGreaterThanOrEqual(5)
        previousEnd = block.end
      }
    }
    const monday = day(result, 1)
    expect(monday.blocks.length).toBeGreaterThan(0)
    expect(monday.blocks.some((block) => block.start < 13 * 60 && block.end > 9 * 60)).toBe(false)
  })

  it('plans today only after the current time', () => {
    const today = day(plan({ ...STUDY, nowMinute: 14 * 60 + 2 }), 0)
    expect(Math.min(...today.blocks.map((block) => block.start))).toBe(14 * 60 + 5) // next 5-minute mark
  })

  it('learns prerequisites first', () => {
    const topics = [
      topic('joins', 'dbms', 60, { priority: 0.9, prerequisiteIds: ['select'] }),
      topic('select', 'dbms', 60, { priority: 0.1 }),
    ]
    const today = day(plan({ subjects: [subject('dbms')], topics }), 0)
    const firstStart = (id: string) => Math.min(...today.blocks.filter((block) => block.topicId === id).map((b) => b.start))
    expect(firstStart('select')).toBeLessThan(firstStart('joins'))
  })

  it('puts hard topics into the best focus hours', () => {
    const topics = [
      topic('normalization', 'dbms', 50, { difficulty: 5, priority: 0.9 }),
      topic('basics', 'dbms', 410, { difficulty: 1 }),
    ]
    const today = day(plan({ subjects: [subject('dbms')], topics, settings: { peakWindow: PEAK_WINDOWS.night } }), 0)
    const hard = today.blocks.find((block) => block.topicId === 'normalization')
    expect(hard?.start).toBe(18 * 60) // a night owl's best hours are 18:00–22:00
  })

  it('mixes subjects: never more than 2 blocks of the same subject in a row', () => {
    const subjects = [subject('maths', 30), subject('physics', 30)]
    const topics = [topic('calculus', 'maths', 3000), topic('optics', 'physics', 3000)]
    const order = day(plan({ subjects, topics }), 0)
      .blocks.filter((block) => block.kind === 'learn')
      .map((block) => block.subjectId)
    expect(new Set(order)).toEqual(new Set(['maths', 'physics']))
    for (let index = 2; index < order.length; index++) {
      const threeInARow = order[index] === order[index - 1] && order[index] === order[index - 2]
      expect(threeInARow).toBe(false)
    }
  })

  it('does assignments before topics, earliest due date first', () => {
    const tasks: PlannerTask[] = [
      { id: 'lab', area: 'academics', title: 'Lab report', dueDate: addDays(TODAY, 5), remainingMinutes: 60, priority: 2 },
      { id: 'dbms', area: 'academics', title: 'DBMS assignment', dueDate: addDays(TODAY, 1), remainingMinutes: 60, priority: 2 },
    ]
    const blocks = day(plan({ ...STUDY, tasks }), 0).blocks
    const startOf = (id: string) => blocks.find((block) => block.taskId === id)?.start ?? Number.POSITIVE_INFINITY
    const firstTopic = Math.min(...blocks.filter((block) => block.kind === 'learn').map((block) => block.start))
    expect(startOf('dbms')).toBeLessThan(startOf('lab'))
    expect(startOf('lab')).toBeLessThan(firstTopic)
  })

  it('cuts work into blocks of at most 50 minutes, in 5-minute steps', () => {
    expect(splitIntoChunks(100, 50)).toEqual([50, 50])
    expect(splitIntoChunks(30, 50)).toEqual([30])
    const chunks = splitIntoChunks(464, 50)
    expect(chunks.reduce((total, minutes) => total + minutes, 0)).toBe(464)
    expect(Math.max(...chunks)).toBeLessThanOrEqual(50)
  })
})

describe('exam season', () => {
  it('uses 55/25/20 when the next exam is more than 21 days away', () => {
    expect(dayBudget(TODAY, [subject('dbms', 22)], SETTINGS)).toEqual({ budget: STANDARD_BUDGET, examSeason: false })
  })

  it('switches to 80/5/15 from 21 days before an exam until the exam day', () => {
    expect(dayBudget(TODAY, [subject('dbms', 21)], SETTINGS)).toEqual({ budget: EXAM_SEASON_BUDGET, examSeason: true })
    expect(dayBudget(TODAY, [subject('dbms', 0)], SETTINGS).examSeason).toBe(true)
    expect(dayBudget(TODAY, [subject('dbms', -1)], SETTINGS).examSeason).toBe(false) // the exam is over
  })

  it('pauses the skill track and gives academics 80% during exam season', () => {
    const topics = [
      topic('exam-topic', 'dbms', 5000),
      topic('modern-sql', 'dbms', 2000, { track: 'skill', priority: 0.9 }),
    ]
    const result = plan({ subjects: [subject('dbms', 25)], topics })
    const skillMinutes = (d: DayPlan) => minutesWhere(d, (block) => block.topicId === 'modern-sql')

    for (const index of [0, 1, 2, 3]) {
      // 25 to 22 days before the exam: normal days, the skill track still gets spare time
      expect(day(result, index).examSeason).toBe(false)
      expect(skillMinutes(day(result, index))).toBeGreaterThan(0)
    }
    for (let index = 4; index < 14; index++) {
      // 21 days before the exam and closer: exam season
      expect(day(result, index).examSeason).toBe(true)
      expect(skillMinutes(day(result, index))).toBe(0)
    }
    expect(minutesByArea(day(result, 4))).toEqual({ academics: 670, hustle: 40, life: 130 })
  })
})

describe('burnout guard', () => {
  const tired = [checkIn(1, 2), checkIn(2, 1), checkIn(4, 2)]

  it('turns on when the last 3 check-ins of the past 7 days all have energy ≤ 2', () => {
    expect(burnoutGuard(TODAY, tired, SETTINGS)).toBe(true)
    expect(burnoutGuard(TODAY, [...tired, checkIn(5, 5)], SETTINGS)).toBe(true) // only the latest 3 count
  })

  it('stays off otherwise', () => {
    expect(burnoutGuard(TODAY, [checkIn(1, 2), checkIn(2, 3), checkIn(3, 1)], SETTINGS)).toBe(false) // one OK day
    expect(burnoutGuard(TODAY, [checkIn(1, 1), checkIn(2, 1)], SETTINGS)).toBe(false) // only 2 check-ins
    expect(burnoutGuard(TODAY, [checkIn(1, 1), checkIn(2, 1), checkIn(8, 1)], SETTINGS)).toBe(false) // one is 8 days old
    expect(burnoutGuard(TODAY, [checkIn(0, 1), checkIn(1, 1), checkIn(2, 1)], SETTINGS)).toBe(false) // today's doesn't count
    expect(burnoutGuard(TODAY, [checkIn(1, 1), checkIn(2, null), checkIn(3, 1)], SETTINGS)).toBe(false) // no energy given
  })

  it("cuts today's planned minutes by 30%, and only today's", () => {
    const normal = plan(STUDY)
    const guarded = plan({ ...STUDY, checkIns: tired })
    expect(day(guarded, 0).burnoutGuard).toBe(true)
    expect(plannedMinutes(day(normal, 0))).toBe(840)
    expect(plannedMinutes(day(guarded, 0))).toBe(585) // 840 × 0.7 = 588, rounded down to 5 minutes
    expect(day(guarded, 1).burnoutGuard).toBe(false)
    expect(plannedMinutes(day(guarded, 1))).toBe(plannedMinutes(day(normal, 1)))
  })
})

describe('minimum day ("I Crashed")', () => {
  it('keeps the top piece of work (≤ 30 min) and reviews (≤ 15 min), and moves the rest', () => {
    const work: WorkItem[] = [
      { key: 'review', area: 'academics', kind: 'review', title: 'Reviews', minutes: 25 },
      { key: 'task:a1', area: 'academics', kind: 'task', title: 'Assignment', minutes: 60, taskId: 'a1' },
      { key: 'topic:sql', area: 'academics', kind: 'learn', title: 'SQL', minutes: 120, topicId: 'sql' },
      { key: 'hustle', area: 'hustle', kind: 'hustle', title: 'Hustle work', minutes: 210 },
      { key: 'life', area: 'life', kind: 'life', title: 'Life time', minutes: 170 },
    ]
    const { keep, moved } = minimumDayWork(work, SETTINGS)
    expect(keep.map((item) => [item.key, item.minutes])).toEqual([['task:a1', 30], ['review', 15]])
    expect(moved.map((item) => [item.key, item.minutes])).toEqual([['task:a1', 30], ['topic:sql', 120]])
  })

  it('plans only those two blocks today', () => {
    const today = day(plan({ ...STUDY, checkIns: [checkIn(0, null, true)], reviewMinutes: { [TODAY]: 25 } }), 0)
    expect(today.minimumDay).toBe(true)
    expect(today.blocks.map((block) => [block.kind, block.end - block.start])).toEqual([
      ['learn', 30],
      ['review', 15],
    ])
  })

  it('spreads the rest over the next days, never growing a day by more than 20%', () => {
    const result = plan({ ...STUDY, checkIns: [checkIn(0, null, true)], reviewMinutes: { [TODAY]: 25 } })
    const later = result.days.slice(1)
    // Today normally had 460 study minutes: 25 of reviews and 435 of SQL. 30 stay, 405 move on.
    expect(later.reduce((total, d) => total + recoveredMinutes(d), 0)).toBe(405)
    for (const d of later) {
      expect(plannedMinutes(d)).toBeLessThanOrEqual(d.normalMinutes + growthAllowance(d.normalMinutes, SETTINGS))
    }
    expect(result.atRisk).toEqual([])
  })
})

describe('auto-recovery (+20% cap)', () => {
  const missed: WorkItem = {
    key: 'topic:er',
    area: 'academics',
    kind: 'learn',
    title: 'ER diagrams',
    minutes: 400,
    topicId: 'er',
    subjectId: 'dbms',
  }
  // A 40% buffer leaves room in each day, and a subject with a lot left before its exam fills
  // all study time, so missed work can only go ON TOP of the normal plan.
  const fullStudyTime = {
    subjects: [subject('dbms', 40)],
    topics: [topic('exam-topic', 'dbms', ENDLESS)],
    settings: { bufferPct: 40 },
  }

  it('lets a day grow by at most 20% of its normal plan', () => {
    expect(growthAllowance(575, SETTINGS)).toBe(115)
    expect(growthAllowance(0, SETTINGS)).toBe(0)
  })

  it('puts missed work before "getting ahead", so the day does not grow', () => {
    const today = day(plan({ ...STUDY, carryOver: [{ ...missed, minutes: 120 }] }), 0)
    expect(recoveredMinutes(today)).toBe(120)
    expect(plannedMinutes(today)).toBe(today.normalMinutes)
  })

  it('when study time is already full, adds at most +20% a day until the work is caught up', () => {
    const result = plan({ ...fullStudyTime, carryOver: [missed] })
    expect(day(result, 0).normalMinutes).toBe(575) // 960 − 40%, rounded down to 5 minutes
    expect(result.days.slice(0, 5).map(recoveredMinutes)).toEqual([115, 115, 115, 55, 0])
    expect(plannedMinutes(day(result, 0))).toBe(575 + 115)
    expect(result.atRisk).toEqual([])
  })

  it('reports work that does not fit in the plan as at risk', () => {
    const result = plan({ ...fullStudyTime, carryOver: [missed], horizonDays: 2 })
    expect(result.atRisk).toEqual([expect.objectContaining({ key: 'topic:er', minutes: 170, reason: 'no_room' })])
  })
})

describe('at-risk work', () => {
  it('flags an assignment that cannot be finished by its due date', () => {
    const tasks: PlannerTask[] = [
      { id: 'project', area: 'academics', title: 'Mini project', dueDate: TODAY, remainingMinutes: 600, priority: 1 },
    ]
    // Today has 460 study minutes, so 140 minutes of the project end up late.
    expect(plan({ tasks }).atRisk).toEqual([
      expect.objectContaining({ key: 'task:project', minutes: 140, reason: 'deadline' }),
    ])
  })

  it('flags exam topics that cannot be covered before an exam inside the plan', () => {
    const result = plan({ subjects: [subject('dbms', 5)], topics: [topic('everything', 'dbms', 20_000)] })
    const risk = result.atRisk.find((item) => item.key === 'topic:everything')
    expect(risk?.reason).toBe('exam')
    expect(risk?.minutes).toBeGreaterThan(0)
  })
})
