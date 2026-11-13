import { createBrowserRouter, Navigate } from 'react-router'
import { RootLayout } from '@/components/ConsentBanner'
import { RouteErrorFallback } from '@/components/ErrorBoundary'
import { AppShell } from '@/components/layout/AppShell'
import { PageLoading } from '@/components/layout/PageLoading'
import { RequireAuth } from '@/features/auth/RequireAuth'

// Public pages: sign-in, password reset, the OAuth callback (web), pricing, and legal policies.
// Everything else needs a signed-in user or Demo Mode (RequireAuth), landing directly on /today
// with an optional skippable quick-start onboarding modal for new accounts. createBrowserRouter is
// needed for useBlocker, which powers the mode-switch warning.
//
// Every page is loaded only when it's opened (`lazy` + import(): code-splitting), so the app's
// first download stays small; the router waits for a page's code before showing it. Only the
// frame (RequireAuth, AppShell) is part of the first download, because every screen needs it.
export const router = createBrowserRouter([
  {
    // Shown while the first page's code downloads.
    HydrateFallback: PageLoading,
    element: <RootLayout />,
    errorElement: <RouteErrorFallback />,
    children: [
      {
        path: '/',
        lazy: async () => ({ Component: (await import('@/pages/SignInPage')).HomeGate }),
      },
      {
        path: '/sign-in',
        lazy: async () => ({ Component: (await import('@/pages/SignInPage')).SignInPage }),
      },
      {
        path: '/auth/callback',
        lazy: async () => ({ Component: (await import('@/pages/AuthCallbackPage')).AuthCallbackPage }),
      },
      {
        path: '/reset-password',
        lazy: async () => ({ Component: (await import('@/pages/ResetPasswordPage')).ResetPasswordPage }),
      },
      {
        path: '/privacy',
        lazy: async () => ({ Component: (await import('@/pages/PrivacyPage')).PrivacyPage }),
      },
      {
        path: '/terms',
        lazy: async () => ({ Component: (await import('@/pages/TermsPage')).TermsPage }),
      },
      {
        path: '/pricing',
        lazy: async () => ({ Component: (await import('@/pages/PricingPage')).PricingPage }),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/onboarding',
            lazy: async () => ({ Component: (await import('@/pages/OnboardingPage')).OnboardingPage }),
          },
          {
            element: <AppShell />,
            errorElement: <RouteErrorFallback />,
            children: [
              {
                path: 'today',
                lazy: async () => ({ Component: (await import('@/pages/TodayPage')).TodayPage }),
              },
              {
                path: 'today/tasks',
                lazy: async () => ({ Component: (await import('@/pages/TasksPage')).TasksPage }),
              },
              {
                path: 'today/focus',
                lazy: async () => ({ Component: (await import('@/pages/FocusPage')).FocusPage }),
              },
              {
                path: 'today/focus/tollbooth',
                lazy: async () => ({ Component: (await import('@/pages/TollboothPage')).TollboothPage }),
              },
              {
                path: 'academics',
                lazy: async () => ({ Component: (await import('@/pages/AcademicsPage')).AcademicsPage }),
              },
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
                path: 'academics/subjects/:subjectId/practice',
                lazy: async () => ({ Component: (await import('@/pages/PracticePage')).PracticePage }),
              },
              {
                path: 'academics/subjects/:subjectId/mock',
                lazy: async () => ({ Component: (await import('@/pages/MockTestPage')).MockTestPage }),
              },
              {
                path: 'academics/subjects/:subjectId/papers',
                lazy: async () => ({ Component: (await import('@/pages/PastPapersPage')).PastPapersPage }),
              },
              {
                path: 'academics/attendance',
                lazy: async () => ({ Component: (await import('@/pages/AttendancePage')).AttendancePage }),
              },
              {
                path: 'academics/progress',
                lazy: async () => ({ Component: (await import('@/pages/ProgressPage')).ProgressPage }),
              },
              {
                path: 'academics/grades',
                lazy: async () => ({ Component: (await import('@/pages/GradesPage')).GradesPage }),
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
                path: 'academics/materials/:materialId',
                lazy: async () => ({ Component: (await import('@/pages/MaterialPage')).MaterialPage }),
              },
              {
                path: 'academics/notes/:noteId',
                lazy: async () => ({ Component: (await import('@/pages/NotePage')).NotePage }),
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
              {
                path: 'hustle',
                lazy: async () => ({ Component: (await import('@/pages/HustlePage')).HustlePage }),
              },
              {
                path: 'hustle/:hustleId',
                lazy: async () => ({ Component: (await import('@/pages/HustleDetailPage')).HustleDetailPage }),
              },
              {
                path: 'life/:tab?',
                lazy: async () => ({ Component: (await import('@/pages/LifePage')).LifePage }),
              },
              {
                path: 'me',
                lazy: async () => ({ Component: (await import('@/pages/MePage')).MePage }),
              },
              {
                path: 'me/focus',
                lazy: async () => ({ Component: (await import('@/pages/FocusSetupPage')).FocusSetupPage }),
              },
              {
                path: 'me/account',
                lazy: async () => ({ Component: (await import('@/pages/AccountPage')).AccountPage }),
              },
              {
                path: 'me/review',
                lazy: async () => ({ Component: (await import('@/pages/WeeklyReviewPage')).WeeklyReviewPage }),
              },
              {
                path: 'me/friends',
                lazy: async () => ({ Component: (await import('@/pages/FriendsPage')).FriendsPage }),
              },
              {
                path: 'studio',
                lazy: async () => ({ Component: (await import('@studio/components/EmbeddedStudioShell')).EmbeddedStudioShell }),
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
                  { path: '*', element: <Navigate to="/studio" replace /> },
                ],
              },
              { path: '*', element: <Navigate to="/today" replace /> },
            ],
          },
        ],
      },
    ],
  },
])
