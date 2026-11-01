import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { changeChallenge, listChallenges, listSnapshots, syncMetrics } from './metricsData'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
// Wednesday 11 November 2026: last week began on Monday 2 November.
const NOW = new Date(2026, 10, 11, 18)
const at = (day: number) => new Date(2026, 10, day, 10).toISOString()

function practiseLastWeek() {
  const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
  const [card] = demoDb.insert('flashcards', [{ front: 'Q', back: 'A' }])
  demoDb.insert('flashcard_reviews', [3, 3, 4, 2, 3].map((rating, index) => ({ flashcard_id: card?.id ?? '', rating, reviewed_at: at(3 + index) })))
  demoDb.insert('focus_sessions', [{ area: 'academics', mode: 'pomodoro', planned_minutes: 25, actual_minutes: 25, started_at: at(4), subject_id: subject?.id }])
  // This week: one more focus session.
  demoDb.insert('focus_sessions', [{ area: 'academics', mode: 'deep', planned_minutes: 50, actual_minutes: 40, started_at: at(10) }])
}

describe('weekly metric snapshots in Demo Mode', () => {
  it('saves the finished weeks that had practice, once, and works out this week live', async () => {
    practiseLastWeek()
    const first = await syncMetrics(DEMO, NOW)
    expect(first.snapshots.map((snapshot) => snapshot.week_start)).toEqual(['2026-11-02'])
    expect(first.snapshots[0]).toMatchObject({ memory: 0.8, focus_minutes: 25 })
    expect(first.thisWeek).toMatchObject({ weekStart: '2026-11-09', focusMinutes: 40, memory: null })

    await syncMetrics(DEMO, NOW)
    expect(await listSnapshots(DEMO)).toHaveLength(1)
  })

  it('saves nothing for weeks without any practice (and has no challenge to set yet)', async () => {
    const view = await syncMetrics(DEMO, NOW)
    expect(view.snapshots).toEqual([])
    expect(view.thisWeek.focusMinutes).toBe(0)
    expect(view.challenge).toBeNull()
  })
})

describe('the weekly challenge in Demo Mode', () => {
  it('starts on the first measured metric and is settled once its week is over', async () => {
    practiseLastWeek()
    const first = await syncMetrics(DEMO, NOW)
    expect(first.challenge).toMatchObject({ week_start: '2026-11-09', metric: 'memory', baseline: 0.8, target: 0.84, achieved: null })

    // A week later: that week had a focus session but no reviews, so memory couldn't be measured (missed).
    const next = await syncMetrics(DEMO, new Date(2026, 10, 18, 18))
    expect(next.challenges).toEqual([expect.objectContaining({ week_start: '2026-11-09', achieved: false })])
    expect(next.challenge).toMatchObject({ week_start: '2026-11-16', metric: 'memory', target: 0.84, baseline: null })

    await syncMetrics(DEMO, new Date(2026, 10, 18, 19))
    expect(await listChallenges(DEMO)).toHaveLength(2)
  })

  it('can challenge another metric, with a new target 5% better than its last value', async () => {
    practiseLastWeek()
    const view = await syncMetrics(DEMO, NOW)
    await changeChallenge(DEMO, { id: view.challenge?.id ?? '', metric: 'processing_speed', baseline: 20 })
    expect(await listChallenges(DEMO)).toEqual([expect.objectContaining({ metric: 'processing_speed', baseline: 20, target: 19 })])
  })
})
