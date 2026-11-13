import { describe, expect, it } from 'vitest'
import { buildPlan } from './planner'
import {
  blockAt,
  blockMode,
  blocksAfter,
  localDateOf,
  localToIso,
  minuteOf,
  planFingerprint,
  planIsFresh,
  planRows,
  remainingMinutes,
  replanStart,
  workDone,
  type PlanBlock,
} from './schedule'

const at = (date: string, time: string) => new Date(`${date}T${time}:00`) // local time

function block(id: string, start: string, end: string, values: Partial<PlanBlock> = {}): PlanBlock {
  return {
    id,
    user_id: 'u',
    date: '2026-11-02',
    start_at: at('2026-11-02', start).toISOString(),
    end_at: at('2026-11-02', end).toISOString(),
    area: 'academics',
    kind: 'learn',
    subject_id: 'dbms',
    topic_id: 'sql',
    task_id: null,
    hustle_id: null,
    title: id,
    planned_minutes: 45,
    actual_minutes: null,
    status: 'planned',
    at_risk: false,
    plan_version: 1,
    created_at: '',
    updated_at: '',
    ...values,
  }
}

describe('local time and UTC', () => {
  it('turns a local date and minute into a timestamp and back', () => {
    const iso = localToIso('2026-11-02', 14 * 60 + 30)
    expect(iso).toBe(at('2026-11-02', '14:30').toISOString())
    expect(localDateOf(iso)).toBe('2026-11-02')
    expect(minuteOf(new Date(iso))).toBe(870)
    expect(localToIso('2026-11-02', 1440)).toBe(at('2026-11-03', '00:00').toISOString()) // the end of the day
  })

  it('converts timestamps using an explicit user IANA timezone regardless of host machine offset', () => {
    // 14:30 in New York on 2026-11-02 (EST, UTC-5) is 19:30Z; in Tokyo (JST, UTC+9) it is 05:30Z.
    const nyIso = localToIso('2026-11-02', 14 * 60 + 30, 'America/New_York')
    expect(nyIso).toBe('2026-11-02T19:30:00.000Z')
    expect(localDateOf('2026-11-03T02:00:00.000Z', 'America/New_York')).toBe('2026-11-02')
    expect(localDateOf('2026-11-03T02:00:00.000Z', 'Asia/Tokyo')).toBe('2026-11-03')
    expect(minuteOf(new Date('2026-11-02T19:30:00.000Z'), 'America/New_York')).toBe(870)
  })
})

describe('planRows', () => {
  it('saves every planned block with its times, links and the plan version', () => {
    const plan = buildPlan({
      today: '2026-11-02',
      nowMinute: 0,
      horizonDays: 1,
      routine: [{ kind: 'sleep', title: 'Sleep', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], start: '23:00', end: '07:00' }],
      subjects: [{ id: 'dbms', name: 'DBMS', examDate: '2026-11-30' }],
      topics: [{ id: 'sql', subjectId: 'dbms', title: 'SQL', track: 'exam', remainingMinutes: 120, difficulty: 2, priority: 0.9, prerequisiteIds: [], orderIndex: 0 }],
      tasks: [],
      checkIns: [],
    })
    const rows = planRows(plan, 7)
    const sql = rows.find((row) => row.topic_id === 'sql')
    expect(sql).toMatchObject({ date: '2026-11-02', area: 'academics', kind: 'learn', subject_id: 'dbms', title: 'SQL', status: 'planned', plan_version: 7 })
    expect(Date.parse(sql?.end_at ?? '') - Date.parse(sql?.start_at ?? '')).toBe((sql?.planned_minutes ?? 0) * 60_000)
    expect(rows.length).toBe(plan.days[0]?.blocks.length)
  })
})

describe('work done and what is left', () => {
  it('counts done, partial and running blocks, per topic, per task and per subject today', () => {
    const done = workDone(
      [
        block('a', '09:00', '09:45', { status: 'done' }),
        block('b', '10:00', '10:45', { status: 'partial', actual_minutes: 20 }),
        block('c', '11:00', '11:45', { status: 'missed' }),
        block('d', '12:00', '12:45', { status: 'in_progress', topic_id: null, task_id: 'essay', subject_id: null }),
        block('e', '09:00', '09:45', { status: 'done', date: '2026-11-01' }),
      ],
      '2026-11-02',
    )
    expect(done.byTopic.get('sql')).toBe(45 + 20 + 45)
    expect(done.byTask.get('essay')).toBe(45)
    expect(done.todayBySubject.get('dbms')).toBe(65)
  })

  it('keeps at least 30 minutes for work that is not finished yet', () => {
    expect([remainingMinutes(120, 0), remainingMinutes(120, 45), remainingMinutes(120, 110), remainingMinutes(20, 60)]).toEqual([120, 75, 30, 20])
  })
})

describe('the blocks of today', () => {
  const day = [
    block('morning', '09:00', '09:45', { status: 'done' }),
    block('skipped', '10:00', '10:45', { status: 'missed' }),
    block('now', '14:00', '14:45'),
    block('next', '15:00', '15:30'),
    block('later', '16:00', '16:45'),
    block('evening', '18:00', '18:30'),
  ]
  const now = at('2026-11-02', '14:20')

  it('finds the block running now and the next ones', () => {
    expect(blockAt(day, now)?.id).toBe('now')
    expect(blockAt(day, at('2026-11-02', '10:15'))).toBeNull() // skipped
    expect(blocksAfter(day, now, 2).map((b) => b.id)).toEqual(['next', 'later'])
  })

  it('re-plans after the block that is running, and right away when nothing is', () => {
    expect(replanStart(day, now).toISOString()).toBe(at('2026-11-02', '14:45').toISOString())
    expect(replanStart(day, at('2026-11-02', '14:50')).toISOString()).toBe(at('2026-11-02', '14:50').toISOString())
  })

  it("knows each block's mode", () => {
    expect([blockMode('academics'), blockMode('hustle'), blockMode('life'), blockMode('personal')]).toEqual(['study', 'hustle', 'life', 'life'])
  })
})

describe('when to make the plan again', () => {
  const run = { ranOn: '2026-11-01', plannedFrom: '2026-11-02', fingerprint: 'abc' }

  it('keeps a plan made today or for today, while its inputs are the same', () => {
    expect(planIsFresh(run, '2026-11-02', 'abc')).toBe(true) // evening check-in planned today
    expect(planIsFresh({ ...run, plannedFrom: '2026-11-01' }, '2026-11-02', 'abc')).toBe(false) // yesterday's plan
    expect(planIsFresh({ ...run, ranOn: '2026-11-02', plannedFrom: '2026-11-02' }, '2026-11-02', 'changed')).toBe(false)
    expect(planIsFresh(null, '2026-11-02', 'abc')).toBe(false)
  })

  it('gives the same fingerprint for the same inputs only', () => {
    expect(planFingerprint({ a: 1, b: [2] })).toBe(planFingerprint({ a: 1, b: [2] }))
    expect(planFingerprint({ a: 1, b: [2] })).not.toBe(planFingerprint({ a: 1, b: [3] }))
  })
})
