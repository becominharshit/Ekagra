import { describe, expect, it } from 'vitest'
import type { PlanBlock } from '@/features/planner/schedule'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { finishBlock, finishSession, focusedMinutes, loadActiveFocus, minutesLeftIn, partOf, sessionTitle, startFocus, stopFocus } from './sessions'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const at = (time: string) => new Date(`2026-11-02T${time}:00`) // local time
const iso = (time: string) => at(time).toISOString()
const NOW = at('14:20')

function block(id: string, start: string, end: string, values: Partial<PlanBlock> = {}): PlanBlock {
  return {
    id,
    user_id: 'demo-user',
    date: '2026-11-02',
    start_at: iso(start),
    end_at: iso(end),
    area: 'academics',
    kind: 'learn',
    subject_id: null,
    topic_id: null,
    task_id: null,
    hustle_id: null,
    title: id,
    planned_minutes: (Date.parse(iso(end)) - Date.parse(iso(start))) / 60_000,
    actual_minutes: null,
    status: 'planned',
    at_risk: false,
    plan_version: 1,
    created_at: '',
    updated_at: '',
    ...values,
  }
}

describe('focus session helpers', () => {
  it('knows the minutes a block leaves, and parts of a block', () => {
    expect(minutesLeftIn(block('now', '14:00', '14:45'), NOW)).toBe(25) // until the block ends
    expect(minutesLeftIn(block('later', '15:00', '15:30'), NOW)).toBe(30) // the whole block
    expect(minutesLeftIn(block('ending', '13:30', '14:22'), NOW)).toBe(5) // at least 5
    expect([partOf(45, 0.25), partOf(45, 0.5), partOf(45, 0.75), partOf(10, 0.9)]).toEqual([10, 25, 35, 5])
  })

  it('counts minutes focused: not breaks, not pauses, not time after the planned focus', () => {
    const pomodoro = { mode: 'pomodoro', planned_minutes: 40, started_at: iso('14:00') }
    expect(focusedMinutes(pomodoro, [], at('14:20'))).toBe(20)
    expect(focusedMinutes(pomodoro, [], at('14:28'))).toBe(25) // in the break
    expect(focusedMinutes(pomodoro, [{ from: iso('14:05'), to: iso('14:15') }], at('14:30'))).toBe(20)
    expect(focusedMinutes(pomodoro, [], at('18:00'))).toBe(40) // a timer left running doesn't add hours
    expect(focusedMinutes({ ...pomodoro, mode: 'custom' }, [], at('14:28'))).toBe(28)
  })

  it('names a session after its block, else its hustle or subject, else its area', () => {
    expect(sessionTitle({ area: 'academics' }, { block: 'Normalization', subject: 'DBMS' })).toBe('Normalization')
    expect(sessionTitle({ area: 'hustle' }, { hustle: 'Logo design' })).toBe('Logo design')
    expect(sessionTitle({ area: 'academics' }, { subject: 'DBMS' })).toBe('DBMS')
    expect(sessionTitle({ area: 'life' }, {})).toBe('Life session')
  })
})

