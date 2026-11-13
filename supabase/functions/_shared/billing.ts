/**
 * Billing domain primitives shared across Edge Functions (Node/Vitest + Deno safe):
 * - Plan catalog & PPP multi-currency pricing (USD, EUR, GBP, INR)
 * - Default per-tier entitlements mirroring 010_billing.sql
 * - Web Crypto HMAC-SHA256 signature verification for Stripe & Razorpay
 * - Webhook payload normalization & provider cancellation helpers
 */

export type PlanTier = 'free' | 'pro' | 'campus'
export type BillingProvider = 'stripe' | 'razorpay'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'expired'
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR'
export type BillingInterval = 'month' | 'year'

export interface PlanEntitlement {
  planTier: PlanTier
  dailyAiRequests: number
  monthlyAiTokens: number
  maxStudioSources: number
  codingLabLanguages: readonly string[]
  offlineSyncEnabled: boolean
  priorityTier: 'standard' | 'priority'
}

export interface SubscriptionRecord {
  userId: string
  provider: BillingProvider
  customerId: string | null
  subscriptionId: string | null
  planTier: PlanTier
  status: SubscriptionStatus
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export interface PricePoint {
  monthlyMinor: number
  yearlyMinor: number
  displayMonthly: string
  displayYearly: string
}

export interface PlanCatalogEntry {
  tier: PlanTier
  name: string
  tagline: string
  prices: Record<CurrencyCode, PricePoint>
  features: readonly string[]
}

export const DEFAULT_ENTITLEMENTS: Record<PlanTier, PlanEntitlement> = {
  free: {
    planTier: 'free',
    dailyAiRequests: 25,
    monthlyAiTokens: 250_000,
    maxStudioSources: 5,
    codingLabLanguages: ['python'],
    offlineSyncEnabled: false,
    priorityTier: 'standard',
  },
  pro: {
    planTier: 'pro',
    dailyAiRequests: 250,
    monthlyAiTokens: 5_000_000,
    maxStudioSources: 200,
    codingLabLanguages: ['python', 'javascript', 'typescript', 'sql'],
    offlineSyncEnabled: true,
    priorityTier: 'priority',
  },
  campus: {
    planTier: 'campus',
    dailyAiRequests: 1000,
    monthlyAiTokens: 20_000_000,
    maxStudioSources: 1000,
    codingLabLanguages: ['python', 'javascript', 'typescript', 'sql'],
    offlineSyncEnabled: true,
    priorityTier: 'priority',
  },
}

export const PLAN_CATALOG: Record<PlanTier, PlanCatalogEntry> = {
  free: {
    tier: 'free',
    name: 'Starter',
    tagline: 'Daily planning, FSRS flashcards, FocusGuard and core AI tutor',
    prices: {
      USD: { monthlyMinor: 0, yearlyMinor: 0, displayMonthly: '$0', displayYearly: '$0' },
      EUR: { monthlyMinor: 0, yearlyMinor: 0, displayMonthly: '€0', displayYearly: '€0' },
      GBP: { monthlyMinor: 0, yearlyMinor: 0, displayMonthly: '£0', displayYearly: '£0' },
      INR: { monthlyMinor: 0, yearlyMinor: 0, displayMonthly: '₹0', displayYearly: '₹0' },
    },
    features: [
      '25 AI requests per day (250k monthly tokens)',
      'Up to 5 Studio PDF & YouTube sources',
      'Python 3 Coding Lab in-browser',
      'Adaptive planner, FSRS & FocusGuard',
    ],
  },
  pro: {
    tier: 'pro',
    name: 'Ekagra Pro',
    tagline: 'Priority AI tutor, multi-language Coding Lab & cloud offline sync',
    prices: {
      USD: { monthlyMinor: 1200, yearlyMinor: 9900, displayMonthly: '$12', displayYearly: '$99' },
      EUR: { monthlyMinor: 1100, yearlyMinor: 8900, displayMonthly: '€11', displayYearly: '€89' },
      GBP: { monthlyMinor: 900, yearlyMinor: 7900, displayMonthly: '£9', displayYearly: '£79' },
      INR: { monthlyMinor: 29900, yearlyMinor: 249900, displayMonthly: '₹299', displayYearly: '₹2,499' },
    },
    features: [
      '250 priority AI requests per day (5M monthly tokens)',
      'Up to 200 Studio PDF, audio & lecture sources',
      'Python, JavaScript, TypeScript & SQL Coding Lab',
      'Offline-to-cloud IndexedDB sync & conflict merge',
    ],
  },
  campus: {
    tier: 'campus',
    name: 'Campus & Cohort',
    tagline: 'Built for study cohorts, peer mentors & heavy research loads',
    prices: {
      USD: { monthlyMinor: 2900, yearlyMinor: 24900, displayMonthly: '$29', displayYearly: '$249' },
      EUR: { monthlyMinor: 2700, yearlyMinor: 22900, displayMonthly: '€27', displayYearly: '€229' },
      GBP: { monthlyMinor: 2300, yearlyMinor: 19900, displayMonthly: '£23', displayYearly: '£199' },
      INR: { monthlyMinor: 79900, yearlyMinor: 699900, displayMonthly: '₹799', displayYearly: '₹6,999' },
    },
    features: [
      '1,000 priority AI requests per day (20M monthly tokens)',
      'Up to 1,000 Studio sources & large syllabus synthesis',
      'All Coding Lab runtimes + cloud sync enabled',
      'Cohort accountability & priority support',
    ],
  },
}

const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set<CurrencyCode>(['USD', 'EUR', 'GBP', 'INR'])
const ACTIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>(['trialing', 'active', 'past_due'])

export function normalizeCurrency(currency?: string | null): CurrencyCode {
  const upper = currency?.trim().toUpperCase()
  if (upper && SUPPORTED_CURRENCIES.has(upper)) return upper as CurrencyCode
  return 'USD'
}

/**
 * Selects the checkout provider:
 * - INR defaults to Razorpay (UPI + Indian cards with PPP pricing) unless Stripe is explicitly requested.
 * - Global currencies (USD, EUR, GBP) use Stripe (cards, Apple Pay, Google Pay).
 */
export function selectBillingProvider(currency: CurrencyCode | string, preferred?: BillingProvider): BillingProvider {
  const code = normalizeCurrency(currency)
  if (preferred === 'stripe') return 'stripe'
  if (preferred === 'razorpay' && code === 'INR') return 'razorpay'
  return code === 'INR' ? 'razorpay' : 'stripe'
}

export function isPlanTier(value: unknown): value is PlanTier {
  return value === 'free' || value === 'pro' || value === 'campus'
}

export function isSubscriptionActive(
  sub: Pick<SubscriptionRecord, 'status' | 'currentPeriodEnd'>,
  now: Date = new Date(),
): boolean {
  if (!ACTIVE_STATUSES.has(sub.status)) return false
  if (!sub.currentPeriodEnd) return true
  const endMs = Date.parse(sub.currentPeriodEnd)
  if (Number.isNaN(endMs)) return false
  return endMs > now.getTime()
}

export function resolveEffectiveTier(
  sub: Pick<SubscriptionRecord, 'planTier' | 'status' | 'currentPeriodEnd'> | null | undefined,
  now: Date = new Date(),
): PlanTier {
  if (!sub || !isSubscriptionActive(sub, now)) return 'free'
  return sub.planTier
}

export function resolveEntitlement(
  sub: Pick<SubscriptionRecord, 'planTier' | 'status' | 'currentPeriodEnd'> | null | undefined,
  entitlementsMap?: Partial<Record<PlanTier, PlanEntitlement>>,
  now: Date = new Date(),
): PlanEntitlement {
  const tier = resolveEffectiveTier(sub, now)
  return entitlementsMap?.[tier] ?? DEFAULT_ENTITLEMENTS[tier]
}

const encoder = new TextEncoder()

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const bytes = new Uint8Array(signature)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * Verifies a Stripe webhook `Stripe-Signature` header (`t=unix,v1=hex,...`) using Web Crypto HMAC-SHA256
 * with constant-time comparison and a 5-minute replay window by default.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false
  let timestamp: number | null = null
  const v1Signatures: string[] = []

