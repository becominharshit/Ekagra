import { useQuery } from '@tanstack/react-query'
import { startOfMonth } from 'date-fns'
import { DEFAULT_ENTITLEMENTS, type PlanEntitlement, type PlanTier } from '@shared/billing.ts'
import { AiUsageResponseSchema, DEFAULT_AI_LIMITS, type AiUsageResponse } from '@shared/schemas.ts'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { callAiFunction, type AiFunction } from './aiClient'

// The AI usage dashboard (Me → AI usage): the student's own requests, read from ai_usage (RLS lets
// students read their own rows), next to the active plan entitlements & token counters from ai-usage.
// Demo Mode makes its sample answers on the device: nothing is counted.

/** The AI Edge Functions, and the names each one saves in ai_usage.feature. */
export const AI_FUNCTIONS: { name: AiFunction; label: string; features: string[] }[] = [
  { name: 'ai-syllabus', label: 'Syllabus to topics', features: ['syllabus'] },
  { name: 'ai-papers', label: 'Past papers', features: ['papers'] },
  { name: 'ai-generate', label: 'Lessons, quizzes and cards', features: ['generate'] },
  { name: 'ai-tutor', label: 'AI Anchors and page tutor', features: ['anchor', 'tutor'] },
  { name: 'ai-capture', label: 'Task capture', features: ['capture'] },
  { name: 'ai-inbox', label: 'Sorting what you add', features: ['inbox'] },
  { name: 'ai-brief', label: 'Morning brief', features: ['brief'] },
  { name: 'ai-hustle', label: 'Custom hustle plans', features: ['hustle'] },
  { name: 'ai-grade', label: 'Marking mock tests', features: ['grade'] },
  { name: 'ai-review', label: 'Weekly reviews', features: ['review'] },
  { name: 'ai-meal', label: 'Meal estimates', features: ['meal'] },
  { name: 'ai-speak', label: 'Speaking practice', features: ['speak'] },
  { name: 'studio-notes', label: 'Studio: notes, mind maps and revision sheets', features: ['studio-notes'] },
  { name: 'studio-quiz', label: 'Studio: quizzes from notes', features: ['studio-quiz'] },
]

export interface UsageRow {
  feature: string
  cost_usd: number
  created_at: string
}

export interface FunctionUsage {
  name: AiFunction
  label: string
  /** Requests in the last 24 hours. */
  day: number
  /** Requests this month, and what they cost (USD). */
  month: number
  monthUsd: number
}

export interface UsageSummary {
  /** Requests in the last 24 hours: the daily limit counts these. */
  day: number
  month: number
  monthUsd: number
  byFunction: FunctionUsage[]
  /** At the daily limit: when the next request frees up. */
  nextFreeAt: Date | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Adds up the student's requests: in the last 24 hours, and since the month began, per Edge Function. */
export function summarizeUsage(rows: UsageRow[], { now, monthStart, dailyLimit }: { now: Date; monthStart: Date; dailyLimit: number }): UsageSummary {
  const dayStart = now.getTime() - DAY_MS
  const byFunction: FunctionUsage[] = AI_FUNCTIONS.map(({ name, label }) => ({ name, label, day: 0, month: 0, monthUsd: 0 }))
  const functionOf = new Map(AI_FUNCTIONS.flatMap(({ features }, index) => features.map((feature) => [feature, byFunction[index]] as const)))
  const lastDay: number[] = []
  let month = 0
  let monthUsd = 0
  for (const row of rows) {
    const at = Date.parse(row.created_at)
    const cost = Number(row.cost_usd) || 0
    const usage = functionOf.get(row.feature)
    if (at >= dayStart) {
      lastDay.push(at)
      if (usage) usage.day += 1
    }
    if (at >= monthStart.getTime()) {
      month += 1
      monthUsd += cost
      if (usage) {
        usage.month += 1
        usage.monthUsd += cost
      }
    }
  }
  lastDay.sort((a, b) => a - b)
  const freesUp = lastDay.length >= dailyLimit ? lastDay[lastDay.length - dailyLimit] : undefined
  return { day: lastDay.length, month, monthUsd, byFunction, nextFreeAt: freesUp === undefined ? null : new Date(freesUp + DAY_MS) }
}

/** A cost for students: "$0", "<$0.01" or "$1.25". */
export function formatUsd(usd: number): string {
  if (usd <= 0) return '$0'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

const PAGE_SIZE = 1000
const MAX_PAGES = 10

type SignedIn = Extract<DataSource, { kind: 'supabase' }>

async function listUsageRows(source: SignedIn, since: Date): Promise<UsageRow[]> {
  const rows: UsageRow[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await source.client
      .from('ai_usage')
      .select('feature, cost_usd, created_at')
      .eq('user_id', source.userId)
      .gte('created_at', since.toISOString())
      .order('created_at')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw dbError(error)
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

export type AiUsageView =
  | { kind: 'demo' }
  | {
      kind: 'signed_in'
      monthStart: Date
      tier: PlanTier
      entitlement: PlanEntitlement
      tokensThisMonth: number
      limits: AiUsageResponse['limits']
      summary: UsageSummary
      app: AiUsageResponse['app'] | null
      aiConfigured: boolean | null
      serverError: string | null
    }

export async function loadAiUsage(source: DataSource, now = new Date()): Promise<AiUsageView> {
  if (source.kind === 'demo') return { kind: 'demo' }
  const monthStart = startOfMonth(now)
  const since = new Date(Math.min(monthStart.getTime(), now.getTime() - DAY_MS))
  const [rows, server] = await Promise.all([
    listUsageRows(source, since),
    callAiFunction('ai-usage', { monthStart: monthStart.toISOString() }, AiUsageResponseSchema, source.client).then(
      (answer) => ({ answer, error: null }),
      (error: unknown) => ({
        answer: null,
        error: error instanceof Error && error.message.trim() ? error.message : 'Could not sync subscription limits right now.',
      }),
    ),
  ])
  const entitlement: PlanEntitlement = server.answer?.entitlement ?? DEFAULT_ENTITLEMENTS.free
  const limits: AiUsageResponse['limits'] = server.answer?.limits ?? {
    userDailyRequests: entitlement.dailyAiRequests,
    monthlyAiTokens: entitlement.monthlyAiTokens,
    monthlyBudgetUsd: DEFAULT_AI_LIMITS.monthlyBudgetUsd,
  }
  return {
    kind: 'signed_in',
    monthStart,
    tier: server.answer?.tier ?? 'free',
    entitlement,
    tokensThisMonth: server.answer?.user.tokensThisMonth ?? 0,
    limits,
    summary: summarizeUsage(rows, { now, monthStart, dailyLimit: limits.userDailyRequests }),
    app: server.answer?.app ?? null,
    aiConfigured: server.answer?.aiConfigured ?? null,
    serverError: server.error,
  }
}

export function useAiUsage() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: ['ai-usage', owner],
    queryFn: () => loadAiUsage(need(source)),
    enabled: source !== null,
  })
}
