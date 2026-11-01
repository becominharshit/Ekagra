import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { listDistractions, logBlockedOpen, logDistraction, topReason } from './distractions'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const at = (time: string) => new Date(`2026-11-02T${time}:00`)

describe('"I got distracted" (Demo Mode)', () => {
  it('saves a self-report for the focus session, and lists the ones since a time', async () => {
    demoDb.insert('focus_sessions', [{ id: 'f1', area: 'academics', mode: 'pomodoro', planned_minutes: 25 }])
    await logDistraction(DEMO, { sessionId: 'f1', reason: '  Phone or social media ', at: at('09:10') })
    await logDistraction(DEMO, { sessionId: null, reason: 'Noise or people', at: at('14:00') })
    expect(demoDb.list('distraction_events')[0]).toMatchObject({ kind: 'self_report', focus_session_id: 'f1', reason: 'Phone or social media', at: at('09:10').toISOString() })
    expect((await listDistractions(DEMO, at('12:00').toISOString())).map((event) => event.reason)).toEqual(['Noise or people'])
    expect(await listDistractions(DEMO, at('00:00').toISOString())).toHaveLength(2)
  })

  it('saves blocked apps FocusGuard covered (Android) as blocked_open', async () => {
    await logBlockedOpen(DEMO, { packageName: 'com.instagram.android', at: at('15:05'), sessionId: null })
    expect(demoDb.list('distraction_events')).toEqual([expect.objectContaining({ kind: 'blocked_open', app_package: 'com.instagram.android', reason: null, at: at('15:05').toISOString() })])
  })
})

describe('the most noted distraction', () => {
  const note = (reason: string | null, time: string, kind = 'self_report') => ({ kind, reason, at: at(time).toISOString() })

  it('is the reason noted most often, the latest one when tied; other events and empty reasons are left out', () => {
    expect(topReason([note('Games', '09:00'), note('Phone or social media', '10:00'), note('Games', '11:00')])).toEqual({ reason: 'Games', count: 2 })
    expect(topReason([note('Games', '09:00'), note('Phone or social media', '10:00')])).toEqual({ reason: 'Phone or social media', count: 1 })
    expect(topReason([note('urgent', '09:00', 'mode_switch'), note(null, '10:00')])).toBeNull()
    expect(topReason([])).toBeNull()
  })
})
