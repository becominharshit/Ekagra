import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { loadWeekStats } from './reviewData'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const WEEK = new Date(2026, 10, 2)
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString()

describe("a week's numbers in Demo Mode", () => {
  it('reads the week from the device', async () => {
    const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
    const subjectId = subject?.id ?? ''
    const [card] = demoDb.insert('flashcards', [{ front: 'Q', back: 'A' }])
    const [hustle] = demoDb.insert('hustles', [{ name: 'Logo design', type: 'freelancing' }])
    demoDb.insert('plan_blocks', [
      { date: '2026-11-03', start_at: at(3, 9), end_at: at(3, 10), area: 'academics', kind: 'learn', title: 'Joins', subject_id: subjectId, planned_minutes: 50, actual_minutes: 40, status: 'done' },
      { date: '2026-11-04', start_at: at(4, 9), end_at: at(4, 10), area: 'academics', kind: 'learn', title: 'Keys', subject_id: subjectId, planned_minutes: 50, status: 'missed' },
    ])
    demoDb.insert('flashcard_reviews', [{ flashcard_id: card?.id ?? '', rating: 3, reviewed_at: at(4) }])
    demoDb.insert('focus_sessions', [{ area: 'academics', mode: 'pomodoro', planned_minutes: 25, actual_minutes: 25, completed: true, started_at: at(3) }])
    demoDb.insert('daily_checkins', [{ date: '2026-11-03', energy: 4, mood: 4 }])
    demoDb.insert('transactions', [{ hustle_id: hustle?.id ?? '', kind: 'income', amount: 800, currency: 'INR', occurred_on: '2026-11-05' }])

    const stats = await loadWeekStats(DEMO, WEEK, { academics: 55, hustle: 25, life: 20 })
    expect(stats.areas.academics).toEqual({ planned: 100, done: 40, budgetPct: 55, sharePct: 100 })
    expect(stats.blocks).toMatchObject({ planned: 2, done: 1, missed: 1 })
    expect(stats.subjects).toEqual([{ id: subjectId, name: 'DBMS', planned: 100, done: 40, attempts: 0, accuracy: null }])
    expect(stats.reviews).toEqual({ count: 1, retention: 1 })
    expect(stats.focus).toEqual({ minutes: 25, sessions: 1, completed: 1 })
    expect(stats.checkIns).toMatchObject({ days: 1, energy: 4 })
    expect(stats.hustle.income).toEqual([{ currency: 'INR', amount: 800 }])
  })
})
