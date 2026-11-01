import { describe, expect, it } from 'vitest'
import { handleAiRequest, type ServerDeps } from '../_shared/http.ts'
import { fakeModel, memoryUsage, modelAnswer, TEST_SECRETS } from '../_shared/testing.ts'
import { captureFeature } from './feature.ts'

const REQUEST = {
  text: 'DBMS assignment due Friday 5pm\ncall mom',
  now: '2026-11-02T14:30:00+05:30',
  timezone: 'Asia/Kolkata',
  subjects: [{ key: 's1', name: 'Database Management Systems', code: 'DBMS' }],
  hustles: [{ key: 'h1', name: 'Logo design', type: 'freelancing' }],
}
const TASKS = {
  tasks: [
    {
      title: 'DBMS assignment',
      area: 'academics',
      subjectKey: 's1',
      hustleKey: null,
      lead: false,
      dueAt: '2026-11-06T17:00:00+05:30',
      estMinutes: 120,
      priority: 2,
      unsure: ['estMinutes'],
    },
    { title: 'Call mom', area: 'personal', subjectKey: 's9', hustleKey: null, lead: true, dueAt: null, estMinutes: 15, priority: 3, unsure: ['dueAt'] },
  ],
}

async function call(body: unknown, ...answers: string[]) {
  const model = fakeModel(...answers.map((answer) => modelAnswer(answer)))
  const usage = memoryUsage()
  const deps = (): ServerDeps => ({ env: TEST_SECRETS, authenticate: async () => 'student-1', usage, model: () => model })
  const response = await handleAiRequest(captureFeature, deps)(new Request('http://localhost/ai-capture', { method: 'POST', body: JSON.stringify(body) }))
  return { response, model, usage }
}

describe('ai-capture', () => {
  it('returns the tasks with what is unsure; a subject key that is not in the list becomes null', async () => {
    const { response, usage } = await call(REQUEST, JSON.stringify(TASKS))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ model: 'claude-fast-test', promptVersion: 'capture-v2' })
    expect(body.tasks[0]).toEqual(TASKS.tasks[0])
    expect(body.tasks[1]).toMatchObject({ title: 'Call mom', subjectKey: null, lead: false }) // a lead needs a hustle
    expect(usage.logged).toEqual([expect.objectContaining({ feature: 'capture', model: 'claude-fast-test' })])
  })

  it('matches hustles and leads; a hustle key that is not in the list becomes null', async () => {
    const leads = {
      tasks: [
        { ...TASKS.tasks[0], title: 'Bakery logo enquiry', area: 'hustle', subjectKey: null, hustleKey: 'h1', lead: true },
        { ...TASKS.tasks[0], title: 'Send invoice', area: 'hustle', subjectKey: null, hustleKey: 'h7', lead: false },
      ],
    }
    const { response, model } = await call(REQUEST, JSON.stringify(leads))
    const body = await response.json()
    expect(body.tasks.map((task: { hustleKey: string | null; lead: boolean }) => [task.hustleKey, task.lead])).toEqual([
      ['h1', true],
      [null, false],
    ])
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('h1: Logo design (freelancing)')
  })

  it("gives the model the student's date, time zone and subjects", async () => {
    const { model } = await call(REQUEST, JSON.stringify(TASKS))
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('2026-11-02T14:30:00+05:30 (Asia/Kolkata)')
    expect(prompt).toContain('s1: Database Management Systems (DBMS)')
    expect(prompt).toContain('DBMS assignment due Friday 5pm')
  })

  it('tries again when a due date is not a real date', async () => {
    const broken = { tasks: [{ ...TASKS.tasks[0], dueAt: 'Friday at five' }] }
    const { response, model } = await call(REQUEST, JSON.stringify(broken), JSON.stringify(TASKS))
    expect(response.status).toBe(200)
    expect(model.doGenerateCalls).toHaveLength(2)
  })

  it('needs text or a screenshot', async () => {
    const { response } = await call({ ...REQUEST, text: '  ' }, JSON.stringify(TASKS))
    expect(response.status).toBe(400)
  })
})
