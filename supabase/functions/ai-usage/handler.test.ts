import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ENTITLEMENTS } from '../_shared/billing.ts'
import { AiUsageResponseSchema } from '../_shared/schemas.ts'
import { TEST_SECRETS } from '../_shared/testing.ts'
import { handleUsageRequest, type UsageDeps } from './handler.ts'

const NOW = new Date('2026-11-20T10:00:00.000Z')

/** All students' AI costs: one an hour ago, one 3 days ago, one last month. */
const COSTS = [
  { at: new Date('2026-11-20T09:00:00.000Z'), usd: 0.0025 },
  { at: new Date('2026-11-17T10:00:00.000Z'), usd: 0.5 },
  { at: new Date('2026-10-25T10:00:00.000Z'), usd: 4 },
]

function deps(overrides: Partial<UsageDeps> = {}) {
  const spentSince = vi.fn(async (since: Date) => COSTS.filter((cost) => cost.at >= since).reduce((sum, cost) => sum + cost.usd, 0))
  const userRequestsSince = vi.fn(async () => 4)
  const userTokensSince = vi.fn(async () => 12_500)
  const loadBillingState = vi.fn(async () => ({
    subscription: null,
    tier: 'free' as const,
    entitlement: DEFAULT_ENTITLEMENTS.free,
  }))
  const make = (): UsageDeps => ({
    env: TEST_SECRETS,
    authenticate: async (request) => (request.headers.get('Authorization') === 'Bearer good-token' ? 'student-1' : null),
    spentSince,
    userRequestsSince,
    userTokensSince,
    loadBillingState,
    now: () => NOW,
    ...overrides,
  })
  return { make, spentSince, userRequestsSince, userTokensSince, loadBillingState }
}

function post(body?: unknown, token = 'good-token'): Request {
  return new Request('http://localhost/functions/v1/ai-usage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('ai-usage', () => {
  it("returns the active student's tier entitlement, personal counters, and app spend", async () => {
    const { make, spentSince, userTokensSince } = deps()
    const response = await handleUsageRequest(make)(post({ monthStart: '2026-10-31T18:30:00.000Z' }))
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(AiUsageResponseSchema.parse(body)).toEqual({
      tier: 'free',
      entitlement: {
        ...DEFAULT_ENTITLEMENTS.free,
        codingLabLanguages: [...DEFAULT_ENTITLEMENTS.free.codingLabLanguages],
      },
      user: { requestsLast24h: 4, tokensThisMonth: 12_500 },
      subscription: null,
      limits: { userDailyRequests: 25, monthlyAiTokens: 250_000, monthlyBudgetUsd: 100 },
      app: { spentLast24hUsd: 0.0025, spentThisMonthUsd: 0.5025 },
      budgetAlert: false,
      aiConfigured: true,
    })
    expect(spentSince).toHaveBeenCalledWith(new Date('2026-11-19T10:00:00.000Z'))
    expect(spentSince).toHaveBeenCalledWith(new Date('2026-10-31T18:30:00.000Z'), 50)
    expect(userTokensSince).toHaveBeenCalledWith('student-1', new Date('2026-11-01T00:00:00.000Z'), 50)
  })

  it('returns Pro entitlements and subscription summary when user is subscribed', async () => {
    const { make } = deps({
      env: { AI_MONTHLY_BUDGET_USD: '0.25' },
      loadBillingState: async () => ({
        subscription: {
          userId: 'student-1',
          provider: 'stripe',
          customerId: 'cus_1',
          subscriptionId: 'sub_1',
          planTier: 'pro',
          status: 'active',
          currentPeriodEnd: '2026-12-13T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        },
        tier: 'pro',
        entitlement: DEFAULT_ENTITLEMENTS.pro,
      }),
    })
    const body = AiUsageResponseSchema.parse(await (await handleUsageRequest(make)(post({}))).json())
    expect(body.tier).toBe('pro')
    expect(body.limits).toEqual({ userDailyRequests: 250, monthlyAiTokens: 5_000_000, monthlyBudgetUsd: 0.25 })
    expect(body.budgetAlert).toBe(true)
    expect(body.aiConfigured).toBe(false)
    expect(body.subscription?.provider).toBe('stripe')
  })

  it("counts from the 1st of the month (UTC) without a month start, or with one that can't be right", async () => {
    for (const body of [undefined, {}, { monthStart: '2026-12-01T00:00:00.000Z' }, { monthStart: '2026-09-01T00:00:00.000Z' }]) {
      const { make, spentSince } = deps()
      expect((await handleUsageRequest(make)(post(body))).status).toBe(200)
      expect(spentSince).toHaveBeenLastCalledWith(new Date('2026-11-01T00:00:00.000Z'), 50)
    }
  })

  it('uses the single-query getUsageSummary RPC fast path when provided', async () => {
    const getUsageSummary = vi.fn(async () => ({
      requestsLast24h: 3,
      tokensThisMonth: 18_000,
      spentLast24hUsd: 0.02,
      spentThisMonthUsd: 0.45,
    }))
    const { make } = deps({ getUsageSummary })
    const res = await handleUsageRequest(make)(post({}))
    expect(res.status).toBe(200)
    const body = AiUsageResponseSchema.parse(await res.json())
    expect(body.user).toEqual({ requestsLast24h: 3, tokensThisMonth: 18_000 })
    expect(body.app).toEqual({ spentLast24hUsd: 0.02, spentThisMonthUsd: 0.45 })
    expect(getUsageSummary).toHaveBeenCalledWith('student-1', {
      daySince: new Date('2026-11-19T10:00:00.000Z'),
      userMonthSince: new Date('2026-11-01T00:00:00.000Z'),
      appMonthSince: new Date('2026-11-01T00:00:00.000Z'),
    })
  })

  it('says "too many to add up" as null instead of Infinity', async () => {
    const { make } = deps({ spentSince: async () => Number.POSITIVE_INFINITY })
    const body = AiUsageResponseSchema.parse(await (await handleUsageRequest(make)(post({}))).json())
    expect(body.app).toEqual({ spentLast24hUsd: null, spentThisMonthUsd: null })
    expect(body.budgetAlert).toBe(true)
  })

  it('turns away requests without a valid sign-in, and bad month starts', async () => {
    const { make } = deps()
    expect((await handleUsageRequest(make)(post({}, 'stolen-token'))).status).toBe(401)
    const bad = await handleUsageRequest(make)(post({ monthStart: 'last Tuesday' }))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ code: 'bad_request', message: expect.stringContaining('monthStart') })
  })

  it("explains when the spending can't be added up, and answers the CORS preflight", async () => {
    const { make } = deps({ spentSince: async () => Promise.reject(new Error('connection reset')) })
    const response = await handleUsageRequest(make)(post({}))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'usage_unavailable' })

    const preflight = await handleUsageRequest(deps().make)(
      new Request('http://localhost/x', { method: 'OPTIONS', headers: { Origin: 'https://ekagra.app' } }),
    )
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://ekagra.app')
  })
})
