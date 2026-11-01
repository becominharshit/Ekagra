import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { crashToday, guardOn, listCheckIns, saveCheckIn, saveEveningCheckIn, undoCrash } from './checkins'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const MONDAY = '2026-11-02'
const at = (time: string, date = MONDAY) => new Date(`${date}T${time}:00`) // local time

function addBlock(title: string, start: string, end: string) {
  const [row] = demoDb.insert('plan_blocks', [
    {
      date: MONDAY,
      start_at: at(start).toISOString(),
      end_at: at(end).toISOString(),
      area: 'academics',
      kind: 'learn',
      title,
      planned_minutes: (at(end).getTime() - at(start).getTime()) / 60_000,
    },
  ])
  if (!row) throw new Error('no block')
  return row
}

describe('daily check-ins (Demo Mode)', () => {
  it('keeps one row per day: "I Crashed" and the evening check-in fill in the same row', async () => {
    await crashToday(DEMO, at('13:00'))
    expect(await listCheckIns(DEMO, MONDAY)).toEqual([
      expect.objectContaining({ date: MONDAY, minimum_day: true, crashed_at: at('13:00').toISOString(), energy: null, mood: null }),
    ])

    await saveCheckIn(DEMO, MONDAY, { energy: 2, mood: 3, top_distraction: 'Games', checked_in_at: at('21:30').toISOString() })
    const rows = await listCheckIns(DEMO, MONDAY)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ minimum_day: true, energy: 2, mood: 3, top_distraction: 'Games' })

    await undoCrash(DEMO, MONDAY)
    expect((await listCheckIns(DEMO, MONDAY))[0]).toMatchObject({ minimum_day: false, crashed_at: null, energy: 2 })
  })

  it('the evening check-in marks the blocks and saves energy, mood and the biggest distraction', async () => {
    const done = addBlock('SQL', '09:00', '09:45')
    const partly = addBlock('ER model', '10:00', '10:45')
    const missed = addBlock('Loops', '11:00', '11:45')
    await saveEveningCheckIn(DEMO, {
      date: MONDAY,
      energy: 3,
      mood: 4,
      topDistraction: 'Phone or social media',
      outcomes: [
        { block: done, outcome: 'done' },
        { block: partly, outcome: 'partial' },
        { block: missed, outcome: 'missed' },
      ],
      session: null,
      now: at('21:30'),
    })
    expect(demoDb.get('plan_blocks', done.id)).toMatchObject({ status: 'done', actual_minutes: 45 })
    expect(demoDb.get('plan_blocks', partly.id)).toMatchObject({ status: 'partial', actual_minutes: 25 }) // about half
    expect(demoDb.get('plan_blocks', missed.id)).toMatchObject({ status: 'missed', actual_minutes: 0 })
    expect((await listCheckIns(DEMO, MONDAY))[0]).toMatchObject({
      energy: 3,
      mood: 4,
      top_distraction: 'Phone or social media',
      checked_in_at: at('21:30').toISOString(),
    })
  })

  it('turns on the Burnout Guard after the last 3 check-ins had energy of 2 or less', async () => {
    for (const [date, energy] of [['2026-10-30', 2], ['2026-10-31', 1], ['2026-11-01', 2]] as const) {
      await saveCheckIn(DEMO, date, { energy, mood: 3 })
    }
    expect(guardOn(MONDAY, await listCheckIns(DEMO, '2026-10-20'))).toBe(true)

    await saveCheckIn(DEMO, '2026-11-01', { energy: 4, mood: 4 })
    expect(guardOn(MONDAY, await listCheckIns(DEMO, '2026-10-20'))).toBe(false)
  })
})
