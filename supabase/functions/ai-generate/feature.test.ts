import { describe, expect, it } from 'vitest'
import { handleAiRequest, type ServerDeps } from '../_shared/http.ts'
import { fakeModel, memoryUsage, modelAnswer, TEST_SECRETS } from '../_shared/testing.ts'
import { generateFeature } from './feature.ts'

const LESSON = `## Simple explanation\n${'GROUP BY puts rows with the same value together so you can count or add them per group. '.repeat(4)}`

const QUESTIONS = [
  {
    type: 'mcq',
    prompt: 'Which clause filters groups after GROUP BY?',
    options: ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'],
    correctOption: 1,
    answer: 'HAVING',
    tolerance: null,
    keyPoints: [],
    explanation: 'WHERE filters rows before grouping; HAVING filters the groups.',
    difficulty: 2,
  },
  {
    type: 'numerical',
    prompt: 'A table has 3 departments. How many rows does SELECT dept, COUNT(*) ... GROUP BY dept return?',
    options: [],
    correctOption: null,
    answer: '3',
    tolerance: 0,
    keyPoints: [],
    explanation: 'One row per group.',
    difficulty: 1,
  },
  {
    type: 'short',
    prompt: 'Explain the difference between WHERE and HAVING.',
    options: [],
    correctOption: null,
    answer: 'WHERE filters rows before grouping, HAVING filters groups after aggregation.',
    tolerance: null,
    keyPoints: ['WHERE works on rows', 'HAVING works on groups'],
    explanation: 'They run at different steps of the query.',
    difficulty: 3,
  },
]
const CARDS = Array.from({ length: 5 }, (_, i) => ({ front: `Question ${i + 1}`, back: `Answer ${i + 1}` }))
const GOOD = { lessonMd: LESSON, checkQuestions: QUESTIONS, flashcards: CARDS }

const REQUEST = {
  subjectName: 'DBMS',
  unitTitle: 'Unit 2: SQL and transactions',
  topicTitle: 'SQL queries',
  track: 'exam',
  prerequisites: ['Relational algebra'],
  pastQuestions: [{ text: 'Write a SQL query using GROUP BY and HAVING.', marks: 10, year: 2024 }],
}

async function call(body: unknown, ...answers: string[]) {
  const model = fakeModel(...answers.map((answer) => modelAnswer(answer, 2000, 3000)))
  const usage = memoryUsage()
  const deps = (): ServerDeps => ({ env: TEST_SECRETS, authenticate: async () => 'student-1', usage, model: () => model })
  const response = await handleAiRequest(generateFeature, deps)(new Request('http://localhost/ai-generate', { method: 'POST', body: JSON.stringify(body) }))
  return { response, model, usage }
}

describe('ai-generate', () => {
  it('returns the lesson, check questions and flashcards, made with the Fast model', async () => {
    const { response, usage } = await call(REQUEST, JSON.stringify(GOOD))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ...GOOD, model: 'fast-model', promptVersion: 'generate-v1' })
    expect(usage.logged).toEqual([expect.objectContaining({ feature: 'generate', model: 'fast-model' })])
  })

  it('tells the model about the topic, what came before and how it was asked in past papers', async () => {
    const { model } = await call(REQUEST, JSON.stringify(GOOD))
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    for (const part of ['Subject: DBMS', 'Unit: Unit 2: SQL and transactions', 'Topic: SQL queries', 'Already learned: Relational algebra', '(10 marks, 2024) Write a SQL query']) {
      expect(prompt).toContain(part)
    }
    expect(prompt).toContain('How to write this in the exam')
  })

  it('asks for practical use instead of exam tips on the skill track', async () => {
    const { model } = await call({ ...REQUEST, track: 'skill' }, JSON.stringify(GOOD))
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('Using it in practice')
    expect(prompt).not.toContain('How to write this in the exam')
  })

  it('tries again when an mcq has no valid right option', async () => {
    const broken = { ...GOOD, checkQuestions: [{ ...QUESTIONS[0], correctOption: 7 }, QUESTIONS[1], QUESTIONS[2]] }
    const { response, model } = await call(REQUEST, JSON.stringify(broken), JSON.stringify(GOOD))
    expect(response.status).toBe(200)
    expect(model.doGenerateCalls).toHaveLength(2)
  })

  it('needs a topic', async () => {
    const { response } = await call({ ...REQUEST, topicTitle: ' ' }, JSON.stringify(GOOD))
    expect(response.status).toBe(400)
  })
})
