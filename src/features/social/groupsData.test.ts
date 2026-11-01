import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { leaderboard, runningSession, studyingNow } from './groups'
import { createGroup, joinGroup, leaveGroup, listGroups, startGroupFocus } from './groupsData'
import { DEFAULT_SHARING, toPublished } from './social'
import { saveMyStats } from './socialData'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const EVENING = new Date(2026, 10, 4, 20, 15) // Wednesday 20:15

describe('study groups in Demo Mode', () => {
  it('shows a sample group with studying now, a running group focus and the leaderboard, and the student in it once sharing', async () => {
    let [group] = await listGroups(DEMO, EVENING)
    expect(group?.members.map((member) => member.name)).toEqual(['Riya (sample)', 'Kabir (sample)', 'Meera (sample)', 'Aarav (sample)'])
    expect(studyingNow(group?.members ?? []).map((member) => member.name)).toEqual(['Aarav (sample)', 'Riya (sample)'])
    expect(runningSession(group?.sessions ?? [], EVENING)?.minutes).toBe(50)

    await saveMyStats(DEMO, toPublished({ ...DEFAULT_SHARING, displayName: 'Dev', leaderboard: true }, { weekStart: '2026-11-02', focusMinutes: 400, streakDays: 2, planPct: null }, null))
    ;[group] = await listGroups(DEMO, EVENING)
    const board = leaderboard(group?.members ?? [], '2026-11-02')
    expect(board[0]).toMatchObject({ name: 'Dev (you)', minutes: 400, me: true, rank: 1 })
    expect(board.map((row) => row.name)).toEqual(['Dev (you)', 'Riya (sample)', 'Aarav (sample)', 'Meera (sample)', 'Kabir (sample)'])
  })

  it('says making, joining and leaving real groups needs an account; starting group focus there tells nobody', async () => {
    await expect(createGroup(DEMO, '')).rejects.toThrow(/name/)
    await expect(createGroup(DEMO, 'Maths gang')).rejects.toThrow(/sign in/)
    await expect(joinGroup(DEMO, '9C4E1B7A30')).rejects.toThrow(/sign in/)
    await expect(leaveGroup(DEMO, 'sample-group')).rejects.toThrow(/stays in Demo Mode/)
    await expect(startGroupFocus(DEMO, { groupId: 'sample-group', minutes: 25 })).resolves.toBeUndefined()
  })
})
