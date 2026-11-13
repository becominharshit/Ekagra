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
// Uses the admin (service_role) client so quota accounting and tier lookup stay authoritative.

const PAGE_SIZE = 1000
const MAX_PAGES = 10

export async function requestsSince(admin: SupabaseClient, userId: string, since: Date): Promise<number> {
  const { count, error } = await admin
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
  if (error) throw error
  return count ?? 0
}

export async function tokensSince(admin: SupabaseClient, userId: string, since: Date, maxPages = MAX_PAGES): Promise<number> {
  let total = 0
  for (let page = 0; page < maxPages; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await admin
      .from('ai_usage')
      .select('input_tokens, output_tokens')
      .eq('user_id', userId)
      .gte('created_at', since.toISOString())
      .order('created_at')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as { input_tokens: number | string; output_tokens: number | string }[]
    total += rows.reduce((sum, row) => sum + Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0), 0)
    if (rows.length < PAGE_SIZE) return total
  }
  return Number.POSITIVE_INFINITY
}

/**
 * What every student's AI requests since `since` cost (USD).
 * More than `maxPages` pages returns Infinity (exceeded admin reporting window).
 */
export async function spendSince(admin: SupabaseClient, since: Date, maxPages = MAX_PAGES): Promise<number> {
  let total = 0
  for (let page = 0; page < maxPages; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await admin
      .from('ai_usage')
      .select('cost_usd')
      .gte('created_at', since.toISOString())
      .order('created_at')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as { cost_usd: number | string }[]
    total += rows.reduce((sum, row) => sum + Number(row.cost_usd), 0)
    if (rows.length < PAGE_SIZE) return total
  }
  return Number.POSITIVE_INFINITY
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