describe('focus sessions (Demo Mode)', () => {
  function setUp(values: Partial<PlanBlock> = {}) {
    demoDb.insert('subjects', [{ id: 'dbms', name: 'DBMS' }])
    demoDb.insert('topics', [
      { id: 'unit', subject_id: 'dbms', title: 'Unit 1' },
      { id: 'sql', subject_id: 'dbms', parent_id: 'unit', title: 'SQL' },
    ])
    const [row] = demoDb.insert('plan_blocks', [{ ...block('now', '14:00', '14:45', { subject_id: 'dbms', topic_id: 'sql', ...values }), id: undefined }])
    if (!row) throw new Error('no block')
    return row
  }

  it('starts for a block with the chosen timer, fitted to the time the block has left', async () => {
    const row = setUp()
    const later = demoDb.insert('plan_blocks', [{ ...block('later', '15:00', '15:45'), id: undefined }])[0]
    if (!later) throw new Error('no block')
    await startFocus(DEMO, { block: later, mode: 'pomodoro', now: NOW })
    expect(await loadActiveFocus(DEMO)).toMatchObject({ plan_block_id: later.id, planned_minutes: 40 }) // 25 + 5 break + 15 in 45 minutes
    await startFocus(DEMO, { block: row, mode: 'deep', workMinutes: 20, now: at('14:21') })
    expect(await loadActiveFocus(DEMO)).toMatchObject({ plan_block_id: row.id, mode: 'deep', planned_minutes: 20 }) // the minutes picked
  })

  it('Done saves the minutes focused for the block and starts its topic', async () => {
    const row = setUp()
    const id = await startFocus(DEMO, { block: row, mode: 'pomodoro', now: NOW })
    const session = await loadActiveFocus(DEMO)
    expect(session).toMatchObject({ id, plan_block_id: row.id, area: 'academics', subject_id: 'dbms', mode: 'pomodoro', planned_minutes: 25, ended_at: null })
    expect(demoDb.get('plan_blocks', row.id)?.status).toBe('in_progress')

    await finishBlock(DEMO, { block: row, outcome: 'done', session, focused: 22, now: at('14:44') })
    expect(demoDb.get('plan_blocks', row.id)).toMatchObject({ status: 'done', actual_minutes: 22 })
    expect(demoDb.list('focus_sessions')[0]).toMatchObject({ outcome: 'done', completed: true, actual_minutes: 22, ended_at: iso('14:44') })
    expect(await loadActiveFocus(DEMO)).toBeNull()
    expect(demoDb.get('topics', 'sql')?.status).toBe('learning')
  })

  it("without the timer's minutes, counts the time since the start, up to the planned focus", async () => {
    const row = setUp()
    await startFocus(DEMO, { block: row, mode: 'custom', workMinutes: 25, now: NOW })
    const session = await loadActiveFocus(DEMO)
    await finishBlock(DEMO, { block: row, outcome: 'partial', session, now: at('14:31') })
    expect(demoDb.get('plan_blocks', row.id)).toMatchObject({ status: 'partial', actual_minutes: 11 })
  })

  it('Partly without a session saves the part picked; Skip saves nothing and leaves the topic alone', async () => {
    const row = setUp()
    await finishBlock(DEMO, { block: row, outcome: 'partial', minutes: 25, now: NOW })
    expect(demoDb.get('plan_blocks', row.id)).toMatchObject({ status: 'partial', actual_minutes: 25 })

    demoDb.update('topics', 'sql', { status: 'not_started' })
    await finishBlock(DEMO, { block: row, outcome: 'missed', now: NOW })
    expect(demoDb.get('plan_blocks', row.id)).toMatchObject({ status: 'missed', actual_minutes: 0 })
    expect(demoDb.get('topics', 'sql')?.status).toBe('not_started')
  })

  it('a session on its own: for a hustle (its minutes become hours) or a subject; Done or Stop', async () => {
    demoDb.insert('hustles', [{ id: 'logos', type: 'freelancing', name: 'Logos' }])
    await startFocus(DEMO, { block: null, area: 'hustle', hustleId: 'logos', subjectId: 'dbms', mode: 'deep', workMinutes: 50, now: NOW })
    const hustle = await loadActiveFocus(DEMO)
    expect(hustle).toMatchObject({ plan_block_id: null, area: 'hustle', hustle_id: 'logos', subject_id: null, mode: 'deep', planned_minutes: 50 })
    if (!hustle) throw new Error('no focus session')
    await finishSession(DEMO, { session: hustle, focused: 45, now: at('15:20') })
    expect(demoDb.get('focus_sessions', hustle.id)).toMatchObject({ outcome: 'done', completed: true, actual_minutes: 45 })
    expect(demoDb.list('time_entries')).toEqual([expect.objectContaining({ hustle_id: 'logos', minutes: 45, source: 'focus', focus_session_id: hustle.id })])

    await startFocus(DEMO, { block: null, area: 'academics', subjectId: 'dbms', hustleId: 'logos', mode: 'custom', workMinutes: 30, now: at('16:00') })
    const study = await loadActiveFocus(DEMO)
    expect(study).toMatchObject({ area: 'academics', subject_id: 'dbms', hustle_id: null })
    if (!study) throw new Error('no focus session')
    await stopFocus(DEMO, { session: study, focused: 12, now: at('16:15') })
    expect(demoDb.get('focus_sessions', study.id)).toMatchObject({ outcome: 'stopped', completed: false, actual_minutes: 12 })
    expect(demoDb.list('time_entries')).toHaveLength(1) // study time isn't hustle time
  })

  it('focus on a hustle block logs the minutes focused as hours for that hustle, also when stopped early', async () => {
    demoDb.insert('hustles', [{ id: 'logos', type: 'freelancing', name: 'Logos' }])
    const [row] = demoDb.insert('plan_blocks', [{ ...block('logos', '14:00', '14:45', { area: 'hustle', kind: 'hustle', hustle_id: 'logos' }), id: undefined }])
    if (!row) throw new Error('no block')
    await startFocus(DEMO, { block: row, mode: 'pomodoro', workMinutes: 25, now: NOW })
    const session = await loadActiveFocus(DEMO)
    expect(session?.hustle_id).toBe('logos')
    await finishBlock(DEMO, { block: row, outcome: 'done', session, focused: 24, now: at('14:44') })
    expect(demoDb.list('time_entries')).toEqual([
      expect.objectContaining({ hustle_id: 'logos', minutes: 24, source: 'focus', focus_session_id: session?.id, started_at: session?.started_at }),
    ])

    demoDb.update('plan_blocks', row.id, { status: 'planned' })
    await startFocus(DEMO, { block: row, mode: 'custom', workMinutes: 30, now: at('15:00') })
    const again = await loadActiveFocus(DEMO)
    if (!again) throw new Error('no focus session')
    await stopFocus(DEMO, { session: again, now: at('15:10') })
    expect(demoDb.list('time_entries').map((entry) => entry.minutes)).toEqual([24, 10])
  })

  it('Stop ends the focus session and the block is still to do', async () => {
    const row = setUp()
    await startFocus(DEMO, { block: row, mode: 'pomodoro', workMinutes: 25, now: NOW })
    const session = await loadActiveFocus(DEMO)
    if (!session) throw new Error('no focus session')
    await stopFocus(DEMO, { session, focused: 8, now: at('14:30') })
    expect(demoDb.list('focus_sessions')[0]).toMatchObject({ outcome: 'stopped', completed: false, actual_minutes: 8 })
    expect(demoDb.get('plan_blocks', row.id)).toMatchObject({ status: 'planned', actual_minutes: null })
  })
})
