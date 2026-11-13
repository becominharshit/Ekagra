// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getAnalyticsConsent, resetObservabilityForTest, setAnalyticsConsent } from '@/lib/observability'
import { ConsentBanner } from './ConsentBanner'
import { renderWithRouter } from '@/test/renderApp'

describe('ConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear()
    resetObservabilityForTest()
  })

  afterEach(() => {
    cleanup()
    resetObservabilityForTest()
    localStorage.clear()
  })

  it('shows when consent is unset and hides after Decline or Accept', () => {
    renderWithRouter(<ConsentBanner />, ['/sign-in'])

    expect(screen.getByRole('complementary', { name: /Privacy and analytics preferences/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Decline$/i }))

    expect(getAnalyticsConsent()).toBe('denied')
    expect(screen.queryByRole('complementary', { name: /Privacy and analytics preferences/i })).not.toBeInTheDocument()
  })

  it('persists granted consent and stays hidden when already decided', () => {
    renderWithRouter(<ConsentBanner />, ['/sign-in'])
    fireEvent.click(screen.getByRole('button', { name: /Accept analytics/i }))
    expect(getAnalyticsConsent()).toBe('granted')

    cleanup()
    renderWithRouter(<ConsentBanner />, ['/sign-in'])
    expect(screen.queryByRole('complementary', { name: /Privacy and analytics preferences/i })).not.toBeInTheDocument()

    // Clearing/changing via API updates cleanly
    setAnalyticsConsent('denied')
    expect(getAnalyticsConsent()).toBe('denied')
  })
})
