import { AiError } from '../_shared/aiCore.ts'
import {
  PLAN_CATALOG,
  isAllowedRedirectUrl,
  selectBillingProvider,
  type BillingInterval,
  type CurrencyCode,
  type PlanTier,
  type SubscriptionRecord,
} from '../_shared/billing.ts'
import { handleJson, readBody, requireUser } from '../_shared/respond.ts'
import { BillingCheckoutRequestSchema, type BillingCheckoutResponse } from '../_shared/schemas.ts'

export interface CheckoutDeps {
  env: Record<string, string | undefined>
  authenticate(request: Request): Promise<string | null>
  getUserEmail?(userId: string): Promise<string | null>
  getExistingSubscription(userId: string): Promise<SubscriptionRecord | null>
  fetchImpl?: typeof fetch
}

function resolveStripePriceId(
  env: Record<string, string | undefined>,
  tier: 'pro' | 'campus',
  interval: BillingInterval,
  currency: CurrencyCode,
): string | undefined {
  const intervalKey = interval === 'year' ? 'YEARLY' : 'MONTHLY'
  const specificKey = `STRIPE_PRICE_${tier.toUpperCase()}_${intervalKey}_${currency}`
  const fallbackKey = `STRIPE_PRICE_${tier.toUpperCase()}_${intervalKey}`
  return env[specificKey]?.trim() || env[fallbackKey]?.trim() || undefined
}

function resolveRazorpayPlanId(
  env: Record<string, string | undefined>,
  tier: 'pro' | 'campus',
  interval: BillingInterval,
): string | undefined {
  const intervalKey = interval === 'year' ? 'YEARLY' : 'MONTHLY'
  return env[`RAZORPAY_PLAN_${tier.toUpperCase()}_${intervalKey}`]?.trim() || undefined
}

function stripeSessionWithSessionParam(successUrl: string): string {
  if (successUrl.includes('{CHECKOUT_SESSION_ID}')) return successUrl
  const sep = successUrl.includes('?') ? '&' : '?'
  return `${successUrl}${sep}session_id={CHECKOUT_SESSION_ID}`
}

async function createStripeCheckout(options: {
  env: Record<string, string | undefined>
  userId: string
  userEmail: string | null
  existingSub: SubscriptionRecord | null
  planTier: 'pro' | 'campus'
  interval: BillingInterval
  currency: CurrencyCode
  successUrl: string
  cancelUrl: string
  fetchFn: typeof fetch
}): Promise<BillingCheckoutResponse> {
  const secretKey = options.env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) {
    throw new AiError(500, 'not_configured', 'Stripe billing is not configured yet (missing STRIPE_SECRET_KEY).')
  }

  const params = new URLSearchParams()
  params.set('mode', 'subscription')
  params.set('success_url', stripeSessionWithSessionParam(options.successUrl))
  params.set('cancel_url', options.cancelUrl)
  params.set('client_reference_id', options.userId)
  params.set('allow_promotion_codes', 'true')
  params.set('metadata[user_id]', options.userId)
  params.set('metadata[plan_tier]', options.planTier)
  params.set('metadata[interval]', options.interval)
  params.set('metadata[currency]', options.currency)
  params.set('subscription_data[metadata][user_id]', options.userId)
  params.set('subscription_data[metadata][plan_tier]', options.planTier)

  if (options.existingSub?.provider === 'stripe' && options.existingSub.customerId) {
    params.set('customer', options.existingSub.customerId)
  } else if (options.userEmail) {
    params.set('customer_email', options.userEmail)
  }

  const configuredPriceId = resolveStripePriceId(options.env, options.planTier, options.interval, options.currency)
  if (configuredPriceId) {
    params.set('line_items[0][price]', configuredPriceId)
    params.set('line_items[0][quantity]', '1')
  } else {
    const plan = PLAN_CATALOG[options.planTier]
    const pricePoint = plan.prices[options.currency]
    const unitAmount = options.interval === 'year' ? pricePoint.yearlyMinor : pricePoint.monthlyMinor
    params.set('line_items[0][price_data][currency]', options.currency.toLowerCase())
    params.set('line_items[0][price_data][unit_amount]', String(unitAmount))
    params.set('line_items[0][price_data][recurring][interval]', options.interval)
    params.set('line_items[0][price_data][product_data][name]', `${plan.name} (${options.interval === 'year' ? 'Annual' : 'Monthly'})`)
    params.set('line_items[0][quantity]', '1')
  }

  const response = await options.fetchFn('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error(`[billing-checkout] Stripe error (${response.status}):`, detail)
    throw new AiError(502, 'billing_provider_error', 'Could not start Stripe checkout right now. Please try again.')
  }

  const data = (await response.json()) as { id?: string; url?: string }
  if (!data.id || !data.url) {
    throw new AiError(502, 'billing_provider_error', 'Stripe returned an incomplete checkout session.')
  }

  return {
    provider: 'stripe',
    planTier: options.planTier,
    interval: options.interval,
    currency: options.currency,
    checkoutUrl: data.url,
    sessionId: data.id,
    subscriptionId: null,
    keyId: null,
  }
}

