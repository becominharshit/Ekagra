import { adminClient } from '../_shared/admin.ts'
import type { BillingProvider } from '../_shared/billing.ts'
import { handleBillingWebhook, type WebhookSubscriptionUpsert } from './handler.ts'

Deno.serve(
  handleBillingWebhook(() => {
    const env = Deno.env.toObject()
    const admin = adminClient(env)
    return {
      env,
      async recordEvent(entry) {
        const { error } = await admin.from('webhook_events').insert({
          provider: entry.provider,
          event_id: entry.eventId,
          event_type: entry.eventType,
          status: entry.status,
          payload: entry.payload,
        })
        if (error) {
          if (error.code === '23505') return { duplicate: true }
          throw error
        }
        return { duplicate: false }
      },
      async markEventFailed(provider: BillingProvider, eventId: string, errorMessage: string) {
        await admin
          .from('webhook_events')
          .update({ status: 'failed', error: errorMessage })
          .eq('provider', provider)
          .eq('event_id', eventId)
      },
      async markEventIgnored(provider: BillingProvider, eventId: string) {
        await admin
          .from('webhook_events')
          .update({ status: 'ignored' })
          .eq('provider', provider)
          .eq('event_id', eventId)
      },
      async findUserIdBySubscription(provider: BillingProvider, subscriptionId: string): Promise<string | null> {
        const { data, error } = await admin
          .from('subscriptions')
          .select('user_id')
          .eq('provider', provider)
          .eq('subscription_id', subscriptionId)
          .maybeSingle()
        if (error || !data) return null
        return (data as { user_id?: string }).user_id ?? null
      },
      async upsertSubscription(patch: WebhookSubscriptionUpsert) {
        const { data: existing } = await admin
          .from('subscriptions')
          .select('customer_id, subscription_id, plan_tier, current_period_end, cancel_at_period_end')
          .eq('user_id', patch.userId)
          .maybeSingle()

        const prev = existing as {
          customer_id?: string | null
          subscription_id?: string | null
          plan_tier?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
        } | null

        const { error } = await admin.from('subscriptions').upsert(
          {
            user_id: patch.userId,
            provider: patch.provider,
            customer_id: patch.customerId ?? prev?.customer_id ?? null,
            subscription_id: patch.subscriptionId ?? prev?.subscription_id ?? null,
            plan_tier: patch.planTier ?? prev?.plan_tier ?? 'pro',
            status: patch.status,
            current_period_end: patch.currentPeriodEnd !== undefined ? patch.currentPeriodEnd : (prev?.current_period_end ?? null),
            cancel_at_period_end:
              patch.cancelAtPeriodEnd !== undefined ? patch.cancelAtPeriodEnd : (prev?.cancel_at_period_end ?? false),
          },
          { onConflict: 'user_id' },
        )
        if (error) throw error
      },
    }
  }),
)
