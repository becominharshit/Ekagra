import { AiError, dailyBudgetUsd, dayBefore, isAiConfigured, readUsageLimits } from '../_shared/aiCore.ts'
import { handleJson, readBody, requireUser } from '../_shared/respond.ts'
import { AiUsageRequestSchema, type AiUsageResponse } from '../_shared/schemas.ts'

// The AI usage dashboard (Me → AI usage). It makes no AI call and isn't counted. It tells the app
// the limits set in the secrets and what all students' AI requests cost, which only the secret key
// can add up. The student's own requests are read by the app itself (RLS lets them read their rows).

export interface UsageDeps {
  env: Record<string, string | undefined>
  /** The signed-in student's id, or null. */
  authenticate(request: Request): Promise<string | null>
  /** What all AI requests since then cost (USD); Infinity when there are more than maxPages × 1000. */
  spentSince(since: Date, maxPages?: number): Promise<number>
  now?: () => Date
}

/** "This month" can't have begun longer ago than this (31 days plus a timezone). */
const MAX_MONTH_MS = 32 * 24 * 60 * 60 * 1000
/** A month has far more requests than a day: add up to 50,000 of them. */
const MONTH_PAGES = 50

const roundUsd = (value: number): number | null => (Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : null)

/** The 1st of this month at midnight UTC, when the app doesn't say when its month began. */
function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export function handleUsageRequest(deps: () => UsageDeps): (request: Request) => Promise<Response> {
  return handleJson(async (request): Promise<AiUsageResponse> => {
    const { env, authenticate, spentSince, now = () => new Date() } = deps()
    await requireUser(authenticate, request)
    const input = await readBody(request, AiUsageRequestSchema)
    const limits = readUsageLimits(env)

    const at = now()
    const asked = input?.monthStart ? new Date(input.monthStart) : null
    const monthStart = asked && asked <= at && at.getTime() - asked.getTime() <= MAX_MONTH_MS ? asked : utcMonthStart(at)
    const [lastDay, month] = await Promise.all([spentSince(dayBefore(at)), spentSince(monthStart, MONTH_PAGES)]).catch((error: unknown) => {
      throw new AiError(503, 'usage_unavailable', "Couldn't add up the app's AI spending right now. Please try again in a minute.", { cause: error })
    })

    return {
      limits: { ...limits, dailyBudgetUsd: dailyBudgetUsd(limits) },
      app: { spentLast24hUsd: roundUsd(lastDay), spentThisMonthUsd: roundUsd(month) },
      aiConfigured: isAiConfigured(env),
    }
  })
}
