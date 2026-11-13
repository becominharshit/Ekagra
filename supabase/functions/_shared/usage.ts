import type { SupabaseClient } from '@supabase/supabase-js'
import type { UsageStore } from './ai.ts'
import {
  DEFAULT_ENTITLEMENTS,
  isPlanTier,
  resolveEffectiveTier,
  type BillingProvider,
  type PlanEntitlement,
  type PlanTier,
  type SubscriptionRecord,
  type SubscriptionStatus,
} from './billing.ts'

// AI usage and entitlement helpers backed by ai_usage, subscriptions, and plan_entitlements.
// Uses the admin (service_role) client and the indexed get_user_ai_usage_summary SQL RPC so
// quota accounting and tier lookup stay authoritative without scanning raw ai_usage rows.

export interface UserAiUsageSummary {
  requestsLast24h: number
  tokensThisMonth: number
  spentLast24hUsd: number
  spentThisMonthUsd: number
}

interface RawUsageSummaryRow {
  requests_last_24h: number | string | null
  tokens_this_month: number | string | null
  spent_last_24h_usd: number | string | null
  spent_this_month_usd: number | string | null
}

export async function getUserAiUsageSummary(
  admin: SupabaseClient,
  params: {
    userId: string | null
    daySince: Date
    userMonthSince: Date
    appMonthSince: Date
  },
): Promise<UserAiUsageSummary> {
  const { data, error } = await admin.rpc('get_user_ai_usage_summary', {
    p_user_id: params.userId,
    p_day_since: params.daySince.toISOString(),
    p_user_month_since: params.userMonthSince.toISOString(),
    p_app_month_since: params.appMonthSince.toISOString(),
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as RawUsageSummaryRow | null | undefined
  return {
    requestsLast24h: Math.max(0, Math.round(Number(row?.requests_last_24h ?? 0) || 0)),
    tokensThisMonth: Math.max(0, Math.round(Number(row?.tokens_this_month ?? 0) || 0)),
    spentLast24hUsd: Math.max(0, Number(row?.spent_last_24h_usd ?? 0) || 0),
    spentThisMonthUsd: Math.max(0, Number(row?.spent_this_month_usd ?? 0) || 0),
  }
}

export async function requestsSince(admin: SupabaseClient, userId: string, since: Date): Promise<number> {
  const summary = await getUserAiUsageSummary(admin, {
    userId,
    daySince: since,
    userMonthSince: since,
    appMonthSince: since,
  })
  return summary.requestsLast24h
}

export async function tokensSince(admin: SupabaseClient, userId: string, since: Date): Promise<number> {
  const summary = await getUserAiUsageSummary(admin, {
    userId,
    daySince: since,
    userMonthSince: since,
    appMonthSince: since,
  })
  return summary.tokensThisMonth
}

/** What every student's AI requests since `since` cost (USD) via indexed Postgres SUM(). */
export async function spendSince(admin: SupabaseClient, since: Date): Promise<number> {
  const summary = await getUserAiUsageSummary(admin, {
    userId: null,
    daySince: since,
    userMonthSince: since,
    appMonthSince: since,
  })
  return summary.spentThisMonthUsd
}

interface RawSubscriptionRow {
  user_id: string
  provider: string
  customer_id: string | null
  subscription_id: string | null
  plan_tier: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

interface RawEntitlementRow {
  plan_tier: string
  daily_ai_requests: number
  monthly_ai_tokens: number
  max_studio_sources: number
  coding_lab_languages: string[]
  offline_sync_enabled: boolean
  priority_tier: string
}

export async function loadUserSubscriptionAndEntitlement(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<{ subscription: SubscriptionRecord | null; tier: PlanTier; entitlement: PlanEntitlement }> {
  const { data: subData, error: subError } = await admin
    .from('subscriptions')
    .select('user_id, provider, customer_id, subscription_id, plan_tier, status, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  if (subError) throw subError

  const rawSub = subData as RawSubscriptionRow | null
  const subscription: SubscriptionRecord | null = rawSub
    ? {
        userId: rawSub.user_id,
        provider: (rawSub.provider === 'razorpay' ? 'razorpay' : 'stripe') as BillingProvider,
        customerId: rawSub.customer_id,
        subscriptionId: rawSub.subscription_id,
        planTier: isPlanTier(rawSub.plan_tier) ? rawSub.plan_tier : 'free',
        status: rawSub.status as SubscriptionStatus,
        currentPeriodEnd: rawSub.current_period_end,
        cancelAtPeriodEnd: Boolean(rawSub.cancel_at_period_end),
      }
    : null

  const tier = resolveEffectiveTier(subscription, now)

  const { data: entData, error: entError } = await admin
    .from('plan_entitlements')
    .select('plan_tier, daily_ai_requests, monthly_ai_tokens, max_studio_sources, coding_lab_languages, offline_sync_enabled, priority_tier')
    .eq('plan_tier', tier)
    .maybeSingle()
  if (entError) throw entError

  const rawEnt = entData as RawEntitlementRow | null
  const entitlement: PlanEntitlement = rawEnt
    ? {
        planTier: isPlanTier(rawEnt.plan_tier) ? rawEnt.plan_tier : tier,
        dailyAiRequests: Number(rawEnt.daily_ai_requests),
        monthlyAiTokens: Number(rawEnt.monthly_ai_tokens),
        maxStudioSources: Number(rawEnt.max_studio_sources),
        codingLabLanguages: Array.isArray(rawEnt.coding_lab_languages) ? rawEnt.coding_lab_languages : DEFAULT_ENTITLEMENTS[tier].codingLabLanguages,
        offlineSyncEnabled: Boolean(rawEnt.offline_sync_enabled),
        priorityTier: rawEnt.priority_tier === 'priority' ? 'priority' : 'standard',
      }
    : DEFAULT_ENTITLEMENTS[tier]

  return { subscription, tier, entitlement }
}

export function supabaseUsageStore(admin: SupabaseClient): UsageStore {
  return {
    requestsSince: (userId, since) => requestsSince(admin, userId, since),
    tokensSince: (userId, since) => tokensSince(admin, userId, since),
    spentSince: (since) => spendSince(admin, since),
    async getEntitlement(userId, now) {
      const { entitlement } = await loadUserSubscriptionAndEntitlement(admin, userId, now)
      return entitlement
    },
    async log(entry) {
      const { error } = await admin.from('ai_usage').insert({
        user_id: entry.userId,
        feature: entry.feature,
        model: entry.model,
        input_tokens: entry.inputTokens,
        output_tokens: entry.outputTokens,
        cost_usd: entry.costUsd,
      })
      if (error) throw error
    },
  }
}
