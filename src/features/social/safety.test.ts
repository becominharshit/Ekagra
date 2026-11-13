import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { listGroups, joinGroup } from './groupsData'
import { acceptPartnerCode, listPartners, SAMPLE_PARTNER_ID } from './socialData'
import {
  blockUser,
  clearDemoSafetyForTest,
  listAbuseReports,
  listBlockedUsers,
  submitAbuseReport,
  unblockUser,
} from './safety'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const NOW = new Date('2026-11-02T14:00:00.000Z')

describe('social safety controls (Demo Mode)', () => {
  beforeEach(() => {
    clearDemoSafetyForTest()
  })

  afterEach(() => {
    clearDemoSafetyForTest()
  })

  it('blocks a partner or group member, hides them immediately, and restores them on unblock', async () => {
    expect((await listPartners(DEMO, NOW, 'UTC')).map((p) => p.userId)).toEqual([SAMPLE_PARTNER_ID])

    await blockUser(DEMO, { targetUserId: SAMPLE_PARTNER_ID, displayName: 'Aarav (sample)', reason: 'Need quiet focus' })

    const blocked = await listBlockedUsers(DEMO)
    expect(blocked).toHaveLength(1)
    expect(blocked[0]).toMatchObject({ blockedUserId: SAMPLE_PARTNER_ID, displayName: 'Aarav (sample)', reason: 'Need quiet focus' })

    expect(await listPartners(DEMO, NOW, 'UTC')).toEqual([])
    const [group] = await listGroups(DEMO, NOW, 'UTC')
    expect(group?.members.some((m) => m.userId === SAMPLE_PARTNER_ID)).toBe(false)

    await unblockUser(DEMO, SAMPLE_PARTNER_ID)
    expect(await listBlockedUsers(DEMO)).toEqual([])
    expect((await listPartners(DEMO, NOW, 'UTC')).map((p) => p.userId)).toEqual([SAMPLE_PARTNER_ID])
  })

  it('records abuse reports with optional immediate block and validates categories + invite formats', async () => {
    await submitAbuseReport(DEMO, {
      reportedUserId: 'sample-riya',
      reportedName: 'Riya (sample)',
      category: 'spam',
      contextType: 'group',
      details: 'Repeated spam messages',
      alsoBlock: true,
    })

    const reports = await listAbuseReports(DEMO)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ reportedUserId: 'sample-riya', category: 'spam', contextType: 'group', status: 'open' })

    const blocked = await listBlockedUsers(DEMO)
    expect(blocked.map((b) => b.blockedUserId)).toContain('sample-riya')

    await expect(acceptPartnerCode(DEMO, 'BAD')).rejects.toThrow(/10-character/)
    await expect(joinGroup(DEMO, '123')).rejects.toThrow(/10-character/)
  })
})
