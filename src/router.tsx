import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { AcademicsPage } from '@/pages/AcademicsPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { HustlePage } from '@/pages/HustlePage'
import { LifePage } from '@/pages/LifePage'
import { MePage } from '@/pages/MePage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { SignInPage } from '@/pages/SignInPage'
import { TodayPage } from '@/pages/TodayPage'

// Public pages: sign-in and the page Google sign-in returns to (web).
// Everything else needs a signed-in user or Demo Mode (RequireAuth), who is sent to
// /onboarding until it's finished. Onboarding is full screen; the other pages live inside
// AppShell (top bar + bottom tabs). createBrowserRouter is needed for useBlocker,
// which powers the mode-switch warning.
export const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/onboarding', element: <OnboardingPage /> },
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/today" replace /> },
          { path: 'today', element: <TodayPage /> },
          { path: 'academics', element: <AcademicsPage /> },
          // Loaded only when opened (lazy), so the first screen of the app stays small.
          {
            path: 'academics/subjects/:subjectId',
            lazy: async () => ({ Component: (await import('@/pages/SubjectPage')).SubjectPage }),
          },
          {
            path: 'academics/subjects/:subjectId/import',
            lazy: async () => ({ Component: (await import('@/pages/RoadmapEditorPage')).SyllabusImportPage }),
          },
          {
            path: 'academics/subjects/:subjectId/edit',
            lazy: async () => ({ Component: (await import('@/pages/RoadmapEditorPage')).RoadmapEditPage }),
          },
          {
            path: 'academics/subjects/:subjectId/papers',
            lazy: async () => ({ Component: (await import('@/pages/PastPapersPage')).PastPapersPage }),
          },
          { path: 'hustle', element: <HustlePage /> },
          { path: 'life', element: <LifePage /> },
          { path: 'me', element: <MePage /> },
          { path: '*', element: <Navigate to="/today" replace /> },
        ],
      },
    ],
  },
])
