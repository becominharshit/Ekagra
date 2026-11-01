import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { finishPractice, loadPractice, savePracticeAnswer } from './practice'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

function setUp() {
  const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
  const [topic] = demoDb.insert('topics', [{ subject_id: subject?.id ?? '', title: 'Joins' }])
  const check = { kind: 'check' }
  demoDb.insert('questions', [
    { id: 'q-mcq', subject_id: subject?.id, topic_id: topic?.id, source: 'generated', source_ref: check, type: 'mcq', prompt: 'Which join keeps all rows of the left table?', options: ['Inner', 'Left outer'], answer: { correct: 1 }, difficulty: 2 },
    { id: 'q-num', subject_id: subject?.id, topic_id: topic?.id, source: 'generated', source_ref: check, type: 'numerical', prompt: '3 × 4?', answer: { value: 12, tolerance: 0 }, difficulty: 1 },
    // Past-paper questions have no answer to check, so practice leaves them out.
    { id: 'q-pyq', subject_id: subject?.id, topic_id: topic?.id, source: 'pyq', type: 'long', prompt: 'Explain joins.' },
  ])
  return { subjectId: subject?.id ?? '', topicId: topic?.id ?? '' }
}

describe('adaptive practice in Demo Mode', () => {
  it("loads the subject's check questions, starting at 1000", async () => {
    const { subjectId } = setUp()
    const data = await loadPractice(DEMO, subjectId)
    expect(data.questions.map((question) => question.id).sort()).toEqual(['q-mcq', 'q-num'])
    expect(data).toMatchObject({ rating: 1000, answers: 0 })
    expect(data.lastAnswered.size).toBe(0)
  })

  it('saves each answer with new ratings, and notes wrong ones in the mistake notebook', async () => {
    const { subjectId } = setUp()
    const data = await loadPractice(DEMO, subjectId)
    const mcq = data.questions.find((question) => question.id === 'q-mcq')
    const num = data.questions.find((question) => question.id === 'q-num')
    if (!mcq || !num) throw new Error('questions missing')
    const startedAt = new Date('2026-11-02T10:00:00Z')

    const first = await savePracticeAnswer(DEMO, { subjectId, quizId: 'session-1', firstAnswer: true, startedAt, question: mcq, given: '1', right: true, timeMs: 8000, rating: 1000, answers: 0 })
    // A difficulty-2 question (900): 64% expected, so a right answer adds 24 × 0.36.
    expect(first.rating).toBeCloseTo(1008.6, 1)
    expect(first.questionRating).toBe(897)

    const second = await savePracticeAnswer(DEMO, { subjectId, quizId: 'session-1', firstAnswer: false, startedAt, question: num, given: '13', right: false, timeMs: 5000, rating: first.rating, answers: 1 })
    expect(second.rating).toBeLessThan(first.rating)
    await finishPractice(DEMO, { quizId: 'session-1', score: 0.5 })

    const after = await loadPractice(DEMO, subjectId)
    expect(after).toMatchObject({ rating: second.rating, answers: 2 })
    expect([...after.lastAnswered.keys()].sort()).toEqual(['q-mcq', 'q-num'])
    expect(after.questions.find((question) => question.id === 'q-mcq')?.rating).toBe(897)
    expect(demoDb.list('quizzes')).toEqual([expect.objectContaining({ id: 'session-1', kind: 'subject', score: 0.5 })])
    expect(demoDb.list('attempts').map((attempt) => [attempt.question_id, attempt.is_correct, attempt.time_ms])).toEqual([
      ['q-mcq', true, 8000],
      ['q-num', false, 5000],
    ])
    expect(demoDb.list('mistakes')).toEqual([expect.objectContaining({ question_id: 'q-num', why_wrong: 'I answered: 13' })])
  })
})
