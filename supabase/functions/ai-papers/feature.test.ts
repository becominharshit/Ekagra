import { describe, expect, it } from 'vitest'
import { handleAiRequest, type ServerDeps } from '../_shared/http.ts'
import { fakeModel, memoryUsage, modelAnswer, TEST_SECRETS } from '../_shared/testing.ts'
import { papersFeature } from './feature.ts'

const ANALYSIS = {
  year: 2024,
  examType: 'End semester',
  questions: [
    { text: 'Normalize the relation to BCNF.', marks: 10, type: 'long', topicKey: 't2' },
    { text: 'Write a SQL query with GROUP BY.', marks: 5, type: 'code', topicKey: 't9' },
  ],
}

const REQUEST = {
  subjectName: 'DBMS',
  topics: [
    { key: 't1', title: 'SQL queries' },
    { key: 't2', title: 'Normalization' },
  ],
  text: 'Q1. Normalize R to BCNF (10 marks)\nQ2. GROUP BY query (5 marks)',
}

async function call(body: unknown) {
  const model = fakeModel(modelAnswer(JSON.stringify(ANALYSIS)))
  const deps = (): ServerDeps => ({ env: TEST_SECRETS, authenticate: async () => 'student-1', usage: memoryUsage(), model: () => model })
  const response = await handleAiRequest(papersFeature, deps)(
    new Request('http://localhost/ai-papers', { method: 'POST', body: JSON.stringify(body) }),
  )
  return { response, model }
}

describe('ai-papers', () => {
  it('lists the questions; a topic key that is not in the list becomes "no topic"', async () => {
    const { response } = await call(REQUEST)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      year: 2024,
      examType: 'End semester',
      questions: [ANALYSIS.questions[0], { ...ANALYSIS.questions[1], topicKey: null }],
      promptVersion: 'papers-v1',
    })
  })

  it('gives the model the topic list with keys and the paper text', async () => {
    const { model } = await call(REQUEST)
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('t1: SQL queries')
    expect(prompt).toContain('t2: Normalization')
    expect(prompt).toContain('Normalize R to BCNF')
  })

  it('needs at least one topic to match questions to', async () => {
    const { response } = await call({ ...REQUEST, topics: [] })
    expect(response.status).toBe(400)
  })
})
