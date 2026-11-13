// @vitest-environment jsdom
import '@/lib/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/authStore'
import { enterSignedOutForTest } from '@/test/renderApp'

const mockState = vi.hoisted(() => {
  const fakeUser = {
    id: 'user-reset-1',
    email: 'student@ekagra.app',
    user_metadata: { full_name: 'Student' },
  }
  const getSession = vi.fn(async () => ({
    data: { session: { user: fakeUser, access_token: 'tok' } },
    error: null,
  }))
  const exchangeCodeForSession = vi.fn(async () => ({
    data: { session: { user: fakeUser, access_token: 'tok' } },
    error: null,
  }))
  const updateUser = vi.fn(async () => ({
    data: { user: fakeUser },
    error: null,
  }))
  const profilesMaybeSingle = vi.fn(async () => ({ data: { id: fakeUser.id }, error: null }))
  return {
    fakeUser,
    updateUser,
    fakeSupabase: {
      auth: {
        getSession,
        exchangeCodeForSession,
        updateUser,
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: profilesMaybeSingle })) })),
        upsert: vi.fn(async () => ({ error: null })),
      })),
    },
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mockState.fakeSupabase,
  isSupabaseConfigured: true,
  requireSupabase: () => mockState.fakeSupabase,
}))

const { ResetPasswordPage } = await import('./ResetPasswordPage')

function renderResetRoute(initialEntry = '/reset-password?code=pkce-reset-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/today" element={<h1>Today Route</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    enterSignedOutForTest()
    useAuthStore.setState({
      status: 'signed_in',
      session: { user: mockState.fakeUser } as never,
      user: { id: mockState.fakeUser.id, email: mockState.fakeUser.email, name: 'Student', avatarUrl: null, isDemo: false },
      error: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('validates password match & minimum length before saving', async () => {
    renderResetRoute()

    fireEvent.change(screen.getByLabelText(/^New password$/i), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText(/^Confirm new password$/i), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: /Save new password/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 6 characters/i)
    expect(mockState.updateUser).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/^New password$/i), { target: { value: 'secure123' } })
    fireEvent.change(screen.getByLabelText(/^Confirm new password$/i), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: /Save new password/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/must match/i)
    expect(mockState.updateUser).not.toHaveBeenCalled()
  })

  it('calls supabase.auth.updateUser({ password }) and redirects straight to /today', async () => {
    renderResetRoute()

    fireEvent.change(screen.getByLabelText(/^New password$/i), { target: { value: 'new-strong-pass' } })
    fireEvent.change(screen.getByLabelText(/^Confirm new password$/i), { target: { value: 'new-strong-pass' } })
    fireEvent.click(screen.getByRole('button', { name: /Save new password/i }))

    await waitFor(() => {
      expect(mockState.updateUser).toHaveBeenCalledWith({ password: 'new-strong-pass' })
    })
    expect(await screen.findByRole('heading', { name: 'Today Route' })).toBeInTheDocument()
  })
})
