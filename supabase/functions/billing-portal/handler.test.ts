import { describe, expect, it, vi } from 'vitest'
import type { SubscriptionRecord } from '../_shared/billing.ts'
import { BillingPortalResponseSchema } from '../_shared/schemas.ts'
import { handleBillingPortal, type PortalDeps } from './handler.ts'

function post(body: unknown, token = 'good-token'): Request {
  return new Request('http://localhost/functions/v1/billing-portal', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const STRIPE_SUB: SubscriptionRecord = {
  userId: 'user-1',
  provider: 'stripe',
  customerId: 'cus_1',
  subscriptionId: 'sub_1',
  planTier: 'pro',
  status: 'active',
  currentPeriodEnd: '2026-12-13T00:00:00.000Z',
  cancelAtPeriodEnd: false,
}

const RAZORPAY_SUB: SubscriptionRecord = {
  userId: 'user-2',
  provider: 'razorpay',
  customerId: 'cust_rzp_2',
  subscriptionId: 'sub_rzp_2',
  planTier: 'pro',
  status: 'active',
  currentPeriodEnd: '2026-12-13T00:00:00.000Z',
  cancelAtPeriodEnd: false,
}

function makeDeps(sub: SubscriptionRecord | null, overrides: Partial<PortalDeps> = {}): () => PortalDeps {
  return () => ({
    env: {
      STRIPE_SECRET_KEY: 'sk_test_123',
      RAZORPAY_KEY_ID: 'rzp_test_key',
      RAZORPAY_KEY_SECRET: 'rzp_test_secret',
    },
    authenticate: async (req) => (req.headers.get('Authorization') === 'Bearer good-token' ? 'user-1' : null),
    getSubscription: async () => sub,
    markCancelAtPeriodEnd: vi.fn(async () => undefined),
    ...overrides,
  })
}

describe('billing-portal', () => {
  it('opens a Stripe Billing Portal session for self-serve management & invoices', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://api.stripe.com/v1/billing_portal/sessions')
      return new Response(JSON.stringify({ url: 'https://billing.stripe.com/session/bps_1' }), { status: 200 })
    })

    const res = await handleBillingPortal(makeDeps(STRIPE_SUB, { fetchImpl: fetchMock as typeof fetch }))(
      post({ returnUrl: 'https://ekagra.app/pricing', action: 'portal' }),
    )
    expect(res.status).toBe(200)
    expect(BillingPortalResponseSchema.parse(await res.json())).toMatchObject({
      provider: 'stripe',
      url: 'https://billing.stripe.com/session/bps_1',
      canceledAtPeriodEnd: false,
    })
  })

  it('supports self-serve cancel_at_cycle_end on Razorpay subscriptions and returns invoice link', async () => {
    const markCancel = vi.fn(async () => undefined)
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/cancel')) {
        expect(JSON.parse(String(init?.body))).toEqual({ cancel_at_cycle_end: 1 })
        return new Response(JSON.stringify({ id: 'sub_rzp_2', status: 'active' }), { status: 200 })
      }
      return new Response(JSON.stringify({ id: 'sub_rzp_2', short_url: 'https://rzp.io/i/sub_rzp_2' }), { status: 200 })
    })

    const cancelRes = await handleBillingPortal(
      makeDeps(RAZORPAY_SUB, { markCancelAtPeriodEnd: markCancel, fetchImpl: fetchMock as typeof fetch }),
    )(post({ returnUrl: 'https://ekagra.app/pricing', action: 'cancel' }))
    expect(cancelRes.status).toBe(200)
    expect(markCancel).toHaveBeenCalledWith('user-1')
    expect(BillingPortalResponseSchema.parse(await cancelRes.json()).canceledAtPeriodEnd).toBe(true)

    const portalRes = await handleBillingPortal(makeDeps(RAZORPAY_SUB, { fetchImpl: fetchMock as typeof fetch }))(
      post({ returnUrl: 'https://ekagra.app/pricing', action: 'portal' }),
    )
    expect(portalRes.status).toBe(200)
    expect(BillingPortalResponseSchema.parse(await portalRes.json()).url).toBe('https://rzp.io/i/sub_rzp_2')
  })

  it('returns 404 when the user has no subscription yet', async () => {
    const res = await handleBillingPortal(makeDeps(null))(post({ returnUrl: 'https://ekagra.app/pricing' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'no_subscription' })
  })
})
