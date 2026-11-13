import { Capacitor } from '@capacitor/core'
import * as Sentry from '@sentry/react'
import { useAuthStore } from '@/features/auth/authStore'
import { demoDb } from '@/lib/demoDb'
import { queryClient } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'

export type AppSurface = 'web' | 'studio' | 'android' | 'extension'
export type AnalyticsConsentState = 'granted' | 'denied' | 'unset'

export const ANALYTICS_CONSENT_STORAGE_KEY = 'ekagra:analytics-consent'
export const ANALYTICS_CONSENT_EVENT = 'ekagra:analytics-consent-changed'

const SENSITIVE_KEY_PATTERN =
  /(email|phone|mobile|token|secret|password|passcode|api[_-]?key|authorization|cookie|credential)/i

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const SECRET_PREFIX_PATTERN = /\b(?:sk|pk|rk|rzp|whsec|ghp|gho|AIza|xoxb|xoxp)[-_A-Za-z0-9]{10,}\b/g
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{8,}\d)/g

let sentryInitialized = false
let inMemoryConsent: AnalyticsConsentState = 'unset'
let currentSurface: AppSurface | null = null

export interface AnalyticsTransport {
  recordEvent: (row: {
    event_name: string
    app_surface: AppSurface
    properties: Record<string, Json>
  }) => Promise<void>
}

let customTransport: AnalyticsTransport | null = null

/** Optional override for unit tests to inspect emitted events without network calls. */
export function setAnalyticsTransportForTest(transport: AnalyticsTransport | null): void {
  customTransport = transport
}

export function resetObservabilityForTest(): void {
  sentryInitialized = false
  inMemoryConsent = 'unset'
  currentSurface = null
  customTransport = null
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY)
    }
  } catch {
    // Ignore storage unavailability in restricted contexts.
  }
}

export function scrubPiiString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(BEARER_PATTERN, 'Bearer [redacted-token]')
    .replace(JWT_PATTERN, '[redacted-jwt]')
    .replace(SECRET_PREFIX_PATTERN, '[redacted-key]')
    .replace(PHONE_PATTERN, (match) => {
      const digits = match.replace(/\D/g, '')
      return digits.length >= 10 && digits.length <= 15 ? '[redacted-phone]' : match
    })
}

function toSafeJsonObject(value: Record<string, unknown>, depth = 0): Record<string, Json> {
  const out: Record<string, Json> = {}
  if (depth > 4) return out
  for (const [key, entry] of Object.entries(value).slice(0, 25)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = '[redacted]'
    } else if (entry !== undefined) {
      out[key] = toSafeJson(entry, depth + 1)
    }
  }
  return out
}

function toSafeJson(value: unknown, depth = 0): Json {
  if (depth > 4) return '[truncated]'
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return scrubPiiString(value.slice(0, 500))
  if (value instanceof Error) return scrubPiiString(value.message.slice(0, 500))
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => toSafeJson(item, depth + 1))
  }
  if (typeof value === 'object') {
    return toSafeJsonObject(value as Record<string, unknown>, depth)
  }
  return String(value)
}

export function sanitizeTelemetryProperties(
  properties?: Record<string, unknown>,
): Record<string, Json> {
  if (!properties) return {}
  return toSafeJsonObject(properties, 0)
}

export function getAnalyticsConsent(): AnalyticsConsentState {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)
      if (stored === 'granted' || stored === 'denied') return stored
    }
  } catch {
    // Fall back to in-memory preference when localStorage is blocked.
  }
  return inMemoryConsent
}

export function hasAnalyticsConsent(): boolean {
  return getAnalyticsConsent() === 'granted'
}

export function setAnalyticsConsent(consent: 'granted' | 'denied'): void {
  inMemoryConsent = consent
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent)
    }
  } catch {
    // In-memory state stays updated even when storage throws.
  }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: consent }))
    }
  } catch {
    // Non-browser test environments may not define window.
  }
}

export function detectAppSurface(explicit?: AppSurface): AppSurface {
  if (explicit) return explicit
  if (currentSurface) return currentSurface
  try {
    if (Capacitor.isNativePlatform()) return 'android'
  } catch {
    // Non-Capacitor environment.
  }
  return 'web'
}

function releaseVersion(): string {
  return typeof __APP_BUILD__ !== 'undefined' ? `ekagra@${__APP_BUILD__}` : 'ekagra@dev'
}

/**
 * Initializes client crash reporting (`@sentry/react`) only when `VITE_SENTRY_DSN`
 * is configured. Strips user emails/tokens/PII via `beforeSend` scrubbing.
 */
