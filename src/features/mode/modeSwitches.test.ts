import { describe, expect, it } from 'vitest'
import { blockAt } from '@/features/planner/schedule'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { stillOpen, toScheduledBlock } from './currentBlock'
import { currentMode, needsSwitchWarning } from './modes'
import { saveModeSwitch } from './modeSwitches'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const block = (id: string, area: string, status: string) => ({
  id,
  area,
  title: id,
  status,
  start_at: '2026-11-02T08:30:00.000Z',
  end_at: '2026-11-02T09:15:00.000Z',
})
const NOW = new Date('2026-11-02T08:45:00.000Z')

describe('the mode from the saved plan', () => {
  it("turns a plan block into the chip's block: academics is Study, personal tasks are Life", () => {
    expect(toScheduledBlock(block('sql', 'academics', 'planned'))).toEqual({
      id: 'sql',
      mode: 'study',
      title: 'sql',
      startsAt: '2026-11-02T08:30:00.000Z',
      endsAt: '2026-11-02T09:15:00.000Z',
    })
    expect(toScheduledBlock(block('laundry', 'personal', 'planned')).mode).toBe('life')
  })

  it('frees you when the running block is finished early or skipped', () => {
    const running = (status: string) => blockAt([block('sql', 'academics', status)].filter(stillOpen), NOW)
    expect(running('planned')?.id).toBe('sql')
    expect(running('in_progress')?.id).toBe('sql')
    for (const status of ['done', 'partial', 'missed']) expect(running(status)).toBeNull()
    expect(currentMode(null, NOW)).toBe('free')
  })

  it('warns when the Hustle tab is opened during a Study block from the plan', () => {
    const study = toScheduledBlock(block('sql', 'academics', 'planned'))
    expect(needsSwitchWarning({ block: study, now: NOW, fromPath: '/today', toPath: '/hustle', acknowledgedBlockIds: [] })).toBe(true)
    expect(needsSwitchWarning({ block: study, now: NOW, fromPath: '/today', toPath: '/hustle', acknowledgedBlockIds: ['sql'] })).toBe(false)
  })
})

describe('saveModeSwitch', () => {
  it('saves a confirmed switch as a mode_switch distraction event', async () => {
    await saveModeSwitch(DEMO, { blockId: 'sql', fromMode: 'study', toMode: 'hustle', reason: 'urgent', at: NOW.toISOString() })
    expect(demoDb.list('distraction_events')).toEqual([
      expect.objectContaining({ kind: 'mode_switch', from_mode: 'study', to_mode: 'hustle', reason: 'urgent', at: NOW.toISOString(), focus_session_id: null }),
    ])
  })
})
