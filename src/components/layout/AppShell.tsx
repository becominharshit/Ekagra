import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { FeedbackSheet } from '@/features/feedback/FeedbackSheet'
import { FocusBar } from '@/features/focus/FocusBar'
import { FocusGuardSync } from '@/features/focus/FocusGuardSync'
import { LaunchpadBar } from '@/features/hustle/LaunchpadBar'
import { InboxDropTarget } from '@/features/inbox/InboxDropTarget'
import { InboxSheet } from '@/features/inbox/InboxSheet'
import { UpgradeModal } from '@/features/billing/UpgradeModal'
import { ModeSwitchGuard } from '@/features/mode/ModeSwitchGuard'
import { usePlanKeeper } from '@/features/planner/replan'
import { CaptureButton } from '@/features/tasks/CaptureButton'
import { StudioBridge } from '@/features/bridge/StudioBridge'
import { ReviewReminder } from '@/features/review/ReviewNudges'
import { SocialSync } from '@/features/social/SocialSync'
import { SyncStatusBanner } from '@/features/sync/SyncController'
import { CaptureSheet } from '@/features/tasks/CaptureSheet'
import { BottomTabBar } from './BottomTabBar'
import { SideNav } from './SideNav'
import { TopBar } from './TopBar'

/** The frame around every page: top bar, the page itself (scrolls), bottom tabs (a side menu on wide screens). */
export function AppShell() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  // The plan is made when the app opens with an old one, and again when its inputs change.
  usePlanKeeper()

  // A new page starts at the top, not where the previous page was scrolled to.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="flex h-full flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <TopBar />
      <SyncStatusBanner />
      {/* A running Launchpad session (10 minutes on Upwork, Instagram…) stays in view on every screen. */}
      <LaunchpadBar />
      {/* So does a running focus session (Today and the focus screen show it themselves). */}
      <FocusBar />
      {/* Android: FocusGuard blocks the picked apps while a session runs. */}
      <FocusGuardSync />
      {/* Android: a notification when the weekly review is ready. */}
      <ReviewReminder />
      {/* The numbers shared with partners and groups stay current; nudges notify on Android. */}
      <SocialSync />
      {/* AI Anchors handed over from Ekagra Studio, and Studio's changes as they happen. */}
      <StudioBridge />
      <div className="flex min-h-0 flex-1">
        <SideNav />
        <main id="main-content" tabIndex={-1} ref={mainRef} className="min-w-0 flex-1 overflow-y-auto focus:outline-none">
          {/* Extra space at the bottom so the floating + button never covers the last item. */}
          <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-24 lg:max-w-4xl lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomTabBar />
      <CaptureButton />
      <CaptureSheet />
      {/* Add a syllabus, timetable, past paper, notes or a notice: the top bar's Add, or a file dropped on the window. */}
      <InboxSheet />
      <InboxDropTarget />
      <FeedbackSheet />
      <UpgradeModal />
      <ModeSwitchGuard />
    </div>
  )
}
