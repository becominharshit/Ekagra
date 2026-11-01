import { describe, expect, it } from 'vitest'
import { AiError, checkQuota, costUsd, dailyBudgetUsd, dayBefore, readAiConfig } from './aiCore.ts'
import { TEST_SECRETS } from './testing.ts'

describe('readAiConfig', () => {
  it('reads the secrets, with defaults for the provider, budget and daily requests', () => {
    expect(readAiConfig(TEST_SECRETS)).toEqual({
      provider: 'google',
      apiKey: 'test-key',
      models: { smart: 'smart-model', fast: 'fast-model' },
      prices: { smart: { input: 0.75, output: 3.75 }, fast: { input: 0.3, output: 2.5 } },
      monthlyBudgetUsd: 10,
      userDailyRequests: 150,
    })
    expect(readAiConfig({ ...TEST_SECRETS, AI_MONTHLY_BUDGET_USD: '25', AI_USER_DAILY_REQUESTS: '40' })).toMatchObject({
      monthlyBudgetUsd: 25,
      userDailyRequests: 40,
    })
  })

  it('names every missing or wrong secret in one error (an empty value counts as missing)', () => {
    const broken = { ...TEST_SECRETS, AI_API_KEY: '', AI_MODEL_FAST: undefined, AI_PRICE_SMART_INPUT: 'cheap' }
    let error: unknown
    try {
      readAiConfig(broken)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(AiError)
    expect(error).toMatchObject({ status: 500, code: 'not_configured' })
    expect(String((error as Error).message)).toContain('AI_API_KEY, AI_MODEL_FAST, AI_PRICE_SMART_INPUT')
  })

  it('only knows the Google provider for now', () => {
    expect(() => readAiConfig({ ...TEST_SECRETS, AI_PROVIDER: 'other' })).toThrow(/AI_PROVIDER/)
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
})
