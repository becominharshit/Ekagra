import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { deleteSleep, listSleep, listSteps, saveNights, saveSteps, syncHealthConnect } from './healthData'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const night = (date: string, minutes: number) => ({ date, bedAt: `${date}T00:00:00.000Z`, wakeAt: `${date}T0${Math.floor(minutes / 60)}:00:00.000Z`, minutes })

describe('sleep and steps in Demo Mode', () => {
  it('keeps one night per morning and source: saving again changes it', async () => {
    await saveNights(DEMO, [night('2026-11-02', 420)], 'manual')
    await saveNights(DEMO, [night('2026-11-02', 450)], 'manual')
    await saveNights(DEMO, [night('2026-11-02', 400), night('2026-11-03', 380)], 'health_connect')
    const rows = await listSleep(DEMO, '2026-11-01')
    expect(rows.map((row) => [row.date, row.source, row.minutes]).sort()).toEqual([
      ['2026-11-02', 'health_connect', 400],
      ['2026-11-02', 'manual', 450],
      ['2026-11-03', 'health_connect', 380],
    ])
    await deleteSleep(DEMO, rows.find((row) => row.source === 'manual')?.id ?? '')
    expect((await listSleep(DEMO, '2026-11-01')).map((row) => row.source)).toEqual(['health_connect', 'health_connect'])
  })

  it('keeps one step count per day and source, and leaves out impossible ones', async () => {
    await saveSteps(DEMO, [{ date: '2026-11-02', steps: 5000 }], 'manual')
    await saveSteps(DEMO, [{ date: '2026-11-02', steps: 6200 }, { date: '2026-11-03', steps: -4 }, { date: '2026-11-04', steps: 2.5 }], 'manual')
    expect((await listSteps(DEMO, '2026-11-01')).map((row) => [row.date, row.steps])).toEqual([['2026-11-02', 6200]])
  })

  it('brings nothing in from Health Connect outside the Android app', async () => {
    expect(await syncHealthConnect(DEMO, new Date(2026, 10, 2, 9))).toEqual({ nights: 0, days: 0 })
  })
})
