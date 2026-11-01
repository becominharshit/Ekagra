import { describe, expect, it } from 'vitest'
import { dueMistakes, firstReviewAt, mistakeLabel, reopenMistake, reviewMistake, type Mistake } from './ladder'

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
    next_review_at: inDays(1),
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...values,
  }
}

describe('the 1 → 3 → 7 day ladder', () => {
  it('brings a new mistake back after 1 day', () => {
    expect(firstReviewAt(NOW)).toBe(inDays(1))
  })

  it('moves up after a right answer and is fixed after the second right answer on another day', () => {
    const first = reviewMistake(mistake('m'), true, NOW, '2026-11-02')
    expect(first).toEqual({ ladder_step: 1, correct_count: 1, last_correct_on: '2026-11-02', next_review_at: inDays(3) })

    const later = new Date(NOW.getTime() + 3 * DAY)
    const second = reviewMistake(mistake('m', { ladder_step: 1, correct_count: 1, last_correct_on: '2026-11-02' }), true, later, '2026-11-05')
    expect(second).toEqual({ status: 'fixed', correct_count: 2, last_correct_on: '2026-11-05' })
  })

  it('counts two right answers on the same day once', () => {
    expect(reviewMistake(mistake('m', { ladder_step: 1, correct_count: 1, last_correct_on: '2026-11-02' }), true, NOW, '2026-11-02')).toEqual({})
  })

  it('goes up to 7 days at most', () => {
    // Right before, but the count started again after a wrong answer: one step up from step 2 stays at 7 days.
    const patch = reviewMistake(mistake('m', { ladder_step: 2, correct_count: 0, last_correct_on: '2026-10-20' }), true, NOW, '2026-11-02')
    expect(patch).toMatchObject({ ladder_step: 2, correct_count: 1, next_review_at: inDays(7) })
  })

  it('sends a wrong answer back to 1 day and counts right answers from zero again', () => {
    const patch = reviewMistake(mistake('m', { ladder_step: 1, correct_count: 1, last_correct_on: '2026-10-30' }), false, NOW, '2026-11-02')
    expect(patch).toEqual({ status: 'open', ladder_step: 0, correct_count: 0, next_review_at: inDays(1) })
  })

  it('reopens a fixed mistake at the start of the ladder', () => {
    expect(reopenMistake(NOW)).toEqual({ status: 'open', ladder_step: 0, correct_count: 0, last_correct_on: null, next_review_at: inDays(1) })
  })
})

describe('due mistakes', () => {
  it('lists open mistakes due by tonight, the longest-waiting first', () => {
    const list = [
      mistake('tomorrow', { next_review_at: inDays(1) }),
      mistake('tonight', { next_review_at: new Date('2026-11-02T17:00:00Z').toISOString() }),
      mistake('fixed', { status: 'fixed', next_review_at: inDays(-3) }),
      mistake('overdue', { next_review_at: inDays(-2) }),
    ]
    expect(dueMistakes(list, END_OF_DAY).map((m) => m.id)).toEqual(['overdue', 'tonight'])
  })

  it('says when a mistake comes back', () => {
    expect(mistakeLabel(mistake('a', { next_review_at: inDays(-1) }), NOW, END_OF_DAY)).toBe('Due now')
    expect(mistakeLabel(mistake('b', { next_review_at: inDays(3) }), NOW, END_OF_DAY)).toBe('Due in 3 d')
    expect(mistakeLabel(mistake('c', { status: 'fixed' }), NOW, END_OF_DAY)).toBe('Fixed')
  })
})
