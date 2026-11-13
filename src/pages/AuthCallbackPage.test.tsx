// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import '@/lib/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/authStore'
import { enterDemoModeForTest, enterSignedOutForTest } from '@/test/renderApp'

const mockState = vi.hoisted(() => {
  const fakeUser = {
    id: 'user-google-1',
    email: 'google@ekagra.app',
    user_metadata: { full_name: 'Google Student', avatar_url: 'https://example.com/a.png' },
  }
  const fakeSession = { user: fakeUser, access_token: 'tok-google' }
  const state = { profileExists: false }
  const getSession = vi.fn(async () => ({ data: { session: null }, error: null }))
  const exchangeCodeForSession = vi.fn(async () => ({
    data: { session: fakeSession },
    error: null,
  }))
  const profileMaybeSingle = vi.fn(async () => ({
    data: state.profileExists
      ? {
          id: fakeUser.id,
          full_name: 'Google Student',
          onboarded_at: null,
          timezone: 'UTC',
          currency: 'USD',
          chronotype: 'neutral',
          mentor_tone: 'balanced',
          settings: {},
        }
      : null,
    error: null,
  }))
  const profileUpsert = vi.fn(async () => {
    state.profileExists = true
    return { error: null }
  })
  return {
    state,
    exchangeCodeForSession,
    profileUpsert,
    fakeSupabase: {
      auth: {
        getSession,
        exchangeCodeForSession,
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: profileMaybeSingle })) })),
        upsert: profileUpsert,
      })),
    },
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mockState.fakeSupabase,
  isSupabaseConfigured: true,
  requireSupabase: () => mockState.fakeSupabase,
}))

const { AuthCallbackPage } = await import('./AuthCallbackPage')
const { RequireAuth } = await import('@/features/auth/RequireAuth')
const { QuickStartOnboardingModal } = await import('./OnboardingPage')

describe('Google AuthCallback & Non-Blocking Onboarding', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockState.state.profileExists = false
    enterSignedOutForTest()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('completes PKCE exchange, initializes missing profile, and routes directly to /today', async () => {
    useAuthStore.setState({ status: 'loading', session: null, user: null, error: null })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/auth/callback?code=oauth-pkce-code']}>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/today" element={<h1>Today Landed</h1>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(mockState.exchangeCodeForSession).toHaveBeenCalledWith('oauth-pkce-code')
    })
    await waitFor(() => {
      expect(mockState.profileUpsert).toHaveBeenCalled()
    })
    expect(await screen.findByRole('heading', { name: 'Today Landed' })).toBeInTheDocument()
  })

  it('allows un-onboarded users straight into /today with a skippable quick-start modal instead of blocking', async () => {
    enterDemoModeForTest()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/today']}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route
                path="/today"
                element={
                  <div>
                    <h1>Today Content</h1>
                    <QuickStartOnboardingModal />
                  </div>
                }
              />
              <Route path="/onboarding" element={<h1>Onboarding Gate</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Today Content' })).toBeInTheDocument()
    const skipBtn = await screen.findByRole('button', { name: /Skip for now/i })
    fireEvent.click(skipBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
