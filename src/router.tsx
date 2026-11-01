import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { AcademicsPage } from '@/pages/AcademicsPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { HustlePage } from '@/pages/HustlePage'
import { LifePage } from '@/pages/LifePage'
import { MePage } from '@/pages/MePage'
import { SignInPage } from '@/pages/SignInPage'
import { TodayPage } from '@/pages/TodayPage'

// Public pages: sign-in and the page Google sign-in returns to (web).
// Everything else needs a signed-in user or Demo Mode (RequireAuth), and lives inside
// AppShell (top bar + bottom tabs). createBrowserRouter is needed for useBlocker,
// which powers the mode-switch warning.
export const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/today" replace /> },
          { path: 'today', element: <TodayPage /> },
          { path: 'academics', element: <AcademicsPage /> },
          { path: 'hustle', element: <HustlePage /> },
          { path: 'life', element: <LifePage /> },
          { path: 'me', element: <MePage /> },
          { path: '*', element: <Navigate to="/today" replace /> },
        ],
      },
    ],
  },
])
