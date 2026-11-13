import { describe, expect, it, vi } from 'vitest'
import { hmacSha256Hex } from '../_shared/billing.ts'
import { handleBillingWebhook, type WebhookDeps, type WebhookSubscriptionUpsert } from './handler.ts'

const NOW_SEC = 1_794_560_000
const STRIPE_SECRET = 'whsec_test_secret'
const RAZORPAY_SECRET = 'rzp_test_secret'

function createDeps(overrides: Partial<WebhookDeps> = {}) {
  const seen = new Set<string>()
  const upserts: WebhookSubscriptionUpsert[] = []
  const make = (): WebhookDeps => ({
    env: {
      STRIPE_WEBHOOK_SECRET: STRIPE_SECRET,
      RAZORPAY_WEBHOOK_SECRET: RAZORPAY_SECRET,
    },
    nowSec: () => NOW_SEC,
    async recordEvent(entry) {
      const key = `${entry.provider}:${entry.eventId}`
      if (seen.has(key)) return { duplicate: true }
      seen.add(key)
      return { duplicate: false }
    },
    markEventFailed: vi.fn(async () => undefined),
    markEventIgnored: vi.fn(async () => undefined),
    findUserIdBySubscription: vi.fn(async () => null),
    async upsertSubscription(patch) {
      upserts.push(patch)
    },
    ...overrides,
  })
  return { make, upserts }
}

describe('billing-webhook', () => {
  it('rejects invalid Stripe and Razorpay signatures with 401', async () => {
    const { make, upserts } = createDeps()
    const stripeReq = new Request('http://localhost/functions/v1/billing-webhook', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${NOW_SEC},v1=deadbeef` },
      body: '{"id":"evt_1"}',
    })
    expect((await handleBillingWebhook(make)(stripeReq)).status).toBe(401)

    const rzpReq = new Request('http://localhost/functions/v1/billing-webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': 'wrong' },
      body: '{"event":"subscription.activated"}',
    })
    expect((await handleBillingWebhook(make)(rzpReq)).status).toBe(401)
    expect(upserts).toHaveLength(0)
  })

  it('verifies Stripe checkout completion and enforces webhook_events idempotency', async () => {
    const { make, upserts } = createDeps()
    const body = JSON.stringify({
      id: 'evt_stripe_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-1',
          customer: 'cus_1',
          subscription: 'sub_1',
          payment_status: 'paid',
          metadata: { plan_tier: 'pro' },
        },
      },
    })
    const sig = await hmacSha256Hex(STRIPE_SECRET, `${NOW_SEC}.${body}`)
    const req = () =>
      new Request('http://localhost/functions/v1/billing-webhook', {
        method: 'POST',
        headers: { 'stripe-signature': `t=${NOW_SEC},v1=${sig}` },
        body,
      })

    const first = await handleBillingWebhook(make)(req())
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ received: true, userId: 'user-1', status: 'active' })
    expect(upserts).toHaveLength(1)

    const replay = await handleBillingWebhook(make)(req())
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ received: true, duplicate: true })
    expect(upserts).toHaveLength(1)
  })

  it('resolves user_id by subscription_id on Razorpay renewal or Stripe invoice failure', async () => {
    const { make, upserts } = createDeps({
      findUserIdBySubscription: vi.fn(async (_provider, subId) => (subId === 'sub_rzp_9' ? 'user-rzp' : null)),
    })
    const body = JSON.stringify({
      event: 'subscription.halted',
      created_at: NOW_SEC,
      payload: {
        subscription: {
          entity: {
            id: 'sub_rzp_9',
            customer_id: 'cust_rzp_9',
            status: 'halted',
          },
        },
      },
    })
    const sig = await hmacSha256Hex(RAZORPAY_SECRET, body)
    const req = new Request('http://localhost/functions/v1/billing-webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'evt_rzp_9' },
      body,
    })

    const res = await handleBillingWebhook(make)(req)
    expect(res.status).toBe(200)
    expect(upserts).toEqual([
      expect.objectContaining({
        userId: 'user-rzp',
        provider: 'razorpay',
        subscriptionId: 'sub_rzp_9',
        status: 'past_due',
      }),
    ])
  })
})
