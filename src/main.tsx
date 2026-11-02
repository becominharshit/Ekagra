// First: an anchor handed over by Ekagra Studio (?bridge_payload=…) sets the address the router starts at.
import '@/features/bridge/launch'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { initAuth } from '@/features/auth/auth'
import { registerServiceWorker } from '@/lib/pwa'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'
import './index.css'

// Start following sign-in changes (and Android sign-in links) before the first screen shows.
initAuth()
// The installed web app opens without a connection (web production builds only).
registerServiceWorker()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('index.html is missing <div id="root">')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
