import { beforeAll, describe, expect, it } from 'vitest'
import type { Json } from '@/types/database'
import {
  CARD_STATE,
  dueLabel,
  intervalLabel,
  isLapse,
  isNew,
  previewIntervals,
  reviewCard,
  reviewQueue,
  type Flashcard,
  type Scheduler,
} from './fsrs'
import { getScheduler } from './scheduler'

const NOW = new Date('2026-11-02T10:00:00.000Z')
const END_OF_DAY = new Date('2026-11-02T18:29:59.999Z')
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
let scheduler: Scheduler

beforeAll(async () => {
  scheduler = await getScheduler(0.9, false) // no fuzz: exact numbers
})

const minutesUntil = (iso: string, from: Date) => Math.round((Date.parse(iso) - from.getTime()) / MINUTE)

function card(id: string, values: Partial<Flashcard> = {}): Flashcard {
  return {
    id,
    user_id: 'u',
    topic_id: null,
    material_id: null,
    anchor_id: null,
    front: id,
    back: id,
    source: 'manual',
    fsrs: {},
    due_at: NOW.toISOString(),
    suspended: false,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...values,
  }
}

/** A card that was learned and is now in the review state, due at `dueAt`. */
function learned(id: string, dueAt: Date): Flashcard {
  const first = reviewCard(scheduler, {}, 3, new Date(dueAt.getTime() - 20 * DAY))
  const second = reviewCard(scheduler, first.fsrs, 3, new Date(Date.parse(first.dueAt)))
  return card(id, { fsrs: { ...(second.fsrs as Record<string, Json>), dueAt: dueAt.toISOString() }, due_at: dueAt.toISOString() })
}

describe('scheduling', () => {
  it('makes the scheduler once and reuses it', () => {
    expect(getScheduler(0.9, false)).toBe(getScheduler(0.9, false))
  })

  it('shows a new card again after 1 or 10 minutes, then days later once it is learned', () => {
    // Hard is halfway between the two learning steps (1 and 10 minutes); Easy skips them.
    expect(previewIntervals(scheduler, {}, NOW)).toEqual({ 1: MINUTE, 2: 5.5 * MINUTE, 3: 10 * MINUTE, 4: expect.any(Number) })

    const first = reviewCard(scheduler, {}, 3, NOW)
    expect(minutesUntil(first.dueAt, NOW)).toBe(10)
    expect(first.fsrs).toMatchObject({ state: CARD_STATE.learning, reps: 1 })

    // The state goes through the database as JSON (dates as text) and still works.
    const later = new Date(Date.parse(first.dueAt))
    const second = reviewCard(scheduler, JSON.parse(JSON.stringify(first.fsrs)) as Json, 3, later)
    expect(second.fsrs).toMatchObject({ state: CARD_STATE.review, reps: 2 })
    expect((Date.parse(second.dueAt) - later.getTime()) / DAY).toBeGreaterThan(3)
  })

  it('brings a forgotten card back after 10 minutes and counts the lapse', () => {
    const due = learned('c', NOW)
    const outcome = reviewCard(scheduler, due.fsrs, 1, NOW)
    expect(minutesUntil(outcome.dueAt, NOW)).toBe(10)
    expect(outcome.fsrs).toMatchObject({ state: CARD_STATE.relearning, lapses: 1 })
    // The review log keeps the state before the review.
    expect(outcome.log).toMatchObject({ rating: 1, state: CARD_STATE.review })
  })

  it('never counts a review as earlier than the last one (the screen clock can lag behind)', () => {
    const forgotten = reviewCard(scheduler, {}, 1, NOW) // Again: back in 1 minute
    const lagging = new Date(NOW.getTime() - 15_000)

    expect(previewIntervals(scheduler, forgotten.fsrs, lagging)).toMatchObject({ 1: MINUTE, 3: 10 * MINUTE })
    const outcome = reviewCard(scheduler, forgotten.fsrs, 3, lagging)
    expect(outcome.reviewedAt).toBe(NOW.toISOString())
    expect(minutesUntil(outcome.dueAt, NOW)).toBe(10)
  })

  it('treats a broken saved state as a new card instead of failing', () => {
    expect(reviewCard(scheduler, { state: 2, dueAt: 'not a date' }, 3, NOW).fsrs).toMatchObject({ state: CARD_STATE.learning, reps: 1 })
  })

  it("says a card's status in words", () => {
    expect(dueLabel(card('n'), NOW)).toBe('New')
    expect(dueLabel(card('s', { suspended: true }), NOW)).toBe('Suspended')
    expect(dueLabel(learned('due', new Date(NOW.getTime() - MINUTE)), NOW)).toBe('Due now')
    expect(dueLabel(learned('later', new Date(NOW.getTime() + 4 * DAY)), NOW)).toBe('Due in 4 d')
  })

  it('writes intervals the short way', () => {
    expect([intervalLabel(MINUTE), intervalLabel(10 * MINUTE), intervalLabel(14 * 60 * MINUTE), intervalLabel(5 * DAY), intervalLabel(70 * DAY)]).toEqual([
      '1 min',
      '10 min',
      '14 h',
      '5 d',
      '2 mo',
    ])
  })
})

describe('reviewQueue', () => {
  it('shows due learning cards, then reviews due today, new cards up to the limit, and learning cards due soon last', () => {
    const learning = (id: string, dueInMinutes: number) =>
      card(id, {
        fsrs: reviewCard(scheduler, {}, 3, new Date(NOW.getTime() - 10 * MINUTE)).fsrs,
        due_at: new Date(NOW.getTime() + dueInMinutes * MINUTE).toISOString(),
      })
    const old = learned('old', new Date(NOW.getTime() - 2 * DAY))
    const tonight = learned('tonight', new Date(NOW.getTime() + 6 * 60 * MINUTE))
    const tomorrow = learned('tomorrow', new Date(NOW.getTime() + DAY))
    const fresh = [1, 2, 3].map((n) => card(`new-${n}`, { created_at: new Date(NOW.getTime() + n).toISOString() }))
    const hidden = card('suspended', { suspended: true })
    const cards = [tomorrow, ...fresh, tonight, hidden, old, learning('soon', 5), learning('due', 0), learning('later', 45)]

    const queue = reviewQueue(cards, NOW, 2, END_OF_DAY)
    expect(queue.map((c) => c.id)).toEqual(['due', 'old', 'tonight', 'new-1', 'new-2', 'soon'])
    expect(isNew(fresh[0] as Flashcard)).toBe(true)
  })
})

describe('isLapse', () => {
  it('only counts Again on a learned card as forgetting it', () => {
    const due = learned('due', NOW)
    expect(isLapse(due, 1)).toBe(true)
    expect(isLapse(due, 3)).toBe(false)
    expect(isLapse(card('new'), 1)).toBe(false) // still learning: Again is normal
  })
})
