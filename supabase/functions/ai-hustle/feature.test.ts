import { describe, expect, it } from 'vitest'
import { handleAiRequest, type ServerDeps } from '../_shared/http.ts'
import { fakeModel, memoryUsage, modelAnswer, TEST_SECRETS } from '../_shared/testing.ts'
import { hustleFeature } from './feature.ts'

const REQUEST = {
  description: 'I want to sell handmade resin keychains to students at my college and on Instagram.',
  skill: 'Product photography',
  goal: 'First ₹3,000 by February',
}
const PLAN = {
  name: 'Resin keychains',
  phases: [
    { title: 'Product and price', steps: [{ title: 'Make 5 test keychains', skill: null }, { title: 'Work out the cost of one', skill: null }] },
    { title: 'Photos and page', steps: [{ title: 'Learn to shoot products on your phone', skill: 'Product photography' }, { title: 'Start an Instagram page', skill: null }] },
    { title: 'First sales', steps: [{ title: 'Sell 10 at college', skill: null }] },
  ],
  stages: ['Order', 'Making', 'Delivered', 'Paid'],
}

async function call(body: unknown, ...answers: string[]) {
  const model = fakeModel(...answers.map((answer) => modelAnswer(answer)))
  const usage = memoryUsage()
  const deps = (): ServerDeps => ({ env: TEST_SECRETS, authenticate: async () => 'student-1', usage, model: () => model })
  const response = await handleAiRequest(hustleFeature, deps)(new Request('http://localhost/ai-hustle', { method: 'POST', body: JSON.stringify(body) }))
  return { response, model, usage }
}

describe('ai-hustle', () => {
  it('plans phases, steps (with the skills they need) and board columns on the Smart tier', async () => {
    const { response, usage } = await call(REQUEST, JSON.stringify(PLAN))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ...PLAN, model: 'claude-smart-test', promptVersion: 'hustle-v1' })
    expect(usage.logged).toEqual([expect.objectContaining({ feature: 'hustle', model: 'claude-smart-test' })])
  })

  it("gives the model the student's idea, skill and goal", async () => {
    const { model } = await call(REQUEST, JSON.stringify(PLAN))
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('resin keychains')
    expect(prompt).toContain('The skill it needs most: Product photography')
    expect(prompt).toContain('Their goal: First ₹3,000 by February')
  })

  it('tries again when two board columns have the same name, or there are too few phases', async () => {
    const twice = { ...PLAN, stages: ['Order', 'order', 'Paid'] }
    const short = { ...PLAN, phases: PLAN.phases.slice(0, 2) }
    for (const broken of [twice, short]) {
      const { response, model } = await call(REQUEST, JSON.stringify(broken), JSON.stringify(PLAN))
      expect(response.status).toBe(200)
      expect(model.doGenerateCalls).toHaveLength(2)
    }
  })

  it('needs a real description', async () => {
    const { response } = await call({ description: 'money' }, JSON.stringify(PLAN))
    expect(response.status).toBe(400)
  })
})
