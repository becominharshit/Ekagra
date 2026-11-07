import { describe, expect, it } from 'vitest'
import type { ServerDeps } from '../_shared/http.ts'
import { handleStudioAiRequest } from '../_shared/studioHttp.ts'
import { fakeModel, memoryUsage, modelAnswer } from '../_shared/testing.ts'
import { quizFeature, shuffleOptions } from './feature.ts'

const REQUEST = { noteId: '33333333-3333-4333-8333-333333333333', title: 'SQL joins', text: '## Inner join\n- Only matching rows', count: 3, program: 'BTech CSE', year: 1 }
const question = (prompt: string, correctOption = 0) => ({
  prompt: ` ${prompt} `,
  options: [' Only matching rows ', 'Every row of the left table', 'Every row of both tables', 'No rows'],
  correctOption,
  explanation: ' An inner join keeps rows that match in both tables. ',
  difficulty: 2,
})

async function call(body: unknown, ...answers: unknown[]) {
  const model = fakeModel(...answers.map((answer) => modelAnswer(JSON.stringify(answer))))
  const usage = memoryUsage()
  const deps = (): ServerDeps => ({ env: { GEMINI_API_KEY: 'gemini-test-key' }, authenticate: async () => 'student-1', usage, model: () => model })
  const response = await handleStudioAiRequest(quizFeature, deps)(new Request('http://localhost/studio-quiz', { method: 'POST', body: JSON.stringify(body) }))
  return { response, model, usage }
}

describe('studio-quiz', () => {
  it('returns the questions (at most as many as asked), tidied, with the options shuffled and the right one still right', async () => {
    const { response, usage, model } = await call(REQUEST, {
      questions: [question('What does an inner join keep?'), question('Which rows?'), question('Third'), question('One too many')],
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    // The Fast model: questions from a note need no deep thinking, and it answers in seconds.
    expect(body).toMatchObject({ model: 'gemini-3.5-flash-lite', promptVersion: 'studio-quiz-v2' })
    expect(body.questions).toHaveLength(3)
    for (const asked of body.questions as { prompt: string; options: string[]; correctOption: number; explanation: string }[]) {
      expect(asked.options[asked.correctOption]).toBe('Only matching rows')
      expect([...asked.options].sort()).toEqual(['Every row of both tables', 'Every row of the left table', 'No rows', 'Only matching rows'])
    }
    expect(body.questions[0]).toMatchObject({ prompt: 'What does an inner join keep?', explanation: 'An inner join keeps rows that match in both tables.' })
    expect(usage.logged).toEqual([expect.objectContaining({ feature: 'studio-quiz', model: 'gemini-3.5-flash-lite' })])
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('Write 3 questions about these notes, called \\"SQL joins\\"')
    expect(prompt).toContain('Only matching rows')
  })

  it('tries again when two options are the same', async () => {
    const twice = { ...question('Q'), options: ['A', 'a ', 'B', 'C'] }
    const { response, model } = await call(REQUEST, { questions: [twice] }, { questions: [question('Q')] })
    expect(response.status).toBe(200)
    expect(model.doGenerateCalls).toHaveLength(2)
  })

  it('needs the note, its text and a sensible number of questions', async () => {
    expect((await call({ ...REQUEST, count: 50 }, { questions: [] })).response.status).toBe(400)
    expect((await call({ ...REQUEST, text: '  ' }, { questions: [] })).response.status).toBe(400)
  })

  it('reads the full notes of a long lecture (more than other texts)', async () => {
    const long = `## Topic\n${'- A detailed point about the lecture.\n'.repeat(3_000)}`
    expect(long.length).toBeGreaterThan(100_000)
    expect((await call({ ...REQUEST, text: long }, { questions: [question('Q')] })).response.status).toBe(200)
  })
})

describe('shuffleOptions', () => {
  it('moves the right answer with its option', () => {
    // random() = 0 every time: [a, b, c, d] → [b, c, d, a]
    const shuffled = shuffleOptions({ prompt: 'Q', options: ['a', 'b', 'c', 'd'], correctOption: 0, explanation: 'E', difficulty: 1 }, () => 0)
    expect(shuffled.options).toEqual(['b', 'c', 'd', 'a'])
    expect(shuffled.correctOption).toBe(3)
  })
})
