import { describe, expect, it } from 'vitest'
import { isRight } from '@/features/lessons/quiz'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import type { Tables } from '@/types/database'
import {
  builtinQuestion,
  cardQuestion,
  cardWeaknessScore,
  codingDebugQuestion,
  mistakeQuestion,
  pickQuestions,
  saveTollbooth,
  seededRandom,
  tollboothMistake,
  tollboothStatus,
  type TollboothAnswer,
  type TollboothPool,
  type TollboothQuestion,
} from './tollbooth'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const at = (time: string) => new Date(`2026-11-02T${time}:00`)

const question = (id: string, subject: string, values: Partial<Tables<'questions'>> = {}) =>
  ({
    id,
    subject_id: subject,
    topic_id: `${subject}-topic`,
    source: 'generated',
    type: 'mcq',
    prompt: `Question ${id}`,
    options: ['A', 'B', 'C', 'D'],
    answer: { correct: 2 },
    explanation: 'Because C.',
    difficulty: 2,
    ...values,
  }) as Tables<'questions'>
const card = (id: string, topic: string, back = `Answer ${id}`) => ({ id, front: `What is ${id}?`, back, topic_id: topic, suspended: false })

const POOL: TollboothPool = {
  questions: [
    question('q1', 'dbms'),
    question('q2', 'dbms', { type: 'numerical', options: null, answer: { value: 3, tolerance: 0 } }),
    question('q3', 'dbms', { type: 'short', answer: { model: 'x', keyPoints: [] } }), // can't be checked at once: never asked
    question('q4', 'python'),
  ],
  cards: [card('c1', 'dbms-topic'), card('c2', 'dbms-topic'), card('c3', 'dbms-topic'), card('c4', 'dbms-topic'), card('p1', 'python-topic')],
  topics: [
    { id: 'dbms-topic', subject_id: 'dbms' },
    { id: 'python-topic', subject_id: 'python' },
  ],
}

