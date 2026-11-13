import { AiError, dayBefore, isAiConfigured, isBudgetAlertTriggered, monthStartUtc, readUsageLimits } from '../_shared/aiCore.ts'
import { type PlanEntitlement, type PlanTier, type SubscriptionRecord } from '../_shared/billing.ts'
import { handleJson, readBody, requireUser } from '../_shared/respond.ts'
import { AiUsageRequestSchema, type AiUsageResponse } from '../_shared/schemas.ts'

// The AI usage dashboard (Me → AI usage & Pricing). Makes no AI call and isn't counted.
// Returns the signed-in student's active tier/entitlement, daily requests, monthly token usage,
// and aggregate spend / admin alert state.

export interface BillingStateSnapshot {
  subscription: SubscriptionRecord | null
  tier: PlanTier
  entitlement: PlanEntitlement
}

export interface UsageDeps {
  env: Record<string, string | undefined>
  /** The signed-in student's id, or null. */
  authenticate(request: Request): Promise<string | null>
  /** What all AI requests since then cost (USD); Infinity when there are more than maxPages × 1000. */
  spentSince(since: Date, maxPages?: number): Promise<number>
  userRequestsSince(userId: string, since: Date): Promise<number>
  userTokensSince(userId: string, since: Date, maxPages?: number): Promise<number>
  loadBillingState(userId: string, now?: Date): Promise<BillingStateSnapshot>
  now?: () => Date
}

/** "This month" can't have begun longer ago than this (31 days plus a timezone). */
const MAX_MONTH_MS = 32 * 24 * 60 * 60 * 1000
/** A month has far more requests than a day: add up to 50,000 of them. */
const MONTH_PAGES = 50

const roundUsd = (value: number): number | null => (Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : null)

export function handleUsageRequest(deps: () => UsageDeps): (request: Request) => Promise<Response> {
  return handleJson(
    async (request): Promise<AiUsageResponse> => {
    const {
      env,
      authenticate,
      spentSince,
      userRequestsSince,
      userTokensSince,
      loadBillingState,
      now = () => new Date(),
    } = deps()
    const userId = await requireUser(authenticate, request)
    const input = await readBody(request, AiUsageRequestSchema)
    const limits = readUsageLimits(env)

    const at = now()
    const dayAgo = dayBefore(at)
    const asked = input?.monthStart ? new Date(input.monthStart) : null
    const monthStart = asked && asked <= at && at.getTime() - asked.getTime() <= MAX_MONTH_MS ? asked : monthStartUtc(at)
    const billingMonthStart = monthStartUtc(at)

    const [lastDay, month, requestsLast24h, tokensRaw, billing] = await Promise.all([
      spentSince(dayAgo),
      spentSince(monthStart, MONTH_PAGES),
      userRequestsSince(userId, dayAgo),
      userTokensSince(userId, billingMonthStart, MONTH_PAGES),
      loadBillingState(userId, at),
    ]).catch((error: unknown) => {
      throw new AiError(503, 'usage_unavailable', "Couldn't load AI usage and plan entitlements right now. Please try again in a minute.", {
        cause: error,
      })
    })

    const tokensThisMonth = Number.isFinite(tokensRaw) ? Math.max(0, Math.round(tokensRaw)) : billing.entitlement.monthlyAiTokens
    const { subscription, tier, entitlement } = billing

    return {
      tier,
      entitlement: {
        ...entitlement,
        codingLabLanguages: [...entitlement.codingLabLanguages],
      },
      user: {
        requestsLast24h,
        tokensThisMonth,
      },
      subscription: subscription
        ? {
            provider: subscription.provider,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      limits: {
        userDailyRequests: entitlement.dailyAiRequests,
        monthlyAiTokens: entitlement.monthlyAiTokens,
        monthlyBudgetUsd: limits.monthlyBudgetUsd,
      },
      app: { spentLast24hUsd: roundUsd(lastDay), spentThisMonthUsd: roundUsd(month) },
      budgetAlert: isBudgetAlertTriggered(month, limits.monthlyBudgetUsd),
      aiConfigured: isAiConfigured(env),
    }
    },
    () => deps().env,
  )
}
