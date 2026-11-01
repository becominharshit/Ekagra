import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { addCards, listCards, listReviewsSince, newCardsStarted, recordReview } from './flashcards'
import { CARD_STATE } from './fsrs'
import { getScheduler } from './scheduler'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const NOW = new Date('2026-11-02T10:00:00.000Z')

describe('flashcard reviews (Demo Mode)', () => {
  it('saves the new FSRS state and due date, and logs the review', async () => {
    await addCards(DEMO, [{ front: 'What is BCNF?', back: 'Every determinant is a superkey.', source: 'manual' }])
    const [card] = await listCards(DEMO)
    if (!card) throw new Error('no card')
    const scheduler = await getScheduler(0.9, false)

    await recordReview(DEMO, { card, grade: 3, durationMs: 4200.6, scheduler, now: NOW })

    const [saved] = await listCards(DEMO)
    expect(saved?.fsrs).toMatchObject({ state: CARD_STATE.learning, reps: 1 })
    expect(saved?.due_at).toBe('2026-11-02T10:10:00.000Z')
    const reviews = await listReviewsSince(DEMO, new Date('2026-11-02T00:00:00Z'))
    expect(reviews).toEqual([expect.objectContaining({ flashcard_id: card.id, rating: 3, duration_ms: 4201, reviewed_at: NOW.toISOString() })])
    // It was new when reviewed, so it counts against today's new-card limit (once).
    expect(newCardsStarted(reviews)).toBe(1)
  })

  it('counts a new card once even when it is reviewed again during learning', async () => {
    await addCards(DEMO, [{ front: 'Q', back: 'A', source: 'manual' }])
    const scheduler = await getScheduler(0.9, false)
    const [card] = await listCards(DEMO)
    if (!card) throw new Error('no card')
    await recordReview(DEMO, { card, grade: 1, durationMs: 1000, scheduler, now: NOW })
    const [again] = await listCards(DEMO)
    if (!again) throw new Error('no card')
    await recordReview(DEMO, { card: again, grade: 3, durationMs: 1000, scheduler, now: new Date(NOW.getTime() + 60_000) })
    expect(newCardsStarted(await listReviewsSince(DEMO, new Date(0)))).toBe(1)
  })
})
