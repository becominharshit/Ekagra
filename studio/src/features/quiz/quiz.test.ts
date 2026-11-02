import { describe, expect, it, vi } from 'vitest'
import { callAiFunction } from '@/features/ai/aiClient'
import type { QuizAnswer } from '@/features/lessons/lessons'
import { readCheckQuestion, type StoredCheckQuestion } from '@/features/lessons/quiz'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import type { Tables } from '@/types/database'
import { isNoteQuestion, makeQuiz, noteQuestions, saveQuizResult, studioMistake } from './quiz'

vi.mock('@/features/ai/aiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/aiClient')>()),
  callAiFunction: vi.fn(),
}))

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const NOTE = { id: 'n1', title: 'SQL joins', content: '## Inner join\n- Matching rows', subject_id: 's1', topic_id: null }
const MCQ: StoredCheckQuestion = { id: 'q1', type: 'mcq', prompt: 'What does an inner join keep?', options: ['Matching rows', 'All rows'], correct: 0, explanation: 'Only matches.', difficulty: 2 }

describe('questions made from a note', () => {
  it('are told apart from lesson check questions and from other notes', () => {
    expect(isNoteQuestion({ source: 'generated', source_ref: { kind: 'studio', noteId: 'n1' } }, 'n1')).toBe(true)
    expect(isNoteQuestion({ source: 'generated', source_ref: { kind: 'studio', noteId: 'n2' } }, 'n1')).toBe(false)
    expect(isNoteQuestion({ source: 'generated', source_ref: { kind: 'check' } }, 'n1')).toBe(false)
  })

  it('are read back for practising again', async () => {
    const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
    demoDb.insert('questions', [
      { subject_id: subject?.id, source: 'generated', source_ref: { kind: 'studio', noteId: 'n1' }, type: 'mcq', prompt: 'Q1', options: ['a', 'b', 'c', 'd'], answer: { correct: 2 } },
      { subject_id: subject?.id, source: 'generated', source_ref: { kind: 'check' }, type: 'mcq', prompt: 'Lesson Q', options: ['a', 'b'], answer: { correct: 0 } },
    ])
    expect((await noteQuestions(DEMO, 'n1')).map((question) => [question.prompt, question.type === 'mcq' ? question.correct : null])).toEqual([['Q1', 2]])
  })
})

describe('makeQuiz', () => {
  it("saves Gemini's questions in Ekagra's format and returns them ready to ask", async () => {
    vi.mocked(callAiFunction).mockResolvedValueOnce({
      questions: [{ prompt: 'What does an inner join keep?', options: ['All rows', 'Matching rows', 'No rows', 'Left rows'], correctOption: 1, explanation: 'Only matches.', difficulty: 2 }],
      model: 'gemini-3.8-flash',
      promptVersion: 'studio-quiz-v1',
    })
    const inserted: Record<string, unknown>[] = []
    const client = {
      from: () => ({
        insert: async (rows: Record<string, unknown>[]) => {
          inserted.push(...rows)
          return { error: null }
        },
      }),
    }
    const signedIn = { kind: 'supabase', userId: 'u', client } as unknown as DataSource
    const questions = await makeQuiz(signedIn, { note: { ...NOTE, topic_id: 't1' }, count: 5, program: 'BTech CSE', year: 1 })

    expect(vi.mocked(callAiFunction).mock.calls[0]?.slice(0, 2)).toEqual(['studio-quiz', { noteId: 'n1', title: 'SQL joins', text: NOTE.content, count: 5, program: 'BTech CSE', year: 1 }])
    expect(inserted).toEqual([
      expect.objectContaining({
        source: 'generated',
        source_ref: { kind: 'studio', noteId: 'n1' },
        subject_id: 's1',
        topic_id: 't1',
        type: 'mcq',
        options: ['All rows', 'Matching rows', 'No rows', 'Left rows'],
        answer: { correct: 1 },
        prompt_version: 'studio-quiz-v1',
      }),
    ])
    // Ekagra reads the saved row back the same way.
    expect(readCheckQuestion(inserted[0] as unknown as Tables<'questions'>)).toMatchObject({ type: 'mcq', correct: 1 })
    expect(questions).toEqual([expect.objectContaining({ id: inserted[0]?.id, type: 'mcq', correct: 1 })])
  })

  it('needs sign-in and a note with something in it', async () => {
    await expect(makeQuiz(DEMO, { note: NOTE, count: 5 })).rejects.toThrow(/signed in/)
    const signedIn = { kind: 'supabase', userId: 'u', client: {} } as unknown as DataSource
    await expect(makeQuiz(signedIn, { note: { ...NOTE, content: ' ' }, count: 5 })).rejects.toThrow(/empty/)
  })
})

describe('saveQuizResult', () => {
  it('saves the quiz and every answer, and puts wrong answers in the mistake notebook (also without a topic)', async () => {
    const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
    const [question] = demoDb.insert('questions', [{ subject_id: subject?.id, source: 'generated', type: 'mcq', prompt: MCQ.prompt, options: MCQ.options, answer: { correct: 0 } }])
    const asked = { ...MCQ, id: question?.id ?? '' }
    const answers: QuizAnswer[] = [
      { question: asked, given: '1', right: false, timeMs: 4200 },
      { question: { ...asked, id: 'q-other' }, given: '0', right: true, timeMs: 1500 },
    ]
    const score = await saveQuizResult(DEMO, { note: { subject_id: subject?.id ?? '', topic_id: null }, answers, startedAt: new Date('2026-11-02T10:00:00Z'), now: new Date('2026-11-02T10:05:00Z') })

    expect(score).toBe(0.5)
    expect(demoDb.list('quizzes')).toEqual([expect.objectContaining({ kind: 'subject', subject_id: subject?.id, topic_ids: [], score: 0.5 })])
    expect(demoDb.list('attempts').map((attempt) => [attempt.is_correct, attempt.time_ms])).toEqual([
      [false, 4200],
      [true, 1500],
    ])
    expect(demoDb.list('mistakes')).toEqual([expect.objectContaining({ concept: MCQ.prompt, why_wrong: 'I answered: All rows', topic_id: null, question_id: asked.id })])
  })

  it('is a topic quiz when the note is about one topic', () => {
    expect(studioMistake(MCQ, '1', 't1')).toMatchObject({ topic_id: 't1', correct_approach: 'Matching rows\n\nOnly matches.' })
  })
})
