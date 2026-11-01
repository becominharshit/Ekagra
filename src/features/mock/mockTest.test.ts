import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { finishedMock, keepProgress, listMocks, loadMockSetup, markMock, newProgress, readProgress, saveMock, type MockProgress } from './mockTest'
import { buildMockTest, type ExamPattern } from './pattern'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

/** DBMS with two topics, one past paper (2 short answers of 5 marks, a long answer of 10) and a check question. */
function setUp() {
  const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
  const subjectId = subject?.id ?? ''
  const [unit] = demoDb.insert('topics', [{ subject_id: subjectId, title: 'Unit 1' }])
  const [joins, norm] = demoDb.insert('topics', [
    { subject_id: subjectId, parent_id: unit?.id, title: 'Joins', order_index: 0, priority_score: 0.5 },
    { subject_id: subjectId, parent_id: unit?.id, title: 'Normalization', order_index: 1, priority_score: 0.9 },
  ])
  const [paper] = demoDb.insert('past_papers', [{ subject_id: subjectId, year: 2024 }])
  const pyq = { subject_id: subjectId, past_paper_id: paper?.id, source: 'pyq' }
  demoDb.insert('questions', [
    { ...pyq, id: 'q-long', topic_id: norm?.id, type: 'long', marks: 10, prompt: 'Normalize R to BCNF.' },
    { ...pyq, id: 'q-3nf', topic_id: norm?.id, type: 'short', marks: 5, prompt: 'Explain 3NF.' },
    { ...pyq, id: 'q-joins', topic_id: joins?.id, type: 'short', marks: 5, prompt: 'Explain joins.' },
    { id: 'q-check', subject_id: subjectId, topic_id: joins?.id, source: 'generated', source_ref: { kind: 'check' }, type: 'mcq', prompt: 'Which join?', options: ['Left outer', 'Inner'], answer: { correct: 0 } },
  ])
  return { subjectId, joinsId: joins?.id ?? '', normId: norm?.id ?? '' }
}

function progressFor(subjectId: string, test: ReturnType<typeof buildMockTest>, values: Partial<MockProgress> = {}): MockProgress {
  return {
    quizId: 'quiz-1',
    subjectId,
    startedAt: '2026-11-02T09:00:00.000Z',
    minutes: test.minutes,
    questions: test.questions,
    answers: {},
    timeMs: {},
    current: 0,
    finishedAt: null,
    marks: null,
    aiError: null,
    ...values,
  }
}

describe('mock tests in Demo Mode', () => {
  it("builds a test in the past paper's pattern, sections in syllabus order", async () => {
    const { subjectId, joinsId } = setUp()
    const setup = await loadMockSetup(DEMO, subjectId)
    expect(setup.pattern).toMatchObject({ totalMarks: 20, minutes: 35, papers: 1 })
    expect(setup.pool).toHaveLength(4)
    expect(setup.topicTitles.get(joinsId)).toBe('Joins')
    const test = buildMockTest(setup.pattern as ExamPattern, setup.pool, setup.choice)
    expect(test.questions.map((question) => question.id)).toEqual(['q-joins', 'q-3nf', 'q-long'])
    expect(setup.mocks).toEqual([])
  })

  it('marks written answers on the device (the student marks what it cannot), saves once, and remembers the questions used', async () => {
    const { subjectId } = setUp()
    const setup = await loadMockSetup(DEMO, subjectId)
    const test = buildMockTest(setup.pattern as ExamPattern, setup.pool, setup.choice)
    const answers = { 'q-joins': 'Joins combine rows from two tables.', 'q-long': 'Find the keys, then split.' }

    const { marks, aiError } = await markMock(DEMO, { subject: 'DBMS', questions: test.questions, answers })
    expect(aiError).toBeNull()
    // No key points or model answer to compare with: those are for the student to mark. Empty answers get 0.
    expect([marks['q-joins']?.awarded, marks['q-3nf']?.awarded, marks['q-long']?.awarded]).toEqual([null, 0, null])

    const handedIn = progressFor(subjectId, test, { answers, marks, finishedAt: '2026-11-02T09:30:00.000Z', timeMs: { 'q-joins': 60_000 } })
    expect(finishedMock(handedIn)).toBeNull()
    const marked = {
      ...handedIn,
      marks: { ...marks, 'q-joins': { ...marks['q-joins'], awarded: 4, by: 'self' as const }, 'q-long': { ...marks['q-long'], awarded: 3, by: 'self' as const } },
    } as MockProgress
    const mock = finishedMock(marked)
    if (!mock) throw new Error('the test should be ready to save')

    await saveMock(DEMO, mock)
    // A second save (say, after a failed one) adds nothing twice.
    await saveMock(DEMO, mock)
    expect(await listMocks(DEMO, subjectId)).toEqual([expect.objectContaining({ id: 'quiz-1', kind: 'mock', score: 0.35, time_limit_sec: 2100 })])
    expect(demoDb.list('attempts').map((attempt) => [attempt.question_id, attempt.score])).toEqual([
      ['q-joins', 0.8],
      ['q-3nf', 0],
      ['q-long', 0.3],
    ])
    expect(demoDb.list('mistakes').map((mistake) => mistake.question_id)).toEqual(['q-3nf', 'q-long'])

    const again = await loadMockSetup(DEMO, subjectId)
    expect(again.choice.used).toEqual(
      new Map([
        ['q-joins', 1],
        ['q-3nf', 1],
        ['q-long', 1],
      ]),
    )
  })
})

describe('the test in progress on the device', () => {
  it('is kept per person and subject, and forgotten on request', () => {
    const progress = progressFor('dbms', { questions: [{ id: 'q', topicId: null, type: 'long', marks: 10, prompt: 'Explain.', check: null }], totalMarks: 10, minutes: 20, missing: 0 }, { answers: { q: 'Draft' } })
    keepProgress('demo', 'dbms', progress)
    expect(readProgress('demo', 'dbms')).toEqual(progress)
    expect(readProgress('demo', 'maths')).toBeNull()
    expect(readProgress('someone-else', 'dbms')).toBeNull()
    keepProgress('demo', 'dbms', null)
    expect(readProgress('demo', 'dbms')).toBeNull()
  })

  it('starts a new test with nothing answered, which survives a reload', () => {
    const questions = [{ id: 'q', topicId: null, type: 'short' as const, marks: 5, prompt: 'Explain.', check: null }]
    const started = newProgress('dbms', { questions, minutes: 10 }, new Date('2026-11-02T09:00:00.000Z'))
    expect(started).toMatchObject({ subjectId: 'dbms', startedAt: '2026-11-02T09:00:00.000Z', minutes: 10, answers: {}, current: 0, finishedAt: null, marks: null })
    keepProgress('demo', 'dbms', started)
    expect(readProgress('demo', 'dbms')).toEqual(started)
  })

  it('ignores broken or outdated data', () => {
    localStorage.setItem('ekagra-mock:demo:dbms', '{broken')
    expect(readProgress('demo', 'dbms')).toBeNull()
    localStorage.setItem('ekagra-mock:demo:dbms', JSON.stringify({ quizId: 'q', subjectId: 'dbms', questions: [] }))
    expect(readProgress('demo', 'dbms')).toBeNull()
  })
})
