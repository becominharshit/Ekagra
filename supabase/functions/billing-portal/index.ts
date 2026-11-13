import { adminClient, signedInUser } from '../_shared/admin.ts'
import type { BillingProvider, PlanTier, SubscriptionRecord, SubscriptionStatus } from '../_shared/billing.ts'
import { handleBillingPortal } from './handler.ts'

Deno.serve(
  handleBillingPortal(() => {
    const env = Deno.env.toObject()
    const admin = adminClient(env)
    return {
      env,
      authenticate: (request) => signedInUser(admin, request),
      async getSubscription(userId): Promise<SubscriptionRecord | null> {
        const { data, error } = await admin
          .from('subscriptions')
          .select('user_id, provider, customer_id, subscription_id, plan_tier, status, current_period_end, cancel_at_period_end')
          .eq('user_id', userId)
          .maybeSingle()
        if (error || !data) return null
        const row = data as {
          user_id: string
          provider: string
          customer_id: string | null
          subscription_id: string | null
          plan_tier: string
          status: string
          current_period_end: string | null
          cancel_at_period_end: boolean
        }
        return {
          userId: row.user_id,
          provider: (row.provider === 'razorpay' ? 'razorpay' : 'stripe') as BillingProvider,
          customerId: row.customer_id,
          subscriptionId: row.subscription_id,
          planTier: row.plan_tier as PlanTier,
          status: row.status as SubscriptionStatus,
          currentPeriodEnd: row.current_period_end,
          cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        }
      },
      async markCancelAtPeriodEnd(userId) {
        const { error } = await admin
          .from('subscriptions')
          .update({ cancel_at_period_end: true })
          .eq('user_id', userId)
        if (error) throw error
      },
    }
  }),
)
