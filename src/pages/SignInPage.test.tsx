// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/authStore'
import { enterSignedOutForTest, renderWithRouter } from '@/test/renderApp'

const mockState = vi.hoisted(() => {
  const signInWithOAuth = vi.fn(async () => ({ data: { url: 'https://accounts.google.com' }, error: null }))
  const signInWithPassword = vi.fn(async () => ({ data: { session: null, user: null }, error: null }))
  const signUp = vi.fn(async () => ({ data: { session: null, user: null }, error: null }))
  const resetPasswordForEmail = vi.fn(async () => ({ data: {}, error: null }))
  const profilesMaybeSingle = vi.fn(async () => ({ data: null, error: null }))
  const profilesUpsert = vi.fn(async () => ({ error: null }))
  return {
    configured: false,
    signInWithOAuth,
    signInWithPassword,
    signUp,
    resetPasswordForEmail,
    fakeSupabase: {
      auth: {
        signInWithOAuth,
        signInWithPassword,
        signUp,
        resetPasswordForEmail,
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: profilesMaybeSingle })) })),
        upsert: profilesUpsert,
      })),
    },
  }
})

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mockState.configured ? mockState.fakeSupabase : null
  },
  get isSupabaseConfigured() {
    return mockState.configured
  },
  requireSupabase: () => {
    if (!mockState.configured) throw new Error('Supabase not configured')
    return mockState.fakeSupabase
  },
}))

const { SignInPage } = await import('./SignInPage')

describe('SignInPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockState.configured = false
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

  it('starts one-click Google OAuth directly with /auth/callback redirect', async () => {
    mockState.configured = true
    renderWithRouter(<SignInPage />, ['/sign-in'])

    const googleButton = screen.getByRole('button', { name: /Continue with Google/i })
    expect(googleButton).toBeEnabled()
    fireEvent.click(googleButton)

    await waitFor(() => {
      expect(mockState.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
    })
  })

  it('validates email and sends password reset link via Forgot password?', async () => {
    mockState.configured = true
    renderWithRouter(<SignInPage />, ['/sign-in'])

    fireEvent.click(screen.getByRole('button', { name: /Forgot password\?/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/enter your email address first/i)
    expect(mockState.resetPasswordForEmail).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'student@ekagra.app' } })
    fireEvent.click(screen.getByRole('button', { name: /Forgot password\?/i }))

    await waitFor(() => {
      expect(mockState.resetPasswordForEmail).toHaveBeenCalledWith('student@ekagra.app', {
        redirectTo: `${window.location.origin}/reset-password`,
      })
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/Password reset link sent to student@ekagra\.app/i)
  })

  it('signs in with email and password without redirecting to Google', async () => {
    mockState.configured = true
    renderWithRouter(<SignInPage />, ['/sign-in'])

    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'alice@ekagra.app' } })
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'correcthorsebattery' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in with email/i }))

    await waitFor(() => {
      expect(mockState.signInWithPassword).toHaveBeenCalledWith({
        email: 'alice@ekagra.app',
        password: 'correcthorsebattery',
      })
    })
  })
})
