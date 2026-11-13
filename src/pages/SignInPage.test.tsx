// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/features/auth/authStore'
import { SignInPage } from './SignInPage'
import { enterSignedOutForTest, renderWithRouter } from '@/test/renderApp'

describe('SignInPage', () => {
  beforeEach(() => {
    localStorage.clear()
    enterSignedOutForTest()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('renders product overview and enters Demo Mode on click', () => {
    renderWithRouter(<SignInPage />, ['/sign-in'])

    expect(screen.getByRole('heading', { name: /One clear next step/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Privacy$/i })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: /^Terms$/i })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('heading', { name: /Academic Tollbooth Preview/i })).toBeInTheDocument()

    const demoButton = screen.getByRole('button', { name: /Try Demo Mode/i })
    expect(demoButton).toBeEnabled()

    fireEvent.click(demoButton)

    expect(useAuthStore.getState().status).toBe('demo')
    expect(useAuthStore.getState().user?.isDemo).toBe(true)
  })
})
