import { describe, expect, it } from 'vitest'
import { expectedSuccess, kFactor, pickNext, questionRating, rateAnswer, ratingLabel, startingQuestionRating } from './elo'

describe('expectedSuccess', () => {
  it('is 50% for equal ratings and moves with the gap', () => {
    expect(expectedSuccess(1000, 1000)).toBe(0.5)
    expect(expectedSuccess(1000, 800)).toBeCloseTo(0.76, 2)
    expect(expectedSuccess(1000, 1200)).toBeCloseTo(0.24, 2)
    expect(expectedSuccess(1400, 1000)).toBeCloseTo(0.909, 3)
  })
})

describe('question ratings', () => {
  it('start from the difficulty: 1 → 800 … 5 → 1200', () => {
    expect([1, 2, 3, 4, 5].map(startingQuestionRating)).toEqual([800, 900, 1000, 1100, 1200])
    expect(startingQuestionRating(null)).toBe(1000)
    expect(startingQuestionRating(9)).toBe(1200)
    expect(questionRating({ rating: 1234, difficulty: 1 })).toBe(1234)
    expect(questionRating({ rating: null, difficulty: 2 })).toBe(900)
  })
})

describe('rateAnswer', () => {
  it('moves the student up and the question down after a right answer (K = 24, then 16)', () => {
    expect(rateAnswer({ student: 1000, question: 1000, answers: 0, right: true })).toEqual({ student: 1012, question: 996 })
    expect(rateAnswer({ student: 1000, question: 1000, answers: 0, right: false })).toEqual({ student: 988, question: 1004 })
    expect(kFactor(49)).toBe(24)
    expect(kFactor(50)).toBe(16)
    expect(rateAnswer({ student: 1000, question: 1000, answers: 60, right: true }).student).toBe(1008)
  })

  it('moves little after an expected result and a lot after a surprise', () => {
    const expectedWin = rateAnswer({ student: 1200, question: 800, answers: 0, right: true })
    const upset = rateAnswer({ student: 800, question: 1200, answers: 0, right: true })
    expect(expectedWin.student - 1200).toBeLessThan(3)
    expect(upset.student - 800).toBeGreaterThan(20)
  })

  it('stays within the limits the database allows', () => {
    // 110 − 24 × 0.51 would be 97.7: the floor is 100.
    expect(rateAnswer({ student: 110, question: 100, answers: 0, right: false }).student).toBe(100)
  })
})

describe('pickNext', () => {
  const now = Date.parse('2026-11-02T10:00:00Z')
  const questions = [
    { id: 'hard', rating: 1200, difficulty: 5 },
    { id: 'fit', rating: 850, difficulty: 2 }, // about 70% for a 1000 student
    { id: 'even', rating: null, difficulty: 3 }, // 1000: 50%
  ]

  it('asks the question with a chance of success closest to 70%', () => {
    expect(pickNext(questions, 1000, { now })?.id).toBe('fit')
    // A stronger student gets the harder one.
    expect(pickNext(questions, 1350, { now })?.id).toBe('hard')
  })

  it('skips questions asked in this session, and puts recently answered ones later', () => {
    expect(pickNext(questions, 1000, { skip: new Set(['fit']), now })?.id).toBe('even')
    expect(pickNext(questions, 1000, { lastAnswered: new Map([['fit', now - 2 * 3_600_000]]), now })?.id).toBe('even')
    expect(pickNext(questions, 1000, { skip: new Set(['fit', 'even', 'hard']), now })).toBeNull()
  })
})

describe('ratingLabel', () => {
  it('says it in words', () => {
    expect([850, 1000, 1100, 1250].map(ratingLabel)).toEqual(['Building up', 'Getting there', 'Good', 'Strong'])
  })
})
