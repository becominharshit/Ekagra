import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { clientEarnings, earnings, entriesInMonth, monthEarnings, perHourLabel } from './earnings'
import { addFocusTime, addManualTime, deleteTimeEntry, listTimeEntries } from './time'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const local = (text: string) => new Date(text).toISOString() // local time → UTC timestamp

const money = [
  { kind: 'income', amount: 6000, client_id: 'cafe', occurred_on: '2026-11-03', hustle_id: 'h' },
  { kind: 'income', amount: 500, client_id: null, occurred_on: '2026-10-20', hustle_id: 'h' },
  { kind: 'expense', amount: 500, client_id: null, occurred_on: '2026-11-04', hustle_id: 'h' },
]
const time = [
  { minutes: 1500, client_id: 'cafe', started_at: local('2026-11-02T10:00:00'), hustle_id: 'h' },
  { minutes: 900, client_id: null, started_at: local('2026-10-31T23:30:00'), hustle_id: 'h' },
]

describe('earnings per hour', () => {
  it('is net profit divided by hours: ₹6,000 in 40 h = ₹150/h', () => {
    const all = earnings(money, time)
    expect(all).toEqual({ income: 6500, expense: 500, net: 6000, minutes: 2400, perHour: 150 })
    expect(perHourLabel(all, 'INR')).toBe('₹6,000 in 40 h = ₹150/h')
    expect(perHourLabel(earnings(money, []), 'INR')).toBe('₹6,000, no time logged yet')
    expect(earnings([], [{ minutes: 90 }])).toMatchObject({ net: 0, perHour: 0 })
  })

  it('works per client and per month (time by its local date)', () => {
    expect(clientEarnings(money, time).get('cafe')).toEqual({ income: 6000, expense: 0, net: 6000, minutes: 1500, perHour: 240 })
    expect(entriesInMonth(time, '2026-10')).toHaveLength(1) // 31 Oct, 23:30 local
    expect(monthEarnings(money, time, new Date('2026-11-20T12:00:00'))).toEqual({ income: 6000, expense: 500, net: 5500, minutes: 1500, perHour: 220 })
  })
})

describe('time entries (Demo Mode)', () => {
  it('adds time by hand (at noon that day) and from focus sessions (never under a minute)', async () => {
    demoDb.insert('hustles', [{ id: 'h', type: 'freelancing', name: 'Logos' }])
    await addManualTime(DEMO, { hustleId: 'h', fields: { date: '2026-11-02', minutes: 89.6, clientId: null, note: ' Client call ' } })
    await addFocusTime(DEMO, { hustleId: 'h', sessionId: 's1', startedAt: local('2026-11-02T18:00:00'), endedAt: local('2026-11-02T18:45:00'), minutes: 45 })
    await addFocusTime(DEMO, { hustleId: 'h', sessionId: 's2', startedAt: local('2026-11-02T19:00:00'), endedAt: local('2026-11-02T19:00:20'), minutes: 0.3 })

    const entries = await listTimeEntries(DEMO, 'h')
    expect(entries.map((entry) => [entry.source, entry.minutes, entry.note, entry.focus_session_id])).toEqual([
      ['focus', 45, null, 's1'],
      ['manual', 90, 'Client call', null],
    ])
    expect(entries[1]?.started_at).toBe(local('2026-11-02T12:00:00'))

    await deleteTimeEntry(DEMO, entries[0]?.id ?? '')
    expect(await listTimeEntries(DEMO, 'h')).toHaveLength(1)
  })
})
