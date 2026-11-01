import { APICallError, RetryError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createAiGateway, MAX_OUTPUT_TOKENS, type AiTask } from './ai.ts'
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

    await expect(ai.generate(task)).resolves.toEqual({ data: { title: 'SQL', minutes: 60 }, model: 'claude-smart-test' })
    expect(model.doGenerateCalls).toHaveLength(1)
    // 1,000 × $0.75/M + 500 × $3.75/M
    expect(usage.logged).toEqual([
      { userId: 'student-1', feature: 'syllabus', model: 'claude-smart-test', inputTokens: 1000, outputTokens: 500, costUsd: 0.002625 },
    ])
  })

  it('uses the Fast model and its price for Fast tasks', async () => {
    const usage = memoryUsage()
    const ai = createAiGateway({ config, usage, model: () => fakeModel(modelAnswer(GOOD)) })

    await expect(ai.generate({ ...task, tier: 'fast' })).resolves.toMatchObject({ model: 'claude-fast-test' })
    expect(usage.logged[0]).toMatchObject({ model: 'claude-fast-test', costUsd: 0.00155 }) // 1,000 × $0.30/M + 500 × $2.50/M
  })

  it('lets the Smart model think a little first and the Fast one answer straight away, with room for long answers', async () => {
    const model = fakeModel(modelAnswer(GOOD), modelAnswer(GOOD))
    const ai = createAiGateway({ config, usage: memoryUsage(), model: () => model })
    await ai.generate(task)
    await ai.generate({ ...task, tier: 'fast' })
    expect(model.doGenerateCalls.map((call) => [call.reasoning, call.maxOutputTokens])).toEqual([
      ['low', MAX_OUTPUT_TOKENS],
      ['none', MAX_OUTPUT_TOKENS],
    ])
  })

  it('prices each try on its own, so a long prompt on Claude Haiku 5.5 costs the long-prompt price', async () => {
    const usage = memoryUsage()
    const haiku = readAiConfig({ AI_API_KEY: 'sk-ant-test' })
    const model = fakeModel(modelAnswer('{"title":"SQL"}', 60_000, 100), modelAnswer(GOOD, 120_000, 100))
    const ai = createAiGateway({ config: haiku, usage, model: () => model })

    await ai.generate({ ...task, tier: 'fast' })
    // 60,000 × $0.10/M + 100 × $0.50/M, then over 100,000: 120,000 × $0.50/M + 100 × $2.50/M
    expect(usage.logged).toEqual([expect.objectContaining({ model: 'claude-haiku-5-5', inputTokens: 180_000, outputTokens: 200, costUsd: 0.06630 })])
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
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const usage = memoryUsage()
    const broken = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('network down')
      },
    })
    const ai = createAiGateway({ config, usage, model: () => broken })

    await expect(ai.generate(task)).rejects.toMatchObject({ status: 502, code: 'provider_error' })
    expect(usage.logged).toEqual([])
    quiet.mockRestore()
  })

  it("says when Anthropic refuses the key, and when it's busy (also after the SDK's own retries)", async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failing = (error: unknown) =>
      new MockLanguageModelV4({
        doGenerate: async () => {
          throw error
        },
      })
    const apiError = (statusCode: number, responseBody = '{"type":"error"}') =>
      new APICallError({ message: `HTTP ${statusCode}`, url: 'https://api.anthropic.com/v1/messages', requestBodyValues: {}, statusCode, responseBody, isRetryable: false })
    const tryWith = (error: unknown) => createAiGateway({ config, usage: memoryUsage(), model: () => failing(error) }).generate(task)

    await expect(tryWith(apiError(401))).rejects.toMatchObject({ status: 500, code: 'not_configured', message: expect.stringContaining('AI_API_KEY') })
    await expect(tryWith(apiError(529))).rejects.toMatchObject({ status: 503, code: 'provider_busy' })
    const spendLimit = apiError(400, '{"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits."}}')
    await expect(tryWith(spendLimit)).rejects.toMatchObject({ status: 503, code: 'provider_busy' })
    await expect(tryWith(apiError(400))).rejects.toMatchObject({ status: 502, code: 'provider_error' })
    const retried = new RetryError({ message: 'Failed after 3 attempts', reason: 'maxRetriesExceeded', errors: [apiError(429), apiError(429)] })
    await expect(tryWith(retried)).rejects.toMatchObject({ status: 503, code: 'provider_busy' })
    // Only the status and Anthropic's message are logged, never the prompt.
    expect(String(quiet.mock.calls[0]?.[0])).toBe('AI request to claude-smart-test failed (401): {"type":"error"}')
    quiet.mockRestore()
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
