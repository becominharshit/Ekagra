import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createAiGateway, type AiTask } from './ai.ts'
import { readAiConfig } from './aiCore.ts'
import { fakeModel, memoryUsage, modelAnswer, TEST_SECRETS } from './testing.ts'

const config = readAiConfig({ ...TEST_SECRETS, AI_USER_DAILY_REQUESTS: '5' })
const schema = z.object({ title: z.string(), minutes: z.number().int() })
const task: AiTask<z.infer<typeof schema>> = {
  userId: 'student-1',
  feature: 'syllabus',
  tier: 'smart',
  schema,
  instructions: 'Make one topic.',
  prompt: 'DBMS',
}
const GOOD = '{"title":"SQL","minutes":60}'

describe('AI gateway', () => {
  it('returns the checked answer and logs tokens and cost once', async () => {
    const usage = memoryUsage()
    const model = fakeModel(modelAnswer(GOOD))
    const ai = createAiGateway({ config, usage, model: () => model })

    await expect(ai.generate(task)).resolves.toEqual({ data: { title: 'SQL', minutes: 60 }, model: 'smart-model' })
    expect(model.doGenerateCalls).toHaveLength(1)
    // 1,000 × $0.75/M + 500 × $3.75/M
    expect(usage.logged).toEqual([
      { userId: 'student-1', feature: 'syllabus', model: 'smart-model', inputTokens: 1000, outputTokens: 500, costUsd: 0.002625 },
    ])
  })

  it('uses the Fast model and its price for Fast tasks', async () => {
    const usage = memoryUsage()
    const ai = createAiGateway({ config, usage, model: () => fakeModel(modelAnswer(GOOD)) })

    await expect(ai.generate({ ...task, tier: 'fast' })).resolves.toMatchObject({ model: 'fast-model' })
    expect(usage.logged[0]).toMatchObject({ model: 'fast-model', costUsd: 0.00155 }) // 1,000 × $0.30/M + 500 × $2.50/M
  })

  it('gives the model a second try when the answer has the wrong shape, logged as one request', async () => {
    const usage = memoryUsage()
    const model = fakeModel(modelAnswer('{"title":"SQL"}'), modelAnswer(GOOD))
    const ai = createAiGateway({ config, usage, model: () => model })

    await expect(ai.generate(task)).resolves.toMatchObject({ data: { title: 'SQL', minutes: 60 } })
    expect(model.doGenerateCalls).toHaveLength(2)
    expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain('did not match the required JSON format')
    expect(usage.logged).toHaveLength(1)
    expect(usage.logged[0]).toMatchObject({ inputTokens: 2000, outputTokens: 1000 })
  })

  it('gives up after two wrong answers, and still logs the tokens they used', async () => {
    const usage = memoryUsage()
    const ai = createAiGateway({ config, usage, model: () => fakeModel(modelAnswer('not json at all')) })

    await expect(ai.generate(task)).rejects.toMatchObject({ status: 422, code: 'invalid_answer' })
    expect(usage.logged).toEqual([expect.objectContaining({ inputTokens: 2000, outputTokens: 1000 })])
  })

  it("stops before calling the model when the student used today's requests", async () => {
    const usage = memoryUsage({ requests: 5 })
    const model = fakeModel(modelAnswer(GOOD))
    const ai = createAiGateway({ config, usage, model: () => model })

    await expect(ai.generate(task)).rejects.toMatchObject({ status: 429, code: 'daily_limit' })
    expect(model.doGenerateCalls).toHaveLength(0)
    expect(usage.logged).toEqual([])
  })

  it("stops when the app's budget for the day is used up", async () => {
    const usage = memoryUsage({ spentUsd: 10 / 30 })
    const ai = createAiGateway({ config, usage, model: () => fakeModel(modelAnswer(GOOD)) })

    await expect(ai.generate(task)).rejects.toMatchObject({ status: 429, code: 'budget_reached' })
  })

  it('reports a failing AI service as provider_error', async () => {
    const usage = memoryUsage()
    const broken = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('network down')
      },
    })
    const ai = createAiGateway({ config, usage, model: () => broken })

    await expect(ai.generate(task)).rejects.toMatchObject({ status: 502, code: 'provider_error' })
    expect(usage.logged).toEqual([])
  })

  it('refuses (instead of guessing) when the usage cannot be checked', async () => {
    const usage = memoryUsage()
    usage.requestsSince = vi.fn().mockRejectedValue(new Error('database offline'))
    const ai = createAiGateway({ config, usage, model: () => fakeModel(modelAnswer(GOOD)) })

    await expect(ai.generate(task)).rejects.toMatchObject({ status: 503, code: 'quota_unavailable' })
  })

  it('still answers when logging the usage fails', async () => {
    const usage = memoryUsage()
    usage.log = vi.fn().mockRejectedValue(new Error('insert failed'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const ai = createAiGateway({ config, usage, model: () => fakeModel(modelAnswer(GOOD)) })

    await expect(ai.generate(task)).resolves.toMatchObject({ data: { title: 'SQL' } })
    vi.restoreAllMocks()
  })
})
