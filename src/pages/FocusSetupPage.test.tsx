// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FocusSetupPage } from './FocusSetupPage'
import { enterDemoModeForTest, renderWithRouter } from '@/test/renderApp'

describe('FocusSetupPage', () => {
  beforeEach(() => {
    localStorage.clear()
    enterDemoModeForTest()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows accurate Play-safe Android permission disclosures without referencing AccessibilityService', () => {
    const { container } = renderWithRouter(<FocusSetupPage />, ['/me/focus'])

    expect(screen.getByText(/Android permissions & on-device privacy disclosure/i)).toBeInTheDocument()
    expect(screen.getByText(/PACKAGE_USAGE_STATS/i)).toBeInTheDocument()
    expect(screen.getByText(/SYSTEM_ALERT_WINDOW/i)).toBeInTheDocument()
    expect(screen.getByText(/FOREGROUND_SERVICE_SPECIAL_USE/i)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/AccessibilityService/i)
  })
})
