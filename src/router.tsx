import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { PageLoading } from '@/components/layout/PageLoading'
import { RequireAuth } from '@/features/auth/RequireAuth'

// Public pages: sign-in, the page Google sign-in returns to (web) and the privacy policy.
// Everything else needs a signed-in user or Demo Mode (RequireAuth), who is sent to
// /onboarding until it's finished. Onboarding is full screen; the other pages live inside
// AppShell (top bar + bottom tabs). createBrowserRouter is needed for useBlocker,
// which powers the mode-switch warning.
//
// Every page is loaded only when it's opened (`lazy` + import(): code-splitting), so the app's
// first download stays small; the router waits for a page's code before showing it. Only the
// frame (RequireAuth, AppShell) is part of the first download, because every screen needs it.
export const router = createBrowserRouter([
  {
    // Shown while the first page's code downloads.
    HydrateFallback: PageLoading,
    children: [
      {
        path: '/sign-in',
        lazy: async () => ({ Component: (await import('@/pages/SignInPage')).SignInPage }),
      },
      {
        path: '/auth/callback',
        lazy: async () => ({ Component: (await import('@/pages/AuthCallbackPage')).AuthCallbackPage }),
      },
      {
        path: '/privacy',
        lazy: async () => ({ Component: (await import('@/pages/PrivacyPage')).PrivacyPage }),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/onboarding',
            lazy: async () => ({ Component: (await import('@/pages/OnboardingPage')).OnboardingPage }),
          },
          {
            path: '/',
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="/today" replace /> },
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
                path: 'academics/subjects/:subjectId/papers',
                lazy: async () => ({ Component: (await import('@/pages/PastPapersPage')).PastPapersPage }),
              },
              {
                path: 'academics/attendance',
                lazy: async () => ({ Component: (await import('@/pages/AttendancePage')).AttendancePage }),
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
                path: 'life',
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
              { path: '*', element: <Navigate to="/today" replace /> },
            ],
          },
        ],
      },
    ],
  },
])
