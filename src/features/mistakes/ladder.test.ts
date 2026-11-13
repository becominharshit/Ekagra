import { describe, expect, it } from 'vitest'
import { CARD_STATE } from '@/features/flashcards/fsrs'
import { getScheduler } from '@/features/flashcards/scheduler'
import {
  dueMistakes,
  firstReviewAt,
  mistakeFsrsStats,
  mistakeLabel,
  mistakeWeaknessScore,
  previewMistakeIntervals,
  reopenMistake,
  reviewMistake,
  type Mistake,
} from './ladder'

const NOW = new Date('2026-11-02T10:00:00.000Z')
const END_OF_DAY = new Date('2026-11-02T18:29:59.999Z')
const DAY = 24 * 60 * 60 * 1000
const inDays = (days: number, from = NOW) => new Date(from.getTime() + days * DAY).toISOString()

function mistake(id: string, values: Partial<Mistake> = {}): Mistake {
  return {
    id,
    user_id: 'u',
    topic_id: null,
    question_id: null,
    flashcard_id: null,
    code_snippet_id: null,
    concept: id,
    why_wrong: null,
    correct_approach: null,
    status: 'open',
    ladder_step: 0,
    correct_count: 0,
    last_correct_on: null,
    fsrs: {},
    next_review_at: inDays(1),
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...values,
  }
}

describe('FSRS mistake scheduling', () => {
  it('brings a brand-new mistake back after 1 day', () => {
    expect(firstReviewAt(NOW)).toBe(inDays(1))
  })

  it('schedules adaptive ts-fsrs intervals across distinct days and fixes after 3 recalls', async () => {
    const scheduler = await getScheduler(0.9, false)
    const intervals = previewMistakeIntervals(mistake('m'), NOW, scheduler)
    expect(intervals[1]).toBe(60_000)
    expect(intervals[3]).toBeGreaterThanOrEqual(10 * 60_000)
    expect(intervals[4]).toBeGreaterThan(intervals[3])

    const first = reviewMistake(mistake('m'), 3, NOW, '2026-11-02', scheduler)
    expect(first).toMatchObject({ status: 'open', ladder_step: 1, correct_count: 1, last_correct_on: '2026-11-02' })
    expect(mistakeFsrsStats(first.fsrs ?? {}).state).toBe(CARD_STATE.learning)

    const day2 = new Date(Date.parse(String(first.next_review_at)) + DAY)
    const second = reviewMistake(
      mistake('m', { fsrs: first.fsrs ?? {}, correct_count: 1, ladder_step: 1, last_correct_on: '2026-11-02' }),
      3,
      day2,
      '2026-11-03',
      scheduler,
    )
    expect(second).toMatchObject({ status: 'open', ladder_step: 2, correct_count: 2, last_correct_on: '2026-11-03' })
    expect(Date.parse(String(second.next_review_at))).toBeGreaterThan(day2.getTime())

    const day5 = new Date(Date.parse(String(second.next_review_at)) + DAY)
    const third = reviewMistake(
      mistake('m', { fsrs: second.fsrs ?? {}, correct_count: 2, ladder_step: 2, last_correct_on: '2026-11-03' }),
      3,
      day5,
      '2026-11-07',
      scheduler,
    )
    expect(third).toMatchObject({ status: 'fixed', ladder_step: 2, correct_count: 3, last_correct_on: '2026-11-07' })
  })

  it('counts multiple right recalls on the same calendar day once for correct_count while advancing FSRS', async () => {
    const scheduler = await getScheduler(0.9, false)
    const first = reviewMistake(mistake('m'), 3, NOW, '2026-11-02', scheduler)
    const tenMinLater = new Date(NOW.getTime() + 10 * 60_000)
    const sameDaySecond = reviewMistake(
      mistake('m', { fsrs: first.fsrs ?? {}, correct_count: 1, ladder_step: 1, last_correct_on: '2026-11-02' }),
      3,
      tenMinLater,
      '2026-11-02',
      scheduler,
    )
    expect(sameDaySecond.correct_count).toBe(1)
    expect(mistakeFsrsStats(sameDaySecond.fsrs ?? {}).state).toBe(CARD_STATE.review)
    expect(Date.parse(String(sameDaySecond.next_review_at))).toBeGreaterThan(NOW.getTime() + DAY)
  })

  it('requires Good or Easy (not Hard) to graduate to fixed on the 3rd distinct-day recall', async () => {
    const scheduler = await getScheduler(0.9, false)
    const patch = reviewMistake(mistake('m', { correct_count: 2, ladder_step: 2, last_correct_on: '2026-11-01' }), 2, NOW, '2026-11-02', scheduler)
    expect(patch).toMatchObject({ status: 'open', correct_count: 3 })
  })

  it('resets correct_count and logs an FSRS lapse/step-reset when graded Again (false / 1)', async () => {
    const scheduler = await getScheduler(0.9, false)
    const reviewed = reviewMistake(mistake('m'), 4, NOW, '2026-11-02', scheduler)
    const lapsed = reviewMistake(
      mistake('m', { fsrs: reviewed.fsrs ?? {}, ladder_step: 2, correct_count: 2, last_correct_on: '2026-10-30' }),
      false,
      new Date(NOW.getTime() + DAY),
      '2026-11-03',
      scheduler,
    )
    expect(lapsed).toMatchObject({ status: 'open', ladder_step: 0, correct_count: 0 })
    expect(mistakeFsrsStats(lapsed.fsrs ?? {}).lapses).toBe(1)
  })

  it('reopens a fixed mistake with clean FSRS state', () => {
    expect(reopenMistake(NOW)).toEqual({
      status: 'open',
      ladder_step: 0,
      correct_count: 0,
      last_correct_on: null,
      fsrs: {},
      next_review_at: inDays(1),
    })
  })
})

