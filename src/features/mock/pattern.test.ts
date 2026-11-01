import { describe, expect, it } from 'vitest'
import type { Question, QuestionType } from '@/features/academics/pastPapers'
import { buildMockTest, examPattern, groupLabel, isAutoMarked, mockMinutes, mockPool, scalePattern, type ExamPattern, type PoolQuestion } from './pattern'

const paper = (paperId: string, ...groups: [QuestionType, number | null, number][]) =>
  groups.flatMap(([type, marks, count]) => Array.from({ length: count }, () => ({ past_paper_id: paperId, type, marks })))

/** The Demo Mode DBMS paper: 4 short answers of 5 marks, 2 long answers and 1 program of 10. */
const DBMS = paper('p1', ['long', 10, 1], ['short', 5, 1], ['code', 10, 1], ['short', 5, 2], ['long', 10, 1], ['short', 5, 1])

const shape = (pattern: ExamPattern | null) => pattern?.groups.map((group) => `${group.type} ${group.count}×${group.marks}`)

describe('examPattern', () => {
  it('reads the sections of a paper, smaller questions first, at 1.8 minutes per mark', () => {
    const pattern = examPattern(DBMS)
    expect(shape(pattern)).toEqual(['short 4×5', 'long 2×10', 'code 1×10'])
    expect(pattern).toMatchObject({ totalMarks: 50, minutes: 90, papers: 1 })
  })

  it('takes the median count over several papers', () => {
    const pattern = examPattern([
      ...paper('a', ['short', 2, 5], ['long', 10, 3]),
      ...paper('b', ['short', 2, 4], ['long', 10, 3], ['code', 10, 1]),
      ...paper('c', ['short', 2, 6], ['long', 10, 2]),
    ])
    // Programs were in 1 paper of 3, so the usual paper has none.
    expect(shape(pattern)).toEqual(['short 5×2', 'long 3×10'])
    expect(pattern).toMatchObject({ totalMarks: 40, minutes: 70, papers: 3 })
  })

  it('guesses missing marks from the type, reads unknown types as short answers, and skips questions without a paper', () => {
    const pattern = examPattern([...paper('a', ['mcq', null, 10], ['long', null, 2]), { past_paper_id: 'a', type: 'essay', marks: 5 }, { past_paper_id: null, type: 'long', marks: 10 }])
    expect(shape(pattern)).toEqual(['mcq 10×1', 'short 1×5', 'long 2×10'])
  })

  it('uses the biggest paper when the papers have nothing in common', () => {
    const pattern = examPattern([...paper('a', ['short', 2, 5]), ...paper('b', ['long', 10, 3]), ...paper('c', ['code', 5, 2])])
    expect(shape(pattern)).toEqual(['long 3×10'])
  })

  it('has no pattern without past papers', () => {
    expect(examPattern([])).toBeNull()
  })
})

describe('scalePattern and mockMinutes', () => {
  it('makes a half paper with the same mix', () => {
    const half = scalePattern(examPattern(DBMS) as ExamPattern, 0.5)
    // 3.5 of 7 questions → 4: the program's half question is the biggest remainder.
    expect(shape(half)).toEqual(['short 2×5', 'long 1×10', 'code 1×10'])
    expect(half).toMatchObject({ totalMarks: 30, minutes: 55 })
  })

  it('keeps at least one question, and the whole paper at 100%', () => {
    const one: ExamPattern = { groups: [{ type: 'long', marks: 10, count: 1 }], totalMarks: 10, minutes: 20, papers: 1 }
    expect(shape(scalePattern(one, 0.5))).toEqual(['long 1×10'])
    expect(scalePattern(one, 1)).toBe(one)
  })

  it('rounds the time to 5 minutes, at least 10', () => {
    expect([100, 70, 50, 3].map(mockMinutes)).toEqual([180, 125, 90, 10])
    expect(groupLabel({ count: 4, marks: 5 })).toBe('4 × 5 marks')
  })
})

