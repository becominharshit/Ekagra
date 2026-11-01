import { describe, expect, it } from 'vitest'
import { average, dailyValues, nightFromTimes, nightsFromSessions, onePerDate, regularityLabel, sleepRegularity } from './health'

// Local times in November 2026.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute)

describe("Health Connect's sleep", () => {
  it('keeps one night per morning, the longest session, and leaves out naps', () => {
    const night = { start: at(1, 23, 30).getTime(), end: at(2, 7).getTime(), minutes: 420 }
    const nap = { start: at(2, 14).getTime(), end: at(2, 15).getTime(), minutes: 55 }
    const watch = { start: at(2, 23).getTime(), end: at(3, 6, 30).getTime(), minutes: 400 }
    const phone = { start: at(3, 0, 30).getTime(), end: at(3, 6).getTime(), minutes: 320 } // the same night, shorter
    expect(nightsFromSessions([nap, phone, night, watch])).toEqual([
      { date: '2026-11-02', bedAt: at(1, 23, 30).toISOString(), wakeAt: at(2, 7).toISOString(), minutes: 420 },
      { date: '2026-11-03', bedAt: at(2, 23).toISOString(), wakeAt: at(3, 6, 30).toISOString(), minutes: 400 },
    ])
  })

  it('keeps one row per day: what the student typed wins over Health Connect', () => {
    const rows = [
      { date: '2026-11-03', source: 'health_connect', minutes: 400 },
      { date: '2026-11-02', source: 'health_connect', minutes: 420 },
      { date: '2026-11-03', source: 'manual', minutes: 450 },
    ]
    expect(onePerDate(rows)).toEqual([
      { date: '2026-11-02', source: 'health_connect', minutes: 420 },
      { date: '2026-11-03', source: 'manual', minutes: 450 },
    ])
  })
})

describe('sleep regularity', () => {
  const night = (day: number, bed: [number, number], wake: [number, number]) => ({ bed_at: at(day - 1, ...bed).toISOString(), wake_at: at(day, ...wake).toISOString() })

  it('is 100 for the same times every day, even around midnight', () => {
    expect(sleepRegularity([night(2, [23, 30], [7, 0]), night(3, [23, 30], [7, 0]), night(4, [23, 30], [7, 0])])).toBe(100)
  })

  it('drops as bed and wake times wander (bedtimes either side of midnight are close)', () => {
    // Bedtimes 23:00, 00:00, 01:00 (± 49 min) and wake times 07:00 every day: 100 − 24.5 × 100/120 ≈ 80.
    const wandering = [night(2, [23, 0], [7, 0]), { bed_at: at(3, 0).toISOString(), wake_at: at(3, 7).toISOString() }, { bed_at: at(4, 1).toISOString(), wake_at: at(4, 7).toISOString() }]
    expect(sleepRegularity(wandering)).toBe(80)
    const chaos = [night(2, [21, 0], [5, 0]), night(3, [3, 0], [12, 0]), night(4, [22, 0], [6, 0])]
    expect(sleepRegularity(chaos)).toBeLessThan(10)
    expect(sleepRegularity(wandering.slice(0, 2))).toBeNull()
    expect([95, 70, 40].map(regularityLabel)).toEqual(['Very regular', 'Fairly regular', 'Irregular times'])
  })
})

describe('typed nights and chart values', () => {
  it('works out a typed night: a bedtime after the wake time was the evening before', () => {
    expect(nightFromTimes('2026-11-02', '23:30', '07:00')).toEqual({ night: { date: '2026-11-02', bedAt: at(1, 23, 30).toISOString(), wakeAt: at(2, 7).toISOString(), minutes: 450 } })
    expect(nightFromTimes('2026-11-02', '01:15', '08:00')).toMatchObject({ night: { minutes: 405 } })
    expect(nightFromTimes('2026-11-02', '7:00', '08:00')).toEqual({ problem: 'Enter both times, e.g. 23:30 and 07:00.' })
    expect(nightFromTimes('2026-11-02', '08:00', '07:00')).toEqual({ problem: "That's more than 16 hours: check the times." })
  })

  it('gives a value for each of the last days, null where there is nothing, and averages', () => {
    const rows = [
      { date: '2026-11-01', steps: 9000 },
      { date: '2026-11-03', steps: 4000 },
    ]
    expect(dailyValues(rows, '2026-11-03', 3, (row) => row.steps)).toEqual([
      { date: '2026-11-01', value: 9000 },
      { date: '2026-11-02', value: null },
      { date: '2026-11-03', value: 4000 },
    ])
    expect(average([7000, 8001])).toBe(7501)
    expect(average([])).toBeNull()
  })
})