describe('picking Tollbooth questions', () => {
  it("asks only the current subject's checkable questions and flashcards, the same way for the same seed", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const picked = pickQuestions(POOL, 'dbms', seed)
      expect(picked).toHaveLength(3)
      expect(picked.every((item) => ['q1', 'q2', 'c1', 'c2', 'c3', 'c4'].includes(item.id))).toBe(true)
      expect(new Set(picked.map((item) => item.id)).size).toBe(3)
      expect(pickQuestions(POOL, 'dbms', seed)).toEqual(picked)
    }
  })

  it('fills up with built-in questions when the subject has too few', () => {
    // Python has 1 question and 1 flashcard (its wrong choices come from other subjects' cards).
    const picked = pickQuestions(POOL, 'python', 42)
    expect(picked.map((item) => item.origin).sort()).toEqual(['builtin', 'flashcard', 'question'])
    expect(picked.filter((item) => item.origin !== 'builtin').map((item) => item.id).sort()).toEqual(['p1', 'q4'])
    expect(pickQuestions({ questions: [], cards: [], topics: [] }, null, 7, 3).map((item) => item.origin)).toEqual(['builtin', 'builtin', 'builtin'])
  })

  it('turns a flashcard into 4 different choices with its own answer among them', () => {
    const made = cardQuestion(card('c1', 'dbms-topic', 'A key that identifies a row'), ['Answer x', 'Answer y', 'answer X', 'Answer z'], seededRandom(3))
    expect(made).toMatchObject({ origin: 'flashcard', id: 'c1', topicId: 'dbms-topic', type: 'mcq', prompt: 'What is c1?' })
    if (!made || made.type !== 'mcq') throw new Error('no question')
    expect(new Set(made.options.map((option) => option.toLowerCase())).size).toBe(4)
    expect(made.options[made.correct]).toBe('A key that identifies a row')
    expect(cardQuestion(card('c1', 't'), ['Answer x', 'Answer y'], seededRandom(3))).toBeNull() // not enough other answers
    expect(cardQuestion(card('c1', 't', 'x'.repeat(200)), ['a', 'b', 'c'], seededRandom(3))).toBeNull() // too long to read in 20 seconds
  })

  it('makes built-in mental maths with one right choice among 4', () => {
    for (let seed = 0; seed < 40; seed++) {
      const made = builtinQuestion(seededRandom(seed), 0)
      if (made.type !== 'mcq') throw new Error('built-in questions are choices')
      expect(new Set(made.options).size).toBe(4)
      expect(made.options.every((option) => Number(option) > 0)).toBe(true)
      expect(isRight(made, String(made.correct))).toBe(true)
      expect(made.explanation).toContain(made.options[made.correct] ?? '?')
    }
  })

  it('prioritizes weak/due FSRS flashcards and open mistakes over untouched items', () => {
    const now = new Date('2026-11-02T10:00:00.000Z')
    const weakCard = {
      id: 'weak-c',
      front: 'What is ACID?',
      back: 'Atomicity, Consistency, Isolation, Durability',
      topic_id: 'dbms-topic',
      suspended: false,
      due_at: '2026-11-01T10:00:00.000Z',
      fsrs: { state: 3, lapses: 4, stability: 0.6, difficulty: 8 },
    }
    const standaloneMistake: NonNullable<TollboothPool['mistakes']>[number] = {
      id: 'm1',
      topic_id: 'dbms-topic',
      question_id: null,
      flashcard_id: null,
      concept: 'Difference between BCNF and 3NF',
      why_wrong: 'Confused non-prime attribute rule',
      correct_approach: 'Every determinant is a superkey',
      status: 'open',
      fsrs: { state: 1, lapses: 2, stability: 0.5, difficulty: 7 },
      next_review_at: '2026-11-01T08:00:00.000Z',
      correct_count: 0,
    }
    expect(cardWeaknessScore(weakCard, now)).toBeGreaterThan(100)

    const enriched: TollboothPool = {
      ...POOL,
      cards: [weakCard, ...POOL.cards],
      mistakes: [standaloneMistake],
    }
    const picked = pickQuestions(enriched, 'dbms', 17, 3, now)
    expect(picked.some((q) => q.origin === 'mistake' && q.id === 'm1')).toBe(true)
    expect(picked.some((q) => q.origin === 'flashcard' && q.id === 'weak-c')).toBe(true)

    const mq = mistakeQuestion(standaloneMistake, ['Answer A', 'Answer B', 'Answer C'], seededRandom(1))
    expect(mq?.origin).toBe('mistake')
    expect(mq?.type === 'mcq' && mq.options[mq.correct]).toBe('Every determinant is a superkey')
  })

  it('includes coding debugging prompts prioritizing failed snippets in Coding Lab pools', () => {
    const now = new Date('2026-11-02T10:00:00.000Z')
    const withSnippets: TollboothPool = {
      ...POOL,
      snippets: [{ id: 's1', topic_id: 'python-topic', title: 'Fix recursion', language: 'python', passed: false, last_output: 'RecursionError' }],
    }
    const picked = pickQuestions(withSnippets, 'python', 5, 3, now)
    const debugQ = picked.find((q) => q.origin === 'coding')
    expect(debugQ).toBeDefined()
    expect(debugQ?.prompt).toContain('Fix recursion')

    const sqlPrompt = codingDebugQuestion(seededRandom(3), 0, 'sql')
    expect(sqlPrompt.origin).toBe('coding')
    expect(sqlPrompt.prompt).toContain('SQL')
    expect(tollboothMistake({ question: sqlPrompt, given: '' })).toMatchObject({ question_id: null, flashcard_id: null })
  })
})

describe('the daily limit', () => {
  const event = (kind: string, time: string, day = '2026-11-02') => ({ kind, at: new Date(`${day}T${time}:00`).toISOString() })

  it("counts today's unlocks, and waits a minute after a wrong try", () => {
    const events = [event('tollbooth_unlock', '22:00', '2026-11-01'), event('tollbooth_unlock', '09:00'), event('tollbooth_failed', '10:00'), event('self_report', '10:01')]
    const dayStart = at('00:00')
    expect(tollboothStatus(events, { dayStart, now: at('10:00'), dailyLimit: 3 })).toEqual({ used: 1, left: 2, wait: 60 })
    expect(tollboothStatus(events, { dayStart, now: new Date(at('10:00').getTime() + 45_000), dailyLimit: 3 })).toMatchObject({ wait: 15 })
    expect(tollboothStatus(events, { dayStart, now: at('10:02'), dailyLimit: 1 })).toEqual({ used: 1, left: 0, wait: 0 })
  })
})

