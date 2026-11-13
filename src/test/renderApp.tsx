import '@testing-library/jest-dom/vitest'
import '@/lib/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { DEMO_USER } from '@/features/auth/demo'
import { useAuthStore } from '@/features/auth/authStore'
import { demoDb } from '@/lib/demoDb'

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

export function enterDemoModeForTest(): void {
  demoDb.clear()
  useAuthStore.setState({
    status: 'demo',
    session: null,
    user: DEMO_USER,
    error: null,
  })
}

export function enterSignedOutForTest(): void {
  demoDb.clear()
  useAuthStore.setState({
    status: 'signed_out',
    session: null,
    user: null,
    error: null,
  })
}

export function renderWithRouter(ui: ReactElement, initialEntries: string[] = ['/']): RenderResult {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
