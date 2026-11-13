import { createBrowserRouter, Navigate } from 'react-router'
import { RouteErrorFallback } from '@/components/ErrorBoundary'
import { PageLoading } from '@/components/layout/PageLoading'
import { RequireSignIn } from '@studio/features/auth/RequireSignIn'
import { StudioShell } from '@studio/components/StudioShell'

// Ekagra Studio's pages. Everything but sign-in needs a signed-in student (Studio has no Demo Mode:
// it works on the account it shares with Ekagra). Ekagra links straight to /subjects/:id,
// /materials/:id and /notes/:id. Pages load only when they're opened, like in Ekagra.
export const router = createBrowserRouter([
  {
    HydrateFallback: PageLoading,
    errorElement: <RouteErrorFallback />,
    children: [
      {
        path: '/sign-in',
        lazy: async () => ({ Component: (await import('@studio/pages/SignInPage')).SignInPage }),
      },
      {
        path: '/auth/callback',
        lazy: async () => ({ Component: (await import('@studio/pages/AuthCallbackPage')).AuthCallbackPage }),
      },
      {
        element: <RequireSignIn />,
        children: [
          {
            path: '/',
            element: <StudioShell />,
            errorElement: <RouteErrorFallback />,
            children: [
              {
                index: true,
                lazy: async () => ({ Component: (await import('@studio/pages/LibraryPage')).LibraryPage }),
              },
              {
                path: 'subjects/:subjectId',
                lazy: async () => ({ Component: (await import('@studio/pages/SubjectPage')).SubjectPage }),
              },
              {
                path: 'unfiled',
                lazy: async () => ({ Component: (await import('@studio/pages/SubjectPage')).UnfiledPage }),
              },
              {
                path: 'materials/:materialId',
                lazy: async () => ({ Component: (await import('@studio/pages/MaterialPage')).MaterialPage }),
              },
              {
                path: 'notes/:noteId',
                lazy: async () => ({ Component: (await import('@studio/pages/NotePage')).NotePage }),
              },
              { path: '*', element: <Navigate to="/" replace /> },
            ],
          },
        ],
      },
    ],
  },
])
