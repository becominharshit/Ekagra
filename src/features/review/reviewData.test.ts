import { describe, expect, it } from 'vitest'
import type { Subject } from '@/features/academics/subjects'
import { readSettings } from '@/features/profile/settings'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { readReviewChanges } from './changes'
import { loadReview, loadWeekStats, makeReview, updateReview, type ReviewSetup } from './reviewData'

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
    demoDb.insert('sleep_logs', [
      { date: '2026-11-03', bed_at: at(2, 23), wake_at: at(3, 7), minutes: 480 },
      { date: '2026-11-04', bed_at: at(4, 1), wake_at: at(4, 7), minutes: 360, source: 'health_connect' },
    ])
    demoDb.insert('workouts', [{ date: '2026-11-05', title: 'Hostel workout' }])

    const stats = await loadWeekStats(DEMO, WEEK, { academics: 55, hustle: 25, life: 20 })
    expect(stats.areas.academics).toEqual({ planned: 100, done: 40, budgetPct: 55, sharePct: 100 })
    expect(stats.blocks).toMatchObject({ planned: 2, done: 1, missed: 1 })
    expect(stats.subjects).toEqual([{ id: subjectId, name: 'DBMS', planned: 100, done: 40, attempts: 0, accuracy: null }])
    expect(stats.reviews).toEqual({ count: 1, retention: 1 })
    expect(stats.focus).toEqual({ minutes: 25, sessions: 1, completed: 1 })
    expect(stats.checkIns).toMatchObject({ days: 1, energy: 4 })
    expect(stats.hustle.income).toEqual([{ currency: 'INR', amount: 800 }])
    expect(stats.sleep).toMatchObject({ nights: 2, avgMinutes: 420, shortNights: 1 })
    // The 25-minute focus session was on the day after the 8-hour night.
    expect(stats.sleep.vsStudy).toMatchObject({ rested: { days: 1, focusMinutes: 25 }, short: { days: 1, focusMinutes: 0 } })
    expect(stats.workouts).toBe(1)
  })
})

describe('weekly reviews in Demo Mode', () => {
  const setup = (subjects: Subject[]): ReviewSetup => ({ settings: readSettings({}), subjects, mentorTone: 'balanced', peak: { start: '09:00', end: '13:00' }, today: '2026-11-08' })

  it('writes the review on the device from the rules, saves it once per week, and keeps what the student did', async () => {
    const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
    const subjectId = subject?.id ?? ''
    // A week with many missed blocks.
    demoDb.insert(
      'plan_blocks',
      [2, 3, 4, 5, 6, 7].map((day) => ({
        date: `2026-11-0${day}`,
        start_at: at(day, 9),
        end_at: at(day, 10),
        area: 'academics',
        kind: 'learn',
        title: 'Joins',
        subject_id: subjectId,
        planned_minutes: 50,
        status: day < 4 ? 'done' : 'missed',
        actual_minutes: day < 4 ? 50 : null,
      })),
    )
    const { review, aiError } = await makeReview(DEMO, WEEK, setup(demoDb.list('subjects')))
    expect(aiError).toBeNull()
    expect(review).toMatchObject({ week_start: '2026-11-02', source: 'device', model: null, completed_at: null })
    expect(review.insights).toEqual(['You finished 2 of 6 study blocks (33%): 4 were missed and 0 ended early.'])
    const changes = readReviewChanges(review.changes)
    expect(changes).toEqual([expect.objectContaining({ type: 'set_buffer', value: 17, status: 'open' })])

    await updateReview(DEMO, { id: review.id, patch: { changes: changes.map((change) => ({ ...change, status: 'applied' as const })), completed_at: '2026-11-08T12:00:00.000Z' } })
    const saved = await loadReview(DEMO, '2026-11-02')
    expect(readReviewChanges(saved?.changes)[0]?.status).toBe('applied')
    expect(saved?.completed_at).toBe('2026-11-08T12:00:00.000Z')

    // Making it again replaces the week's review (still one row).
    await makeReview(DEMO, WEEK, setup(demoDb.list('subjects')))
    expect(demoDb.list('weekly_reviews')).toHaveLength(1)
    expect(await loadReview(DEMO, '2026-10-26')).toBeNull()
  })
})
