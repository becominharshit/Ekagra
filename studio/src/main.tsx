import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { initAuth } from '@/features/auth/auth'
import { initObservability } from '@/lib/observability'
import { registerServiceWorker } from '@/lib/pwa'
import { queryClient } from '@/lib/queryClient'
import { router } from '@studio/router'
import './index.css'

// Ekagra Studio starts like Ekagra: initialize crash reporting, follow sign-in changes (the same
// Supabase project, so the same account), and on the web in production the service worker.
initObservability('studio')
initAuth()
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
