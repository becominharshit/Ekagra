// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getAnalyticsConsent, resetObservabilityForTest } from '@/lib/observability'
import { enterDemoModeForTest, renderWithRouter } from '@/test/renderApp'
import { AccountPage } from './AccountPage'

describe('AccountPage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetObservabilityForTest()
    enterDemoModeForTest()
  })

  afterEach(() => {
    cleanup()
    resetObservabilityForTest()
    localStorage.clear()
  })

  it('links both Privacy Policy and Terms of Service and lets users toggle optional analytics', () => {
    renderWithRouter(<AccountPage />, ['/me/account'])

    expect(screen.getByRole('link', { name: /Privacy policy and permissions/i })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: /Terms of service/i })).toHaveAttribute('href', '/terms')

    expect(getAnalyticsConsent()).toBe('unset')
    fireEvent.click(screen.getByRole('button', { name: /Allow optional analytics/i }))
    expect(getAnalyticsConsent()).toBe('granted')

    fireEvent.click(screen.getByRole('button', { name: /Decline analytics/i }))
    expect(getAnalyticsConsent()).toBe('denied')
  })
})
