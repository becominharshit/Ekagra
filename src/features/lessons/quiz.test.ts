import { describe, expect, it } from 'vitest'
import type { CheckQuestion } from '@shared/schemas.ts'
import type { Tables } from '@/types/database'
import {
  checkQuestionRows,
  givenText,
  isCheckQuestion,
  isRight,
  mistakeForAnswer,
  parseNumber,
  readCheckQuestion,
  rightAnswerText,
  topicAfterQuiz,
  type StoredCheckQuestion,
} from './quiz'

const GENERATED: CheckQuestion[] = [
  {
    type: 'mcq',
    prompt: 'Which clause filters groups?',
    options: ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'],
    correctOption: 1,
    answer: 'HAVING',
    tolerance: null,
    keyPoints: [],
    explanation: 'HAVING runs after grouping.',
    difficulty: 2,
  },
  { type: 'numerical', prompt: 'What is 1/3, rounded to 2 decimals?', options: [], correctOption: null, answer: '0,33', tolerance: 0.005, keyPoints: [], explanation: '1 ÷ 3', difficulty: 1 },
  {
    type: 'short',
    prompt: 'WHERE vs HAVING?',
    options: [],
    correctOption: null,
    answer: 'WHERE filters rows, HAVING filters groups.',
    tolerance: null,
    keyPoints: ['rows', 'groups'],
    explanation: 'Different steps.',
    difficulty: 3,
  },
]

/** The rows as they come back from the database. */
function saved(): StoredCheckQuestion[] {
  return checkQuestionRows(GENERATED, { id: 'topic-1', subject_id: 'dbms' }, 'generate-v1').map((row, index) => {
    const question = readCheckQuestion({ ...row, id: `q${index}`, user_id: 'u', created_at: '', updated_at: '' } as Tables<'questions'>)
    if (!question) throw new Error(`question ${index} could not be read`)
    return question
  })
}

describe('saving and reading check questions', () => {
  it('turns the AI questions into rows that are marked as check questions of the topic', () => {
    const rows = checkQuestionRows(GENERATED, { id: 'topic-1', subject_id: 'dbms' }, 'generate-v1')
    expect(rows[0]).toMatchObject({ source: 'generated', source_ref: { kind: 'check' }, topic_id: 'topic-1', subject_id: 'dbms', options: GENERATED[0]?.options, answer: { correct: 1 } })
    expect(rows[1]).toMatchObject({ type: 'numerical', answer: { value: 0.33, tolerance: 0.005 } })
    expect(rows[2]).toMatchObject({ type: 'short', answer: { model: 'WHERE filters rows, HAVING filters groups.', keyPoints: ['rows', 'groups'] } })
    expect(isCheckQuestion({ source: 'generated', source_ref: { kind: 'check' } })).toBe(true)
    expect(isCheckQuestion({ source: 'pyq', source_ref: null })).toBe(false)
  })

  it('reads them back, and skips broken rows', () => {
    expect(saved().map((question) => question.type)).toEqual(['mcq', 'numerical', 'short'])
    const [mcqRow] = checkQuestionRows(GENERATED, { id: 'topic-1', subject_id: 'dbms' }, 'generate-v1')
    const broken = { ...mcqRow, id: 'x', user_id: 'u', created_at: '', updated_at: '', options: ['A', 'B'], answer: { correct: 5 } } as Tables<'questions'>
    expect(readCheckQuestion(broken)).toBeNull()
  })
})

describe('checking answers', () => {
  it('reads numbers the way students type them', () => {
    expect([parseNumber('3.5'), parseNumber('3,5'), parseNumber(' 42 '), parseNumber('-1e3'), parseNumber('.5')]).toEqual([3.5, 3.5, 42, -1000, 0.5])
    expect([parseNumber(''), parseNumber('abc'), parseNumber('1.2.3')]).toEqual([null, null, null])
  })

  it('checks the chosen option and numbers within the tolerance', () => {
    const [mcq, numerical] = saved()
    if (!mcq || !numerical) throw new Error('missing questions')
    expect([isRight(mcq, '1'), isRight(mcq, '0')]).toEqual([true, false])
    expect([isRight(numerical, '0.33'), isRight(numerical, '0,334'), isRight(numerical, '0.34'), isRight(numerical, 'a third')]).toEqual([true, true, false, false])
  })

  it('writes answers in words', () => {
    const [mcq, numerical, short] = saved()
    if (!mcq || !numerical || !short) throw new Error('missing questions')
    expect([rightAnswerText(mcq), rightAnswerText(numerical), rightAnswerText(short)]).toEqual(['HAVING', '0.33', 'WHERE filters rows, HAVING filters groups.'])
    expect([givenText(mcq, '0'), givenText(numerical, ' '), givenText(short, 'no idea')]).toEqual(['WHERE', '(no answer)', 'no idea'])
  })
})

describe('after the quiz', () => {
  it('sets mastery to the score; from 80% the topic counts as learned', () => {
    expect(topicAfterQuiz({ status: 'learning' }, 0.75)).toEqual({ mastery: 0.75, status: 'learning' })
    expect(topicAfterQuiz({ status: 'not_started' }, 0.8)).toEqual({ mastery: 0.8, status: 'review' })
    expect(topicAfterQuiz({ status: 'review' }, 0.5)).toEqual({ mastery: 0.5, status: 'learning' })
    expect(topicAfterQuiz({ status: 'mastered' }, 0.5)).toEqual({ mastery: 0.5 })
  })

  it('writes a wrong answer into the notebook with what was answered and the right approach', () => {
    const [mcq, , short] = saved()
    if (!mcq || !short) throw new Error('missing questions')
    expect(mistakeForAnswer(mcq, '0', 'topic-1')).toEqual({
      concept: 'Which clause filters groups?',
      why_wrong: 'I answered: WHERE',
      correct_approach: 'HAVING\n\nHAVING runs after grouping.',
      topic_id: 'topic-1',
      question_id: 'q0',
    })
    expect(mistakeForAnswer(short, '', 'topic-1')).toMatchObject({
      why_wrong: 'I marked my answer as wrong.',
      correct_approach: 'WHERE filters rows, HAVING filters groups.\n\nKey points: rows; groups\n\nDifferent steps.',
    })
  })
})
