import { describe, expect, it } from 'vitest'
import { handleAiRequest, type ServerDeps } from '../_shared/http.ts'
import { fakeModel, memoryUsage, modelAnswer, TEST_SECRETS } from '../_shared/testing.ts'
import { tutorFeature } from './feature.ts'

const PAGE = {
  pageText: 'BCNF: for every functional dependency X → Y, X is a superkey.',
  pageNumber: 42,
  materialTitle: 'DBMS notes',
  subjectName: 'DBMS',
}
const CARDS = [{ front: 'What is BCNF?', back: 'Every determinant is a superkey.' }]

async function call(body: unknown) {
  const model = fakeModel(modelAnswer(JSON.stringify({ answerMd: 'BCNF means **every** determinant is a superkey [p. 42].', flashcards: CARDS })))
  const usage = memoryUsage()
  const deps = (): ServerDeps => ({ env: TEST_SECRETS, authenticate: async () => 'student-1', usage, model: () => model })
  const response = await handleAiRequest(tutorFeature, deps)(new Request('http://localhost/ai-tutor', { method: 'POST', body: JSON.stringify(body) }))
  return { response, model, usage }
}

describe('ai-tutor', () => {
  it('explains the selected text with the Fast model, citing the page', async () => {
    const { response, model, usage } = await call({ ...PAGE, action: 'explain', selectedText: 'X is a superkey' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      answerMd: 'BCNF means **every** determinant is a superkey [p. 42].',
      flashcards: [], // only the flashcards action keeps cards
      model: 'fast-model',
      promptVersion: 'tutor-v1',
    })
    expect(usage.logged[0]).toMatchObject({ feature: 'anchor', model: 'fast-model' })
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('Page 42 of \\"DBMS notes\\" (DBMS)')
    expect(prompt).toContain('Selected text')
    expect(prompt).toContain('[p. 42]')
  })

  it('keeps the cards for the flashcards action', async () => {
    const { response } = await call({ ...PAGE, action: 'flashcards', selectedText: 'BCNF' })
    expect(await response.json()).toMatchObject({ flashcards: CARDS })
  })

  it('answers questions about the page, logged as the tutor', async () => {
    const { response, model, usage } = await call({ ...PAGE, action: 'ask', question: 'Why is BCNF stricter than 3NF?', mentorTone: 'strict' })
    expect(response.status).toBe(200)
    expect(usage.logged[0]).toMatchObject({ feature: 'tutor' })
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('Question: Why is BCNF stricter than 3NF?')
    expect(prompt).toContain('Be brief and direct.')
  })

  it('needs a question to ask, and selected text for the other actions', async () => {
    expect((await call({ ...PAGE, action: 'ask' })).response.status).toBe(400)
    expect((await call({ ...PAGE, action: 'explain', selectedText: '  ' })).response.status).toBe(400)
  })
})
