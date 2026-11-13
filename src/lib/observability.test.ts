import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildIssueReportUrl,
  getAnalyticsConsent,
  hasAnalyticsConsent,
  resetObservabilityForTest,
  sanitizeTelemetryProperties,
  scrubPiiString,
  setAnalyticsConsent,
  setAnalyticsTransportForTest,
  trackEvent,
} from './observability'

describe('observability & consent-gated analytics', () => {
  beforeEach(() => {
    resetObservabilityForTest()
  })

  it('scrubs PII (emails, tokens, API keys, phone numbers) from strings and objects', () => {
    const scrubbed = scrubPiiString(
      'Contact alice@example.com or +1 415 555 0199 with Bearer eyJhbGciOi.payload.sig and sk_live_1234567890abcdef',
    )
    expect(scrubbed).not.toContain('alice@example.com')
    expect(scrubbed).not.toContain('415 555 0199')
    expect(scrubbed).not.toContain('eyJhbGciOi')
    expect(scrubbed).not.toContain('sk_live_1234567890abcdef')
    expect(scrubbed).toContain('[redacted-email]')
    expect(scrubbed).toContain('[redacted-phone]')
    expect(scrubbed).toContain('[redacted-key]')

    const safeProps = sanitizeTelemetryProperties({
      email: 'student@university.edu',
      token: 'secret-value',
      nested: { phoneNumber: '+91 9876543210', tier: 'pro' },
      note: 'User alice@example.com upgraded',
      durationMinutes: 25,
    })
    expect(safeProps.email).toBe('[redacted]')
    expect(safeProps.token).toBe('[redacted]')
    expect(safeProps.durationMinutes).toBe(25)
    expect(safeProps.note).toBe('User [redacted-email] upgraded')
    expect((safeProps.nested as Record<string, unknown>).tier).toBe('pro')
  })

  it('blocks analytics events until explicit consent is granted', async () => {
    const recordEvent = vi.fn().mockResolvedValue(undefined)
    setAnalyticsTransportForTest({ recordEvent })

    expect(getAnalyticsConsent()).toBe('unset')
    expect(hasAnalyticsConsent()).toBe(false)

    expect(await trackEvent('page_view', { route: '/today' })).toBe(false)
    expect(recordEvent).not.toHaveBeenCalled()

    setAnalyticsConsent('denied')
    expect(hasAnalyticsConsent()).toBe(false)
    expect(await trackEvent('page_view', { route: '/today' })).toBe(false)
    expect(recordEvent).not.toHaveBeenCalled()

    setAnalyticsConsent('granted')
    expect(hasAnalyticsConsent()).toBe(true)
    expect(await trackEvent('pricing_viewed', { email: 'hide@me.com', tier: 'pro' }, 'web')).toBe(true)
    expect(recordEvent).toHaveBeenCalledWith({
      event_name: 'pricing_viewed',
      app_surface: 'web',
      properties: { email: '[redacted]', tier: 'pro' },
    })
  })

  it('builds a scrubbed diagnostic issue report URL', () => {
    const url = buildIssueReportUrl(new Error('Failed for bob@example.com'), {
      apiKey: 'AIzaSyTestSecretKey12345',
    })
    expect(url).toContain('https://github.com/becominharshit/Ekagra/issues/new')
    expect(url).not.toContain('bob@example.com')
    expect(url).not.toContain('AIzaSyTestSecretKey12345')
  })
})
