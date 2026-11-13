import { AiError } from '../_shared/aiCore.ts'
import { cancelProviderSubscription, isAllowedRedirectUrl, type SubscriptionRecord } from '../_shared/billing.ts'
import { handleJson, readBody, requireUser } from '../_shared/respond.ts'
import { BillingPortalRequestSchema, type BillingPortalResponse } from '../_shared/schemas.ts'

export interface PortalDeps {
  env: Record<string, string | undefined>
  authenticate(request: Request): Promise<string | null>
  getSubscription(userId: string): Promise<SubscriptionRecord | null>
  markCancelAtPeriodEnd(userId: string): Promise<void>
  fetchImpl?: typeof fetch
}

export function handleBillingPortal(deps: () => PortalDeps): (request: Request) => Promise<Response> {
  return handleJson(
    async (request): Promise<BillingPortalResponse> => {
    const { env, authenticate, getSubscription, markCancelAtPeriodEnd, fetchImpl = globalThis.fetch } = deps()
    const userId = await requireUser(authenticate, request)
    const input = await readBody(request, BillingPortalRequestSchema)

    if (!isAllowedRedirectUrl(input.returnUrl, env)) {
      throw new AiError(400, 'invalid_redirect_url', 'Return URL is not in an allowed domain.')
    }

    const sub = await getSubscription(userId)
    if (!sub || (!sub.customerId && !sub.subscriptionId)) {
      throw new AiError(404, 'no_subscription', 'No billing subscription is linked to your account yet.')
    }

    if (sub.provider === 'stripe') {
      const secretKey = env.STRIPE_SECRET_KEY?.trim()
      if (!secretKey) {
        throw new AiError(500, 'not_configured', 'Stripe billing is not configured yet (missing STRIPE_SECRET_KEY).')
      }

      if (input.action === 'cancel') {
        if (!sub.subscriptionId) {
          throw new AiError(404, 'no_subscription', 'No active Stripe subscription ID found.')
        }
        await cancelProviderSubscription({
          provider: 'stripe',
          subscriptionId: sub.subscriptionId,
          stripeSecretKey: secretKey,
          immediate: false,
          fetchImpl,
        })
        await markCancelAtPeriodEnd(userId)
        return {
          provider: 'stripe',
          url: null,
          canceledAtPeriodEnd: true,
          message: 'Your subscription will stay active until the end of your current billing period.',
        }
      }

      if (!sub.customerId) {
        throw new AiError(404, 'no_subscription', 'No Stripe customer record is linked to this subscription.')
      }

      const params = new URLSearchParams()
      params.set('customer', sub.customerId)
      params.set('return_url', input.returnUrl)
      const response = await fetchImpl('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        console.error(`[billing-portal] Stripe portal error (${response.status}):`, detail)
        throw new AiError(502, 'billing_provider_error', 'Could not open the Stripe billing portal. Please try again.')
      }

      const data = (await response.json()) as { url?: string }
      if (!data.url) {
        throw new AiError(502, 'billing_provider_error', 'Stripe did not return a billing portal URL.')
      }

      return {
        provider: 'stripe',
        url: data.url,
        canceledAtPeriodEnd: sub.cancelAtPeriodEnd,
        message: 'Manage your plan, payment method, and invoices in the billing portal.',
      }
    }

    // Razorpay subscription management
    const keyId = env.RAZORPAY_KEY_ID?.trim()
    const keySecret = env.RAZORPAY_KEY_SECRET?.trim()
    if (!keyId || !keySecret) {
      throw new AiError(500, 'not_configured', 'Razorpay billing is not configured yet.')
    }
    if (!sub.subscriptionId) {
      throw new AiError(404, 'no_subscription', 'No Razorpay subscription ID found.')
    }

    if (input.action === 'cancel') {
      await cancelProviderSubscription({
        provider: 'razorpay',
        subscriptionId: sub.subscriptionId,
        razorpayKeyId: keyId,
        razorpayKeySecret: keySecret,
        immediate: false,
        fetchImpl,
      })
      await markCancelAtPeriodEnd(userId)
      return {
        provider: 'razorpay',
        url: null,
        canceledAtPeriodEnd: true,
        message: 'Auto-renewal canceled. You keep Pro access through the end of the current billing cycle.',
      }
    }

    const authHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`
    const response = await fetchImpl(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(sub.subscriptionId)}`, {
      method: 'GET',
      headers: { Authorization: authHeader },
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error(`[billing-portal] Razorpay lookup error (${response.status}):`, detail)
      throw new AiError(502, 'billing_provider_error', 'Could not fetch Razorpay subscription details.')
    }

    const data = (await response.json()) as { short_url?: string }
    return {
      provider: 'razorpay',
      url: data.short_url ?? null,
      canceledAtPeriodEnd: sub.cancelAtPeriodEnd,
      message: data.short_url
        ? 'View invoices or update your payment mandate via Razorpay.'
        : 'Use Cancel Auto-Renewal if you want to end your Razorpay subscription at cycle end.',
    }
    },
    () => deps().env,
  )
}
