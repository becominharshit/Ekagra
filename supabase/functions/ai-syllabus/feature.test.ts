import { describe, expect, it } from 'vitest'
import { handleAiRequest, type ServerDeps } from '../_shared/http.ts'
import { fakeModel, memoryUsage, modelAnswer, TEST_SECRETS } from '../_shared/testing.ts'
import { syllabusFeature } from './feature.ts'

const TREE = {
  units: [
    {
      title: 'Unit 1: Relational model',
      topics: [
        { key: 'u1t1', title: 'ER model', track: 'exam', estMinutes: 90, difficulty: 2, examWeight: 0.6, prerequisites: [] },
        { key: 'u1t2', title: 'Relational algebra', track: 'exam', estMinutes: 120, difficulty: 3, examWeight: 0.7, prerequisites: ['u1t1'] },
      ],
    },
  ],
}

function call(body: unknown) {
  const model = fakeModel(modelAnswer(JSON.stringify(TREE)))
  const usage = memoryUsage()
  const deps = (): ServerDeps => ({ env: TEST_SECRETS, authenticate: async () => 'student-1', usage, model: () => model })
  const request = new Request('http://localhost/ai-syllabus', { method: 'POST', body: JSON.stringify(body) })
  return { response: handleAiRequest(syllabusFeature, deps)(request), model, usage }
}

describe('ai-syllabus', () => {
  it('returns the topic tree, made with the Smart model', async () => {
    const { response, usage } = call({ subjectName: 'DBMS', text: 'Unit 1: ER model, relational algebra' })
    const answer = await response
    expect(answer.status).toBe(200)
    expect(await answer.json()).toEqual(TREE)
    expect(usage.logged).toEqual([expect.objectContaining({ feature: 'syllabus', model: 'claude-smart-test' })])
  })

  it('tells the model about the student and gives it the syllabus text', async () => {
    const { response, model } = call({
      subjectName: 'DBMS',
      program: 'B.Tech CSE',
      year: 2,
      examDate: '2026-12-02',
      text: 'Unit 1: ER model',
    })
    await response
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    for (const part of ['Subject: DBMS', 'Program: B.Tech CSE', 'Year of study: 2', 'Exam date: 2026-12-02', 'Unit 1: ER model']) {
      expect(prompt).toContain(part)
    }
    expect(prompt).toContain('learnable topics of 30–120 minutes')
  })

  it('sends a photo of the syllabus to the model as a file', async () => {
    const { response, model } = call({ subjectName: 'DBMS', file: { mimeType: 'image/jpeg', base64: 'aGVsbG8=' } })
    expect((await response).status).toBe(200)
    const userMessage = model.doGenerateCalls[0]?.prompt.find((message) => message.role === 'user')
    expect(JSON.stringify(userMessage)).toContain('image/jpeg')
  })

  it('needs either text or a file', async () => {
    const { response } = call({ subjectName: 'DBMS', text: '   ' })
    expect((await response).status).toBe(400)
  })
})
