import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AcademicsPage } from '@/pages/AcademicsPage'
import { HustlePage } from '@/pages/HustlePage'
import { LifePage } from '@/pages/LifePage'
import { MePage } from '@/pages/MePage'
import { TodayPage } from '@/pages/TodayPage'

// Every page lives inside AppShell (top bar + bottom tabs).
// createBrowserRouter is needed for useBlocker, which powers the mode-switch warning.
export const router = createBrowserRouter([
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
])