describe('mockPool', () => {
  const row = (values: Partial<Question>): Question =>
    ({ id: 'x', topic_id: 't1', source: 'pyq', source_ref: null, type: 'short', prompt: 'Q', marks: null, options: null, answer: null, explanation: null, difficulty: null, ...values }) as Question

  it('takes past-paper questions and readable check questions', () => {
    const pool = mockPool([
      row({ id: 'pyq', marks: 5 }),
      row({ id: 'mcq', source: 'generated', source_ref: { kind: 'check' }, type: 'mcq', options: ['A', 'B'], answer: { correct: 1 } }),
      row({ id: 'broken', source: 'generated', source_ref: { kind: 'check' }, type: 'mcq', options: ['A'], answer: { correct: 3 } }),
      row({ id: 'tutor', source: 'generated', source_ref: { kind: 'tutor' } }),
    ])
    expect(pool.map((question) => [question.id, question.type, question.marks, question.check?.type ?? null])).toEqual([
      ['pyq', 'short', 5, null],
      ['mcq', 'mcq', null, 'mcq'],
    ])
    expect(pool.map(isAutoMarked)).toEqual([false, true])
  })
})

describe('buildMockTest', () => {
  const fromPaper = (id: string, type: QuestionType, marks: number | null, topicId: string | null = 't1'): PoolQuestion => ({ id, topicId, type, marks, prompt: `Question ${id}`, check: null })
  const check = (id: string, type: 'mcq' | 'short', topicId = 't1'): PoolQuestion => ({
    id,
    topicId,
    type,
    marks: null,
    prompt: `Check ${id}`,
    check:
      type === 'mcq'
        ? { id, prompt: `Check ${id}`, explanation: '', difficulty: 2, type: 'mcq', options: ['A', 'B'], correct: 1 }
        : { id, prompt: `Check ${id}`, explanation: '', difficulty: 2, type: 'short', model: 'Model', keyPoints: ['point'] },
  })
  const pattern = (...groups: [QuestionType, number, number][]): ExamPattern => ({
    groups: groups.map(([type, marks, count]) => ({ type, marks, count })),
    totalMarks: 0,
    minutes: 0,
    papers: 1,
  })

  it('fills each section with the best fits: check questions for multiple choice, then past papers', () => {
    const test = buildMockTest(pattern(['mcq', 1, 2], ['short', 5, 2], ['long', 10, 1], ['code', 10, 1]), [
      fromPaper('m1', 'mcq', 1),
      check('c1', 'mcq'),
      fromPaper('s1', 'short', 5),
      fromPaper('s2', 'short', 5),
      fromPaper('s3', 'short', 2),
      fromPaper('l1', 'long', 10),
      fromPaper('l2', 'long', 10),
    ])
    // No programs: the second 10-mark long answer fills that section (the first stays with long answers).
    expect(test.questions.map((question) => `${question.type}:${question.id}`)).toEqual(['mcq:c1', 'mcq:m1', 'short:s1', 'short:s2', 'long:l1', 'code:l2'])
    expect(test).toMatchObject({ totalMarks: 32, minutes: 60, missing: 0 })
  })

  it('prefers questions not used in earlier mocks and important topics, then follows the syllabus', () => {
    const pool = [fromPaper('s1', 'short', 5, 't1'), fromPaper('s2', 'short', 5, 't2'), fromPaper('s3', 'short', 5, 't3')]
    const choice = {
      used: new Map([['s1', 1]]),
      priority: new Map([
        ['t1', 0.9],
        ['t2', 0.2],
        ['t3', 0.8],
      ]),
      topicOrder: new Map([
        ['t1', 0],
        ['t2', 1],
        ['t3', 2],
      ]),
    }
    expect(buildMockTest(pattern(['short', 5, 1]), pool, choice).questions.map((question) => question.id)).toEqual(['s3'])
    expect(buildMockTest(pattern(['short', 5, 2]), pool, choice).questions.map((question) => question.id)).toEqual(['s2', 's3'])
  })

  it("uses a lesson's short question as a last resort and says what's missing", () => {
    const test = buildMockTest(pattern(['short', 5, 3]), [fromPaper('s1', 'short', 5), check('k1', 'short')])
    expect(test.questions.map((question) => [question.id, question.marks, question.check?.type ?? null])).toEqual([
      ['s1', 5, null],
      ['k1', 5, 'short'],
    ])
    expect(test.missing).toBe(1)
  })
})
