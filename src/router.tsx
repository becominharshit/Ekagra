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
          {
            path: 'today/tasks',
            lazy: async () => ({ Component: (await import('@/pages/TasksPage')).TasksPage }),
          },
          {
            path: 'today/focus',
            lazy: async () => ({ Component: (await import('@/pages/FocusPage')).FocusPage }),
          },
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
          {
            path: 'academics/library',
            lazy: async () => ({ Component: (await import('@/pages/LibraryPage')).LibraryPage }),
          },
          {
            path: 'academics/library/:materialId',
            lazy: async () => ({ Component: (await import('@/pages/PdfViewerPage')).PdfViewerPage }),
          },
          {
            path: 'academics/review',
            lazy: async () => ({ Component: (await import('@/pages/ReviewPage')).ReviewPage }),
          },
          {
            path: 'academics/cards',
            lazy: async () => ({ Component: (await import('@/pages/FlashcardsPage')).FlashcardsPage }),
          },
          {
            path: 'academics/mistakes',
            lazy: async () => ({ Component: (await import('@/pages/MistakesPage')).MistakesPage }),
          },
          {
            path: 'academics/topics/:topicId',
            lazy: async () => ({ Component: (await import('@/pages/TopicPage')).TopicPage }),
          },
          {
            path: 'academics/code',
            lazy: async () => ({ Component: (await import('@/pages/CodingLabPage')).CodingLabPage }),
          },
          {
            path: 'academics/code/:snippetId',
            lazy: async () => ({ Component: (await import('@/pages/CodeEditorPage')).CodeEditorPage }),
          },
          { path: 'hustle', element: <HustlePage /> },
          {
            path: 'hustle/:hustleId',
            lazy: async () => ({ Component: (await import('@/pages/HustleDetailPage')).HustleDetailPage }),
          },
          { path: 'life', element: <LifePage /> },
          { path: 'me', element: <MePage /> },
          { path: '*', element: <Navigate to="/today" replace /> },
        ],
      },
    ],
  },
])
