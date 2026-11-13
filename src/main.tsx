// First: an anchor handed over by Ekagra Studio (?bridge_payload=…) sets the address the router starts at.
import '@/features/bridge/launch'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { initAuth } from '@/features/auth/auth'
import { initObservability } from '@/lib/observability'
import { registerServiceWorker } from '@/lib/pwa'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'
import '@/lib/i18n'
import './index.css'

// Initialize crash reporting before mounting (no-op if VITE_SENTRY_DSN is unset).
initObservability('web')
// Start following sign-in changes (and Android sign-in links) before the first screen shows.
initAuth()
// The installed web app opens without a connection (web production builds only).
registerServiceWorker()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('index.html is missing <div id="root">')

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
