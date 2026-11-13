import { useQuery } from '@tanstack/react-query'
import {
  DEFAULT_ENTITLEMENTS,
  PLAN_CATALOG,
  isPlanTier,
  resolveEffectiveTier,
  resolveEntitlement,
  selectBillingProvider,
  type BillingInterval,
  type BillingProvider,
  type CurrencyCode,
  type PlanEntitlement,
  type PlanTier,
  type SubscriptionRecord,
  type SubscriptionStatus,
} from '@shared/billing.ts'
import {
  BillingCheckoutResponseSchema,
  BillingPortalResponseSchema,
  type BillingCheckoutResponse,
  type BillingPortalResponse,
} from '@shared/schemas.ts'
import { callAiFunction } from '@/features/ai/aiClient'
import { dbError, useDataSource, type DataSource } from '@/lib/dataSource'

export type {
  BillingInterval,
  BillingProvider,
  CurrencyCode,
  PlanEntitlement,
  PlanTier,
  SubscriptionRecord,
  SubscriptionStatus,
}
export { DEFAULT_ENTITLEMENTS, PLAN_CATALOG, selectBillingProvider }

export interface BillingSnapshot {
  mode: 'demo' | 'supabase'
  tier: PlanTier
  entitlement: PlanEntitlement
  subscription: SubscriptionRecord | null
  catalog: typeof PLAN_CATALOG
}

/** Infers sensible currency for pricing/PPP checkout from the user's locale or timezone. */
export function detectDefaultCurrency(
  locale: string = typeof navigator !== 'undefined' ? navigator.language : 'en-US',
  timeZone: string = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
): CurrencyCode {
  const lowerLocale = locale.toLowerCase()
  const lowerTz = timeZone.toLowerCase()
  if (lowerLocale.endsWith('-in') || lowerLocale === 'hi' || lowerTz === 'asia/kolkata' || lowerTz === 'asia/calcutta') {
    return 'INR'
  }
  if (lowerLocale === 'en-gb' || lowerTz === 'europe/london') {
    return 'GBP'
  }
  if (lowerTz.startsWith('europe/') || ['de', 'fr', 'es', 'it', 'nl'].some((code) => lowerLocale.startsWith(code))) {
    return 'EUR'
  }
  return 'USD'
}

export async function loadBillingSnapshot(source: DataSource | null, now: Date = new Date()): Promise<BillingSnapshot> {
  if (!source || source.kind === 'demo') {
    return {
      mode: 'demo',
      tier: 'free',
      entitlement: DEFAULT_ENTITLEMENTS.free,
      subscription: null,
      catalog: PLAN_CATALOG,
    }
  }

  const [subResult, entResult] = await Promise.all([
    source.client
      .from('subscriptions')
      .select('user_id, provider, customer_id, subscription_id, plan_tier, status, current_period_end, cancel_at_period_end')
      .eq('user_id', source.userId)
      .maybeSingle(),
    source.client
      .from('plan_entitlements')
      .select('plan_tier, daily_ai_requests, monthly_ai_tokens, max_studio_sources, coding_lab_languages, offline_sync_enabled, priority_tier'),
  ])

  if (subResult.error) throw dbError(subResult.error)
  if (entResult.error) throw dbError(entResult.error)

  const rawSub = subResult.data
  const subscription: SubscriptionRecord | null = rawSub
    ? {
        userId: rawSub.user_id,
        provider: rawSub.provider === 'razorpay' ? 'razorpay' : 'stripe',
        customerId: rawSub.customer_id,
        subscriptionId: rawSub.subscription_id,
        planTier: isPlanTier(rawSub.plan_tier) ? rawSub.plan_tier : 'free',
        status: rawSub.status as SubscriptionStatus,
        currentPeriodEnd: rawSub.current_period_end,
        cancelAtPeriodEnd: Boolean(rawSub.cancel_at_period_end),
      }
    : null

  const entitlementsMap: Partial<Record<PlanTier, PlanEntitlement>> = {}
  for (const row of entResult.data ?? []) {
    if (!isPlanTier(row.plan_tier)) continue
    entitlementsMap[row.plan_tier] = {
      planTier: row.plan_tier,
      dailyAiRequests: row.daily_ai_requests,
      monthlyAiTokens: row.monthly_ai_tokens,
      maxStudioSources: row.max_studio_sources,
      codingLabLanguages: row.coding_lab_languages,
      offlineSyncEnabled: row.offline_sync_enabled,
      priorityTier: row.priority_tier === 'priority' ? 'priority' : 'standard',
    }
  }

  const tier = resolveEffectiveTier(subscription, now)
  const entitlement = resolveEntitlement(subscription, entitlementsMap, now)

  return {
    mode: 'supabase',
    tier,
    entitlement,
    subscription,
    catalog: PLAN_CATALOG,
  }
}

export function useBilling() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: ['billing', owner],
    queryFn: () => loadBillingSnapshot(source),
    staleTime: 60_000,
  })
}

export async function startBillingCheckout(
  source: DataSource,
  options: {
    planTier: 'pro' | 'campus'
    interval: BillingInterval
    currency: CurrencyCode
    provider?: BillingProvider
    successUrl: string
    cancelUrl: string
  },
): Promise<BillingCheckoutResponse> {
  if (source.kind !== 'supabase') {
    throw new Error('Sign in to subscribe and unlock cloud sync and priority AI.')
  }
  return callAiFunction(
    'billing-checkout',
    {
      planTier: options.planTier,
      interval: options.interval,
      currency: options.currency,
      ...(options.provider ? { provider: options.provider } : {}),
      successUrl: options.successUrl,
      cancelUrl: options.cancelUrl,
    },
    BillingCheckoutResponseSchema,
    source.client,
  )
}

export async function manageBillingSubscription(
  source: DataSource,
  options: { returnUrl: string; action: 'portal' | 'cancel' },
): Promise<BillingPortalResponse> {
  if (source.kind !== 'supabase') {
    throw new Error('Sign in to manage a billing subscription.')
  }
  return callAiFunction(
    'billing-portal',
    {
      returnUrl: options.returnUrl,
      action: options.action,
    },
    BillingPortalResponseSchema,
    source.client,
  )
}