export function initObservability(surface: AppSurface = 'web'): boolean {
  currentSurface = surface
  if (sentryInitialized) return true

  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  if (!dsn) return false

  Sentry.init({
    dsn,
    release: releaseVersion(),
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
    beforeSend(event) {
      if (event.user) {
        event.user = { id: event.user.id }
      }
      if (typeof event.message === 'string') {
        event.message = scrubPiiString(event.message)
      }
      if (event.exception?.values) {
        event.exception.values = event.exception.values.map((item) => ({
          ...item,
          value: typeof item.value === 'string' ? scrubPiiString(item.value) : item.value,
        }))
      }
      if (event.extra) {
        event.extra = sanitizeTelemetryProperties(event.extra)
      }
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
          ...crumb,
          message: typeof crumb.message === 'string' ? scrubPiiString(crumb.message) : crumb.message,
          data: crumb.data ? sanitizeTelemetryProperties(crumb.data) : undefined,
        }))
      }
      return event
    },
  })

  Sentry.setTag('app_surface', detectAppSurface(surface))
  sentryInitialized = true
  return true
}

export function captureClientError(error: unknown, context?: Record<string, unknown>): void {
  const safeContext = sanitizeTelemetryProperties(context)
  if (sentryInitialized) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(safeContext)) {
        scope.setExtra(key, value)
      }
      const err =
        error instanceof Error
          ? new Error(scrubPiiString(error.message))
          : new Error(scrubPiiString(String(error)))
      if (error instanceof Error && error.name) err.name = error.name
      Sentry.captureException(err)
    })
  }
  if (import.meta.env.DEV) {
    console.error('[Ekagra client error]', error, safeContext)
  }
}

export function formatDiagnosticSummary(error: unknown, context?: Record<string, unknown>): string {
  const message =
    error instanceof Error
      ? `${error.name}: ${scrubPiiString(error.message)}`
      : scrubPiiString(String(error ?? 'Unknown error'))
  const pathname =
    typeof window !== 'undefined' ? scrubPiiString(window.location.pathname) : 'unknown'
  const safeContext = sanitizeTelemetryProperties(context)
  return [
    `Build: ${releaseVersion()}`,
    `Surface: ${detectAppSurface()}`,
    `Route: ${pathname}`,
    `Error: ${message}`,
    Object.keys(safeContext).length > 0 ? `Context: ${JSON.stringify(safeContext)}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildIssueReportUrl(error: unknown, context?: Record<string, unknown>): string {
  const summary = formatDiagnosticSummary(error, context)
  const title =
    error instanceof Error
      ? `Bug: ${scrubPiiString(error.message).slice(0, 80)}`
      : 'Bug: Unexpected application error'
  const body = `## What happened?\n<!-- Please describe what you clicked or were doing -->\n\n## Diagnostics (scrubbed)\n\`\`\`\n${summary}\n\`\`\`\n`
  const params = new URLSearchParams({ title, body })
  return `https://github.com/becominharshit/Ekagra/issues/new?${params.toString()}`
}

/**
 * Clears local Demo/query/service-worker caches so users can recover from
 * corrupt cached state or stale service worker bundles without altering Supabase auth.
 */
export async function resetLocalAppCache(): Promise<void> {
  try {
    queryClient.clear()
  } catch {
    // Ignore query cache failures during emergency recovery.
  }

  try {
    demoDb.clear()
  } catch {
    // Ignore Demo Mode storage failures.
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.startsWith('ekagra-cache:') || key.startsWith('ekagra:sync-queue'))) {
          keysToRemove.push(key)
        }
      }
      for (const key of keysToRemove) localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage read errors.
  }

  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
  } catch {
    // Ignore sessionStorage failures.
  }

  try {
    if (typeof caches !== 'undefined') {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map((name) => caches.delete(name)))
    }
  } catch {
    // Ignore CacheStorage errors in unsupported environments.
  }
}

/**
 * Records a privacy-respecting product analytics event to Supabase `analytics_events`
 * only after explicit user consent (`setAnalyticsConsent('granted')`).
 * Never throws; returns `true` when emitted or `false` when skipped/unavailable.
 */
export async function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
  surface?: AppSurface,
): Promise<boolean> {
  if (!hasAnalyticsConsent()) return false
  const cleanName = eventName.trim().slice(0, 80)
  if (!cleanName) return false

  const row = {
    event_name: cleanName,
    app_surface: detectAppSurface(surface),
    properties: sanitizeTelemetryProperties(properties),
  }

  if (customTransport) {
    try {
      await customTransport.recordEvent(row)
      return true
    } catch {
      return false
    }
  }

  if (!supabase) return false
  const auth = useAuthStore.getState()
  if (auth.status !== 'signed_in' || !auth.user || auth.user.isDemo) return false

  try {
    const { error } = await supabase.from('analytics_events').insert(row)
    return !error
  } catch {
    return false
  }
}
