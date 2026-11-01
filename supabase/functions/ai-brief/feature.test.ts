import { describe, expect, it } from 'vitest'
import { handleAiRequest, type ServerDeps } from '../_shared/http.ts'
import { fakeModel, memoryUsage, modelAnswer, TEST_SECRETS } from '../_shared/testing.ts'
import { briefFeature } from './feature.ts'

const REQUEST = {
  day: 'Monday, 2 November',
  mentorTone: 'strict',
  blocks: [
    { start: '09:00', end: '09:45', mode: 'study', kind: 'task', title: 'DBMS assignment', subject: 'DBMS', status: 'planned' },
    { start: '10:00', end: '10:30', mode: 'study', kind: 'learn', title: 'ER model', subject: 'DBMS', status: 'done' },
  ],
  deadlines: [{ title: 'DBMS assignment', due: 'Due Fri 5:00 PM', subject: 'DBMS' }],
  exams: [{ subject: 'DBMS', inDays: 12 }],
  reviews: { flashcards: 9, mistakes: 2 },
  lastCheckIn: { daysAgo: 1, energy: 2, mood: 3, topDistraction: 'Games' },
  minimumDay: false,
  burnoutGuard: false,
}
const LINES = {
  lines: ['Main focus: DBMS assignment at 09:00.', 'It is due Friday 5 PM, and the DBMS exam is in 12 days.', 'Energy was low yesterday: start with the easy part.'],
}

async function call(body: unknown, ...answers: string[]) {
  const model = fakeModel(...answers.map((answer) => modelAnswer(answer)))
  const usage = memoryUsage()
  const deps = (): ServerDeps => ({ env: TEST_SECRETS, authenticate: async () => 'student-1', usage, model: () => model })
  const response = await handleAiRequest(briefFeature, deps)(new Request('http://localhost/ai-brief', { method: 'POST', body: JSON.stringify(body) }))
  return { response, model, usage }
}

describe('ai-brief', () => {
  it('returns the 3 lines and logs the usage', async () => {
    const { response, usage } = await call(REQUEST, JSON.stringify(LINES))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ...LINES, model: 'claude-fast-test', promptVersion: 'brief-v1' })
    expect(usage.logged).toEqual([expect.objectContaining({ feature: 'brief', model: 'claude-fast-test' })])
  })

  it("gives the model today's plan, deadlines, exams, reviews, the last check-in and the mentor tone", async () => {
    const { model } = await call(REQUEST, JSON.stringify(LINES))
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    for (const fact of ['Today is Monday, 2 November.', '09:00–09:45 study: DBMS assignment (DBMS)', 'ER model (DBMS) [done]', 'DBMS assignment (DBMS): Due Fri 5:00 PM', 'DBMS in 12 days', '9 flashcards, 2 mistakes', 'Last check-in (yesterday): energy 2/5, mood 3/5, biggest distraction: Games', 'Be brief and direct.']) {
      expect(prompt).toContain(fact)
    }
  })

  it('says so when today is a minimum day or the Burnout Guard is on', async () => {
    const { model } = await call({ ...REQUEST, minimumDay: true, burnoutGuard: true, lastCheckIn: null }, JSON.stringify(LINES))
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('today is a minimum day')
    expect(prompt).toContain('The Burnout Guard is on')
    expect(prompt).toContain('No check-in yet.')
  })

  it('tries again when the answer does not have exactly 3 lines', async () => {
    const { response, model } = await call(REQUEST, JSON.stringify({ lines: ['Only one line.'] }), JSON.stringify(LINES))
    expect(response.status).toBe(200)
    expect(model.doGenerateCalls).toHaveLength(2)
  })

  it('rejects a request without the plan', async () => {
    const { response } = await call({ ...REQUEST, blocks: undefined }, JSON.stringify(LINES))
    expect(response.status).toBe(400)
  })
})