describe('saving a try (Demo Mode)', () => {
  const asked: TollboothQuestion[] = [
    { origin: 'question', id: 'q1', topicId: 'dbms-topic', type: 'mcq', prompt: 'Which key identifies a row?', options: ['Foreign', 'Primary', 'Candidate', 'Super'], correct: 1, explanation: 'It is unique.', difficulty: 2 },
    { origin: 'flashcard', id: 'c1', topicId: 'dbms-topic', type: 'mcq', prompt: 'What is 1NF?', options: ['Atomic values', 'No keys', 'One table', 'No nulls'], correct: 0, explanation: '', difficulty: null },
    builtinQuestion(seededRandom(9), 2),
  ]
  const answer = (item: TollboothQuestion, right: boolean): TollboothAnswer => ({ question: item, given: right && item.type === 'mcq' ? String(item.correct) : '', right, timeMs: 4200 })

  function setUp() {
    demoDb.insert('subjects', [{ id: 'dbms', name: 'DBMS' }])
    demoDb.insert('topics', [{ id: 'dbms-topic', subject_id: 'dbms', title: 'Keys' }])
    demoDb.insert('questions', [question('q1', 'dbms')])
    demoDb.insert('flashcards', [card('c1', 'dbms-topic')])
    demoDb.insert('focus_sessions', [{ id: 'f1', area: 'academics', subject_id: 'dbms', mode: 'pomodoro', planned_minutes: 25 }])
  }

  it('all right with a reason: an unlock for the set minutes, the quiz, and attempts only for saved questions', async () => {
    setUp()
    const until = await saveTollbooth(DEMO, {
      subjectId: 'dbms',
      sessionId: 'f1',
      appPackage: 'com.instagram.android',
      questions: asked,
      answers: asked.map((item) => answer(item, true)),
      reason: '  Reply to the class group  ',
      unlockMinutes: 3,
      startedAt: at('10:00'),
      now: at('10:01'),
    })
    expect(until).toBe(at('10:04').toISOString())
    expect(demoDb.list('quizzes')).toEqual([expect.objectContaining({ kind: 'tollbooth', subject_id: 'dbms', topic_ids: ['dbms-topic'], score: 1, time_limit_sec: 60 })])
    expect(demoDb.list('attempts')).toEqual([expect.objectContaining({ question_id: 'q1', is_correct: true, answer: { given: '1' }, time_ms: 4200 })])
    expect(demoDb.list('distraction_events')).toEqual([
      expect.objectContaining({ kind: 'tollbooth_unlock', focus_session_id: 'f1', app_package: 'com.instagram.android', reason: 'Reply to the class group', unlock_until: until }),
    ])
  })

  it('a wrong answer: no unlock, a failed try is logged, and the missed concept can go into the notebook', async () => {
    setUp()
    const answers = [answer(asked[0] as TollboothQuestion, true), answer(asked[1] as TollboothQuestion, false)]
    const until = await saveTollbooth(DEMO, { subjectId: 'dbms', sessionId: 'f1', appPackage: null, questions: asked, answers, reason: null, unlockMinutes: 3, startedAt: at('10:00'), now: at('10:01') })
    expect(until).toBeNull()
    expect(demoDb.list('quizzes')[0]).toMatchObject({ score: 0.3333 })
    expect(demoDb.list('distraction_events')).toEqual([expect.objectContaining({ kind: 'tollbooth_failed', unlock_until: null, reason: null })])

    expect(tollboothMistake(answers[1] as TollboothAnswer)).toEqual({
      concept: 'What is 1NF?',
      why_wrong: 'Academic Tollbooth: the time ran out.',
      correct_approach: 'Atomic values',
      topic_id: 'dbms-topic',
      question_id: null,
      flashcard_id: 'c1',
    })
    expect(tollboothMistake({ question: asked[0] as TollboothQuestion, given: '3' })).toMatchObject({ why_wrong: 'Academic Tollbooth: I answered Super', question_id: 'q1', flashcard_id: null })
  })
})
