import { describe, expect, it } from 'vitest'
import { DEFAULT_ENTITLEMENTS } from '@shared/billing.ts'
import type { DataSource } from '@/lib/dataSource'
import { detectDefaultCurrency, loadBillingSnapshot } from './billing'

describe('detectDefaultCurrency', () => {
  it('selects INR for Indian locales/timezones and USD/EUR/GBP elsewhere', () => {
    expect(detectDefaultCurrency('en-IN', 'Asia/Kolkata')).toBe('INR')
    expect(detectDefaultCurrency('en-US', 'Asia/Calcutta')).toBe('INR')
    expect(detectDefaultCurrency('en-GB', 'Europe/London')).toBe('GBP')
    expect(detectDefaultCurrency('de-DE', 'Europe/Berlin')).toBe('EUR')
    expect(detectDefaultCurrency('en-US', 'America/New_York')).toBe('USD')
  })
})

describe('loadBillingSnapshot', () => {
  it('returns Starter entitlements without network calls in Demo Mode', async () => {
    const snapshot = await loadBillingSnapshot({ kind: 'demo' })
    expect(snapshot.mode).toBe('demo')
    expect(snapshot.tier).toBe('free')
    expect(snapshot.entitlement).toEqual(DEFAULT_ENTITLEMENTS.free)
    expect(snapshot.subscription).toBeNull()
  })

  it('resolves Pro entitlements from Supabase subscriptions + plan_entitlements', async () => {
    const fakeClient = {
      from: (table: string) => {
        if (table === 'subscriptions') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    user_id: 'user-1',
                    provider: 'stripe',
                    customer_id: 'cus_1',
                    subscription_id: 'sub_1',
                    plan_tier: 'pro',
                    status: 'active',
                    current_period_end: '2026-12-20T00:00:00.000Z',
                    cancel_at_period_end: false,
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          select: async () => ({
            data: [
              {
                plan_tier: 'pro',
                daily_ai_requests: 300,
                monthly_ai_tokens: 6_000_000,
                max_studio_sources: 250,
                coding_lab_languages: ['python', 'javascript', 'typescript', 'sql'],
                offline_sync_enabled: true,
                priority_tier: 'priority',
              },
            ],
            error: null,
          }),
        }
      },
    }
    const source = { kind: 'supabase', userId: 'user-1', client: fakeClient } as unknown as DataSource
    const snapshot = await loadBillingSnapshot(source, new Date('2026-11-13T00:00:00.000Z'))
    expect(snapshot.tier).toBe('pro')
    expect(snapshot.entitlement.dailyAiRequests).toBe(300)
    expect(snapshot.entitlement.offlineSyncEnabled).toBe(true)
    expect(snapshot.subscription?.provider).toBe('stripe')
  })
})
