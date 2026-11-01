import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { DEFAULT_SHARING, toPublished } from './social'
import { acceptPartnerCode, listNudges, listPartners, loadMyNumbers, loadMyStats, partnerCode, removePartner, samplePartner, saveMyStats, sendNudge } from './socialData'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const NOW = new Date(2026, 10, 4, 19, 30) // Wednesday evening

describe('sharing in Demo Mode', () => {
  it('keeps one sharing row on the device, and works out the numbers from the focus sessions and plan', async () => {
    expect(await loadMyStats(DEMO)).toBeNull()
    demoDb.insert('focus_sessions', [{ area: 'academics', mode: 'pomodoro', planned_minutes: 25, actual_minutes: 25, completed: true, started_at: new Date(2026, 10, 3, 9).toISOString() }])
    const numbers = await loadMyNumbers(DEMO, NOW)
    expect(numbers).toEqual({ weekStart: '2026-11-02', focusMinutes: 25, streakDays: 1, planPct: null })

    await saveMyStats(DEMO, toPublished({ ...DEFAULT_SHARING, displayName: 'Riya' }, numbers, null))
    await saveMyStats(DEMO, toPublished({ ...DEFAULT_SHARING, displayName: 'Riya S', streak: false }, numbers, null))
    expect(demoDb.list('shared_stats')).toHaveLength(1)
    expect(await loadMyStats(DEMO)).toMatchObject({ display_name: 'Riya S', focus_minutes: 25, streak_days: null, share_streak: false })
  })

  it('shows a sample partner, and says codes need an account', async () => {
    const [partner] = await listPartners(DEMO, NOW)
    expect(partner).toMatchObject({ userId: 'sample-aarav', name: 'Aarav (sample)', sample: true })
    expect(partner?.stats).toMatchObject({ focus_minutes: 230, streak_days: 7, studying_now: true }) // studying 19:00–21:00
    expect(samplePartner(new Date(2026, 10, 4, 9)).stats?.studying_now).toBe(false)
    expect((await partnerCode(DEMO)).code).toMatch(/^[0-9A-F]{10}$/)
    await expect(acceptPartnerCode(DEMO, '7F3A9C21B4')).rejects.toThrow(/Sign in/)
    await expect(removePartner(DEMO, 'sample-aarav')).rejects.toThrow(/stays in Demo Mode/)
    await expect(sendNudge(DEMO, { to: 'sample-aarav', kind: 'cheer' })).resolves.toBeUndefined()
    expect(await listNudges(DEMO, NOW)).toEqual({ received: [], sent: [] })
  })
})
