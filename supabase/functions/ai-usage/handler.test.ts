import { describe, expect, it, vi } from 'vitest'
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
  const make = (): UsageDeps => ({
    env: TEST_SECRETS,
    authenticate: async (request) => (request.headers.get('Authorization') === 'Bearer good-token' ? 'student-1' : null),
    spentSince,
    now: () => NOW,
    ...overrides,
  })
  return { make, spentSince }
}

function post(body?: unknown, token = 'good-token'): Request {
  return new Request('http://localhost/functions/v1/ai-usage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('ai-usage', () => {
  it("returns the limits and what the whole app spent in the last 24 hours and since the student's month began", async () => {
    const { make, spentSince } = deps()
    const response = await handleUsageRequest(make)(post({ monthStart: '2026-10-31T18:30:00.000Z' }))
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(AiUsageResponseSchema.parse(body)).toEqual({
      limits: { userDailyRequests: 150, monthlyBudgetUsd: 10, dailyBudgetUsd: 10 / 30 },
      app: { spentLast24hUsd: 0.0025, spentThisMonthUsd: 0.5025 },
      aiConfigured: true,
    })
    expect(spentSince).toHaveBeenCalledWith(new Date('2026-11-19T10:00:00.000Z'))
    expect(spentSince).toHaveBeenCalledWith(new Date('2026-10-31T18:30:00.000Z'), 50)
  })

  it('uses the limits from the secrets, and works before the AI key is set', async () => {
    const { make } = deps({ env: { AI_USER_DAILY_REQUESTS: '40', AI_MONTHLY_BUDGET_USD: '25' } })
    const body = AiUsageResponseSchema.parse(await (await handleUsageRequest(make)(post({}))).json())
    expect(body.limits).toEqual({ userDailyRequests: 40, monthlyBudgetUsd: 25, dailyBudgetUsd: 25 / 30 })
    expect(body.aiConfigured).toBe(false)
  })

  it("counts from the 1st of the month (UTC) without a month start, or with one that can't be right", async () => {
    for (const body of [undefined, {}, { monthStart: '2026-12-01T00:00:00.000Z' }, { monthStart: '2026-09-01T00:00:00.000Z' }]) {
      const { make, spentSince } = deps()
      expect((await handleUsageRequest(make)(post(body))).status).toBe(200)
      expect(spentSince).toHaveBeenLastCalledWith(new Date('2026-11-01T00:00:00.000Z'), 50)
    }
  })

  it('says "too many to add up" as null instead of Infinity', async () => {
    const { make } = deps({ spentSince: async () => Number.POSITIVE_INFINITY })
    const body = AiUsageResponseSchema.parse(await (await handleUsageRequest(make)(post({}))).json())
    expect(body.app).toEqual({ spentLast24hUsd: null, spentThisMonthUsd: null })
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

    const preflight = await handleUsageRequest(deps().make)(new Request('http://localhost/x', { method: 'OPTIONS' }))
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
