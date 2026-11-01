import { describe, expect, it } from 'vitest'
import type { MockQuestion } from './pattern'
import { autoMark, gradeItems, markFromGrade, mockRows, scoreMock, topicBreakdown, type FinishedMock, type MockMark } from './scoring'

const MCQ: MockQuestion = {
  id: 'mcq',
  topicId: 'joins',
  type: 'mcq',
  marks: 1,
  prompt: 'Which join keeps every row of the left table?',
  check: { id: 'mcq', prompt: 'Which join keeps every row of the left table?', explanation: 'Left outer joins keep the left rows.', difficulty: 2, type: 'mcq', options: ['Left outer', 'Inner'], correct: 0 },
}
const NUMERICAL: MockQuestion = {
  id: 'num',
  topicId: 'keys',
  type: 'numerical',
  marks: 2,
  prompt: 'How many keys?',
  check: { id: 'num', prompt: 'How many keys?', explanation: '', difficulty: 3, type: 'numerical', value: 3, tolerance: 0 },
}
const LONG: MockQuestion = { id: 'long', topicId: 'norm', type: 'long', marks: 10, prompt: 'Normalize R to BCNF.', check: null }
const LESSON_SHORT: MockQuestion = {
  id: 'short',
  topicId: 'joins',
  type: 'short',
  marks: 5,
  prompt: 'Explain joins.',
  check: { id: 'short', prompt: 'Explain joins.', explanation: '', difficulty: 2, type: 'short', model: 'Joins combine rows.', keyPoints: ['combine rows', 'matching columns'] },
}
const QUESTIONS = [MCQ, NUMERICAL, LONG, LESSON_SHORT]

const mark = (awarded: number | null, values: Partial<MockMark> = {}): MockMark => ({ awarded, by: 'ai', feedback: null, missing: [], modelAnswer: null, ...values })

describe('autoMark', () => {
  it('gives full marks or none to multiple choice and numericals from lessons', () => {
    expect(autoMark(MCQ, '0')).toEqual({ awarded: 1, by: 'app', feedback: 'Left outer joins keep the left rows.', missing: [], modelAnswer: 'Left outer' })
    expect(autoMark(MCQ, '1')?.awarded).toBe(0)
    expect(autoMark(NUMERICAL, ' 3 ')?.awarded).toBe(2)
    expect(autoMark(NUMERICAL, '4')).toMatchObject({ awarded: 0, modelAnswer: '3' })
  })

  it("never counts an empty answer as option 0, and leaves written answers to the marker", () => {
    expect(autoMark(MCQ, '')?.awarded).toBe(0)
    expect(autoMark(LONG, 'BCNF steps')).toBeNull()
    expect(autoMark(LESSON_SHORT, 'Joins combine rows')).toBeNull()
  })
})

describe('gradeItems', () => {
  it('sends only the written answers, numbered as in the test, with what a lesson knows', () => {
    const { items, idByKey } = gradeItems(QUESTIONS, { long: 'Find the keys, then split.', short: 'Joins combine rows.' })
    expect(items).toEqual([
      { key: 'a3', question: 'Normalize R to BCNF.', marks: 10, answer: 'Find the keys, then split.' },
      { key: 'a4', question: 'Explain joins.', marks: 5, answer: 'Joins combine rows.', keyPoints: ['combine rows', 'matching columns'], modelAnswer: 'Joins combine rows.' },
    ])
    expect(idByKey.get('a3')).toBe('long')
    expect(markFromGrade({ key: 'a3', awarded: 6.5, feedback: '', missing: ['BCNF check'], modelAnswer: 'Full answer', by: 'ai' })).toEqual(mark(6.5, { missing: ['BCNF check'], modelAnswer: 'Full answer' }))
  })
})

describe('scoreMock and topicBreakdown', () => {
  const marks = { mcq: mark(1), num: mark(0), long: mark(4), short: mark(null) }

  it('adds up the marks and counts the answers still to mark', () => {
    expect(scoreMock(QUESTIONS, marks)).toEqual({ awarded: 5, total: 18, share: 5 / 18, unmarked: 1 })
  })

  it('shows each topic, weakest first', () => {
    expect(topicBreakdown(QUESTIONS, marks)).toEqual([
      { topicId: 'keys', awarded: 0, marks: 2 },
      { topicId: 'joins', awarded: 1, marks: 6 },
      { topicId: 'norm', awarded: 4, marks: 10 },
    ])
  })
})

describe('mockRows', () => {
  const mock: FinishedMock = {
    quizId: 'quiz-1',
    subjectId: 'dbms',
    startedAt: '2026-11-02T09:00:00.000Z',
    finishedAt: '2026-11-02T09:40:00.000Z',
    minutes: 35,
    questions: QUESTIONS,
    answers: { mcq: '0', num: '', long: 'Find the keys, then split.', short: 'Joins combine rows on matching columns.' },
    marks: {
      mcq: autoMark(MCQ, '0') as MockMark,
      num: autoMark(NUMERICAL, '') as MockMark,
      long: mark(4, { feedback: 'The BCNF step is missing.', missing: ['Check every determinant'], modelAnswer: 'Find the candidate keys…' }),
      short: mark(2.5, { by: 'self' }),
    },
    timeMs: { mcq: 12_000, long: 900_000 },
  }
  const rows = mockRows(mock)

  it('saves the quiz with its score as a share of the marks and its time limit', () => {
    expect(rows.quiz).toEqual({
      id: 'quiz-1',
      kind: 'mock',
      subject_id: 'dbms',
      topic_ids: ['joins', 'keys', 'norm'],
      started_at: '2026-11-02T09:00:00.000Z',
      finished_at: '2026-11-02T09:40:00.000Z',
      time_limit_sec: 2100,
      score: 0.4167, // 7.5 of 18
    })
  })

  it('saves one attempt per question: right from half marks, time only for quick answers', () => {
    expect(rows.attempts.map((attempt) => [attempt.question_id, attempt.is_correct, attempt.score, attempt.time_ms])).toEqual([
      ['mcq', true, 1, 12_000],
      ['num', false, 0, null], // no time spent on it was noted
      ['long', false, 0.4, null],
      ['short', true, 0.5, null],
    ])
    expect(rows.attempts[2]?.answer).toEqual({
      given: 'Find the keys, then split.',
      awarded: 4,
      marks: 10,
      by: 'ai',
      feedback: 'The BCNF step is missing.',
      missing: ['Check every determinant'],
      modelAnswer: 'Find the candidate keys…',
      timeMs: 900_000,
    })
  })

  it('notes answers under half marks in the mistake notebook, with the marks, feedback and missing points', () => {
    expect(rows.mistakes).toEqual([
      expect.objectContaining({ question_id: 'num', topic_id: 'keys', why_wrong: 'I left it out in a mock test.', correct_approach: '3' }),
      {
        concept: 'Normalize R to BCNF.',
        why_wrong: 'In a mock test I got 4 of 10 marks. The BCNF step is missing.',
        correct_approach: 'Find the candidate keys…\n\nPoints to include: Check every determinant',
        topic_id: 'norm',
        question_id: 'long',
      },
    ])
  })
})
