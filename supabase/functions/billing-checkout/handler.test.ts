import { describe, expect, it, vi } from 'vitest'
import { BillingCheckoutResponseSchema } from '../_shared/schemas.ts'
import { handleBillingCheckout, type CheckoutDeps } from './handler.ts'

function post(body: unknown, token = 'good-token'): Request {
  return new Request('http://localhost/functions/v1/billing-checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  planTier: 'pro',
  interval: 'month',
  currency: 'USD',
  successUrl: 'https://ekagra.app/pricing?checkout=success',
  cancelUrl: 'https://ekagra.app/pricing?checkout=canceled',
}

function makeDeps(overrides: Partial<CheckoutDeps> = {}): () => CheckoutDeps {
  return () => ({
    env: {
      STRIPE_SECRET_KEY: 'sk_test_123',
      RAZORPAY_KEY_ID: 'rzp_test_key',
      RAZORPAY_KEY_SECRET: 'rzp_test_secret',
    },
    authenticate: async (req) => (req.headers.get('Authorization') === 'Bearer good-token' ? 'user-1' : null),
    getUserEmail: async () => 'student@example.edu',
    getExistingSubscription: async () => null,
    ...overrides,
  })
}

describe('billing-checkout', () => {
  it('creates a Stripe Checkout Session for global currencies (USD/EUR/GBP)', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.stripe.com/v1/checkout/sessions')
      expect(String(init?.body)).toContain('client_reference_id=user-1')
      expect(String(init?.body)).toContain('currency%5D=eur')
      return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 })
    })

    const res = await handleBillingCheckout(makeDeps({ fetchImpl: fetchMock as typeof fetch }))(
      post({ ...VALID_BODY, currency: 'EUR', interval: 'year' }),
    )
    expect(res.status).toBe(200)
    const body = BillingCheckoutResponseSchema.parse(await res.json())
    expect(body).toEqual({
      provider: 'stripe',
      planTier: 'pro',
      interval: 'year',
      currency: 'EUR',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
      sessionId: 'cs_test_1',
      subscriptionId: null,
      keyId: null,
    })
  })

  it('creates a Razorpay Subscription with INR PPP pricing by default for INR', async () => {
    const calls: string[] = []
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url)
      calls.push(target)
      if (target.endsWith('/plans')) {
        return new Response(JSON.stringify({ id: 'plan_rzp_1' }), { status: 200 })
      }
      return new Response(JSON.stringify({ id: 'sub_rzp_1', short_url: 'https://rzp.io/i/sub_rzp_1' }), { status: 200 })
    })

    const res = await handleBillingCheckout(makeDeps({ fetchImpl: fetchMock as typeof fetch }))(
      post({ ...VALID_BODY, currency: 'INR', planTier: 'campus' }),
    )
    expect(res.status).toBe(200)
    const body = BillingCheckoutResponseSchema.parse(await res.json())
    expect(body).toEqual({
      provider: 'razorpay',
      planTier: 'campus',
      interval: 'month',
      currency: 'INR',
      checkoutUrl: 'https://rzp.io/i/sub_rzp_1',
      sessionId: null,
      subscriptionId: 'sub_rzp_1',
      keyId: 'rzp_test_key',
    })
    expect(calls).toEqual(['https://api.razorpay.com/v1/plans', 'https://api.razorpay.com/v1/subscriptions'])
  })

  it('rejects untrusted redirect URLs and unauthenticated calls', async () => {
    const unauth = await handleBillingCheckout(makeDeps())(post(VALID_BODY, 'bad-token'))
    expect(unauth.status).toBe(401)

    const phishing = await handleBillingCheckout(makeDeps())(
      post({ ...VALID_BODY, successUrl: 'https://evil.example.com/steal' }),
    )
    expect(phishing.status).toBe(400)
    expect(await phishing.json()).toMatchObject({ code: 'invalid_redirect_url' })
  })
})
