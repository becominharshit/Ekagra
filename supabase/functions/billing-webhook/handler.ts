import { AiError } from '../_shared/aiCore.ts'
import {
  normalizeRazorpayEvent,
  normalizeStripeEvent,
  verifyRazorpaySignature,
  verifyStripeSignature,
  type BillingProvider,
  type PlanTier,
  type SubscriptionStatus,
} from '../_shared/billing.ts'
import { corsHeadersFor, json } from '../_shared/respond.ts'

export interface WebhookSubscriptionUpsert {
  userId: string
  provider: BillingProvider
  customerId: string | null
  subscriptionId: string | null
  planTier?: PlanTier
  status: SubscriptionStatus
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd?: boolean
}

export interface WebhookDeps {
  env: Record<string, string | undefined>
  nowSec?: () => number
  recordEvent(entry: {
    provider: BillingProvider
    eventId: string
    eventType: string
    status: 'processed' | 'ignored'
    payload: unknown
  }): Promise<{ duplicate: boolean }>
  markEventFailed(provider: BillingProvider, eventId: string, errorMessage: string): Promise<void>
  markEventIgnored(provider: BillingProvider, eventId: string): Promise<void>
  findUserIdBySubscription(provider: BillingProvider, subscriptionId: string): Promise<string | null>
  upsertSubscription(patch: WebhookSubscriptionUpsert): Promise<void>
}

function detectProvider(request: Request): BillingProvider | null {
  if (request.headers.get('stripe-signature')) return 'stripe'
  if (request.headers.get('x-razorpay-signature')) return 'razorpay'
  try {
    const param = new URL(request.url).searchParams.get('provider')
    if (param === 'stripe' || param === 'razorpay') return param
  } catch {
    // ignore malformed URL
  }
  return null
}

export function handleBillingWebhook(deps: () => WebhookDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    let env: Record<string, string | undefined> | undefined
    try {
      env = deps().env
    } catch {
      env = undefined
    }
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(request, env) })
    if (request.method !== 'POST') return json({ code: 'method_not_allowed', message: 'Use POST.' }, 405, request, env)

    try {
      const {
        env,
        nowSec = () => Math.floor(Date.now() / 1000),
        recordEvent,
        markEventFailed,
        markEventIgnored,
        findUserIdBySubscription,
        upsertSubscription,
      } = deps()

      const provider = detectProvider(request)
      if (!provider) {
        throw new AiError(400, 'unknown_provider', 'Missing webhook signature headers.')
      }

      const rawBody = await request.text()
      if (!rawBody) {
        throw new AiError(400, 'bad_request', 'Webhook body is empty.')
      }

      if (provider === 'stripe') {
        const secret = env.STRIPE_WEBHOOK_SECRET?.trim()
        if (!secret) throw new AiError(500, 'not_configured', 'STRIPE_WEBHOOK_SECRET is not configured.')
        const valid = await verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), secret, nowSec())
        if (!valid) throw new AiError(401, 'invalid_signature', 'Invalid Stripe webhook signature.')
      } else {
        const secret = env.RAZORPAY_WEBHOOK_SECRET?.trim()
        if (!secret) throw new AiError(500, 'not_configured', 'RAZORPAY_WEBHOOK_SECRET is not configured.')
        const valid = await verifyRazorpaySignature(rawBody, request.headers.get('x-razorpay-signature'), secret)
        if (!valid) throw new AiError(401, 'invalid_signature', 'Invalid Razorpay webhook signature.')
      }

      let payload: unknown
      try {
        payload = JSON.parse(rawBody)
      } catch {
        throw new AiError(400, 'invalid_json', 'Webhook payload is not valid JSON.')
      }

      const patch =
        provider === 'stripe'
          ? normalizeStripeEvent(payload)
          : normalizeRazorpayEvent(payload, request.headers.get('x-razorpay-event-id'))

      if (!patch.eventId) {
        throw new AiError(400, 'bad_request', 'Webhook event is missing an id.')
      }

      const { duplicate } = await recordEvent({
        provider,
        eventId: patch.eventId,
        eventType: patch.eventType,
        status: patch.action === 'ignore' ? 'ignored' : 'processed',
        payload,
      })

      if (duplicate) {
        return json({ received: true, duplicate: true, eventId: patch.eventId }, 200, request, env)
      }

      if (patch.action === 'ignore') {
        return json({ received: true, ignored: true, eventId: patch.eventId }, 200, request, env)
      }

      try {
        let userId = patch.userId
        if (!userId && patch.subscriptionId) {
          userId = (await findUserIdBySubscription(provider, patch.subscriptionId)) ?? undefined
        }
        if (!userId) {
          await markEventIgnored(provider, patch.eventId)
          return json({ received: true, ignored: true, eventId: patch.eventId }, 200, request, env)
        }

        await upsertSubscription({
          userId,
          provider,
          customerId: patch.customerId ?? null,
          subscriptionId: patch.subscriptionId ?? null,
          planTier: patch.planTier,
          status: patch.status ?? 'incomplete',
          currentPeriodEnd: patch.currentPeriodEnd,
          cancelAtPeriodEnd: patch.cancelAtPeriodEnd,
        })

        return json({ received: true, eventId: patch.eventId, userId, status: patch.status }, 200, request, env)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await markEventFailed(provider, patch.eventId, message.slice(0, 2000)).catch(() => undefined)
        throw err
      }
    } catch (error) {
      if (error instanceof AiError) return json({ code: error.code, message: error.message }, error.status, request, env)
      console.error('[billing-webhook] unexpected failure:', error)
      return json({ code: 'server_error', message: 'Webhook processing failed.' }, 500, request, env)
    }
  }
}
