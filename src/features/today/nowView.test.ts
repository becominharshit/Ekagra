import { describe, expect, it } from 'vitest'
import type { FocusSession } from '@/features/focus/sessions'
import type { PlanBlock } from '@/features/planner/schedule'
import { nowView, upNext } from './nowView'

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

describe('the Now card', () => {
  it('shows the focus session first, else the block of right now, else the next block', () => {
    const blocks = [
      block('done', '13:00', '13:45', { status: 'done' }),
      block('now', '14:00', '14:45'),
      block('next', '15:00', '15:30'),
      block('skip', '16:00', '16:30', { status: 'missed' }),
      block('last', '17:00', '17:30'),
    ]
    expect(nowView(blocks, null, NOW)).toMatchObject({ kind: 'block', block: { id: 'now' } })
    expect(nowView(blocks, null, new Date('2026-11-02T14:50:00'))).toMatchObject({ kind: 'free', next: { id: 'next' } })
    expect(nowView(blocks, null, new Date('2026-11-02T18:00:00'))).toEqual({ kind: 'free', next: null })
    expect(upNext(blocks, NOW).map((b) => b.id)).toEqual(['next', 'last'])

    const forBlock = { id: 's1', plan_block_id: 'next' } as FocusSession
    const onItsOwn = { id: 's2', plan_block_id: null } as FocusSession
    expect(nowView(blocks, forBlock, NOW)).toMatchObject({ kind: 'focus', session: { id: 's1' }, block: { id: 'next' } })
    expect(nowView(blocks, onItsOwn, NOW)).toMatchObject({ kind: 'focus', session: { id: 's2' }, block: null })
  })
})
