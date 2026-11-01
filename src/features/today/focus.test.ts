import { describe, expect, it } from 'vitest'
import type { PlanBlock } from '@/features/planner/schedule'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { elapsedMinutes, finishBlock, focusedMinutes, focusLength, loadActiveFocus, nowView, partOf, startFocus, stopFocus, upNext } from './focus'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const iso = (time: string) => new Date(`2026-11-02T${time}:00`).toISOString() // local time
const NOW = new Date(`2026-11-02T14:20:00`)

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

describe('focus helpers', () => {
  it('counts minutes and lengths', () => {
    expect(elapsedMinutes(iso('14:00'), NOW)).toBe(20)
    expect(focusLength(block('now', '14:00', '14:45'), NOW)).toBe(25) // until the block ends
    expect(focusLength(block('later', '15:00', '15:30'), NOW)).toBe(30) // the whole block
    expect([partOf(45, 0.25), partOf(45, 0.5), partOf(45, 0.75), partOf(10, 0.9)]).toEqual([10, 25, 35, 5])
    expect(focusedMinutes({ started_at: iso('08:00'), planned_minutes: 30 }, NOW)).toBe(90) // a timer left running doesn't count for hours
  })

  it('shows the focus session first, else the block of right now, else the next block', () => {
    const blocks = [block('done', '13:00', '13:45', { status: 'done' }), block('now', '14:00', '14:45'), block('next', '15:00', '15:30'), block('skip', '16:00', '16:30', { status: 'missed' }), block('last', '17:00', '17:30')]
    expect(nowView(blocks, null, NOW)).toMatchObject({ kind: 'block', block: { id: 'now' } })
    expect(nowView(blocks, null, new Date('2026-11-02T14:50:00'))).toMatchObject({ kind: 'free', next: { id: 'next' } })
    expect(nowView(blocks, null, new Date('2026-11-02T18:00:00'))).toEqual({ kind: 'free', next: null })
    expect(upNext(blocks, NOW).map((b) => b.id)).toEqual(['next', 'last'])
  })
})

describe('Now card actions (Demo Mode)', () => {
  function setUp(values: Partial<PlanBlock> = {}) {
    demoDb.insert('subjects', [{ id: 'dbms', name: 'DBMS' }])
    demoDb.insert('topics', [{ id: 'unit', subject_id: 'dbms', title: 'Unit 1' }, { id: 'sql', subject_id: 'dbms', parent_id: 'unit', title: 'SQL' }])
    const [row] = demoDb.insert('plan_blocks', [{ ...block('now', '14:00', '14:45', { subject_id: 'dbms', topic_id: 'sql', ...values }), id: undefined }])
    if (!row) throw new Error('no block')
    return row
  }

  it('Start Focus times the rest of the block; Done counts the minutes focused and starts the topic', async () => {
    const row = setUp()
    await startFocus(DEMO, { block: row, now: NOW })
    const session = await loadActiveFocus(DEMO)
    expect(session).toMatchObject({ plan_block_id: row.id, area: 'academics', mode: 'custom', planned_minutes: 25, ended_at: null })
    expect(demoDb.get('plan_blocks', row.id)?.status).toBe('in_progress')

    await finishBlock(DEMO, { block: row, outcome: 'done', session, now: new Date('2026-11-02T14:44:00') })
    expect(demoDb.get('plan_blocks', row.id)).toMatchObject({ status: 'done', actual_minutes: 24 })
    expect(demoDb.list('focus_sessions')[0]).toMatchObject({ outcome: 'done', completed: true, actual_minutes: 24 })
    expect(await loadActiveFocus(DEMO)).toBeNull()
    expect(demoDb.get('topics', 'sql')?.status).toBe('learning')
  })

  it('Partial saves the part picked, Skip saves nothing and leaves the topic alone', async () => {
    const row = setUp()
    await finishBlock(DEMO, { block: row, outcome: 'partial', minutes: 25, now: NOW })
    expect(demoDb.get('plan_blocks', row.id)).toMatchObject({ status: 'partial', actual_minutes: 25 })

    demoDb.update('topics', 'sql', { status: 'not_started' })
    await finishBlock(DEMO, { block: row, outcome: 'missed', now: NOW })
    expect(demoDb.get('plan_blocks', row.id)).toMatchObject({ status: 'missed', actual_minutes: 0 })
    expect(demoDb.get('topics', 'sql')?.status).toBe('not_started')
  })

  it('Stop ends the focus session and the block is still to do', async () => {
    const row = setUp()
    await startFocus(DEMO, { block: row, now: NOW })
    const session = await loadActiveFocus(DEMO)
    if (!session) throw new Error('no focus session')
    await stopFocus(DEMO, { session, now: new Date('2026-11-02T14:30:00') })
    expect(demoDb.list('focus_sessions')[0]).toMatchObject({ outcome: 'stopped', completed: false, actual_minutes: 10 })
    expect(demoDb.get('plan_blocks', row.id)?.status).toBe('planned')
  })
})