async function createRazorpayCheckout(options: {
  env: Record<string, string | undefined>
  userId: string
  planTier: 'pro' | 'campus'
  interval: BillingInterval
  currency: CurrencyCode
  fetchFn: typeof fetch
}): Promise<BillingCheckoutResponse> {
  const keyId = options.env.RAZORPAY_KEY_ID?.trim()
  const keySecret = options.env.RAZORPAY_KEY_SECRET?.trim()
  if (!keyId || !keySecret) {
    throw new AiError(500, 'not_configured', 'Razorpay UPI/INR billing is not configured yet (missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).')
  }

  const authHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`
  let planId = resolveRazorpayPlanId(options.env, options.planTier, options.interval)

  if (!planId) {
    const plan = PLAN_CATALOG[options.planTier]
    const pricePoint = plan.prices.INR
    const amount = options.interval === 'year' ? pricePoint.yearlyMinor : pricePoint.monthlyMinor
    const planRes = await options.fetchFn('https://api.razorpay.com/v1/plans', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        period: options.interval === 'year' ? 'yearly' : 'monthly',
        interval: 1,
        item: {
          name: `${plan.name} INR (${options.interval})`,
          amount,
          currency: 'INR',
          description: plan.tagline,
        },
      }),
    })
    if (!planRes.ok) {
      const detail = await planRes.text().catch(() => '')
      console.error(`[billing-checkout] Razorpay plan creation error (${planRes.status}):`, detail)
      throw new AiError(502, 'billing_provider_error', 'Could not prepare INR subscription plan. Please try again.')
    }
    const createdPlan = (await planRes.json()) as { id?: string }
    if (!createdPlan.id) {
      throw new AiError(502, 'billing_provider_error', 'Razorpay returned an invalid plan response.')
    }
    planId = createdPlan.id
  }

  const subRes = await options.fetchFn('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: planId,
      total_count: options.interval === 'year' ? 10 : 120,
      customer_notify: 1,
      notes: {
        user_id: options.userId,
        plan_tier: options.planTier as PlanTier,
        interval: options.interval,
        currency: 'INR',
      },
    }),
  })

  if (!subRes.ok) {
    const detail = await subRes.text().catch(() => '')
    console.error(`[billing-checkout] Razorpay subscription error (${subRes.status}):`, detail)
    throw new AiError(502, 'billing_provider_error', 'Could not start Razorpay UPI checkout right now. Please try again.')
  }

  const subData = (await subRes.json()) as { id?: string; short_url?: string }
  if (!subData.id) {
    throw new AiError(502, 'billing_provider_error', 'Razorpay returned an incomplete subscription response.')
  }

  return {
    provider: 'razorpay',
    planTier: options.planTier,
    interval: options.interval,
    currency: 'INR',
    checkoutUrl: subData.short_url ?? null,
    sessionId: null,
    subscriptionId: subData.id,
    keyId,
  }
}

export function handleBillingCheckout(deps: () => CheckoutDeps): (request: Request) => Promise<Response> {
  return handleJson(
    async (request): Promise<BillingCheckoutResponse> => {
    const { env, authenticate, getUserEmail, getExistingSubscription, fetchImpl = globalThis.fetch } = deps()
    const userId = await requireUser(authenticate, request)
    const input = await readBody(request, BillingCheckoutRequestSchema)

    if (!isAllowedRedirectUrl(input.successUrl, env) || !isAllowedRedirectUrl(input.cancelUrl, env)) {
      throw new AiError(400, 'invalid_redirect_url', 'Checkout redirect URL is not in an allowed domain.')
    }

    const provider = selectBillingProvider(input.currency, input.provider)
    const [existingSub, userEmail] = await Promise.all([
      getExistingSubscription(userId),
      getUserEmail ? getUserEmail(userId).catch(() => null) : Promise.resolve(null),
    ])

    if (provider === 'razorpay') {
      return createRazorpayCheckout({
        env,
        userId,
        planTier: input.planTier,
        interval: input.interval,
        currency: 'INR',
        fetchFn: fetchImpl,
      })
    }

    return createStripeCheckout({
      env,
      userId,
      userEmail,
      existingSub,
      planTier: input.planTier,
      interval: input.interval,
      currency: input.currency,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      fetchFn: fetchImpl,
    })
    },
    () => deps().env,
  )
}