describe('due mistakes and weakness ranking', () => {
  it('lists open mistakes due by tonight (or now for learning steps), most overdue then weakest first', () => {
    const learningFuture = { state: CARD_STATE.learning, due: new Date(NOW.getTime() + 10 * 60_000).toISOString(), stability: 0.5, difficulty: 5, lapses: 0, reps: 1, elapsed_days: 0, scheduled_days: 0 }
    const learningDue = { state: CARD_STATE.learning, due: new Date(NOW.getTime() - 60_000).toISOString(), stability: 0.5, difficulty: 5, lapses: 1, reps: 1, elapsed_days: 0, scheduled_days: 0 }
    const list = [
      mistake('tomorrow', { next_review_at: inDays(1) }),
      mistake('learningLaterToday', { fsrs: learningFuture, next_review_at: learningFuture.due }),
      mistake('tonight', { next_review_at: new Date('2026-11-02T17:00:00Z').toISOString() }),
      mistake('fixed', { status: 'fixed', next_review_at: inDays(-3) }),
      mistake('overdue', { next_review_at: inDays(-2) }),
      mistake('learningNow', { fsrs: learningDue, next_review_at: learningDue.due }),
    ]
    expect(dueMistakes(list, END_OF_DAY, NOW).map((m) => m.id)).toEqual(['overdue', 'learningNow', 'tonight'])
  })

  it('scores lapsed low-stability open mistakes higher than stable ones', () => {
    const weak = mistake('w', { fsrs: { state: CARD_STATE.relearning, lapses: 3, stability: 0.4, difficulty: 8 }, next_review_at: inDays(-1) })
    const stronger = mistake('s', { correct_count: 2, fsrs: { state: CARD_STATE.review, lapses: 0, stability: 10, difficulty: 4 }, next_review_at: inDays(-1) })
    expect(mistakeWeaknessScore(weak, NOW)).toBeGreaterThan(mistakeWeaknessScore(stronger, NOW))
    expect(mistakeWeaknessScore(mistake('f', { status: 'fixed' }), NOW)).toBe(0)
  })

  it('says when a mistake comes back', () => {
    expect(mistakeLabel(mistake('a', { next_review_at: inDays(-1) }), NOW, END_OF_DAY)).toBe('Due now')
    expect(mistakeLabel(mistake('b', { next_review_at: inDays(3) }), NOW, END_OF_DAY)).toBe('Due in 3 d')
    expect(mistakeLabel(mistake('c', { status: 'fixed' }), NOW, END_OF_DAY)).toBe('Fixed')
  })
})
