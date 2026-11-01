import { describe, expect, it } from 'vitest'
import type { Flashcard } from '@/features/flashcards/fsrs'
import type { Mistake } from '@/features/mistakes/ladder'
import { reviewMinutesByDay } from './reviewLoad'

const utcDay = (iso: string) => iso.slice(0, 10)

/** A learned card (FSRS state 2 = review) due at `dueAt`, or a new card. */
const card = (id: string, dueAt?: string, values: Partial<Flashcard> = {}) =>
  ({ id, suspended: false, fsrs: dueAt ? { state: 2 } : {}, due_at: dueAt ?? '2026-11-02T00:00:00Z', ...values }) as Flashcard
const mistake = (id: string, nextReviewAt: string, status = 'open') => ({ id, status, next_review_at: nextReviewAt }) as Mistake

describe('reviewMinutesByDay', () => {
  it('counts overdue cards today, due cards on their day, and new cards at the daily limit (in 5-minute steps)', () => {
    const cards = [
      card('overdue', '2026-10-30T09:00:00Z'),
      card('due-today', '2026-11-02T15:00:00Z'),
      card('due-in-two-days', '2026-11-04T08:00:00Z'),
      card('suspended', '2026-11-02T08:00:00Z', { suspended: true }),
      ...Array.from({ length: 70 }, (_, i) => card(`new-${i}`)),
    ]
    // Today: 2 reviews + 30 new = 32 cards × 12 s = 6.4 min → 10. Tomorrow: 30 new = 6 min → 10.
    // Day 3: 1 review + the last 10 new = 2.2 min → 5. Day 4: nothing.
    expect(reviewMinutesByDay({ cards, mistakes: [], today: '2026-11-02', days: 4, newCardsPerDay: 30, localDate: utcDay })).toEqual({
      '2026-11-02': 10,
      '2026-11-03': 10,
      '2026-11-04': 5,
    })
  })

  it('adds open mistakes on the day they come back, and adds up before rounding', () => {
    const mistakes = [
      mistake('overdue', '2026-11-01T10:00:00Z'),
      mistake('tomorrow', '2026-11-03T10:00:00Z'),
      mistake('fixed', '2026-11-02T10:00:00Z', 'fixed'),
    ]
    // Today: 1 card (12 s) + 1 mistake (45 s) = 57 s → 5 min, not 5 + 5.
    const minutes = reviewMinutesByDay({
      cards: [card('due', '2026-11-02T09:00:00Z')],
      mistakes,
      today: '2026-11-02',
      days: 3,
      newCardsPerDay: 20,
      localDate: utcDay,
    })
    expect(minutes).toEqual({ '2026-11-02': 5, '2026-11-03': 5 })
  })
})
