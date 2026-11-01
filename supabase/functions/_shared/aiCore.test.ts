import { describe, expect, it } from 'vitest'
import { AiError, checkQuota, costUsd, dailyBudgetUsd, dayBefore, isAiConfigured, KNOWN_PRICES, readAiConfig, readUsageLimits } from './aiCore.ts'
import { TEST_SECRETS } from './testing.ts'

describe('readUsageLimits', () => {
  it('reads the two limits with the same defaults, without the other AI secrets', () => {
    expect(readUsageLimits({})).toEqual({ monthlyBudgetUsd: 10, userDailyRequests: 150 })
    expect(readUsageLimits({ AI_MONTHLY_BUDGET_USD: '25', AI_USER_DAILY_REQUESTS: ' ' })).toEqual({ monthlyBudgetUsd: 25, userDailyRequests: 150 })
    expect(() => readUsageLimits({ AI_USER_DAILY_REQUESTS: 'lots' })).toThrow(/AI_USER_DAILY_REQUESTS/)
  })

  it('knows whether the AI itself is set up: the Anthropic key is all it needs', () => {
    expect(isAiConfigured(TEST_SECRETS)).toBe(true)
    expect(isAiConfigured({ AI_API_KEY: 'sk-ant-test' })).toBe(true)
    expect(isAiConfigured({ ...TEST_SECRETS, AI_API_KEY: '' })).toBe(false)
  })
})

describe('readAiConfig', () => {
  it('needs only the Anthropic key: Claude Sonnet and Haiku, their prices and how much they think come by themselves', () => {
    expect(readAiConfig({ AI_API_KEY: 'sk-ant-test' })).toEqual({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      models: { smart: 'claude-sonnet-5-5', fast: 'claude-haiku-5-5' },
      prices: { smart: { input: 2, output: 10 }, fast: { input: 0.1, output: 0.5, longPrompt: { inputTokens: 100_000, input: 0.5, output: 2.5 } } },
      reasoning: { smart: 'low', fast: 'none' },
      monthlyBudgetUsd: 10,
      userDailyRequests: 150,
    })
  })

  it('reads other models with their prices, how much they think, the budget and the daily requests', () => {
    expect(readAiConfig({ ...TEST_SECRETS, AI_REASONING_SMART: 'medium', AI_MONTHLY_BUDGET_USD: '25', AI_USER_DAILY_REQUESTS: '40' })).toEqual({
      provider: 'anthropic',
      apiKey: 'test-key',
      models: { smart: 'claude-smart-test', fast: 'claude-fast-test' },
      prices: { smart: { input: 0.75, output: 3.75 }, fast: { input: 0.3, output: 2.5 } },
      reasoning: { smart: 'medium', fast: 'none' },
      monthlyBudgetUsd: 25,
      userDailyRequests: 40,
    })
    // A Claude model it knows (also by its dated name) brings its own prices.
    expect(readAiConfig({ AI_API_KEY: 'k', AI_MODEL_SMART: 'claude-opus-5-5', AI_MODEL_FAST: 'claude-haiku-4-5-20251001' }).prices).toEqual({
      smart: { input: 4, output: 20 },
      fast: { input: 1, output: 5 },
    })
  })

  it('names every missing or wrong secret in one error (an empty value counts as missing)', () => {
    const broken = { ...TEST_SECRETS, AI_API_KEY: '', AI_MODEL_FAST: 'gemini-3.5-flash-lite', AI_PRICE_SMART_INPUT: 'cheap', AI_REASONING_FAST: 'lots' }
    let error: unknown
    try {
      readAiConfig(broken)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(AiError)
    expect(error).toMatchObject({ status: 500, code: 'not_configured' })
    expect(String((error as Error).message)).toContain('AI_API_KEY, AI_MODEL_FAST, AI_PRICE_SMART_INPUT, AI_REASONING_FAST')
  })

  it("needs both prices for a Claude model it doesn't know", () => {
    expect(() => readAiConfig({ AI_API_KEY: 'k', AI_MODEL_SMART: 'claude-next-model' })).toThrow(/AI_PRICE_SMART_INPUT, AI_PRICE_SMART_OUTPUT/)
    expect(() => readAiConfig({ AI_API_KEY: 'k', AI_MODEL_SMART: 'claude-next-model', AI_PRICE_SMART_INPUT: '1' })).toThrow(/AI_PRICE_SMART_OUTPUT/)
  })

  it('only uses Anthropic (Claude)', () => {
    expect(readAiConfig({ ...TEST_SECRETS, AI_PROVIDER: 'anthropic' }).provider).toBe('anthropic')
    expect(() => readAiConfig({ ...TEST_SECRETS, AI_PROVIDER: 'google' })).toThrow(/AI_PROVIDER/)
  })
})

describe('checkQuota', () => {
  const config = readAiConfig({ ...TEST_SECRETS, AI_MONTHLY_BUDGET_USD: '9', AI_USER_DAILY_REQUESTS: '3' })

  it('spreads the monthly budget evenly over the days', () => {
    expect(dailyBudgetUsd(config)).toBeCloseTo(0.3)
  })

  it('lets requests through while both limits have room', () => {
    expect(checkQuota({ requests: 2, spentUsd: 0.29 }, config)).toEqual({ ok: true })
  })

  it("stops a student who used today's requests", () => {
    expect(checkQuota({ requests: 3, spentUsd: 0 }, config)).toMatchObject({ ok: false, code: 'daily_limit' })
  })

  it("stops everyone when the app's budget for the day is used up", () => {
    expect(checkQuota({ requests: 0, spentUsd: 0.3 }, config)).toMatchObject({ ok: false, code: 'budget_reached' })
  })

  it('counts the last 24 hours', () => {
    expect(dayBefore(new Date('2026-11-02T10:00:00Z')).toISOString()).toBe('2026-11-01T10:00:00.000Z')
  })
})

describe('costUsd', () => {
  it('prices input and output tokens per million, rounded to 6 decimals', () => {
    // 1,000 × $0.75/M + 500 × $3.75/M = $0.00075 + $0.001875
    expect(costUsd({ input: 1000, output: 500 }, { input: 0.75, output: 3.75 })).toBe(0.002625)
    expect(costUsd({ input: 1, output: 0 }, { input: 0.3, output: 2.5 })).toBe(0)
  })

  it('charges the long-prompt price for a prompt over the line (Claude Haiku 5.5)', () => {
    const haiku = KNOWN_PRICES['claude-haiku-5-5'] ?? { input: 0, output: 0 }
    // 100,000 × $0.10/M + 1,000 × $0.50/M, then 200,000 × $0.50/M + 1,000 × $2.50/M
    expect(costUsd({ input: 100_000, output: 1000 }, haiku)).toBe(0.0105)
    expect(costUsd({ input: 200_000, output: 1000 }, haiku)).toBe(0.1025)
  })
})
