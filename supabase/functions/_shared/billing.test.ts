import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ENTITLEMENTS,
  PLAN_CATALOG,
  hmacSha256Hex,
  normalizeCurrency,
  normalizeRazorpayEvent,
  normalizeStripeEvent,
  resolveEffectiveTier,
  resolveEntitlement,
  selectBillingProvider,
  verifyRazorpaySignature,
  verifyStripeSignature,
} from './billing.ts'

describe('billing catalog & provider selection', () => {
  it('normalizes currencies and defaults unknown codes to USD', () => {
    expect(normalizeCurrency('inr')).toBe('INR')
    expect(normalizeCurrency(' eur ')).toBe('EUR')
    expect(normalizeCurrency('GBP')).toBe('GBP')
    expect(normalizeCurrency('JPY')).toBe('USD')
    expect(normalizeCurrency(null)).toBe('USD')
  })

  it('routes INR to Razorpay (UPI PPP) by default and global currencies to Stripe', () => {
    expect(selectBillingProvider('INR')).toBe('razorpay')
    expect(selectBillingProvider('USD')).toBe('stripe')
    expect(selectBillingProvider('EUR')).toBe('stripe')
    expect(selectBillingProvider('GBP')).toBe('stripe')
    expect(selectBillingProvider('INR', 'stripe')).toBe('stripe')
    expect(selectBillingProvider('USD', 'razorpay')).toBe('stripe')
  })

  it('offers distinct PPP INR pricing relative to USD', () => {
    expect(PLAN_CATALOG.pro.prices.INR.monthlyMinor).toBe(29900)
    expect(PLAN_CATALOG.pro.prices.USD.monthlyMinor).toBe(1200)
  })
})

describe('entitlement resolution', () => {
  const now = new Date('2026-11-13T10:00:00.000Z')

  it('returns free entitlement when user has no subscription', () => {
    expect(resolveEffectiveTier(null, now)).toBe('free')
    expect(resolveEntitlement(null, undefined, now)).toEqual(DEFAULT_ENTITLEMENTS.free)
  })

  it('grants pro entitlement when active or trialing and not expired', () => {
    expect(
      resolveEffectiveTier(
        { planTier: 'pro', status: 'active', currentPeriodEnd: '2026-12-01T00:00:00.000Z' },
        now,
      ),
    ).toBe('pro')
    expect(
      resolveEffectiveTier(
        { planTier: 'campus', status: 'trialing', currentPeriodEnd: '2026-11-20T00:00:00.000Z' },
        now,
      ),
    ).toBe('campus')
  })

  it('falls back to free when canceled, incomplete, or past currentPeriodEnd', () => {
    expect(
      resolveEffectiveTier(
        { planTier: 'pro', status: 'canceled', currentPeriodEnd: '2026-12-01T00:00:00.000Z' },
        now,
      ),
    ).toBe('free')
    expect(
      resolveEffectiveTier(
        { planTier: 'pro', status: 'active', currentPeriodEnd: '2026-11-12T23:59:59.000Z' },
        now,
      ),
    ).toBe('free')
  })

  it('uses database-loaded plan entitlements when provided', () => {
    const customPro = { ...DEFAULT_ENTITLEMENTS.pro, dailyAiRequests: 500 }
    const resolved = resolveEntitlement(
      { planTier: 'pro', status: 'active', currentPeriodEnd: null },
      { pro: customPro },
      now,
    )
    expect(resolved.dailyAiRequests).toBe(500)
    expect(resolved.offlineSyncEnabled).toBe(true)
  })
})

describe('webhook HMAC-SHA256 verification', () => {
  it('accepts valid Stripe signatures within tolerance and rejects expired or tampered ones', async () => {
    const secret = 'whsec_test_123'
    const body = '{"id":"evt_1","type":"checkout.session.completed"}'
    const ts = 1_794_560_000
    const v1 = await hmacSha256Hex(secret, `${ts}.${body}`)
    const header = `t=${ts},v1=${v1}`

    await expect(verifyStripeSignature(body, header, secret, ts + 60)).resolves.toBe(true)
    await expect(verifyStripeSignature(body, header, secret, ts + 600)).resolves.toBe(false)
    await expect(verifyStripeSignature(`${body} `, header, secret, ts + 60)).resolves.toBe(false)
    await expect(verifyStripeSignature(body, 't=abc,v1=deadbeef', secret, ts)).resolves.toBe(false)
  })

  it('verifies Razorpay X-Razorpay-Signature headers in constant time', async () => {
    const secret = 'rzp_webhook_secret'
    const body = '{"event":"subscription.activated"}'
    const sig = await hmacSha256Hex(secret, body)

    await expect(verifyRazorpaySignature(body, sig, secret)).resolves.toBe(true)
    await expect(verifyRazorpaySignature(body, sig.replace(/^./, 'f'), secret)).resolves.toBe(false)
    await expect(verifyRazorpaySignature(body, null, secret)).resolves.toBe(false)
  })
})

describe('webhook event normalization', () => {
  it('normalizes Stripe checkout.session.completed and customer.subscription.updated events', () => {
    const checkout = normalizeStripeEvent({
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-123',
          customer: 'cus_abc',
          subscription: 'sub_xyz',
          payment_status: 'paid',
          metadata: { plan_tier: 'pro' },
        },
      },
    })
    expect(checkout).toEqual({
      provider: 'stripe',
      eventId: 'evt_checkout_1',
      eventType: 'checkout.session.completed',
      action: 'upsert',
      userId: 'user-123',
      customerId: 'cus_abc',
      subscriptionId: 'sub_xyz',
      planTier: 'pro',
      status: 'active',
      cancelAtPeriodEnd: false,
    })

    const subDeleted = normalizeStripeEvent({
      id: 'evt_sub_del',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_xyz',
          customer: 'cus_abc',
          status: 'canceled',
          current_period_end: 1_795_000_000,
          cancel_at_period_end: false,
          metadata: { user_id: 'user-123', plan_tier: 'pro' },
        },
      },
    })
    expect(subDeleted.status).toBe('canceled')
    expect(subDeleted.currentPeriodEnd).toBe(new Date(1_795_000_000 * 1000).toISOString())
  })

  it('normalizes Razorpay subscription lifecycle events', () => {
    const activated = normalizeRazorpayEvent(
      {
        event: 'subscription.activated',
        created_at: 1_794_560_000,
        payload: {
          subscription: {
            entity: {
              id: 'sub_rzp_1',
              customer_id: 'cust_rzp_1',
              status: 'active',
              current_end: 1_797_152_000,
              notes: { user_id: 'user-456', plan_tier: 'campus' },
            },
          },
        },
      },
      'evt_rzp_hdr_1',
    )
    expect(activated).toEqual({
      provider: 'razorpay',
      eventId: 'evt_rzp_hdr_1',
      eventType: 'subscription.activated',
      action: 'upsert',
      userId: 'user-456',
      customerId: 'cust_rzp_1',
      subscriptionId: 'sub_rzp_1',
      planTier: 'campus',
      status: 'active',
      currentPeriodEnd: new Date(1_797_152_000 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
    })
  })
})
