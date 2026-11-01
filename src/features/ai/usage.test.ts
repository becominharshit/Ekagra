import { FunctionsHttpError } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { AI_FUNCTIONS, formatUsd, loadAiUsage, summarizeUsage, type UsageRow } from './usage'

const NOW = new Date('2026-11-20T10:00:00.000Z')
const MONTH_START = new Date('2026-11-01T00:00:00.000Z')

const row = (feature: string, at: string, cost = 0.001): UsageRow => ({ feature, cost_usd: cost, created_at: at })

describe('summarizeUsage', () => {
  it('counts the last 24 hours and the month, per Edge Function (anchors and questions are both ai-tutor)', () => {
    const summary = summarizeUsage(
      [
        row('anchor', '2026-11-20T09:00:00.000Z', 0.002),
        row('tutor', '2026-11-19T12:00:00.000Z', 0.003),
        row('syllabus', '2026-11-10T08:00:00.000Z', 0.02),
        row('brief', '2026-10-31T23:00:00.000Z', 0.5), // last month
        row('something-new', '2026-11-20T08:00:00.000Z', 0.001), // only in the totals
      ],
      { now: NOW, monthStart: MONTH_START, dailyLimit: 150 },
    )
    expect(summary).toMatchObject({ day: 3, month: 4, nextFreeAt: null })
    expect(summary.monthUsd).toBeCloseTo(0.026)
    expect(summary.byFunction.map((usage) => usage.name)).toEqual(AI_FUNCTIONS.map((fn) => fn.name))
    expect(summary.byFunction.find((usage) => usage.name === 'ai-tutor')).toMatchObject({ day: 2, month: 2 })
    expect(summary.byFunction.find((usage) => usage.name === 'ai-tutor')?.monthUsd).toBeCloseTo(0.005)
    expect(summary.byFunction.find((usage) => usage.name === 'ai-syllabus')).toMatchObject({ day: 0, month: 1, monthUsd: 0.02 })
    expect(summary.byFunction.find((usage) => usage.name === 'ai-brief')).toMatchObject({ day: 0, month: 0, monthUsd: 0 })
  })

  it('counts a request exactly 24 hours old, like the server', () => {
    expect(summarizeUsage([row('brief', '2026-11-19T10:00:00.000Z')], { now: NOW, monthStart: MONTH_START, dailyLimit: 150 }).day).toBe(1)
  })

  it('says when the next request frees up at the daily limit', () => {
    const rows = [row('generate', '2026-11-19T12:00:00.000Z'), row('generate', '2026-11-19T15:00:00.000Z'), row('generate', '2026-11-20T09:00:00.000Z')]
    // 3 used of 3: one more is allowed once the oldest is a day old.
    expect(summarizeUsage(rows, { now: NOW, monthStart: MONTH_START, dailyLimit: 3 }).nextFreeAt).toEqual(new Date('2026-11-20T12:00:00.000Z'))
    // 3 used of 2 (the limit was lowered): two have to leave.
    expect(summarizeUsage(rows, { now: NOW, monthStart: MONTH_START, dailyLimit: 2 }).nextFreeAt).toEqual(new Date('2026-11-20T15:00:00.000Z'))
    expect(summarizeUsage(rows, { now: NOW, monthStart: MONTH_START, dailyLimit: 4 }).nextFreeAt).toBeNull()
  })
})

describe('formatUsd', () => {
  it('shows cents, and tiny amounts as under a cent', () => {
    expect(formatUsd(0)).toBe('$0')
    expect(formatUsd(0.0004)).toBe('<$0.01')
    expect(formatUsd(0.042)).toBe('$0.04')
    expect(formatUsd(3.2)).toBe('$3.20')
  })
})

/** A pretend signed-in Supabase client: ai_usage rows (one page) and the ai-usage function. */
function signedIn(rows: UsageRow[], invoke: () => Promise<{ data: unknown; error: unknown }>) {
  const asked: { since?: string; body?: unknown } = {}
  const query = {
    select: () => query,
    eq: () => query,
    gte: (_column: string, since: string) => {
      asked.since = since
      return query
    },
    order: () => query,
    range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
  }
  const client = {
    from: () => query,
    functions: {
      invoke: vi.fn(async (_name: string, options: { body: unknown }) => {
        asked.body = options.body
        return invoke()
      }),
    },
  }
  return { source: { kind: 'supabase', userId: 'student-1', client } as unknown as DataSource, asked, client }
}

describe('loadAiUsage', () => {
  it('counts nothing in Demo Mode', async () => {
    expect(await loadAiUsage({ kind: 'demo' })).toEqual({ kind: 'demo' })
  })

  it("puts the student's own rows next to the server's limits and the app's spending", async () => {
    const answer = {
      limits: { userDailyRequests: 40, monthlyBudgetUsd: 25, dailyBudgetUsd: 25 / 30 },
      app: { spentLast24hUsd: 0.3, spentThisMonthUsd: 4.2 },
      aiConfigured: true,
    }
    const { source, asked, client } = signedIn([row('capture', '2026-11-20T09:30:00.000Z', 0.01)], async () => ({ data: answer, error: null }))
    const view = await loadAiUsage(source, new Date(2026, 10, 20, 15, 0))
    expect(view).toMatchObject({ kind: 'signed_in', limits: answer.limits, app: answer.app, aiConfigured: true, serverError: null })
    if (view.kind !== 'signed_in') throw new Error('expected signed in')
    expect(view.monthStart).toEqual(new Date(2026, 10, 1))
    expect(view.summary.month).toBe(1)
    expect(client.functions.invoke).toHaveBeenCalledWith('ai-usage', expect.anything())
    expect(asked.body).toEqual({ monthStart: new Date(2026, 10, 1).toISOString() })
    expect(asked.since).toBe(new Date(2026, 10, 1).toISOString())
  })

  it('reads back into last month on the 1st, for the last 24 hours', async () => {
    const { source, asked } = signedIn([], async () => ({ data: null, error: new Error('offline') }))
    const now = new Date(2026, 10, 1, 9, 0)
    await loadAiUsage(source, now)
    expect(asked.since).toBe(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
  })

  it("still shows the student's own usage with the default limits when ai-usage is not deployed", async () => {
    const notFound = new FunctionsHttpError(new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404 }))
    const { source } = signedIn([row('brief', '2026-11-20T09:30:00.000Z')], async () => ({ data: null, error: notFound }))
    const view = await loadAiUsage(source, new Date(2026, 10, 20, 15, 0))
    expect(view).toMatchObject({
      kind: 'signed_in',
      limits: { userDailyRequests: 150, monthlyBudgetUsd: 10 },
      app: null,
      aiConfigured: null,
      serverError: expect.stringContaining("The ai-usage function isn't on the server yet"),
    })
  })
})