  for (const part of signatureHeader.split(',')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k === 't') {
      const parsed = Number(v)
      if (Number.isFinite(parsed) && parsed > 0) timestamp = parsed
    } else if (k === 'v1' && v.length > 0) {
      v1Signatures.push(v.toLowerCase())
    }
  }

  if (timestamp === null || v1Signatures.length === 0) return false
  if (Math.abs(nowSec - timestamp) > toleranceSec) return false

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`)
  return v1Signatures.some((sig) => constantTimeEqual(sig, expected))
}

/**
 * Verifies a Razorpay webhook `X-Razorpay-Signature` header against the raw JSON body.
 */
export async function verifyRazorpaySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false
  const expected = await hmacSha256Hex(secret, rawBody)
  return constantTimeEqual(signatureHeader.trim().toLowerCase(), expected)
}

export interface NormalizedWebhookPatch {
  provider: BillingProvider
  eventId: string
  eventType: string
  action: 'upsert' | 'ignore'
  userId?: string
  customerId?: string | null
  subscriptionId?: string | null
  planTier?: PlanTier
  status?: SubscriptionStatus
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd?: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function unixSecondsToIso(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value * 1000).toISOString()
  }
  return undefined
}

function mapStripeStatus(raw: unknown): SubscriptionStatus {
  switch (raw) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    case 'incomplete':
      return 'incomplete'
    case 'incomplete_expired':
    case 'unpaid':
    case 'paused':
      return 'expired'
    default:
      return 'incomplete'
  }
}

function mapRazorpayStatus(raw: unknown): SubscriptionStatus {
  switch (raw) {
    case 'active':
      return 'active'
    case 'pending':
    case 'halted':
      return 'past_due'
    case 'cancelled':
      return 'canceled'
    case 'completed':
    case 'expired':
      return 'expired'
    case 'created':
    case 'authenticated':
    default:
      return 'incomplete'
  }
}

function parsePlanTier(raw: unknown): PlanTier | undefined {
  return isPlanTier(raw) ? raw : undefined
}

export function normalizeStripeEvent(payload: unknown): NormalizedWebhookPatch {
  const root = asRecord(payload)
  const eventId = asString(root?.id) ?? ''
  const eventType = asString(root?.type) ?? 'unknown'
  const data = asRecord(root?.data)
  const obj = asRecord(data?.object)

  if (!eventId || !obj) {
    return { provider: 'stripe', eventId, eventType, action: 'ignore' }
  }

  const metadata = asRecord(obj.metadata)

  if (eventType === 'checkout.session.completed') {
    const userId = asString(obj.client_reference_id) ?? asString(metadata?.user_id)
    const subscriptionId = asString(obj.subscription) ?? null
    const customerId = asString(obj.customer) ?? null
    const planTier = parsePlanTier(metadata?.plan_tier) ?? 'pro'
    const paymentStatus = asString(obj.payment_status)
    const status: SubscriptionStatus =
      paymentStatus === 'paid' || paymentStatus === 'no_payment_required' ? 'active' : 'incomplete'

    return {
      provider: 'stripe',
      eventId,
      eventType,
      action: userId ? 'upsert' : 'ignore',
      userId,
      customerId,
      subscriptionId,
      planTier,
      status,
      cancelAtPeriodEnd: false,
    }
  }

  if (
    eventType === 'customer.subscription.created' ||
    eventType === 'customer.subscription.updated' ||
    eventType === 'customer.subscription.deleted'
  ) {
    const subscriptionId = asString(obj.id) ?? null
    const customerId = asString(obj.customer) ?? null
    const userId = asString(metadata?.user_id)
    const planTier = parsePlanTier(metadata?.plan_tier)
    const status = eventType === 'customer.subscription.deleted' ? 'canceled' : mapStripeStatus(obj.status)
    const currentPeriodEnd = unixSecondsToIso(obj.current_period_end)
    const cancelAtPeriodEnd = asBoolean(obj.cancel_at_period_end) ?? false

    return {
      provider: 'stripe',
      eventId,
      eventType,
      action: subscriptionId || userId ? 'upsert' : 'ignore',
      userId,
      customerId,
      subscriptionId,
      planTier,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    }
  }

  if (eventType === 'invoice.payment_failed' || eventType === 'invoice.paid') {
    const parent = asRecord(obj.parent)
    const subDetails = asRecord(parent?.subscription_details) ?? asRecord(obj.subscription_details)
    const subMeta = asRecord(subDetails?.metadata)
    const subscriptionId = asString(subDetails?.subscription) ?? asString(obj.subscription) ?? null
    const customerId = asString(obj.customer) ?? null
    const userId = asString(subMeta?.user_id) ?? asString(metadata?.user_id)
    const planTier = parsePlanTier(subMeta?.plan_tier) ?? parsePlanTier(metadata?.plan_tier)

    return {
      provider: 'stripe',
      eventId,
      eventType,
      action: subscriptionId || userId ? 'upsert' : 'ignore',
      userId,
      customerId,
      subscriptionId,
      planTier,
      status: eventType === 'invoice.payment_failed' ? 'past_due' : 'active',
    }
  }

  return { provider: 'stripe', eventId, eventType, action: 'ignore' }
}

const RAZORPAY_SUB_EVENTS = new Set([
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.pending',
  'subscription.halted',
  'subscription.cancelled',
  'subscription.completed',
  'subscription.expired',
])

export function normalizeRazorpayEvent(payload: unknown, headerEventId?: string | null): NormalizedWebhookPatch {
  const root = asRecord(payload)
  const eventType = asString(root?.event) ?? 'unknown'
  const payloadObj = asRecord(root?.payload)
  const subWrapper = asRecord(payloadObj?.subscription)
  const entity = asRecord(subWrapper?.entity)

  const subscriptionId = asString(entity?.id) ?? null
  const createdAt = typeof root?.created_at === 'number' ? root.created_at : 0
  const eventId =
    asString(headerEventId) ??
    asString(root?.id) ??
    (subscriptionId ? `${eventType}:${subscriptionId}:${createdAt}` : '')

  if (!eventId || !entity || !RAZORPAY_SUB_EVENTS.has(eventType)) {
    return { provider: 'razorpay', eventId, eventType, action: 'ignore' }
  }

  const notes = asRecord(entity.notes)
  const userId = asString(notes?.user_id)
  const planTier = parsePlanTier(notes?.plan_tier)
  const customerId = asString(entity.customer_id) ?? null
  const currentPeriodEnd = unixSecondsToIso(entity.current_end) ?? unixSecondsToIso(entity.ended_at)

  const statusMap: Record<string, SubscriptionStatus | undefined> = {
    'subscription.activated': 'active',
    'subscription.charged': 'active',
    'subscription.pending': 'past_due',
    'subscription.halted': 'past_due',
    'subscription.cancelled': 'canceled',
    'subscription.completed': 'expired',
    'subscription.expired': 'expired',
  }

  const status = statusMap[eventType] ?? mapRazorpayStatus(entity.status)

  return {
    provider: 'razorpay',
    eventId,
    eventType,
    action: subscriptionId || userId ? 'upsert' : 'ignore',
    userId,
    customerId,
    subscriptionId,
    planTier,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd: eventType === 'subscription.cancelled',
  }
}

export interface CancelSubscriptionOptions {
  provider: BillingProvider
  subscriptionId: string
  stripeSecretKey?: string
  razorpayKeyId?: string
  razorpayKeySecret?: string
  immediate?: boolean
  fetchImpl?: typeof fetch
}

/**
 * Cancels an active Stripe or Razorpay subscription. Errors throw so callers can decide whether to log best-effort or fail portal actions.
 */
export async function cancelProviderSubscription(options: CancelSubscriptionOptions): Promise<void> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch
  if (options.provider === 'stripe') {
    if (!options.stripeSecretKey) throw new Error('STRIPE_SECRET_KEY is not configured.')
    const encodedId = encodeURIComponent(options.subscriptionId)
    const response = options.immediate
      ? await fetchFn(`https://api.stripe.com/v1/subscriptions/${encodedId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${options.stripeSecretKey}` },
        })
      : await fetchFn(`https://api.stripe.com/v1/subscriptions/${encodedId}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'cancel_at_period_end=true',
        })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Stripe subscription cancel failed (${response.status}): ${text}`)
    }
    return
  }

  if (!options.razorpayKeyId || !options.razorpayKeySecret) {
    throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not configured.')
  }
  const encodedId = encodeURIComponent(options.subscriptionId)
  const basic = btoa(`${options.razorpayKeyId}:${options.razorpayKeySecret}`)
  const response = await fetchFn(`https://api.razorpay.com/v1/subscriptions/${encodedId}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cancel_at_cycle_end: options.immediate ? 0 : 1 }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Razorpay subscription cancel failed (${response.status}): ${text}`)
  }
}

const DEFAULT_REDIRECT_ORIGINS = [
  'https://ekagra.app',
  'https://www.ekagra.app',
  'https://studio.ekagra.app',
  'capacitor://localhost',
  'ionic://localhost',
]

/**
 * Validates checkout/portal redirect URLs against configured origins to prevent open-redirect phishing.
 * Allows loopback dev URLs (http/https localhost / 127.0.0.1), Capacitor native schemes, production Ekagra domains,
 * and any origin configured in ALLOWED_ORIGINS or SITE_URL.
 */
export function isAllowedRedirectUrl(rawUrl: string, env: Record<string, string | undefined>): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (parsed.protocol === 'capacitor:' || parsed.protocol === 'ionic:') {
    return parsed.hostname === 'localhost'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true

  const extra = [env.ALLOWED_ORIGINS, env.SITE_URL, env.PUBLIC_SITE_URL]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .flatMap((v) => v.split(',').map((s) => s.trim()).filter(Boolean))

  const allowed = new Set<string>(DEFAULT_REDIRECT_ORIGINS)
  for (const item of extra) {
    try {
      allowed.add(new URL(item).origin)
    } catch {
      allowed.add(item)
    }
  }
  return allowed.has(parsed.origin)
}
